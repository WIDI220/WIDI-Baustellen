import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, RefreshCw, Users, CheckCircle, Calendar } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PRUEFER_NORM: Record<string,string> = {
  'kaminski':'R. Kaminski', 'rene kaminski':'R. Kaminski', 'r. kaminski':'R. Kaminski',
  'willing':'N. Willing', 'n. willing':'N. Willing',
  'münch':'M. Münch', 'm. münch':'M. Münch', 'munch':'M. Münch',
  'van der werf':'T. van der Werf', 't. van der werf':'T. van der Werf',
};

function normPruefer(name: string): string {
  const low = name.toLowerCase().trim();
  return PRUEFER_NORM[low] || name.trim();
}

function parseCSVRohdaten(text: string): any[] {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h=>h.trim().replace(/^"|"$/g,''));
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));
    const row: Record<string,string> = {};
    headers.forEach((h,i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => r['ID']?.trim());
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (v.match(/^\d{4}-\d{2}-\d{2}/)) return v.slice(0,10);
  return null;
}

interface AuswertungItem {
  pruefer: string;
  anzahl: number;
  monate: Record<string,number>;
}

interface UploadResult {
  datei: string;
  gesamt: number;
  aktualisiert: number;
  pruefer: AuswertungItem[];
  monatlich: Record<string,number>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1e293b', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'10px 14px' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:16, fontSize:12, marginBottom:2 }}>
          <span style={{ color:p.color, fontWeight:500 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#fff' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const PRUEFER_FARBEN = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function DGUVAbgleich() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle'|'processing'|'done'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  // Beispieldaten 2025 für Vergleich (hardcoded als Basis)
  const vergleich2025: Record<string, number> = {
    'Jan':0,'Feb':0,'Mär':0,'Apr':0,'Mai':0,'Jun':0,
    'Jul':88,'Aug':198,'Sep':337,'Okt':167,'Nov':218,'Dez':200
  };

  async function handleFile(file: File) {
    setStatus('processing'); setProgress(0); setResult(null); setError('');
    try {
      const text = await new Promise<string>((res,rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? '');
        r.onerror = rej;
        r.readAsText(file, 'ISO-8859-1');
      });

      const rows = parseCSVRohdaten(text);
      const total = rows.length;
      let aktualisiert = 0;
      const pruefer: Record<string, { anzahl:number; monate:Record<string,number> }> = {};
      const monatlich: Record<string,number> = {};

      for (let i = 0; i < rows.length; i++) {
        setProgress(Math.round(i/total*100));
        const row = rows[i];
        const id = row['ID']?.trim();
        if (!id) continue;

        const letzteP = parseDate(row['LETZTE PRÜFUNG'] || row['LETZTE PRUEFUNG'] || '');
        const prName = normPruefer(row['LETZTER PRÜFER'] || row['LETZTER PRUFER'] || '');

        if (!letzteP) continue;

        // Nächste Prüfung +12 Monate
        const naechsteP = new Date(letzteP);
        naechsteP.setMonth(naechsteP.getMonth() + 12);
        const naechsteStr = naechsteP.toISOString().slice(0,10);

        // Supabase Update
        const { error: e } = await supabase.from('dguv_geraete').update({
          letzte_pruefung: letzteP,
          letzter_pruefer: prName || null,
          naechste_pruefung: naechsteStr,
        }).eq('id', id);
        if (!e) aktualisiert++;

        // Prüfer-Statistik
        if (prName) {
          if (!pruefer[prName]) pruefer[prName] = { anzahl:0, monate:{} };
          pruefer[prName].anzahl++;
          const moKurz = new Date(letzteP).toLocaleString('de-DE',{month:'short'});
          pruefer[prName].monate[moKurz] = (pruefer[prName].monate[moKurz]||0)+1;
        }

        // Monatlich
        const moKurz = new Date(letzteP).toLocaleString('de-DE',{month:'short',year:'numeric'});
        monatlich[moKurz] = (monatlich[moKurz]||0)+1;

        if (i % 50 === 0) setProgress(Math.round(i/total*100));
      }

      const prueferArr: AuswertungItem[] = Object.entries(pruefer)
        .map(([p,v]) => ({ pruefer:p, anzahl:v.anzahl, monate:v.monate }))
        .sort((a,b) => b.anzahl-a.anzahl);

      setResult({ datei:file.name, gesamt:total, aktualisiert, pruefer:prueferArr, monatlich });
      setStatus('done');
      setProgress(100);
      await logActivity(user?.email, `DGUV Abgleich: ${aktualisiert} Geräte aus ${file.name}`, 'dguv_abgleich', undefined, { datei:file.name, aktualisiert });

    } catch(e: any) {
      setStatus('error'); setError(e.message);
    }
  }

  // Chart-Daten für Jahresvergleich
  const MONATE_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const vergleichData = result ? MONATE_KURZ.map(mo => ({
    monat: mo,
    '2025': vergleich2025[mo] || 0,
    '2026': result.pruefer.reduce((s,p) => s+(p.monate[mo]||0), 0),
  })) : [];

  // Prüfer Chart
  const prueferData = result?.pruefer.map(p => ({
    name: p.pruefer.split(' ').slice(-1)[0],
    fullName: p.pruefer,
    Messungen: p.anzahl,
  })) || [];

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div>
        <h1 style={{ fontSize:24, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
          DGUV <span style={{ color:'#f59e0b' }}>Abgleich</span>
        </h1>
        <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>Rohdaten hochladen → Gesamtliste aktualisieren → Auswertung</p>
      </div>

      {/* Upload */}
      {status === 'idle' && (
        <div onClick={()=>fileRef.current?.click()}
          style={{ background:'#fff', border:'2px dashed #e2e8f0', borderRadius:18, padding:'40px 24px', textAlign:'center', cursor:'pointer', transition:'all .2s' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#f59e0b';(e.currentTarget as HTMLElement).style.background='#fffbeb';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLElement).style.background='#fff';}}>
          <div style={{ width:48, height:48, borderRadius:14, background:'#fffbeb', border:'1px solid #fde68a', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <Upload size={22} style={{ color:'#f59e0b' }} />
          </div>
          <p style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 5px' }}>Fertige Prüfung hochladen</p>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>CSV-Rohdaten vom Gerät · z.B. Messungen_August_2026.csv</p>
          <p style={{ fontSize:11, color:'#cbd5e1', margin:'8px 0 0' }}>Felder: ID · LETZTE PRÜFUNG · LETZTER PRÜFER</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value='';}} />
        </div>
      )}

      {/* Progress */}
      {status === 'processing' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #f1f5f9', padding:24, textAlign:'center' }}>
          <RefreshCw size={28} style={{ color:'#f59e0b', animation:'spin 1s linear infinite', marginBottom:12 }} />
          <p style={{ color:'#0f172a', fontWeight:700, fontSize:15, margin:'0 0 12px' }}>Verarbeite... {progress}%</p>
          <div style={{ height:6, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#f59e0b,#f97316)', borderRadius:99, transition:'width .3s ease' }} />
          </div>
        </div>
      )}

      {/* Ergebnis */}
      {status === 'done' && result && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeUp .4s ease both' }}>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              {val:result.gesamt.toLocaleString('de-DE'), lbl:'Zeilen verarbeitet', color:'#3b82f6', border:'#bfdbfe'},
              {val:result.aktualisiert.toLocaleString('de-DE'), lbl:'Geräte aktualisiert', color:'#10b981', border:'#bbf7d0'},
              {val:result.pruefer.length, lbl:'Prüfer erfasst', color:'#f59e0b', border:'#fde68a'},
            ].map((s,i)=>(
              <div key={i} style={{ background:'#fff', borderRadius:14, border:`1px solid ${s.border}`, padding:'14px 18px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:s.color }} />
                <p style={{ fontSize:26, fontWeight:900, color:s.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{s.val}</p>
                <p style={{ fontSize:11, color:'#64748b', margin:0 }}>{s.lbl}</p>
              </div>
            ))}
          </div>

          {/* Jahresvergleich 2025 vs 2026 */}
          <div style={{ background:'#fff', borderRadius:18, padding:'24px 28px', border:'1px solid #f1f5f9' }}>
            <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>
              Jahresvergleich Messungen
            </h2>
            <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>2025 vs. 2026 — Messungen pro Monat</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vergleichData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }} />
                <Bar dataKey="2025" fill="rgba(148,163,184,0.6)" radius={[5,5,0,0]} />
                <Bar dataKey="2026" fill="rgba(245,158,11,0.85)" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Prüfer Auswertung */}
          {prueferData.length > 0 && (
            <div style={{ background:'#fff', borderRadius:18, padding:'24px 28px', border:'1px solid #f1f5f9' }}>
              <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>Messungen pro Prüfer</h2>
              <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Aus dem hochgeladenen Datensatz</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={prueferData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:12, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Messungen" radius={[6,6,0,0]}>
                    {prueferData.map((_,i)=>(
                      <rect key={i} fill={PRUEFER_FARBEN[i%PRUEFER_FARBEN.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10, marginTop:16, paddingTop:16, borderTop:'1px solid #f1f5f9' }}>
                {result.pruefer.map((p,i)=>(
                  <div key={i} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', border:'1px solid #f1f5f9' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:32, height:32, borderRadius:9, background:`${PRUEFER_FARBEN[i%PRUEFER_FARBEN.length]}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Users size={14} style={{ color:PRUEFER_FARBEN[i%PRUEFER_FARBEN.length] }} />
                      </div>
                      <div>
                        <p style={{ fontSize:12, fontWeight:700, color:'#0f172a', margin:0 }}>{p.pruefer}</p>
                        <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{p.anzahl.toLocaleString('de-DE')} Messungen</p>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {Object.entries(p.monate).sort().slice(0,4).map(([mo,cnt])=>(
                        <span key={mo} style={{ fontSize:10, background:`${PRUEFER_FARBEN[i%PRUEFER_FARBEN.length]}15`, color:PRUEFER_FARBEN[i%PRUEFER_FARBEN.length], padding:'1px 7px', borderRadius:5, fontWeight:600 }}>{mo}: {cnt}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <CheckCircle size={18} style={{ color:'#10b981', flexShrink:0 }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'#065f46', margin:0 }}>Abgleich abgeschlossen · {result.datei}</p>
              <p style={{ fontSize:12, color:'#059669', margin:'2px 0 0' }}>Roadmap und alle Auswertungen zeigen jetzt den aktuellen Stand</p>
            </div>
          </div>

          <button onClick={()=>{setStatus('idle');setResult(null);}}
            style={{ padding:'10px 20px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, color:'#64748b', fontSize:13, fontWeight:600, cursor:'pointer', alignSelf:'flex-start' }}>
            Weitere Prüfung hochladen
          </button>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:14, padding:'16px 20px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#991b1b', margin:'0 0 4px' }}>Fehler</p>
          <p style={{ fontSize:12, color:'#dc2626', margin:0 }}>{error}</p>
          <button onClick={()=>setStatus('idle')} style={{ marginTop:12, padding:'7px 16px', background:'#fff', border:'1px solid #fecaca', borderRadius:8, color:'#991b1b', fontSize:12, cursor:'pointer' }}>Nochmal</button>
        </div>
      )}
    </div>
  );
}
