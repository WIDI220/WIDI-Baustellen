import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Upload, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

const MONATE_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const PRUEFER_FARBEN = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16'];

function Tooltip2({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1e293b', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'10px 14px' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:20, fontSize:12, marginBottom:2 }}>
          <span style={{ color:p.color||p.fill, fontWeight:500 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#fff' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (v.match(/^\d{4}-\d{2}-\d{2}/)) return v.slice(0,10);
  return null;
}

function normPruefer(name: string): string {
  const map: Record<string,string> = {
    'kaminski':'R. Kaminski','rene kaminski':'R. Kaminski','r. kaminski':'R. Kaminski',
    'willing':'N. Willing','n. willing':'N. Willing',
    'münch':'M. Münch','m. münch':'M. Münch','munch':'M. Münch',
    'van der werf':'T. van der Werf','t. van der werf':'T. van der Werf',
    'giesmann':'S. Giesmann','s. giesmann':'S. Giesmann',
  };
  return map[name.toLowerCase().trim()] || name.trim();
}

export default function DGUVAbgleich() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastUpload, setLastUpload] = useState('');

  // Lade alle historischen Daten aus Supabase — LETZTE PRÜFUNG + LETZTER PRÜFER
  const { data: geraete = [], refetch, isLoading } = useQuery({
    queryKey: ['dguv-auswertung-hist'],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('dguv_geraete')
          .select('letzte_pruefung, letzter_pruefer')
          .not('letzte_pruefung', 'is', null)
          .range(from, from+999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
    staleTime: 60 * 1000,
  });

  // Monatliche Auswertung aus Supabase-Daten
  const monatStats: Record<string, Record<string, number>> = {};
  (geraete as any[]).forEach((r: any) => {
    const d = r.letzte_pruefung;
    if (!d) return;
    const year = d.slice(0,4);
    const mo = parseInt(d.slice(5,7)) - 1;
    const moKey = `${year}-${String(mo+1).padStart(2,'0')}`;
    const pruefer = r.letzter_pruefer ? normPruefer(r.letzter_pruefer) : 'Unbekannt';
    if (!monatStats[moKey]) monatStats[moKey] = {};
    monatStats[moKey][pruefer] = (monatStats[moKey][pruefer] || 0) + 1;
  });

  // Alle Prüfer sammeln
  const allePruefer = Array.from(new Set(
    Object.values(monatStats).flatMap(m => Object.keys(m))
  )).filter(p => p !== 'Unbekannt').sort();

  // Jahres-Daten aufbereiten — 2024 vs 2025 vs 2026
  const buildJahresData = (year: string) => {
    return MONATE_KURZ.map((mo, i) => {
      const key = `${year}-${String(i+1).padStart(2,'0')}`;
      const stats = monatStats[key] || {};
      const gesamt = Object.values(stats).reduce((s,v) => s+v, 0);
      return { monat: mo, gesamt, ...stats };
    });
  };

  const data2024 = buildJahresData('2024');
  const data2025 = buildJahresData('2025');
  const data2026 = buildJahresData('2026');

  // Vergleichs-Chart: 2024 vs 2025 vs 2026
  const vergleichData = MONATE_KURZ.map((mo, i) => ({
    monat: mo,
    '2024': data2024[i].gesamt,
    '2025': data2025[i].gesamt,
    '2026': data2026[i].gesamt,
  }));

  // Prüfer-Chart für aktuelles Jahr (2026 oder letztes mit Daten)
  const prueferJahr = data2026.some(d => d.gesamt > 0) ? '2026' :
                      data2025.some(d => d.gesamt > 0) ? '2025' : '2024';
  const prueferData = MONATE_KURZ.map((mo, i) => {
    const key = `${prueferJahr}-${String(i+1).padStart(2,'0')}`;
    const stats = monatStats[key] || {};
    const gesamt = Object.values(stats).reduce((s,v) => s+v, 0);
    if (gesamt === 0) return null;
    return { monat: mo, ...stats };
  }).filter(Boolean);

  const gesamtMessungen = (geraete as any[]).length;

  // Upload Handler
  async function handleFile(file: File) {
    setUploading(true); setProgress(0);
    try {
      const text = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? '');
        r.onerror = rej;
        r.readAsText(file, 'ISO-8859-1');
      });

      const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
      if (lines.length < 2) throw new Error('Datei leer');
      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map(h=>h.trim().replace(/^"|"$/g,''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));
        const row: Record<string,string> = {};
        headers.forEach((h,i) => { row[h] = vals[i] ?? ''; });
        return row;
      }).filter(r => r['ID']?.trim());

      let done = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = row['ID']?.trim();
        if (!id) continue;
        const letzteP = parseDate(row['LETZTE PRÜFUNG'] || row['LETZTE PRUEFUNG'] || '');
        const pruefer = row['LETZTER PRÜFER'] || row['LETZTER PRUFER'] || '';
        if (!letzteP) continue;
        const naechste = new Date(letzteP);
        naechste.setMonth(naechste.getMonth() + 12);
        await supabase.from('dguv_geraete').update({
          letzte_pruefung: letzteP,
          letzter_pruefer: normPruefer(pruefer) || null,
          naechste_pruefung: naechste.toISOString().slice(0,10),
        }).eq('id', id);
        done++;
        if (i % 100 === 0) setProgress(Math.round(i/rows.length*100));
      }
      setLastUpload(`${file.name} · ${done} Geräte aktualisiert`);
      setProgress(100);
      refetch();
    } catch(e: any) {
      alert('Fehler: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  const cardStyle = { background:'#fff', borderRadius:18, padding:'24px 28px', border:'1px solid #f1f5f9' };

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header + Upload */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Prüfungs<span style={{ color:'#f59e0b' }}>auswertung</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>
            {isLoading ? 'Lädt...' : `${gesamtMessungen.toLocaleString('de-DE')} Messungen in der Datenbank`}
            {lastUpload && <span style={{ color:'#10b981', marginLeft:10 }}>✓ {lastUpload}</span>}
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background: uploading?'#f1f5f9':'#f59e0b', color: uploading?'#94a3b8':'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor: uploading?'not-allowed':'pointer', boxShadow: uploading?'none':'0 4px 12px rgba(245,158,11,.35)', transition:'all .15s' }}>
          {uploading
            ? <><RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }}/> {progress}% hochladen...</>
            : <><Upload size={14}/> Messungen hochladen</>
          }
        </button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
          onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value='';}} />
      </div>

      {isLoading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
          <RefreshCw size={28} style={{ color:'#f59e0b', animation:'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Jahresvergleich */}
          <div style={cardStyle}>
            <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>
              Jahresvergleich Messungen
            </h2>
            <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Messungen pro Monat — 2024 · 2025 · 2026</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={vergleichData} barGap={4} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip2 />} />
                <Legend wrapperStyle={{ fontSize:12, paddingTop:10 }} />
                <Bar dataKey="2024" fill="rgba(148,163,184,0.5)" radius={[5,5,0,0]} />
                <Bar dataKey="2025" fill="rgba(59,130,246,0.8)"  radius={[5,5,0,0]} />
                <Bar dataKey="2026" fill="rgba(245,158,11,0.85)" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Prüfer Auswertung */}
          {prueferData.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>
                Messungen pro Prüfer · {prueferJahr}
              </h2>
              <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Aufschlüsselung nach Prüfer je Monat</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={prueferData} barGap={4} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="monat" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tooltip2 />} />
                  <Legend wrapperStyle={{ fontSize:12, paddingTop:10 }} />
                  {allePruefer.map((p, i) => (
                    <Bar key={p} dataKey={p} stackId="a" fill={PRUEFER_FARBEN[i % PRUEFER_FARBEN.length]} radius={i===allePruefer.length-1?[5,5,0,0]:[0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Prüfer Karten */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginTop:20, paddingTop:18, borderTop:'1px solid #f1f5f9' }}>
                {allePruefer.map((p, i) => {
                  const total = (geraete as any[]).filter((r:any) => r.letzter_pruefer && normPruefer(r.letzter_pruefer) === p).length;
                  return (
                    <div key={p} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', border:'1px solid #f1f5f9' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:PRUEFER_FARBEN[i%PRUEFER_FARBEN.length], marginBottom:8 }} />
                      <p style={{ fontSize:12, fontWeight:700, color:'#0f172a', margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p}</p>
                      <p style={{ fontSize:18, fontWeight:900, color:PRUEFER_FARBEN[i%PRUEFER_FARBEN.length], margin:0, letterSpacing:'-.03em' }}>{total.toLocaleString('de-DE')}</p>
                      <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>Messungen gesamt</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
