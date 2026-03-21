import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, CheckCircle, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const rawHeaders = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g,''));
  const norm = (s: string) => s.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
  const headerMap: Record<string,string> = {};
  rawHeaders.forEach(h => { headerMap[norm(h)] = h; });
  const findCol = (names: string[]) => { for (const n of names) { const k = norm(n); if (headerMap[k]) return headerMap[k]; } return names[0]; };
  const GMAP: Record<string,string> = {
    'NÄCHSTE PRÜFUNG': findCol(['NÄCHSTE PRÜFUNG','NACHSTE PRUFUNG','N?CHSTE PR?FUNG']),
    'LETZTE PRÜFUNG': findCol(['LETZTE PRÜFUNG','LETZTE PRUFUNG','LETZTE PR?FUNG']),
    'LETZTER PRÜFER': findCol(['LETZTER PRÜFER','LETZTER PRUFER','LETZTER PR?FER']),
  };
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v=>v.trim().replace(/^"|"$/g,''));
    const row: Record<string,string> = {};
    rawHeaders.forEach((h,i) => { row[h] = vals[i]??''; });
    for (const [correct, found] of Object.entries(GMAP)) {
      if (!row[correct] && row[found]) row[correct] = row[found];
    }
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

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0,10);
}

interface AbgleichResult {
  aktualisiert: number;
  nichtGefunden: number;
  fehler: string[];
  details: { id: string; pruefer: string; letzteP: string; naechsteP: string }[];
}

