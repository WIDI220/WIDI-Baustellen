import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, RefreshCw, FileText, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

const MONAT_NAMEN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

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

// EXAKTE Spaltensuche - kürzeste Spalte gewinnt um Fehlzuordnungen zu vermeiden
function findKey(row: Record<string,any>, exactNorms: string[], partialKeywords: string[]): string {
  const keys = Object.keys(row);
  const norm = (s: string) => s.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
  for (const exact of exactNorms) {
    const found = keys.find(k => norm(k) === exact);
    if (found) return found;
  }
  let best = ''; let bestLen = Infinity;
  for (const kw of partialKeywords) {
    for (const k of keys) {
      if (norm(k).startsWith(kw) && k.length < bestLen) { best = k; bestLen = k.length; }
    }
    if (best) return best;
  }
  return '';
}

interface ParsedRow { pruefer: string; datum: string; monat: string; ergebnis: 'bestanden'|'nicht_bestanden'; kunde: string; }

async function parseFile(file: File, aliaseMap: Record<string,string>): Promise<{rows: ParsedRow[]; unbekannt: string[]}> {
  const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
  let rawRows: Record<string,any>[] = [];

  if (isXlsx) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    let bestSheet = ''; let bestCount = 0;
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<Record<string,any>>(ws, { defval: '' });
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g,'');
      const hasPruefer = data.length > 0 && Object.keys(data[0]).some(k => norm(k).includes('prfer') || norm(k).includes('pruefer'));
      if (hasPruefer && data.length > bestCount) { bestSheet = sn; bestCount = data.length; }
    }
    if (!bestSheet) throw new Error('Kein passendes Sheet gefunden – "LETZTER PRÜFER" Spalte fehlt');
    rawRows = XLSX.utils.sheet_to_json<Record<string,any>>(wb.Sheets[bestSheet], { defval: '' });
  } else {
    const text = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target?.result as string ?? ''); r.onerror = rej; r.readAsText(file, 'ISO-8859-1'); });
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Datei leer');
    const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,''));
    rawRows = lines.slice(1).map(line => {
      const vals = line.split(';').map(v => v.trim().replace(/^"|"$/g,''));
      const row: Record<string,any> = {};
      headers.forEach((h,i) => { row[h] = vals[i] ?? ''; });
      return row;
    });
  }

  if (rawRows.length === 0) throw new Error('Keine Zeilen gefunden');
  const rows: ParsedRow[] = [];
  const unbekSet = new Set<string>();

  for (const row of rawRows) {
    // Präzise Spaltensuche: LETZTER PRÜFER und LETZTE PRÜFUNG müssen exakt gefunden werden
    const prueferKey  = findKey(row, ['letzterpruefer'], ['letzterpr']);
    const datumKey    = findKey(row, ['letztepruefung'], ['letztepru','letzteprf']);
    const ergebnisKey = findKey(row, ['ergebnisderletztenprufung'], ['ergebnis']);
    const kundeKey    = findKey(row, ['kundenbezeichnung'], ['kundenbezeichnung']);

    const prueferRaw = String(row[prueferKey] ?? '').trim();
    const datumRaw   = row[datumKey];
    const ergebnisRaw = String(row[ergebnisKey] ?? '').trim().toLowerCase();
    const kunde       = String(row[kundeKey] ?? '').trim();

    if (!prueferRaw || !datumRaw) continue;
    const datum = parseDatum(datumRaw);
    if (!datum) continue;

    const pruefer = aliaseMap[prueferRaw.toLowerCase()] ?? prueferRaw;
    if (pruefer === prueferRaw && prueferRaw.includes('.') && prueferRaw.split(' ').length <= 2) unbekSet.add(prueferRaw);

    rows.push({ pruefer, datum, monat: datum.slice(0,7), ergebnis: ergebnisRaw.includes('nicht') ? 'nicht_bestanden' : 'bestanden', kunde });
  }
  return { rows, unbekannt: Array.from(unbekSet) };
}

