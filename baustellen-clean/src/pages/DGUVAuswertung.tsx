import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, RefreshCw, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const MONATE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ── Datum parsen (CSV-String, Excel-Zahl, Date-Objekt) ────────────
function parseDatum(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'number') {
    try { const d = XLSX.SSF.parse_date_code(v); if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`; } catch {}
  }
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return null;
}

// ── Spalten finden ohne Verwechslungen ───────────────────────────
function normStr(s: string) {
  return s.toLowerCase()
    .replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]/g,'');
}

function findCol(headers: string[], targets: string[]): number {
  // Exakter Treffer zuerst
  for (const t of targets) {
    const i = headers.findIndex(h => normStr(h) === t);
    if (i >= 0) return i;
  }
  // Teilstring – kürzester Treffer (verhindert falsche Matches)
  let bestIdx = -1; let bestLen = Infinity;
  for (const t of targets) {
    headers.forEach((h, i) => {
      const n = normStr(h);
      if (n.startsWith(t) && h.length < bestLen) { bestIdx = i; bestLen = h.length; }
    });
    if (bestIdx >= 0) return bestIdx;
  }
  return -1;
}

interface Row { pruefer: string; monat: string; ergebnis: 'bestanden'|'nicht_bestanden'; }

async function parseFile(file: File, aliaseMap: Record<string,string>): Promise<{ rows: Row[]; unbekannt: string[] }> {
  const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
  let headers: string[] = [];
  let rawRows: string[][] = [];

  if (isXlsx) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    // Sheet mit LETZTER PRÜFER und meisten Zeilen
    let bestSheet = ''; let bestCount = 0;
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
      if (data.length < 2) continue;
      const hdrs = data[0].map(String);
      const hasPruefer = hdrs.some(h => normStr(h).startsWith('letzterpr') || normStr(h) === 'letzterpruefer');
      if (hasPruefer && data.length > bestCount) { bestSheet = sn; bestCount = data.length; headers = hdrs; rawRows = data.slice(1); }
    }
    if (!bestSheet) throw new Error('Kein Sheet mit "LETZTER PRÜFER" Spalte gefunden');
  } else {
    const text = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = e => res(e.target?.result as string ?? ''); r.onerror = rej;
      r.readAsText(file, 'ISO-8859-1');
    });
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Datei leer');
    headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,''));
    rawRows = lines.slice(1).map(l => l.split(';').map(v => v.trim().replace(/^"|"$/g,'')));
  }

  // Spalten-Indizes – PRÄZISE
  const iPruefer  = findCol(headers, ['letzterpruefer', 'letzterpr']);
  const iDatum    = findCol(headers, ['letztepruefung', 'letztepru']);
  const iErgebnis = findCol(headers, ['ergebnisderletztenprufung', 'ergebnis']);

  if (iPruefer < 0)  throw new Error(`Spalte "LETZTER PRÜFER" nicht gefunden. Gefundene Spalten: ${headers.slice(0,8).join(', ')}`);
  if (iDatum < 0)    throw new Error(`Spalte "LETZTE PRÜFUNG" nicht gefunden`);

  const rows: Row[] = [];
  const unbekSet = new Set<string>();

  for (const cols of rawRows) {
    const prueferRaw = String(cols[iPruefer] ?? '').trim();
    const datumRaw   = cols[iDatum];
    const ergRaw     = iErgebnis >= 0 ? String(cols[iErgebnis] ?? '').trim().toLowerCase() : '';

    if (!prueferRaw) continue;
    const datum = parseDatum(datumRaw);
    if (!datum) continue;

    const pruefer = aliaseMap[prueferRaw.toLowerCase()] ?? prueferRaw;
    if (pruefer === prueferRaw && prueferRaw.includes('.') && prueferRaw.split(' ').length <= 2) {
      unbekSet.add(prueferRaw);
    }

    rows.push({
      pruefer,
      monat: datum.slice(0, 7),
      ergebnis: ergRaw.includes('nicht') ? 'nicht_bestanden' : 'bestanden',
    });
  }
  return { rows, unbekannt: Array.from(unbekSet) };
}

// ════════════════════════════════════════════════════════
export default function DGUVAuswertung() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ansicht, setAnsicht]     = useState<'monat'|'jahr'|'vergleich'>('monat');
  const [jahr, setJahr]           = useState(new Date().getFullYear());
  const [monat, setMonat]         = useState(new Date().getMonth() + 1);
  const [jahr2, setJahr2]         = useState(new Date().getFullYear() - 1);
  const [newAlias, setNewAlias]   = useState({ alias:'', kanonik:'' });
  const [showAlias, setShowAlias] = useState(false);

  // ── Daten ─────────────────────────────────────────────
  const { data: erg = [] } = useQuery({
    queryKey: ['dguv-ergebnisse'],
    queryFn: async () => { const { data } = await supabase.from('dguv_mess_ergebnisse').select('*').order('monat'); return data ?? []; },
  });
  const { data: imp = [], refetch: refetchImp } = useQuery({
    queryKey: ['dguv-importe-neu'],
    queryFn: async () => { const { data } = await supabase.from('dguv_mess_importe').select('*').order('created_at', { ascending: false }); return data ?? []; },
  });
  const { data: aliaseRaw = [], refetch: refetchAliase } = useQuery({
    queryKey: ['dguv-aliase'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer_aliase').select('*').order('alias'); return data ?? []; },
  });
  const aliaseMap = useMemo(() => {
    const m: Record<string,string> = {};
    (aliaseRaw as any[]).forEach((a:any) => { m[a.alias.toLowerCase()] = a.kanonikname; });
    return m;
  }, [aliaseRaw]);

  const ergebnisse = erg as any[];
  const importe    = imp as any[];

  // ── Aggregation: pruefer → monat → zahlen ─────────────
  const agg = useMemo(() => {
    const m: Record<string, Record<string, {g:number;b:number;nb:number}>> = {};
    ergebnisse.forEach(e => {
      if (!m[e.pruefer_name]) m[e.pruefer_name] = {};
      if (!m[e.pruefer_name][e.monat]) m[e.pruefer_name][e.monat] = {g:0,b:0,nb:0};
      m[e.pruefer_name][e.monat].g  += e.gesamt     ?? 0;
      m[e.pruefer_name][e.monat].b  += e.bestanden  ?? 0;
      m[e.pruefer_name][e.monat].nb += e.nicht_best ?? 0;
    });
    return m;
  }, [ergebnisse]);

  const allePruefer = useMemo(() => Array.from(new Set(ergebnisse.map(e => e.pruefer_name))).sort(), [ergebnisse]);
  const maxVal = useMemo(() => { let mx=0; allePruefer.forEach(p => Object.values(agg[p]??{}).forEach(v => { if(v.g>mx) mx=v.g; })); return mx||1; }, [agg, allePruefer]);

  function getVal(p: string, m: string) { return agg[p]?.[m] ?? {g:0,b:0,nb:0}; }
  function getJahrSum(p: string, j: number) {
    let g=0,b=0,nb=0;
    Object.entries(agg[p]??{}).forEach(([m,v]) => { if(m.startsWith(String(j))) { g+=v.g; b+=v.b; nb+=v.nb; } });
    return {g,b,nb};
  }

  // Monate im gewählten Jahr die Daten haben
  const monateImJahr = useMemo(() => {
    const s = new Set<string>();
    ergebnisse.filter(e => e.monat?.startsWith(String(jahr))).forEach(e => s.add(e.monat));
    return Array.from(s).sort();
  }, [ergebnisse, jahr]);

  const selectedMonat = `${jahr}-${String(monat).padStart(2,'0')}`;

  // ── Import ─────────────────────────────────────────────
  async function handleImport(file: File) {
    setUploading(true);
    try {
      const { rows, unbekannt } = await parseFile(file, aliaseMap);
      if (rows.length === 0) throw new Error('Keine gültigen Zeilen – Prüfer und Datum müssen vorhanden sein');

      // Aggregieren
      const aggMap: Record<string,{pruefer:string;monat:string;g:number;b:number;nb:number}> = {};
      rows.forEach(r => {
        const key = `${r.pruefer}__${r.monat}`;
        if (!aggMap[key]) aggMap[key] = { pruefer: r.pruefer, monat: r.monat, g:0, b:0, nb:0 };
        aggMap[key].g++;
        if (r.ergebnis === 'bestanden') aggMap[key].b++; else aggMap[key].nb++;
      });

      const monate = [...new Set(rows.map(r => r.monat))].sort();

      const { data: impRow, error: impErr } = await supabase.from('dguv_mess_importe').insert({
        dateiname:  file.name,
        monat:      monate[0],
        kunde:      '',
        gesamt:     rows.length,
        bestanden:  rows.filter(r => r.ergebnis === 'bestanden').length,
        nicht_best: rows.filter(r => r.ergebnis === 'nicht_bestanden').length,
      }).select().single();
      if (impErr) throw new Error('Import-Header: ' + impErr.message);

      const insRows = Object.values(aggMap).map(v => ({
        import_id:    impRow.id,
        pruefer_name: v.pruefer,
        monat:        v.monat,
        kunde:        '',
        gesamt:       v.g,
        bestanden:    v.b,
        nicht_best:   v.nb,
      }));
      const { error: ergErr } = await supabase.from('dguv_mess_ergebnisse').insert(insRows);
      if (ergErr) throw new Error('Ergebnisse: ' + ergErr.message);

      toast.success(`✓ ${rows.length} Messungen aus ${monate.length > 1 ? monate.length + ' Monaten' : monate[0]} importiert`);
      if (unbekannt.length > 0) toast.info(`Kurzformen erkannt: ${unbekannt.join(', ')} – bitte Alias hinterlegen`);

      // Jahr/Monat auf ersten importierten Monat setzen
      const erstMonat = monate[0];
      setJahr(parseInt(erstMonat.slice(0,4)));
      setMonat(parseInt(erstMonat.slice(5,7)));
      setAnsicht('monat');

      qc.invalidateQueries({ queryKey: ['dguv-ergebnisse'] });
      qc.invalidateQueries({ queryKey: ['dguv-importe-neu'] });
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function deleteImport(id: string) {
    if (!confirm('Import löschen?')) return;
    await supabase.from('dguv_mess_importe').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['dguv-ergebnisse'] });
    qc.invalidateQueries({ queryKey: ['dguv-importe-neu'] });
    toast.success('Gelöscht');
  }

  // ── Styles ─────────────────────────────────────────────
  const card = { background:'#fff', border:'1px solid #f1f5f9', borderRadius:16 };
  const th   = { padding:'10px 16px', fontWeight:700, color:'#374151', fontSize:12, borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' as const };
  const td   = { padding:'10px 16px', fontSize:13, borderBottom:'1px solid #f8fafc' };

  function Badge({val,color,bg}:{val:number;color:string;bg:string}) {
    return <span style={{fontSize:12,fontWeight:700,padding:'2px 8px',borderRadius:99,background:bg,color}}>{val}</span>;
  }

  function heatBg(v:number) {
    if (v===0) return '#f8fafc';
    const p = v/maxVal;
    if (p<0.2) return '#dbeafe'; if (p<0.4) return '#93c5fd';
    if (p<0.6) return '#3b82f6'; if (p<0.8) return '#1d4ed8'; return '#1e3a5f';
  }
  function heatFg(v:number) { return v/maxVal>0.4?'#fff':'#1e3a5f'; }

  // ── Monat navigieren ───────────────────────────────────
  function prevMonat() { if (monat===1) { setMonat(12); setJahr(j=>j-1); } else setMonat(m=>m-1); }
  function nextMonat() { if (monat===12) { setMonat(1); setJahr(j=>j+1); } else setMonat(m=>m+1); }

  const hasDatenMonat = allePruefer.some(p => getVal(p, selectedMonat).g > 0);
  const gesamtMonat   = allePruefer.reduce((s,p) => s + getVal(p, selectedMonat).g, 0);

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",color:'#0f172a'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* ── HEADER ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:'-.03em'}}>DGUV Messauswertung</h1>
          <p style={{fontSize:13,color:'#64748b',margin:'2px 0 0'}}>Monat · Jahres-Heatmap · Jahresvergleich</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer',opacity:uploading?0.6:1,boxShadow:'0 4px 12px rgba(245,158,11,.3)'}}>
          {uploading ? <><RefreshCw size={15} style={{animation:'spin 1s linear infinite'}}/> Importiert...</> : <><Upload size={15}/> CSV / Excel importieren</>}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); }}/>
      </div>

      {/* ── TABS ── */}
      <div style={{display:'flex',gap:8,marginBottom:24,borderBottom:'1px solid #f1f5f9',paddingBottom:12}}>
        {([['monat','📅 Monatsansicht'],['jahr','🟦 Jahres-Heatmap'],['vergleich','📊 Jahresvergleich']] as const).map(([k,label]) => (
          <button key={k} onClick={() => setAnsicht(k)}
            style={{padding:'8px 18px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,cursor:'pointer',
              background:ansicht===k?'#1e3a5f':'transparent',color:ansicht===k?'#fff':'#64748b',
              borderBottom:ansicht===k?'2px solid #f59e0b':'2px solid transparent'}}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          MONATSANSICHT
      ════════════════════════════════════════════════════════ */}
      {ansicht==='monat' && (
        <div>
          {/* Monat-Navigation */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,background:'#f1f5f9',borderRadius:12,padding:'6px 10px'}}>
              <button onClick={prevMonat} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 8px',fontSize:18,lineHeight:1}}>‹</button>
              <span style={{fontSize:16,fontWeight:800,minWidth:120,textAlign:'center',color:'#0f172a'}}>
                {MONATE[monat-1]} {jahr}
              </span>
              <button onClick={nextMonat} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 8px',fontSize:18,lineHeight:1}}>›</button>
            </div>
            {/* Schnellauswahl: Monate mit Daten */}
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {Array.from({length:12},(_,i) => {
                const m = `${jahr}-${String(i+1).padStart(2,'0')}`;
                const hasData = allePruefer.some(p => getVal(p,m).g > 0);
                const isSelected = monat === i+1;
                return (
                  <button key={i} onClick={() => setMonat(i+1)}
                    style={{padding:'5px 10px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',
                      background:isSelected?'#f59e0b':hasData?'#fef3c7':'#f8fafc',
                      color:isSelected?'#fff':hasData?'#92400e':'#cbd5e1'}}>
                    {MONATE[i]}
                  </button>
                );
              })}
            </div>
            <div style={{display:'flex',gap:6,marginLeft:'auto',alignItems:'center'}}>
              <button onClick={() => setJahr(y=>y-1)} style={{padding:'5px 10px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:12,color:'#64748b'}}>{jahr-1}</button>
              <span style={{fontSize:12,fontWeight:700,padding:'5px 10px',borderRadius:8,background:'#1e3a5f',color:'#fff'}}>{jahr}</span>
              <button onClick={() => setJahr(y=>y+1)} style={{padding:'5px 10px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:12,color:'#64748b'}}>{jahr+1}</button>
            </div>
          </div>

          {!hasDatenMonat ? (
            <div style={{...card,textAlign:'center',padding:'64px 0'}}>
              <p style={{fontSize:48,marginBottom:16}}>📂</p>
              <p style={{fontSize:16,fontWeight:700,color:'#64748b',marginBottom:6}}>Keine Daten für {MONATE[monat-1]} {jahr}</p>
              <p style={{fontSize:13,color:'#94a3b8',marginBottom:20}}>Importiere eine CSV oder Excel-Datei für diesen Monat</p>
              <button onClick={() => fileRef.current?.click()}
                style={{padding:'10px 24px',background:'#f59e0b',color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer'}}>
                Datei importieren
              </button>
            </div>
          ) : (
            <div style={{...card,overflow:'hidden'}}>
              {/* Monat-Header */}
              <div style={{padding:'16px 20px',borderBottom:'1px solid #f1f5f9',background:'linear-gradient(135deg,#1e3a5f,#2563eb)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <h2 style={{fontSize:18,fontWeight:800,color:'#fff',margin:0}}>{MONATE[monat-1]} {jahr}</h2>
                  <p style={{fontSize:12,color:'rgba(255,255,255,.6)',margin:'2px 0 0'}}>{allePruefer.filter(p=>getVal(p,selectedMonat).g>0).length} Prüfer aktiv</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{fontSize:28,fontWeight:800,color:'#fff',margin:0,letterSpacing:'-.04em'}}>{gesamtMonat.toLocaleString('de-DE')}</p>
                  <p style={{fontSize:12,color:'rgba(255,255,255,.6)',margin:0}}>Messungen gesamt</p>
                </div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    <th style={{...th,textAlign:'left'}}>Prüfer</th>
                    <th style={{...th,textAlign:'right'}}>Messungen gesamt</th>
                    <th style={{...th,textAlign:'right'}}>✓ Bestanden</th>
                    <th style={{...th,textAlign:'right'}}>✗ Nicht bestanden</th>
                    <th style={{...th,textAlign:'right'}}>Bestanden-Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {allePruefer
                    .map(p => ({p, ...getVal(p, selectedMonat)}))
                    .filter(r => r.g > 0)
                    .sort((a,b) => b.g-a.g)
                    .map((r,i) => (
                      <tr key={r.p} style={{background:i%2===0?'#fff':'#fafbfc'}}>
                        <td style={{...td,fontWeight:600,fontSize:14}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{width:34,height:34,borderRadius:10,background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,color:'#1e3a5f',flexShrink:0}}>
                              {r.p.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}
                            </div>
                            {r.p}
                          </div>
                        </td>
                        <td style={{...td,textAlign:'right',fontWeight:800,fontSize:20,color:'#0f172a'}}>{r.g}</td>
                        <td style={{...td,textAlign:'right'}}><Badge val={r.b} color="#15803d" bg="#f0fdf4"/></td>
                        <td style={{...td,textAlign:'right'}}>{r.nb>0?<Badge val={r.nb} color="#dc2626" bg="#fef2f2"/>:<span style={{color:'#cbd5e1'}}>–</span>}</td>
                        <td style={{...td,textAlign:'right'}}>
                          <span style={{fontSize:14,fontWeight:800,color:r.nb/r.g<0.05?'#15803d':'#dc2626'}}>
                            {Math.round(r.b/r.g*100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  {/* Summenzeile */}
                  <tr style={{background:'#f1f5f9'}}>
                    <td style={{...td,fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.04em',color:'#374151'}}>Gesamt</td>
                    <td style={{...td,textAlign:'right',fontWeight:800,fontSize:20}}>{gesamtMonat}</td>
                    <td style={{...td,textAlign:'right'}}><Badge val={allePruefer.reduce((s,p)=>s+getVal(p,selectedMonat).b,0)} color="#15803d" bg="#f0fdf4"/></td>
                    <td style={{...td,textAlign:'right'}}><Badge val={allePruefer.reduce((s,p)=>s+getVal(p,selectedMonat).nb,0)} color="#dc2626" bg="#fef2f2"/></td>
                    <td style={{...td,textAlign:'right',fontWeight:800,color:'#15803d'}}>
                      {gesamtMonat>0?`${Math.round(allePruefer.reduce((s,p)=>s+getVal(p,selectedMonat).b,0)/gesamtMonat*100)}%`:'–'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          JAHRES-HEATMAP
      ════════════════════════════════════════════════════════ */}
      {ansicht==='jahr' && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
            <button onClick={()=>setJahr(y=>y-1)} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'#64748b',fontWeight:700}}><ChevronLeft size={14}/></button>
            <span style={{fontSize:16,fontWeight:800,minWidth:60,textAlign:'center'}}>{jahr}</span>
            <button onClick={()=>setJahr(y=>y+1)} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'#64748b',fontWeight:700}}><ChevronRight size={14}/></button>
          </div>

          {/* KPI-Kacheln */}
          {allePruefer.filter(p=>getJahrSum(p,jahr).g>0).length > 0 && (
            <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(allePruefer.filter(p=>getJahrSum(p,jahr).g>0).length+1,5)},1fr)`,gap:12,marginBottom:20}}>
              <div style={{...card,padding:'16px 18px',borderTop:'3px solid #1e3a5f'}}>
                <p style={{fontSize:24,fontWeight:800,margin:'0 0 2px',letterSpacing:'-.04em'}}>
                  {allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr).g,0).toLocaleString('de-DE')}
                </p>
                <p style={{fontSize:11,color:'#64748b',margin:0,fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em'}}>Gesamt {jahr}</p>
              </div>
              {allePruefer.filter(p=>getJahrSum(p,jahr).g>0).map(p => {
                const {g,b,nb} = getJahrSum(p,jahr);
                return (
                  <div key={p} style={{...card,padding:'16px 18px',borderTop:'3px solid #f59e0b'}}>
                    <p style={{fontSize:22,fontWeight:800,margin:'0 0 2px',letterSpacing:'-.04em'}}>{g.toLocaleString('de-DE')}</p>
                    <p style={{fontSize:11,color:'#64748b',margin:'0 0 6px',fontWeight:600}}>{p}</p>
                    <div style={{display:'flex',gap:5}}><Badge val={b} color="#15803d" bg="#f0fdf4"/>{nb>0&&<Badge val={nb} color="#dc2626" bg="#fef2f2"/>}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={card}>
            {allePruefer.filter(p=>getJahrSum(p,jahr).g>0).length===0
              ? <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}>
                  <p style={{fontSize:36,marginBottom:12}}>📊</p>
                  <p style={{fontSize:15,fontWeight:600,color:'#64748b'}}>Keine Daten für {jahr}</p>
                </div>
              : <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr style={{background:'#f8fafc'}}>
                      <th style={{...th,textAlign:'left'}}>Prüfer</th>
                      {MONATE.map((m,i)=><th key={i} style={{...th,textAlign:'center',minWidth:52}}>{m}</th>)}
                      <th style={{...th,textAlign:'right'}}>Gesamt</th>
                    </tr></thead>
                    <tbody>
                      {allePruefer.filter(p=>getJahrSum(p,jahr).g>0).map((p,pi)=>{
                        const {g:jg,b:jb,nb:jnb}=getJahrSum(p,jahr);
                        return(<tr key={p} style={{background:pi%2===0?'#fff':'#fafbfc'}}>
                          <td style={{...td,fontWeight:600,whiteSpace:'nowrap'}}>{p}</td>
                          {Array.from({length:12},(_,i)=>`${jahr}-${String(i+1).padStart(2,'0')}`).map(m=>{
                            const v=getVal(p,m);
                            return(<td key={m} style={{...td,textAlign:'center',padding:'6px 4px'}}>
                              {v.g>0
                                ?<div style={{width:46,height:36,borderRadius:8,background:heatBg(v.g),display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',margin:'0 auto',cursor:'pointer'}}
                                    title={`${v.g} · ${v.b}✓ · ${v.nb}✗`}
                                    onClick={()=>{setMonat(parseInt(m.slice(5,7)));setJahr(parseInt(m.slice(0,4)));setAnsicht('monat');}}>
                                    <span style={{fontSize:13,fontWeight:800,color:heatFg(v.g),lineHeight:1}}>{v.g}</span>
                                    {v.nb>0&&<span style={{fontSize:8,color:heatFg(v.g),opacity:.85}}>{v.nb}✗</span>}
                                  </div>
                                :<span style={{color:'#e2e8f0'}}>–</span>}
                            </td>);
                          })}
                          <td style={{...td,textAlign:'right',fontWeight:800,fontSize:16}}>
                            {jg}
                            <div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:2}}>
                              <Badge val={jb} color="#15803d" bg="#f0fdf4"/>
                              {jnb>0&&<Badge val={jnb} color="#dc2626" bg="#fef2f2"/>}
                            </div>
                          </td>
                        </tr>);
                      })}
                      <tr style={{background:'#f1f5f9'}}>
                        <td style={{...td,fontWeight:700,fontSize:11,textTransform:'uppercase',color:'#374151'}}>Gesamt</td>
                        {Array.from({length:12},(_,i)=>`${jahr}-${String(i+1).padStart(2,'0')}`).map(m=>{
                          const t=allePruefer.reduce((s,p)=>s+getVal(p,m).g,0);
                          return<td key={m} style={{...td,textAlign:'center',fontWeight:700,color:t>0?'#0f172a':'#cbd5e1'}}>{t||'–'}</td>;
                        })}
                        <td style={{...td,textAlign:'right',fontWeight:800,fontSize:16}}>{allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr).g,0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            }
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          JAHRESVERGLEICH
      ════════════════════════════════════════════════════════ */}
      {ansicht==='vergleich' && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:20,flexWrap:'wrap'}}>
            {[{label:'Jahr 1',val:jahr,set:setJahr,color:'#dbeafe',tcolor:'#1e3a5f'},{label:'Jahr 2 (Vergleich)',val:jahr2,set:setJahr2,color:'#fef3c7',tcolor:'#92400e'}].map(({label,val,set,color,tcolor})=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:12,height:12,borderRadius:3,background:color,border:`1px solid ${tcolor}30`}}/>
                <span style={{fontSize:12,fontWeight:600,color:'#64748b'}}>{label}:</span>
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#f1f5f9',borderRadius:10,padding:'4px 8px'}}>
                  <button onClick={()=>set((y:number)=>y-1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px',fontSize:16}}><ChevronLeft size={14}/></button>
                  <span style={{fontSize:14,fontWeight:700,minWidth:40,textAlign:'center'}}>{val}</span>
                  <button onClick={()=>set((y:number)=>y+1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px',fontSize:16}}><ChevronRight size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          <div style={card}>
            {allePruefer.length===0
              ?<div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:15,fontWeight:600,color:'#64748b'}}>Noch keine Daten – bitte importieren</p></div>
              :<><div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#f8fafc'}}>
                    <th style={{...th,textAlign:'left'}}>Prüfer</th>
                    {MONATE.map((m,i)=><th key={i} style={{...th,textAlign:'center',minWidth:72}}>{m}</th>)}
                    <th style={{...th,textAlign:'right',minWidth:140}}>Gesamt</th>
                  </tr></thead>
                  <tbody>
                    {allePruefer.map(p=>{
                      const j1=getJahrSum(p,jahr); const j2=getJahrSum(p,jahr2);
                      if(j1.g===0&&j2.g===0) return null;
                      return(<tr key={p}>
                        <td style={{...td,fontWeight:600}}>{p}</td>
                        {Array.from({length:12},(_,i)=>{
                          const m1=`${jahr}-${String(i+1).padStart(2,'0')}`; const m2=`${jahr2}-${String(i+1).padStart(2,'0')}`;
                          const v1=getVal(p,m1); const v2=getVal(p,m2);
                          return(<td key={i} style={{...td,textAlign:'center',padding:'6px 4px'}}>
                            <div style={{display:'flex',flexDirection:'column',gap:2,alignItems:'center'}}>
                              <div style={{fontSize:12,fontWeight:700,color:v1.g>0?'#1e3a5f':'#e2e8f0',background:v1.g>0?'#dbeafe':'transparent',padding:'1px 6px',borderRadius:6,minWidth:34,textAlign:'center'}}>{v1.g||'–'}</div>
                              <div style={{fontSize:12,fontWeight:700,color:v2.g>0?'#92400e':'#e2e8f0',background:v2.g>0?'#fef3c7':'transparent',padding:'1px 6px',borderRadius:6,minWidth:34,textAlign:'center'}}>{v2.g||'–'}</div>
                            </div>
                          </td>);
                        })}
                        <td style={{...td,textAlign:'right'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                            <span style={{fontWeight:800,color:'#1e3a5f',background:'#dbeafe',padding:'2px 8px',borderRadius:8,fontSize:14}}>{jahr}: {j1.g}</span>
                            <span style={{fontWeight:800,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:8,fontSize:14}}>{jahr2}: {j2.g}</span>
                            {j2.g>0&&<span style={{fontSize:11,fontWeight:600,color:j1.g>=j2.g?'#15803d':'#dc2626'}}>{j1.g>=j2.g?'▲':'▼'} {Math.abs(Math.round((j1.g-j2.g)/j2.g*100))}%</span>}
                          </div>
                        </td>
                      </tr>);
                    })}
                    <tr style={{background:'#f1f5f9'}}>
                      <td style={{...td,fontWeight:700,fontSize:11,textTransform:'uppercase',color:'#374151'}}>Gesamt</td>
                      {Array.from({length:12},(_,i)=>{
                        const m1=`${jahr}-${String(i+1).padStart(2,'0')}`; const m2=`${jahr2}-${String(i+1).padStart(2,'0')}`;
                        const t1=allePruefer.reduce((s,p)=>s+getVal(p,m1).g,0); const t2=allePruefer.reduce((s,p)=>s+getVal(p,m2).g,0);
                        return(<td key={i} style={{...td,textAlign:'center',padding:'6px 4px'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:2,alignItems:'center'}}>
                            <span style={{fontSize:12,fontWeight:700,color:t1>0?'#1e3a5f':'#e2e8f0'}}>{t1||'–'}</span>
                            <span style={{fontSize:12,fontWeight:700,color:t2>0?'#92400e':'#e2e8f0'}}>{t2||'–'}</span>
                          </div>
                        </td>);
                      })}
                      <td style={{...td,textAlign:'right'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                          <span style={{fontWeight:800,color:'#1e3a5f',background:'#dbeafe',padding:'2px 8px',borderRadius:8,fontSize:14}}>{allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr).g,0)}</span>
                          <span style={{fontWeight:800,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:8,fontSize:14}}>{allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr2).g,0)}</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{padding:'10px 16px',borderTop:'1px solid #f1f5f9',display:'flex',gap:16,alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:14,height:14,borderRadius:4,background:'#dbeafe'}}/><span style={{fontSize:11,color:'#64748b'}}>{jahr} (oben)</span></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:14,height:14,borderRadius:4,background:'#fef3c7'}}/><span style={{fontSize:11,color:'#64748b'}}>{jahr2} (unten)</span></div>
              </div></>
            }
          </div>
        </div>
      )}

      {/* ── IMPORT-VERLAUF + ALIASE ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginTop:32}}>
        <div style={card}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:13,fontWeight:700}}>📁 Importe ({importe.length})</span>
          </div>
          {importe.length===0
            ?<div style={{padding:'32px 0',textAlign:'center',color:'#94a3b8',fontSize:13}}>Noch keine Importe</div>
            :<div style={{maxHeight:250,overflowY:'auto'}}>
              {importe.map((i:any)=>(
                <div key={i.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 18px',borderBottom:'1px solid #f8fafc'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:12,fontWeight:600,margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.dateiname}</p>
                    <p style={{fontSize:11,color:'#94a3b8',margin:'2px 0 0'}}>{i.gesamt} Messungen · {new Date(i.created_at).toLocaleDateString('de-DE')}</p>
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0}}>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:99,background:'#f0fdf4',color:'#15803d'}}>✓ {i.bestanden}</span>
                    {i.nicht_best>0&&<span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:99,background:'#fef2f2',color:'#dc2626'}}>✗ {i.nicht_best}</span>}
                  </div>
                  <button onClick={()=>deleteImport(i.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4}}><Trash2 size={13}/></button>
                </div>
              ))}
            </div>
          }
        </div>
        <div style={card}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}><AlertCircle size={14} style={{color:'#f59e0b'}}/><span style={{fontSize:13,fontWeight:700}}>Prüfer-Aliase</span></div>
            <button onClick={()=>setShowAlias(v=>!v)} style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:'1px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',fontWeight:600}}>+ Neu</button>
          </div>
          <p style={{fontSize:11,color:'#94a3b8',padding:'8px 18px 0',margin:0}}>Kurzformen einem Vollnamen zuordnen · z.B. "M. Günes" → "Muzaffer Günes"</p>
          {showAlias&&(
            <div style={{padding:'10px 18px',background:'#f8fafc',borderBottom:'1px solid #f1f5f9',display:'flex',gap:8,flexWrap:'wrap'}}>
              <input placeholder="Kurzform" value={newAlias.alias} onChange={e=>setNewAlias(a=>({...a,alias:e.target.value}))} style={{flex:1,minWidth:120,padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,outline:'none'}}/>
              <input placeholder="Vollname" value={newAlias.kanonik} onChange={e=>setNewAlias(a=>({...a,kanonik:e.target.value}))} style={{flex:1,minWidth:140,padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,outline:'none'}}/>
              <button onClick={async()=>{if(!newAlias.alias.trim()||!newAlias.kanonik.trim())return;const{error}=await supabase.from('dguv_pruefer_aliase').insert({alias:newAlias.alias.trim(),kanonikname:newAlias.kanonik.trim()});if(error){toast.error(error.message);return;}toast.success('Gespeichert');setNewAlias({alias:'',kanonik:''});refetchAliase();}} style={{padding:'7px 14px',borderRadius:8,background:'#1e3a5f',color:'#fff',border:'none',fontWeight:700,fontSize:12,cursor:'pointer'}}>Speichern</button>
            </div>
          )}
          <div style={{maxHeight:200,overflowY:'auto'}}>
            {(aliaseRaw as any[]).length===0?<div style={{padding:'24px 0',textAlign:'center',color:'#94a3b8',fontSize:12}}>Keine Aliase</div>
              :(aliaseRaw as any[]).map((a:any)=>(
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 18px',borderBottom:'1px solid #f8fafc',fontSize:12}}>
                  <span style={{color:'#94a3b8',fontFamily:'monospace'}}>{a.alias}</span>
                  <span style={{color:'#94a3b8'}}>→</span>
                  <span style={{fontWeight:600,flex:1}}>{a.kanonikname}</span>
                  <button onClick={async()=>{await supabase.from('dguv_pruefer_aliase').delete().eq('id',a.id);refetchAliase();}} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:2}}><Trash2 size={12}/></button>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