export default function DGUVAbgleich() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle'|'processing'|'done'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AbgleichResult | null>(null);
  const [dateiname, setDateiname] = useState('');

  async function handleFile(file: File) {
    setStatus('processing');
    setProgress(0);
    setResult(null);
    setDateiname(file.name);

    try {
      const text = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? '');
        r.onerror = rej;
        r.readAsText(file, 'ISO-8859-1');
      });

      const rows = parseCSV(text);
      const total = rows.length;
      let aktualisiert = 0;
      let nichtGefunden = 0;
      const fehler: string[] = [];
      const details: AbgleichResult['details'] = [];

      // In Batches verarbeiten
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        setProgress(Math.round((i / total) * 100));

        for (const row of batch) {
          const id = row['ID']?.trim();
          if (!id) continue;

          const letzteP = parseDate(row['LETZTE PRÜFUNG']);
          const pruefer = row['LETZTER PRÜFER']?.trim() || null;

          if (!letzteP) { nichtGefunden++; continue; }

          // Nächste Prüfung = letzte + 12 Monate
          const naechsteP = addMonths(letzteP, 12);

          const { error } = await supabase.from('dguv_geraete').update({
            letzte_pruefung: letzteP,
            letzter_pruefer: pruefer,
            naechste_pruefung: naechsteP,
          }).eq('id', id);

          if (error) {
            if (error.code === 'PGRST116') { nichtGefunden++; }
            else { fehler.push(`ID ${id}: ${error.message}`); }
          } else {
            aktualisiert++;
            if (details.length < 5) details.push({ id, pruefer: pruefer??'–', letzteP, naechsteP });
          }
        }
      }

      setProgress(100);
      const res = { aktualisiert, nichtGefunden, fehler: fehler.slice(0,10), details };
      setResult(res);
      setStatus('done');

      await logActivity(user?.email, `DGUV Abgleich: ${aktualisiert} Geräte aktualisiert aus ${file.name}`, 'dguv_abgleich', undefined, { datei: file.name, aktualisiert, nichtGefunden });

    } catch (e: any) {
      setStatus('error');
      setResult({ aktualisiert:0, nichtGefunden:0, fehler:[e.message], details:[] });
    }
  }

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div>
        <h1 style={{ fontSize:24, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
          Prüfungen <span style={{ color:'#f59e0b' }}>abgleichen</span>
        </h1>
        <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>
          Fertige Monatsprüfung hochladen → Gesamtliste wird automatisch aktualisiert → Roadmap zeigt neuen Stand
        </p>
      </div>

      {/* Erklärung */}
      <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:16, padding:'16px 20px', display:'flex', gap:16, alignItems:'flex-start' }}>
        <AlertTriangle size={18} style={{ color:'#f59e0b', flexShrink:0, marginTop:1 }} />
        <div>
          <p style={{ fontSize:13, fontWeight:700, color:'#92400e', margin:'0 0 4px' }}>Was passiert beim Abgleich?</p>
          <div style={{ fontSize:12, color:'#b45309', display:'flex', flexDirection:'column', gap:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ background:'#fef3c7', padding:'1px 8px', borderRadius:4, fontWeight:600 }}>Schritt 1</span>
              CSV der fertigen Monatsprüfung hochladen
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ background:'#fef3c7', padding:'1px 8px', borderRadius:4, fontWeight:600 }}>Schritt 2</span>
              System liest LETZTE PRÜFUNG + LETZTER PRÜFER pro Gerät
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ background:'#fef3c7', padding:'1px 8px', borderRadius:4, fontWeight:600 }}>Schritt 3</span>
              NÄCHSTE PRÜFUNG wird automatisch auf +12 Monate gesetzt
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ background:'#fef3c7', padding:'1px 8px', borderRadius:4, fontWeight:600 }}>Schritt 4</span>
              Roadmap zeigt sofort den aktualisierten Stand
            </div>
          </div>
        </div>
      </div>

      {/* Upload */}
      {status === 'idle' && (
        <div onClick={() => fileRef.current?.click()}
          style={{ background:'#fff', border:'2px dashed #e2e8f0', borderRadius:18, padding:'40px 24px', textAlign:'center', cursor:'pointer', transition:'all .2s' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#f59e0b';(e.currentTarget as HTMLElement).style.background='#fffbeb';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLElement).style.background='#fff';}}>
          <div style={{ width:48, height:48, borderRadius:14, background:'#fffbeb', border:'1px solid #fde68a', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <Upload size={22} style={{ color:'#f59e0b' }} />
          </div>
          <p style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 5px' }}>Fertige Prüfung hochladen</p>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Rohdaten CSV vom Gossen-Metrawatt Gerät · z.B. Messungen_August.csv</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value='';}} />
        </div>
      )}

      {/* Progress */}
      {status === 'processing' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #f1f5f9', padding:24, textAlign:'center' }}>
          <RefreshCw size={28} style={{ color:'#f59e0b', animation:'spin 1s linear infinite', marginBottom:12 }} />
          <p style={{ color:'#0f172a', fontWeight:700, fontSize:15, margin:'0 0 12px' }}>Gleiche ab... {progress}%</p>
          <div style={{ height:6, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#f59e0b,#f97316)', borderRadius:99, transition:'width .3s ease' }} />
          </div>
          <p style={{ fontSize:12, color:'#94a3b8', margin:'8px 0 0' }}>{dateiname}</p>
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeUp .4s ease both' }}>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { val:result.aktualisiert, lbl:'Geräte aktualisiert', color:'#10b981', border:'#bbf7d0' },
              { val:result.nichtGefunden, lbl:'Nicht in Gesamtliste', color:'#f59e0b', border:'#fde68a' },
              { val:result.fehler.length, lbl:'Fehler', color: result.fehler.length>0?'#ef4444':'#94a3b8', border: result.fehler.length>0?'#fecaca':'#f1f5f9' },
            ].map((s,i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, border:`1px solid ${s.border}`, padding:'14px 18px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:s.color }} />
                <p style={{ fontSize:26, fontWeight:900, color:s.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{s.val.toLocaleString('de-DE')}</p>
                <p style={{ fontSize:11, color:'#64748b', margin:0 }}>{s.lbl}</p>
              </div>
            ))}
          </div>

          {/* Success message */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <CheckCircle size={18} style={{ color:'#10b981', flexShrink:0 }} />
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:'#065f46', margin:0 }}>Abgleich abgeschlossen · {dateiname}</p>
              <p style={{ fontSize:12, color:'#059669', margin:'2px 0 0' }}>Roadmap und Auswertung zeigen jetzt den aktuellen Stand</p>
            </div>
          </div>

          {/* Sample */}
          {result.details.length > 0 && (
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #f1f5f9', overflow:'hidden' }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#0f172a', padding:'12px 16px', borderBottom:'1px solid #f1f5f9', margin:0 }}>Beispiel-Aktualisierungen</p>
              {result.details.map((d,i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 140px 1fr 20px 1fr', gap:8, padding:'10px 16px', borderBottom:'1px solid #f8fafc', fontSize:12, alignItems:'center' }}>
                  <span style={{ fontFamily:'monospace', color:'#94a3b8', fontSize:11 }}>#{d.id}</span>
                  <span style={{ color:'#64748b' }}>{d.pruefer}</span>
                  <span style={{ color:'#0f172a', fontWeight:500 }}>{d.letzteP}</span>
                  <ArrowRight size={12} style={{ color:'#10b981' }} />
                  <span style={{ color:'#10b981', fontWeight:600 }}>{d.naechsteP}</span>
                </div>
              ))}
            </div>
          )}

          {/* Errors */}
          {result.fehler.length > 0 && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:14, padding:'14px 18px' }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#991b1b', margin:'0 0 8px' }}>Fehler ({result.fehler.length})</p>
              {result.fehler.map((f,i) => <p key={i} style={{ fontSize:11, color:'#dc2626', margin:'2px 0', fontFamily:'monospace' }}>{f}</p>)}
            </div>
          )}

          <button onClick={() => { setStatus('idle'); setResult(null); }}
            style={{ padding:'10px 20px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, color:'#64748b', fontSize:13, fontWeight:600, cursor:'pointer', alignSelf:'flex-start', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';}}>
            Weitere Prüfung abgleichen
          </button>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:14, padding:'16px 20px' }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#991b1b', margin:'0 0 4px' }}>Fehler beim Abgleich</p>
          <p style={{ fontSize:12, color:'#dc2626', margin:0 }}>{result?.fehler[0]}</p>
          <button onClick={() => setStatus('idle')} style={{ marginTop:12, padding:'7px 16px', background:'#fff', border:'1px solid #fecaca', borderRadius:8, color:'#991b1b', fontSize:12, cursor:'pointer' }}>Nochmal versuchen</button>
        </div>
      )}
    </div>
  );
}