export default function DGUVMessAuswertung() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]     = useState(false);
  const [ansicht, setAnsicht]         = useState<'heatmap'|'monat'|'vergleich'>('heatmap');
  const [jahr1, setJahr1]             = useState(new Date().getFullYear());
  const [jahr2, setJahr2]             = useState(new Date().getFullYear()-1);
  const [selectedMonat, setSelectedMonat] = useState('');
  const [filterErgebnis, setFilterErgebnis] = useState<'alle'|'bestanden'|'nicht_bestanden'>('alle');
  const [newAlias, setNewAlias]       = useState({ alias:'', kanonik:'' });
  const [showAliasForm, setShowAliasForm] = useState(false);

  const { data: ergebnisseRaw = [] } = useQuery({ queryKey:['dguv-ergebnisse'], queryFn: async () => { const {data}=await supabase.from('dguv_mess_ergebnisse').select('*').order('monat'); return data??[]; } });
  const { data: importeRaw = [] }    = useQuery({ queryKey:['dguv-importe-neu'], queryFn: async () => { const {data}=await supabase.from('dguv_mess_importe').select('*').order('created_at',{ascending:false}); return data??[]; } });
  const { data: aliaseRaw = [], refetch: refetchAliase } = useQuery({ queryKey:['dguv-aliase'], queryFn: async () => { const {data}=await supabase.from('dguv_pruefer_aliase').select('*').order('alias'); return data??[]; } });

  const aliaseMap = useMemo(() => { const m: Record<string,string>={}; (aliaseRaw as any[]).forEach((a:any)=>{m[a.alias.toLowerCase()]=a.kanonikname;}); return m; }, [aliaseRaw]);
  const ergebnisse = ergebnisseRaw as any[];
  const importe    = importeRaw   as any[];

  const agg = useMemo(() => {
    const m: Record<string,Record<string,{g:number;b:number;nb:number}>> = {};
    ergebnisse.forEach(e => { if(!m[e.pruefer_name])m[e.pruefer_name]={}; if(!m[e.pruefer_name][e.monat])m[e.pruefer_name][e.monat]={g:0,b:0,nb:0}; m[e.pruefer_name][e.monat].g+=e.gesamt??0; m[e.pruefer_name][e.monat].b+=e.bestanden??0; m[e.pruefer_name][e.monat].nb+=e.nicht_best??0; });
    return m;
  }, [ergebnisse]);

  const allePruefer = useMemo(() => Array.from(new Set(ergebnisse.map(e=>e.pruefer_name))).sort(), [ergebnisse]);
  const maxVal = useMemo(() => { let mx=0; allePruefer.forEach(p=>Object.values(agg[p]??{}).forEach(v=>{if(v.g>mx)mx=v.g;})); return mx||1; }, [agg,allePruefer]);

  function getVal(p:string,m:string){return agg[p]?.[m]??{g:0,b:0,nb:0};}
  function getJahrSum(p:string,j:number){let g=0,b=0,nb=0;Object.entries(agg[p]??{}).forEach(([m,v])=>{if(m.startsWith(String(j))){g+=v.g;b+=v.b;nb+=v.nb;}});return{g,b,nb};}

  function heatBg(v:number){if(v===0)return'#f8fafc';const p=v/maxVal;if(p<0.2)return'#dbeafe';if(p<0.4)return'#93c5fd';if(p<0.6)return'#3b82f6';if(p<0.8)return'#1d4ed8';return'#1e3a5f';}
  function heatFg(v:number){return v/maxVal>0.4?'#fff':'#1e3a5f';}

  function Badge({val,color,bg}:{val:number;color:string;bg:string}){return <span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:99,background:bg,color}}>{val}</span>;}

  const S = {
    card:{background:'#fff',border:'1px solid #f1f5f9',borderRadius:16},
    th:{padding:'10px 14px',fontWeight:700,color:'#374151',fontSize:12,borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap' as const},
    td:{padding:'9px 14px',fontSize:13,borderBottom:'1px solid #f8fafc'},
  };

  async function handleImport(file: File) {
    setUploading(true);
    try {
      const {rows, unbekannt} = await parseFile(file, aliaseMap);
      if (rows.length===0) throw new Error('Keine gültigen Messungen – "LETZTER PRÜFER" und "LETZTE PRÜFUNG" müssen vorhanden sein');
      const aggMap: Record<string,any>={};
      rows.forEach(r=>{const key=`${r.pruefer}__${r.monat}`;if(!aggMap[key])aggMap[key]={pruefer:r.pruefer,monat:r.monat,kunde:r.kunde,g:0,b:0,nb:0};aggMap[key].g++;if(r.ergebnis==='bestanden')aggMap[key].b++;else aggMap[key].nb++;});
      const monate=[...new Set(rows.map(r=>r.monat))].sort();
      const kunde=rows.find(r=>r.kunde)?.kunde??'';
      const {data:imp,error:impErr}=await supabase.from('dguv_mess_importe').insert({dateiname:file.name,monat:monate[0],kunde,gesamt:rows.length,bestanden:rows.filter(r=>r.ergebnis==='bestanden').length,nicht_best:rows.filter(r=>r.ergebnis==='nicht_bestanden').length}).select().single();
      if(impErr) throw new Error('DB Fehler: '+impErr.message);
      const insRows=Object.values(aggMap).map((v:any)=>({import_id:imp.id,pruefer_name:v.pruefer,monat:v.monat,kunde:v.kunde,gesamt:v.g,bestanden:v.b,nicht_best:v.nb}));
      const {error:ergErr}=await supabase.from('dguv_mess_ergebnisse').insert(insRows);
      if(ergErr) throw new Error('Ergebnisse: '+ergErr.message);
      toast.success(`✓ ${rows.length} Messungen importiert`);
      if(unbekannt.length>0) toast.info(`Kurzformen: ${unbekannt.join(', ')} → Alias hinterlegen`);
      qc.invalidateQueries({queryKey:['dguv-ergebnisse']}); qc.invalidateQueries({queryKey:['dguv-importe-neu']});
    } catch(e:any){toast.error('Fehler: '+e.message);}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
  }

  async function deleteImport(id:string){if(!confirm('Import löschen?'))return;await supabase.from('dguv_mess_importe').delete().eq('id',id);qc.invalidateQueries({queryKey:['dguv-ergebnisse']});qc.invalidateQueries({queryKey:['dguv-importe-neu']});toast.success('Gelöscht');}

  const monateMitDaten = useMemo(() => {
    const s=new Set<string>();
    ergebnisse.filter(e=>e.monat?.startsWith(String(jahr1))).forEach(e=>s.add(e.monat));
    return Array.from(s).sort();
  },[ergebnisse,jahr1]);

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",color:'#0f172a'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:'-.03em'}}>DGUV Messauswertung</h1>
          <p style={{fontSize:13,color:'#64748b',margin:'2px 0 0'}}>Prüfer · Monate · Messungen · Jahresvergleich</p>
        </div>
        <button onClick={()=>fileRef.current?.click()} disabled={uploading}
          style={{display:'flex',alignItems:'center',gap:8,padding:'9px 18px',background:'linear-gradient(135deg,#f59e0b,#d97706)',color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer',opacity:uploading?0.6:1}}>
          {uploading?<><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/> Importiert...</>:<><Upload size={14}/> CSV / Excel importieren</>}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleImport(f);}}/>
      </div>

      {/* Ansicht-Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {([['heatmap','🟦 Jahres-Heatmap'],['monat','📅 Monat'],['vergleich','📊 Jahresvergleich']] as const).map(([k,label])=>(
          <button key={k} onClick={()=>setAnsicht(k)} style={{padding:'7px 16px',borderRadius:9,border:'none',fontSize:13,fontWeight:600,cursor:'pointer',background:ansicht===k?'#1e3a5f':'#f1f5f9',color:ansicht===k?'#fff':'#64748b'}}>{label}</button>
        ))}
      </div>

      {/* ── HEATMAP ── */}
      {ansicht==='heatmap'&&(<>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
          <button onClick={()=>setJahr1(y=>y-1)} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',color:'#64748b'}}><ChevronLeft size={14}/></button>
          <span style={{fontWeight:700,fontSize:15,minWidth:50,textAlign:'center'}}>{jahr1}</span>
          <button onClick={()=>setJahr1(y=>y+1)} style={{background:'#f1f5f9',border:'none',borderRadius:8,padding:'5px 10px',cursor:'pointer',color:'#64748b'}}><ChevronRight size={14}/></button>
        </div>
        {allePruefer.length>0&&(
          <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(allePruefer.length+1,6)},1fr)`,gap:12,marginBottom:20}}>
            <div style={{...S.card,padding:'14px 18px',borderTop:'3px solid #1e3a5f'}}>
              <p style={{fontSize:22,fontWeight:800,margin:'0 0 2px',letterSpacing:'-.03em'}}>{allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr1).g,0).toLocaleString('de-DE')}</p>
              <p style={{fontSize:11,color:'#64748b',margin:0,fontWeight:600}}>Gesamt {jahr1}</p>
            </div>
            {allePruefer.map(p=>{const{g,b,nb}=getJahrSum(p,jahr1);return(
              <div key={p} style={{...S.card,padding:'14px 18px',borderTop:'3px solid #f59e0b'}}>
                <p style={{fontSize:20,fontWeight:800,margin:'0 0 2px',letterSpacing:'-.03em'}}>{g.toLocaleString('de-DE')}</p>
                <p style={{fontSize:11,color:'#64748b',margin:'0 0 6px',fontWeight:600}}>{p}</p>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}><Badge val={b} color="#15803d" bg="#f0fdf4"/>{nb>0&&<Badge val={nb} color="#dc2626" bg="#fef2f2"/>}</div>
              </div>
            );})}
          </div>
        )}
        <div style={S.card}>
          {allePruefer.filter(p=>Object.keys(agg[p]||{}).some(m=>m.startsWith(String(jahr1)))).length===0
            ?<div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:36,marginBottom:12}}>📊</p><p style={{fontSize:15,fontWeight:600,color:'#64748b'}}>Keine Daten für {jahr1}</p><p style={{fontSize:13}}>CSV oder Excel oben importieren</p></div>
            :<div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#f8fafc'}}>
                  <th style={{...S.th,textAlign:'left'}}>Prüfer</th>
                  {Array.from({length:12},(_,i)=>`${jahr1}-${String(i+1).padStart(2,'0')}`).map((m,i)=>(
                    <th key={m} style={{...S.th,textAlign:'center',minWidth:52}}>{MONAT_NAMEN[i]}</th>
                  ))}
                  <th style={{...S.th,textAlign:'right'}}>Gesamt</th>
                </tr></thead>
                <tbody>
                  {allePruefer.map((p,pi)=>{
                    const{g:jg,b:jb,nb:jnb}=getJahrSum(p,jahr1);
                    if(jg===0)return null;
                    return(<tr key={p} style={{background:pi%2===0?'#fff':'#fafbfc'}}>
                      <td style={{...S.td,fontWeight:600,whiteSpace:'nowrap'}}>{p}</td>
                      {Array.from({length:12},(_,i)=>`${jahr1}-${String(i+1).padStart(2,'0')}`).map(m=>{
                        const v=getVal(p,m);
                        return(<td key={m} style={{...S.td,textAlign:'center',padding:'6px 4px'}}>
                          {v.g>0
                            ?<div style={{width:46,height:36,borderRadius:8,background:heatBg(v.g),display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',margin:'0 auto',cursor:'pointer'}}
                                title={`${v.g} gesamt · ${v.b} ✓ · ${v.nb} ✗`}
                                onClick={()=>{setSelectedMonat(m);setAnsicht('monat');}}>
                                <span style={{fontSize:13,fontWeight:800,color:heatFg(v.g),lineHeight:1}}>{v.g}</span>
                                {v.nb>0&&<span style={{fontSize:8,color:heatFg(v.g),opacity:.85}}>{v.nb}✗</span>}
                              </div>
                            :<span style={{color:'#e2e8f0',fontSize:11}}>–</span>}
                        </td>);
                      })}
                      <td style={{...S.td,textAlign:'right',fontWeight:800,fontSize:15}}>
                        {jg}
                        <div style={{display:'flex',gap:4,justifyContent:'flex-end',marginTop:2}}><Badge val={jb} color="#15803d" bg="#f0fdf4"/>{jnb>0&&<Badge val={jnb} color="#dc2626" bg="#fef2f2"/>}</div>
                      </td>
                    </tr>);
                  })}
                  <tr style={{background:'#f1f5f9',fontWeight:700}}>
                    <td style={{...S.td,fontSize:11,color:'#374151',textTransform:'uppercase',letterSpacing:'.04em'}}>Gesamt</td>
                    {Array.from({length:12},(_,i)=>`${jahr1}-${String(i+1).padStart(2,'0')}`).map(m=>{
                      const tot=allePruefer.reduce((s,p)=>s+getVal(p,m).g,0);
                      return<td key={m} style={{...S.td,textAlign:'center',fontWeight:700,fontSize:13,color:tot>0?'#0f172a':'#cbd5e1'}}>{tot||'–'}</td>;
                    })}
                    <td style={{...S.td,textAlign:'right',fontWeight:800,fontSize:15}}>{allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr1).g,0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          }
          {allePruefer.length>0&&(
            <div style={{padding:'10px 16px',borderTop:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>Intensität:</span>
              {[0.1,0.3,0.6,0.9].map((pct,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:14,height:14,borderRadius:3,background:heatBg(Math.round(pct*maxVal))}}/><span style={{fontSize:10,color:'#64748b'}}>{Math.round(pct*maxVal)}</span></div>
              ))}
              <span style={{fontSize:11,color:'#94a3b8',marginLeft:8}}>· Zellen anklicken → Monatsdetail</span>
            </div>
          )}
        </div>
      </>)}

      {/* ── MONAT ── */}
      {ansicht==='monat'&&(<>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,background:'#f1f5f9',borderRadius:10,padding:'4px 8px'}}>
            <button onClick={()=>setJahr1(y=>y-1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px'}}><ChevronLeft size={14}/></button>
            <span style={{fontSize:14,fontWeight:700,minWidth:40,textAlign:'center'}}>{jahr1}</span>
            <button onClick={()=>setJahr1(y=>y+1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px'}}><ChevronRight size={14}/></button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {Array.from({length:12},(_,i)=>`${jahr1}-${String(i+1).padStart(2,'0')}`).map((m,i)=>{
              const hasData=allePruefer.some(p=>getVal(p,m).g>0);
              return(<button key={m} onClick={()=>setSelectedMonat(m)} disabled={!hasData}
                style={{padding:'6px 10px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,cursor:hasData?'pointer':'default',
                  background:selectedMonat===m?'#1e3a5f':hasData?'#e0e7ff':'#f8fafc',
                  color:selectedMonat===m?'#fff':hasData?'#3730a3':'#cbd5e1',opacity:hasData?1:0.5}}>
                {MONAT_NAMEN[i]}
              </button>);
            })}
          </div>
          <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
            {(['alle','bestanden','nicht_bestanden'] as const).map(f=>(
              <button key={f} onClick={()=>setFilterErgebnis(f)}
                style={{padding:'6px 12px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',
                  background:filterErgebnis===f?(f==='bestanden'?'#10b981':f==='nicht_bestanden'?'#ef4444':'#1e3a5f'):'#f1f5f9',
                  color:filterErgebnis===f?'#fff':'#64748b'}}>
                {f==='alle'?'Alle':f==='bestanden'?'✓ Bestanden':'✗ Nicht bestanden'}
              </button>
            ))}
          </div>
        </div>
        {!selectedMonat
          ?<div style={{...S.card,textAlign:'center',padding:'48px 0',color:'#94a3b8'}}><p style={{fontSize:14,fontWeight:600,color:'#64748b'}}>Monat oben auswählen</p></div>
          :<div style={S.card}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{fontSize:15,fontWeight:700,margin:0}}>{MONAT_NAMEN[parseInt(selectedMonat.slice(5,7))-1]} {selectedMonat.slice(0,4)}</h2>
              <span style={{fontSize:13,color:'#64748b'}}>{allePruefer.reduce((s,p)=>s+getVal(p,selectedMonat).g,0)} Messungen gesamt</span>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#f8fafc'}}>
                {['Prüfer','Gesamt','✓ Bestanden','✗ Nicht best.','Bestanden-Quote'].map(h=>(
                  <th key={h} style={{...S.th,textAlign:h==='Prüfer'?'left':'right'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {allePruefer
                  .map(p=>({p,...getVal(p,selectedMonat)}))
                  .filter(row=>filterErgebnis==='alle'?row.g>0:filterErgebnis==='bestanden'?row.b>0:row.nb>0)
                  .sort((a,b)=>b.g-a.g)
                  .map((row,i)=>(
                    <tr key={row.p} style={{background:i%2===0?'#fff':'#fafbfc',borderBottom:'1px solid #f8fafc'}}>
                      <td style={{...S.td,fontWeight:600}}>{row.p}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:800,fontSize:16}}>{row.g}</td>
                      <td style={{...S.td,textAlign:'right'}}><Badge val={row.b} color="#15803d" bg="#f0fdf4"/></td>
                      <td style={{...S.td,textAlign:'right'}}>{row.nb>0?<Badge val={row.nb} color="#dc2626" bg="#fef2f2"/>:<span style={{color:'#cbd5e1'}}>–</span>}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:row.g>0&&row.nb/row.g<0.05?'#15803d':'#dc2626'}}>{row.g>0?`${Math.round(row.b/row.g*100)}%`:'–'}</td>
                    </tr>
                  ))
                }
                {allePruefer.every(p=>getVal(p,selectedMonat).g===0)&&<tr><td colSpan={5} style={{textAlign:'center',padding:'32px 0',color:'#94a3b8',fontSize:13}}>Keine Daten</td></tr>}
              </tbody>
            </table>
          </div>
        }
      </>)}

      {/* ── JAHRESVERGLEICH ── */}
      {ansicht==='vergleich'&&(<>
        <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:20,flexWrap:'wrap'}}>
          {[{label:'Jahr 1 (blau)',val:jahr1,set:setJahr1},{label:'Jahr 2 / Vergleich (amber)',val:jahr2,set:setJahr2}].map(({label,val,set})=>(
            <div key={label} style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,fontWeight:600,color:'#64748b'}}>{label}:</span>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'#f1f5f9',borderRadius:10,padding:'4px 8px'}}>
                <button onClick={()=>set((y:number)=>y-1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px'}}><ChevronLeft size={14}/></button>
                <span style={{fontSize:14,fontWeight:700,minWidth:40,textAlign:'center'}}>{val}</span>
                <button onClick={()=>set((y:number)=>y+1)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b',padding:'2px 6px'}}><ChevronRight size={14}/></button>
              </div>
            </div>
          ))}
        </div>
        <div style={S.card}>
          {allePruefer.length===0
            ?<div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}><p style={{fontSize:15,fontWeight:600,color:'#64748b'}}>Noch keine Daten – Datei importieren</p></div>
            :<><div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#f8fafc'}}>
                  <th style={{...S.th,textAlign:'left'}}>Prüfer</th>
                  {MONAT_NAMEN.map((m,i)=><th key={i} style={{...S.th,textAlign:'center',minWidth:72}}>{m}</th>)}
                  <th style={{...S.th,textAlign:'right'}}>Gesamt</th>
                </tr></thead>
                <tbody>
                  {allePruefer.map(p=>{
                    const j1=getJahrSum(p,jahr1); const j2=getJahrSum(p,jahr2);
                    if(j1.g===0&&j2.g===0)return null;
                    return(<tr key={p}>
                      <td style={{...S.td,fontWeight:600}}>{p}</td>
                      {Array.from({length:12},(_,i)=>{
                        const m1=`${jahr1}-${String(i+1).padStart(2,'0')}`; const m2=`${jahr2}-${String(i+1).padStart(2,'0')}`;
                        const v1=getVal(p,m1); const v2=getVal(p,m2);
                        return(<td key={i} style={{...S.td,textAlign:'center',padding:'6px 4px',verticalAlign:'middle'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:2,alignItems:'center'}}>
                            <div style={{fontSize:12,fontWeight:700,color:v1.g>0?'#1e3a5f':'#e2e8f0',background:v1.g>0?'#dbeafe':'transparent',padding:'1px 6px',borderRadius:6,minWidth:32,textAlign:'center'}}>{v1.g>0?v1.g:'–'}</div>
                            <div style={{fontSize:12,fontWeight:700,color:v2.g>0?'#92400e':'#e2e8f0',background:v2.g>0?'#fef3c7':'transparent',padding:'1px 6px',borderRadius:6,minWidth:32,textAlign:'center'}}>{v2.g>0?v2.g:'–'}</div>
                          </div>
                        </td>);
                      })}
                      <td style={{...S.td,textAlign:'right'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                          <span style={{fontSize:14,fontWeight:800,color:'#1e3a5f',background:'#dbeafe',padding:'2px 8px',borderRadius:8}}>{jahr1}: {j1.g}</span>
                          <span style={{fontSize:14,fontWeight:800,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:8}}>{jahr2}: {j2.g}</span>
                          {j2.g>0&&<span style={{fontSize:11,color:j1.g>=j2.g?'#15803d':'#dc2626',fontWeight:600}}>{j1.g>=j2.g?'▲':'▼'} {Math.abs(Math.round((j1.g-j2.g)/j2.g*100))}%</span>}
                        </div>
                      </td>
                    </tr>);
                  })}
                  <tr style={{background:'#f1f5f9'}}>
                    <td style={{...S.td,fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em'}}>Gesamt</td>
                    {Array.from({length:12},(_,i)=>{
                      const m1=`${jahr1}-${String(i+1).padStart(2,'0')}`; const m2=`${jahr2}-${String(i+1).padStart(2,'0')}`;
                      const t1=allePruefer.reduce((s,p)=>s+getVal(p,m1).g,0); const t2=allePruefer.reduce((s,p)=>s+getVal(p,m2).g,0);
                      return(<td key={i} style={{...S.td,textAlign:'center',padding:'6px 4px'}}>
                        <div style={{display:'flex',flexDirection:'column',gap:2,alignItems:'center'}}>
                          <span style={{fontSize:12,fontWeight:700,color:t1>0?'#1e3a5f':'#e2e8f0'}}>{t1||'–'}</span>
                          <span style={{fontSize:12,fontWeight:700,color:t2>0?'#92400e':'#e2e8f0'}}>{t2||'–'}</span>
                        </div>
                      </td>);
                    })}
                    <td style={{...S.td,textAlign:'right'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                        <span style={{fontSize:14,fontWeight:800,color:'#1e3a5f',background:'#dbeafe',padding:'2px 8px',borderRadius:8}}>{jahr1}: {allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr1).g,0)}</span>
                        <span style={{fontSize:14,fontWeight:800,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:8}}>{jahr2}: {allePruefer.reduce((s,p)=>s+getJahrSum(p,jahr2).g,0)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{padding:'10px 16px',borderTop:'1px solid #f1f5f9',display:'flex',gap:16,alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:14,height:14,borderRadius:4,background:'#dbeafe'}}/><span style={{fontSize:11,color:'#64748b'}}>{jahr1} (oben)</span></div>
              <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:14,height:14,borderRadius:4,background:'#fef3c7'}}/><span style={{fontSize:11,color:'#64748b'}}>{jahr2} (unten)</span></div>
            </div></>
          }
        </div>
      </>)}

      {/* Import-Verlauf + Aliase */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginTop:32}}>
        <div style={S.card}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:8}}>
            <FileText size={14} style={{color:'#64748b'}}/><span style={{fontSize:13,fontWeight:700}}>Importe ({importe.length})</span>
          </div>
          {importe.length===0?<div style={{padding:'32px 0',textAlign:'center',color:'#94a3b8',fontSize:13}}>Noch keine Importe</div>
            :<div style={{maxHeight:280,overflowY:'auto'}}>
              {importe.map((imp:any)=>(
                <div key={imp.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 18px',borderBottom:'1px solid #f8fafc'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:12,fontWeight:600,margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{imp.dateiname}</p>
                    <p style={{fontSize:11,color:'#94a3b8',margin:'2px 0 0'}}>{imp.gesamt} Messungen · {new Date(imp.created_at).toLocaleDateString('de-DE')}</p>
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0}}>
                    <Badge val={imp.bestanden} color="#15803d" bg="#f0fdf4"/>
                    {imp.nicht_best>0&&<Badge val={imp.nicht_best} color="#dc2626" bg="#fef2f2"/>}
                  </div>
                  <button onClick={()=>deleteImport(imp.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:4,borderRadius:6}}><Trash2 size={13}/></button>
                </div>
              ))}
            </div>
          }
        </div>
        <div style={S.card}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}><AlertCircle size={14} style={{color:'#f59e0b'}}/><span style={{fontSize:13,fontWeight:700}}>Prüfer-Aliase</span></div>
            <button onClick={()=>setShowAliasForm(v=>!v)} style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:'1px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',fontWeight:600}}>+ Neu</button>
          </div>
          <p style={{fontSize:11,color:'#94a3b8',padding:'8px 18px 0',margin:0}}>z.B. "M. Günes" → "Muzaffer Günes"</p>
          {showAliasForm&&(
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
