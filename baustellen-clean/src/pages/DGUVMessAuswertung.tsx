import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart2, TrendingUp, Award, Calendar, ChevronLeft, ChevronRight, Target } from 'lucide-react';

const COLORS = ['#2563eb','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4'];

function scoreColor(pct: number) {
  return pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444';
}

function fmtMonat(m: string) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const n = ['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `${n[parseInt(mo)]} ${y}`;
}

// ── Gauge (Tacho) ─────────────────────────────────────────────────────────
function Gauge({ ist, soll, name, farbe }: { ist: number; soll: number; name: string; farbe: string }) {
  const pct   = soll > 0 ? Math.min(ist / soll * 100, 125) : 0;
  const col   = scoreColor(pct);
  const r     = 52; const cx = 70; const cy = 70;
  const toRad = (d: number) => d * Math.PI / 180;
  const startDeg = -210; const spanDeg = 240;
  const endDeg   = startDeg + (Math.min(pct, 120) / 120) * spanDeg;
  const ax = (a: number) => cx + r * Math.cos(toRad(a));
  const ay = (a: number) => cy + r * Math.sin(toRad(a));
  const laf = endDeg - startDeg > 180 ? 1 : 0;
  const needleA = startDeg + (Math.min(pct, 120) / 120) * spanDeg;

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
      <svg width="140" height="96" viewBox="0 0 140 96">
        {/* BG Bogen */}
        <path d={`M ${ax(startDeg)} ${ay(startDeg)} A ${r} ${r} 0 1 1 ${ax(startDeg+spanDeg)} ${ay(startDeg+spanDeg)}`}
          fill="none" stroke="#f1f5f9" strokeWidth="9" strokeLinecap="round"/>
        {/* Wert-Bogen */}
        {pct > 0 && (
          <path d={`M ${ax(startDeg)} ${ay(startDeg)} A ${r} ${r} 0 ${laf} 1 ${ax(endDeg)} ${ay(endDeg)}`}
            fill="none" stroke={col} strokeWidth="9" strokeLinecap="round"/>
        )}
        {/* Zeiger */}
        <line x1={cx} y1={cy}
          x2={cx + (r-12)*Math.cos(toRad(needleA))}
          y2={cy + (r-12)*Math.sin(toRad(needleA))}
          stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="4" fill={col}/>
        {/* Texte */}
        <text x={cx} y={cy+18} textAnchor="middle" fontSize="14" fontWeight="800" fill={col}>{Math.round(pct)}%</text>
        <text x={cx} y={cy+30} textAnchor="middle" fontSize="9" fill="#94a3b8">{ist.toLocaleString('de-DE')} / {soll.toLocaleString('de-DE')}</text>
      </svg>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:13, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>{name}</p>
        <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, fontWeight:600, background:col+'18', color:col }}>
          {pct >= 100 ? '✓ Ziel erreicht' : pct >= 80 ? '⚠ Fast am Ziel' : '✗ Unter Ziel'}
        </span>
      </div>
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────
function Heatmap({ tage, farbe }: { tage: Record<string,number>; farbe: string }) {
  const entries = Object.entries(tage).sort(([a],[b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  const max = Math.max(...Object.values(tage), 1);
  const wt  = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  return (
    <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 12px', marginTop:10 }}>
      <p style={{ fontSize:10, fontWeight:600, color:'#94a3b8', margin:'0 0 8px', textTransform:'uppercase', letterSpacing:'.05em' }}>Tages-Aktivität</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
        {entries.map(([d, count]) => {
          const dt  = new Date(d);
          const opc = 0.15 + (count / max) * 0.85;
          return (
            <div key={d} title={`${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')} (${wt[dt.getDay()]}): ${count} Messungen`}
              style={{ width:34, height:34, borderRadius:7, background:farbe, opacity:opc, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'default', flexShrink:0 }}>
              <span style={{ fontSize:9, fontWeight:800, color:'#fff', lineHeight:1 }}>{count}</span>
              <span style={{ fontSize:8, color:'rgba(255,255,255,.7)', lineHeight:1 }}>{dt.getDate()}.</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Radial Jahres-Chart ───────────────────────────────────────────────────
function RadialChart({ monatsData }: { monatsData: { monat: string; pruefer: Record<string,number> }[] }) {
  if (monatsData.length < 2) return null;
  const allePruefer = [...new Set(monatsData.flatMap(d => Object.keys(d.pruefer)))];
  const maxVal      = Math.max(...monatsData.flatMap(d => Object.values(d.pruefer)), 1);
  const N = monatsData.length;
  const CX=160; const CY=160; const R_MAX=115; const R_MIN=28;
  const toRad = (d: number) => d * Math.PI / 180;

  return (
    <div style={{ display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
      <svg width="320" height="320" viewBox="0 0 320 320">
        {/* Konzentische Ringe */}
        {[25,50,75,100].map(p => {
          const r = R_MIN + (R_MAX-R_MIN)*p/100;
          return <g key={p}>
            <circle cx={CX} cy={CY} r={r} fill="none" stroke="#f1f5f9" strokeWidth=".5"/>
            <text x={CX+4} y={CY-r+3} fontSize="7" fill="#cbd5e1">{p}%</text>
          </g>;
        })}
        {/* Radiale Linien + Monatslabels */}
        {monatsData.map((_, i) => {
          const a = toRad(i*(360/N)-90);
          const xL = CX+(R_MAX+18)*Math.cos(a); const yL = CY+(R_MAX+18)*Math.sin(a);
          return <g key={i}>
            <line x1={CX} y1={CY} x2={CX+R_MAX*Math.cos(a)} y2={CY+R_MAX*Math.sin(a)} stroke="#f1f5f9" strokeWidth=".5"/>
            <text x={xL} y={yL} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#94a3b8">{fmtMonat(monatsData[i].monat).slice(0,6)}</text>
          </g>;
        })}
        {/* Daten */}
        {allePruefer.map((p, pi) => {
          const pts = monatsData.map((d, i) => {
            const val = d.pruefer[p] ?? 0;
            const r   = R_MIN + (R_MAX-R_MIN)*(val/maxVal);
            const a   = toRad(i*(360/N)-90);
            return [CX+r*Math.cos(a), CY+r*Math.sin(a)];
          });
          const path = pts.map((pt,i) => `${i===0?'M':'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ')+'Z';
          return <g key={p}>
            <path d={path} fill={COLORS[pi]+'20'} stroke={COLORS[pi]} strokeWidth="1.5"/>
            {pts.map((pt,i) => <circle key={i} cx={pt[0]} cy={pt[1]} r="3" fill={COLORS[pi]}/>)}
          </g>;
        })}
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {allePruefer.map((p,pi) => (
          <div key={p} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:COLORS[pi], flexShrink:0 }}/>
            <span style={{ fontSize:12, color:'#374151', fontWeight:500 }}>{p}</span>
          </div>
        ))}
        <div style={{ marginTop:4, padding:'8px 10px', background:'#f8fafc', borderRadius:8, fontSize:11, color:'#64748b', lineHeight:1.5 }}>
          Außen = mehr Messungen<br/>Innen = weniger Messungen
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Seite ───────────────────────────────────────────────────────────
export default function DGUVMessAuswertung() {
  const [ansicht, setAnsicht]           = useState<'monat'|'jahr'>('monat');
  const [selectedMonat, setSelectedMonat] = useState('');

  // Prüfer laden
  const { data: pruefer = [] } = useQuery({
    queryKey: ['dguv-pruefer'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer').select('*').eq('aktiv', true).order('name'); return data ?? []; }
  });

  // Alle verfügbaren Monate
  const { data: alleMonate = [] } = useQuery({
    queryKey: ['dguv-monate'],
    queryFn: async () => {
      const { data } = await supabase.from('dguv_messungen').select('import_monat').order('import_monat', { ascending: false });
      return [...new Set((data ?? []).map((r: any) => r.import_monat))];
    }
  });

  const monate     = alleMonate as string[];
  const aktivMonat = selectedMonat || monate[0] || '';

  // Monatsdaten — persistent in DB, werden nicht gelöscht
  const { data: monatsRaw = [] } = useQuery({
    queryKey: ['dguv-auswertung-monat', aktivMonat],
    enabled: !!aktivMonat,
    queryFn: async () => {
      const { data } = await supabase
        .from('dguv_messungen')
        .select('pruefer_name, pruef_datum, ergebnis')
        .eq('import_monat', aktivMonat);
      return data ?? [];
    }
  });

  // Jahresdaten — alle Monate
  const { data: jahresRaw = [] } = useQuery({
    queryKey: ['dguv-auswertung-jahr'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dguv_messungen')
        .select('pruefer_name, pruef_datum, import_monat')
        .order('pruef_datum');
      return data ?? [];
    }
  });

  // Monatsstats berechnen
  const monatStats = useMemo(() => {
    if (!monatsRaw.length) return [];
    const p   = pruefer as any[];
    const soll = p[0]?.soll_monat ?? 0;

    const byP: Record<string, { ist: number; bestanden: number; tage: Record<string,number> }> = {};
    (monatsRaw as any[]).forEach(r => {
      if (!byP[r.pruefer_name]) byP[r.pruefer_name] = { ist:0, bestanden:0, tage:{} };
      byP[r.pruefer_name].ist++;
      if ((r.ergebnis ?? '').toLowerCase().includes('bestanden') && !(r.ergebnis ?? '').toLowerCase().includes('nicht')) {
        byP[r.pruefer_name].bestanden++;
      }
      const tag = r.pruef_datum?.slice(0,10);
      if (tag) byP[r.pruefer_name].tage[tag] = (byP[r.pruefer_name].tage[tag]??0)+1;
    });

    return Object.entries(byP).map(([csvName, d], i) => {
      const matched = p.find((pr: any) => pr.name?.toLowerCase().trim() === csvName.toLowerCase().trim());
      const displayName = matched?.name ?? csvName;
      const kuerzel     = matched?.kuerzel ?? csvName.slice(0,2).toUpperCase();
      const score       = soll > 0 ? Math.round(d.ist / soll * 100) : 0;
      return { name:displayName, kuerzel, csvName, ist:d.ist, soll, bestanden:d.bestanden, tage:d.tage, farbe:COLORS[i%COLORS.length], score };
    }).sort((a,b) => b.ist - a.ist);
  }, [monatsRaw, pruefer]);

  // Jahresdaten aufbereiten
  const jahresMonatData = useMemo(() => {
    const p = pruefer as any[];
    const byMonat: Record<string, Record<string,number>> = {};
    (jahresRaw as any[]).forEach(r => {
      if (!byMonat[r.import_monat]) byMonat[r.import_monat] = {};
      const matched = p.find((pr: any) => pr.name?.toLowerCase().trim() === r.pruefer_name?.toLowerCase().trim());
      const displayName = matched?.name ?? r.pruefer_name;
      byMonat[r.import_monat][displayName] = (byMonat[r.import_monat][displayName]??0)+1;
    });
    return Object.entries(byMonat)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([monat,prData]) => ({ monat, pruefer:prData }));
  }, [jahresRaw, pruefer]);

  // KPIs
  const gesamtIst  = monatStats.reduce((s,p) => s+p.ist, 0);
  const gesamtSoll = monatStats.reduce((s,p) => s+p.soll, 0);
  const avgScore   = monatStats.length ? Math.round(monatStats.reduce((s,p)=>s+p.score,0)/monatStats.length) : 0;
  const topPruefer = [...monatStats].sort((a,b) => b.score-a.score)[0];
  const aktivTageGes = monatStats.reduce((s,p) => s+Object.keys(p.tage).length, 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Messungen <span style={{ color:'#f59e0b' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>Produktivität · Soll/Ist · Jahresrückblick · alle Monate</p>
        </div>
        <div style={{ display:'flex', gap:3, background:'#f1f5f9', borderRadius:12, padding:4 }}>
          {([['monat','Monatsansicht'],['jahr','Jahresrückblick']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAnsicht(k)}
              style={{ padding:'7px 16px', borderRadius:9, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', background:ansicht===k?'#fff':'transparent', color:ansicht===k?'#0f172a':'#94a3b8', boxShadow:ansicht===k?'0 1px 4px rgba(0,0,0,.08)':'none', transition:'all .15s' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Keine Daten */}
      {monate.length === 0 && (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'64px', textAlign:'center', color:'#94a3b8' }}>
          <BarChart2 size={48} style={{ marginBottom:16, opacity:.2 }} />
          <p style={{ fontSize:16, fontWeight:600, margin:'0 0 8px' }}>Noch keine Messungen importiert</p>
          <p style={{ fontSize:13, margin:0 }}>Gehe zu "Messungen Import" und lade eine CSV-Datei hoch</p>
        </div>
      )}

      {/* ── MONATSANSICHT ─────────────────────────────────────── */}
      {ansicht === 'monat' && monate.length > 0 && (
        <>
          {/* Monats-Navigation */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => { const i=monate.indexOf(aktivMonat); if(i<monate.length-1) setSelectedMonat(monate[i+1]); }}
              disabled={monate.indexOf(aktivMonat)>=monate.length-1}
              style={{ padding:8, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, cursor:'pointer', display:'flex', opacity:monate.indexOf(aktivMonat)>=monate.length-1?.4:1 }}>
              <ChevronLeft size={16} style={{ color:'#374151' }}/>
            </button>
            <div style={{ display:'flex', gap:4, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:5, flexWrap:'wrap' }}>
              {monate.map(m => (
                <button key={m} onClick={() => setSelectedMonat(m)}
                  style={{ padding:'5px 13px', borderRadius:8, border:'none', fontSize:12, fontWeight:m===aktivMonat?700:400, cursor:'pointer', background:m===aktivMonat?'#f59e0b':'transparent', color:m===aktivMonat?'#fff':'#64748b', transition:'all .15s' }}>
                  {fmtMonat(m)}
                </button>
              ))}
            </div>
            <button onClick={() => { const i=monate.indexOf(aktivMonat); if(i>0) setSelectedMonat(monate[i-1]); }}
              disabled={monate.indexOf(aktivMonat)<=0}
              style={{ padding:8, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, cursor:'pointer', display:'flex', opacity:monate.indexOf(aktivMonat)<=0?.4:1 }}>
              <ChevronRight size={16} style={{ color:'#374151' }}/>
            </button>
          </div>

          {/* KPI Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {[
              { label:'Messungen gesamt', value:gesamtIst.toLocaleString('de-DE'), sub:`Soll: ${gesamtSoll.toLocaleString('de-DE')}`, icon:BarChart2, color:'#f59e0b' },
              { label:'Ø Produktivität',  value:avgScore+'%', sub:avgScore>=100?'Ziel erreicht':avgScore>=80?'Fast am Ziel':'Unter Ziel', icon:TrendingUp, color:scoreColor(avgScore) },
              { label:'Bester Prüfer',    value:topPruefer?.name??'–', sub:topPruefer?topPruefer.ist+' Messungen':'–', icon:Award, color:'#2563eb' },
              { label:'Aktive Prüftage',  value:aktivTageGes+'', sub:'Tage mit Messungen', icon:Calendar, color:'#10b981' },
            ].map((k,i) => (
              <div key={i} style={{ background:'#fff', border:'1px solid #f1f5f9', borderRadius:16, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, borderRadius:'16px 16px 0 0' }}/>
                <k.icon size={17} style={{ color:k.color, marginBottom:10 }}/>
                <p style={{ fontSize:20, fontWeight:900, color:'#0f172a', margin:'0 0 1px', letterSpacing:'-.02em' }}>{k.value}</p>
                <p style={{ fontSize:11, fontWeight:600, color:'#64748b', margin:'0 0 2px' }}>{k.label}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Gauge Charts */}
          {monatStats.length > 0 && (
            <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'24px' }}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Soll / Ist Tacho — {fmtMonat(aktivMonat)}</h3>
              <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Grün = Ziel erreicht · Gelb = fast da · Rot = unter Ziel</p>
              <div style={{ display:'flex', gap:40, flexWrap:'wrap', justifyContent:'center' }}>
                {monatStats.map(p => (
                  <Gauge key={p.name} ist={p.ist} soll={p.soll} name={p.name} farbe={p.farbe} />
                ))}
              </div>
            </div>
          )}

          {/* Produktivitäts-Details */}
          {monatStats.length > 0 && (
            <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
              <div style={{ padding:'18px 20px', borderBottom:'1px solid #f1f5f9' }}>
                <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 3px' }}>Produktivitäts-Details</h3>
                <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>Bestanden-Quote · Aktive Tage · Bester Tag · Tages-Heatmap</p>
              </div>
              {monatStats.map((p, idx) => {
                const bestandenPct = p.ist>0 ? Math.round(p.bestanden/p.ist*100) : 0;
                const aktivTage    = Object.keys(p.tage).length;
                const avgPerTag    = aktivTage>0 ? Math.round(p.ist/aktivTage) : 0;
                const topTag       = Object.entries(p.tage).sort(([,a],[,b]) => b-a)[0];
                return (
                  <div key={p.name} style={{ padding:'20px', borderBottom:idx<monatStats.length-1?'1px solid #f8fafc':'none' }}>
                    {/* Prüfer Header + Fortschrittsbalken */}
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                      <div style={{ width:42, height:42, borderRadius:13, background:p.farbe+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontSize:13, fontWeight:800, color:p.farbe }}>{p.kuerzel}</span>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{p.name}</span>
                          <span style={{ fontSize:16, fontWeight:900, color:scoreColor(p.score) }}>{p.score}%</span>
                        </div>
                        <div style={{ height:8, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.min(p.score,100)}%`, background:`linear-gradient(90deg,${p.farbe},${scoreColor(p.score)})`, borderRadius:99, transition:'width .6s ease' }}/>
                        </div>
                      </div>
                    </div>
                    {/* Detail Cards */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:4 }}>
                      {[
                        { label:'Messungen',    value:p.ist.toLocaleString('de-DE'),   sub:`Soll: ${p.soll.toLocaleString('de-DE')}`, color:scoreColor(p.score) },
                        { label:'Bestanden',    value:bestandenPct+'%',                sub:`${p.bestanden} von ${p.ist}`,             color:'#10b981' },
                        { label:'Aktive Tage',  value:aktivTage+'',                    sub:`Ø ${avgPerTag}/Tag`,                      color:'#2563eb' },
                        { label:'Bester Tag',   value:topTag?topTag[1]+'':'–',         sub:topTag?new Date(topTag[0]).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):'–', color:'#8b5cf6' },
                      ].map(s => (
                        <div key={s.label} style={{ background:'#f8fafc', borderRadius:10, padding:'10px 12px' }}>
                          <p style={{ fontSize:18, fontWeight:800, color:s.color, margin:'0 0 2px' }}>{s.value}</p>
                          <p style={{ fontSize:10, fontWeight:600, color:'#64748b', margin:'0 0 1px', textTransform:'uppercase', letterSpacing:'.04em' }}>{s.label}</p>
                          <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>{s.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Heatmap */}
                    <Heatmap tage={p.tage} farbe={p.farbe} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── JAHRESRÜCKBLICK ────────────────────────────────────── */}
      {ansicht === 'jahr' && (
        <>
          {jahresMonatData.length < 2 ? (
            <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'48px', textAlign:'center', color:'#94a3b8' }}>
              <Calendar size={36} style={{ marginBottom:12, opacity:.2 }}/>
              <p style={{ fontWeight:600, margin:'0 0 6px' }}>Mindestens 2 Monate für den Jahresrückblick</p>
              <p style={{ fontSize:13, margin:0 }}>{jahresMonatData.length} Monat importiert</p>
            </div>
          ) : (
            <>
              {/* Radial Chart */}
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'24px' }}>
                <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Jahres-Radialchart</h3>
                <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Jede Achse = ein Monat · weiter außen = mehr Messungen</p>
                <RadialChart monatsData={jahresMonatData} />
              </div>

              {/* Monatsvergleich */}
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'24px' }}>
                <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Monatsvergleich</h3>
                <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Gestapelte Balken nach Prüfer · schwarze Linie = Soll</p>
                {(() => {
                  const allePruefer = [...new Set(jahresMonatData.flatMap(d => Object.keys(d.pruefer)))];
                  const soll        = (pruefer as any[])[0]?.soll_monat ?? 0;
                  const sollGes     = soll * (pruefer as any[]).filter((p:any)=>p.aktiv).length;
                  const maxVal      = Math.max(...jahresMonatData.map(d => Object.values(d.pruefer).reduce((s,v)=>s+v,0)), sollGes||1);
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {jahresMonatData.map(d => {
                        const total = Object.values(d.pruefer).reduce((s,v)=>s+v,0);
                        const pct   = sollGes>0 ? Math.round(total/sollGes*100) : 0;
                        return (
                          <div key={d.monat} style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <div style={{ width:54, fontSize:11, fontWeight:600, color:'#64748b', flexShrink:0, textAlign:'right' }}>{fmtMonat(d.monat)}</div>
                            <div style={{ flex:1, height:34, background:'#f8fafc', borderRadius:8, overflow:'hidden', position:'relative' }}>
                              <div style={{ display:'flex', height:'100%' }}>
                                {allePruefer.map((p,pi) => {
                                  const val = d.pruefer[p]??0;
                                  const w   = (val/maxVal)*100;
                                  return w>0 ? (
                                    <div key={p} title={`${p}: ${val}`}
                                      style={{ width:`${w}%`, background:COLORS[pi%COLORS.length], display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      {w>7 && <span style={{ fontSize:10, color:'#fff', fontWeight:700 }}>{val}</span>}
                                    </div>
                                  ) : null;
                                })}
                              </div>
                              {sollGes>0 && (
                                <div style={{ position:'absolute', top:0, bottom:0, left:`${Math.min(sollGes/maxVal*100,99)}%`, width:2, background:'#0f172a', opacity:.5 }}/>
                              )}
                            </div>
                            <div style={{ width:74, flexShrink:0, textAlign:'right' }}>
                              <span style={{ fontSize:14, fontWeight:800, color:scoreColor(pct) }}>{total.toLocaleString('de-DE')}</span>
                              <span style={{ fontSize:10, color:'#94a3b8', marginLeft:3 }}>({pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Legende */}
                      <div style={{ display:'flex', gap:14, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
                        {allePruefer.map((p,pi) => (
                          <div key={p} style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ width:10, height:10, borderRadius:2, background:COLORS[pi%COLORS.length] }}/>
                            <span style={{ fontSize:11, color:'#64748b' }}>{p}</span>
                          </div>
                        ))}
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                          <div style={{ width:2, height:14, background:'#0f172a', opacity:.5 }}/>
                          <span style={{ fontSize:11, color:'#64748b' }}>Soll-Linie</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Jahres-Tabelle */}
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
                <div style={{ padding:'18px 20px', borderBottom:'1px solid #f1f5f9' }}>
                  <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:0 }}>Jahres-Übersicht</h3>
                </div>
                {(() => {
                  const allePruefer = [...new Set(jahresMonatData.flatMap(d => Object.keys(d.pruefer)))];
                  const soll = (pruefer as any[])[0]?.soll_monat ?? 0;
                  return (
                    <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                          <th style={{ padding:'10px 16px', textAlign:'left', color:'#94a3b8', fontWeight:600, fontSize:11, textTransform:'uppercase' }}>Prüfer</th>
                          {jahresMonatData.map(d => (
                            <th key={d.monat} style={{ padding:'10px 8px', textAlign:'center', color:'#94a3b8', fontWeight:600, fontSize:11 }}>
                              {fmtMonat(d.monat).slice(0,6)}
                            </th>
                          ))}
                          <th style={{ padding:'10px 16px', textAlign:'right', color:'#94a3b8', fontWeight:600, fontSize:11, textTransform:'uppercase' }}>Gesamt</th>
                          <th style={{ padding:'10px 16px', textAlign:'right', color:'#94a3b8', fontWeight:600, fontSize:11, textTransform:'uppercase' }}>Ø/Monat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allePruefer.map((p,pi) => {
                          const gesamt = jahresMonatData.reduce((s,d)=>s+(d.pruefer[p]??0),0);
                          const avg    = Math.round(gesamt/jahresMonatData.length);
                          const avgPct = soll>0 ? Math.round(avg/soll*100) : 0;
                          return (
                            <tr key={p} style={{ borderBottom:'1px solid #f8fafc' }}>
                              <td style={{ padding:'12px 16px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <div style={{ width:8, height:8, borderRadius:'50%', background:COLORS[pi%COLORS.length], flexShrink:0 }}/>
                                  <span style={{ fontWeight:600, color:'#0f172a' }}>{p}</span>
                                </div>
                              </td>
                              {jahresMonatData.map(d => {
                                const val = d.pruefer[p]??0;
                                const mp  = soll>0 ? Math.round(val/soll*100) : 0;
                                return (
                                  <td key={d.monat} style={{ padding:'12px 8px', textAlign:'center' }}>
                                    <span style={{ fontWeight:700, color:val>0?scoreColor(mp):'#e2e8f0' }}>{val>0?val.toLocaleString('de-DE'):'–'}</span>
                                  </td>
                                );
                              })}
                              <td style={{ padding:'12px 16px', textAlign:'right' }}>
                                <span style={{ fontSize:15, fontWeight:900, color:scoreColor(avgPct) }}>{gesamt.toLocaleString('de-DE')}</span>
                              </td>
                              <td style={{ padding:'12px 16px', textAlign:'right' }}>
                                <span style={{ fontWeight:700, color:scoreColor(avgPct) }}>{avg.toLocaleString('de-DE')}</span>
                                <span style={{ fontSize:10, color:'#94a3b8', marginLeft:3 }}>({avgPct}%)</span>
                              </td>
                            </tr>
                          );
                        })}
                        {/* Gesamt-Zeile */}
                        <tr style={{ background:'#f8fafc', borderTop:'2px solid #f1f5f9' }}>
                          <td style={{ padding:'12px 16px', fontWeight:700, color:'#0f172a' }}>Gesamt</td>
                          {jahresMonatData.map(d => {
                            const total = Object.values(d.pruefer).reduce((s,v)=>s+v,0);
                            const sollG = soll*(pruefer as any[]).filter((x:any)=>x.aktiv).length;
                            const pct   = sollG>0?Math.round(total/sollG*100):0;
                            return (
                              <td key={d.monat} style={{ padding:'12px 8px', textAlign:'center' }}>
                                <span style={{ fontWeight:800, color:scoreColor(pct) }}>{total.toLocaleString('de-DE')}</span>
                              </td>
                            );
                          })}
                          <td colSpan={2} style={{ padding:'12px 16px', textAlign:'right', fontWeight:800, color:'#0f172a' }}>
                            {jahresMonatData.reduce((s,d)=>s+Object.values(d.pruefer).reduce((ss,v)=>ss+v,0),0).toLocaleString('de-DE')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
