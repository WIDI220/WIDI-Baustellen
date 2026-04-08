import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, BarChart2, Calendar, LogOut, Home, Upload, RefreshCw, CheckCircle, Users, FileUp } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ACCENT = '#f59e0b';
const ACCENT_LIGHT = 'rgba(245,158,11,0.15)';

const NAV = [
  { to: '/dguv',           icon: Upload,    label: 'Verarbeitung' },
  { to: '/dguv/roadmap',   icon: Calendar,  label: 'Roadmap' },
  { to: '/dguv/pruefer',   icon: Users,     label: 'Prüfer' },
  { to: '/dguv/import',    icon: FileUp,    label: 'Messungen Import' },
  { to: '/dguv/auswertung',icon: BarChart2, label: 'Auswertung' },
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const rawHeaders = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g,''));
  const norm = (s: string) => s.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
  const headerMap: Record<string,string> = {};
  rawHeaders.forEach(h => { headerMap[norm(h)] = h; });
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g,''));
    const row: Record<string,string> = {};
    rawHeaders.forEach((h,i) => { row[h] = vals[i] ?? ''; });
    const aliases: Record<string,string[]> = {
      'GEBÄUDE': ['GEB?UDE','GEBAEUDE'], 'NÄCHSTE PRÜFUNG': ['N?CHSTE PR?FUNG','NACHSTE PRUFUNG'],
      'LETZTE PRÜFUNG': ['LETZTE PR?FUNG','LETZTE PRUFUNG'], 'LETZTER PRÜFER': ['LETZTER PR?FER'],
    };
    for (const [correct, variants] of Object.entries(aliases)) {
      if (!row[correct]) {
        for (const v of variants) { if (row[v] !== undefined) { row[correct] = row[v]; break; } }
        if (!row[correct]) {
          const nc = norm(correct);
          for (const key of Object.keys(row)) { if (norm(key) === nc) { row[correct] = row[key]; break; } }
        }
      }
    }
    return row;
  }).filter(r => r['ID']);
}

function SidebarGesamtliste() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    supabase.from('dguv_geraete').select('id', { count: 'exact', head: true }).then(({ count }) => {
      if (count !== null) setTotal(count);
    });
  }, [status]);

  async function handleFile(file: File) {
    setStatus('loading'); setCount(0);
    try {
      const text = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? '');
        r.onerror = rej;
        r.readAsText(file, 'ISO-8859-1');
      });
      const rows = parseCSV(text);
      let imp = 0;
      const parseD = (v: string) => {
        if (!v) return null;
        const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
        return null;
      };
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i+200).map(r => ({
          id: r['ID']?.trim(), bezeichnung: r['BEZEICHNUNG']||null,
          letzte_pruefung: parseD(r['LETZTE PRÜFUNG']), letzter_pruefer: r['LETZTER PRÜFER']||null,
          naechste_pruefung: parseD(r['NÄCHSTE PRÜFUNG']), abteilung: r['ABTEILUNG']||null,
          gebaeude: r['GEBÄUDE']||null, ebene: r['EBENE']||null,
          liegenschaft: r['LIEGENSCHAFT']||null, aktiv: true,
        })).filter(r => r.id);
        await supabase.from('dguv_geraete').upsert(batch, { onConflict: 'id' });
        imp += batch.length; setCount(imp);
      }
      setStatus('done');
    } catch { setStatus('error'); }
  }

  return (
    <div style={{ margin: '8px', padding: '10px 12px', background: total > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 10, border: `1px solid ${total > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
      {status === 'loading' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <RefreshCw size={12} style={{ color: ACCENT, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{count.toLocaleString('de-DE')} importiert...</span>
        </div>
      ) : total > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} style={{ color: '#10b981', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 }}>{total.toLocaleString('de-DE')} Geräte</span>
          <button onClick={() => fileRef.current?.click()} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻</button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, padding: 0 }}>
          <Upload size={12} style={{ color: ACCENT, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'left' }}>Gesamtliste hochladen</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value=''; }} />
    </div>
  );
}

export default function AppLayoutDGUV({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#f8fafc', fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <aside style={{ width:220, background:'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)', display:'flex', flexDirection:'column', flexShrink:0, boxShadow:'4px 0 24px rgba(0,0,0,0.15)', zIndex:10 }}>

        {/* Logo */}
        <div style={{ padding:'18px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:`linear-gradient(135deg,${ACCENT},#d97706)`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px rgba(245,158,11,0.4)` }}>
              <Shield size={17} style={{ color:'#fff' }} />
            </div>
            <div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:13, margin:0 }}>WIDI</p>
              <p style={{ color:'rgba(255,255,255,0.35)', fontSize:10, margin:0 }}>DGUV Prüfung</p>
            </div>
          </div>
          <button onClick={() => navigate('/')}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:500, cursor:'pointer', justifyContent:'center' }}>
            <Home size={12} /> Startseite
          </button>
        </div>

        {/* Gesamtliste Status */}
        <SidebarGesamtliste />

        <p style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'rgba(255,255,255,0.2)', fontWeight:600, padding:'6px 16px 4px', margin:0 }}>Navigation</p>
        <nav style={{ flex:1, padding:'4px 8px', display:'flex', flexDirection:'column', gap:2 }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = to === '/dguv' ? location.pathname === '/dguv' : location.pathname.startsWith(to);
            return (
              <button key={to} onClick={() => navigate(to)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13, fontWeight:500, transition:'all .15s', width:'100%', textAlign:'left', background: active ? ACCENT_LIGHT : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.45)', borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent' }}>
                <Icon size={15} style={{ flexShrink:0 }} /> {label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding:'8px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={signOut}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'none', border:'none', color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:500, cursor:'pointer', borderRadius:10, transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='#fca5a5';(e.currentTarget as HTMLElement).style.background='rgba(239,68,68,0.1)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.3)';(e.currentTarget as HTMLElement).style.background='none';}}>
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      </aside>
      <main style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>{children}</main>
    </div>
  );
}
