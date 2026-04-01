import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, CheckCircle2, ArrowRight, Zap, PauseCircle } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  nicht_gestartet: { label:'Nicht gestartet', color:'#94a3b8', bg:'#f1f5f9' },
  offen:           { label:'Offen',            color:'#64748b', bg:'#f8fafc' },
  in_bearbeitung:  { label:'In Bearbeitung',   color:'#3b82f6', bg:'#eff6ff' },
  pausiert:        { label:'Pausiert',          color:'#f59e0b', bg:'#fffbeb' },
  abgeschlossen:   { label:'Abgeschlossen',     color:'#10b981', bg:'#f0fdf4' },
  abgerechnet:     { label:'Abgerechnet',       color:'#8b5cf6', bg:'#faf5ff' },
};

// Custom Tooltip für Budget vs Kosten
const BudgetTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const budget = payload.find((p:any) => p.dataKey === 'Budget')?.value ?? 0;
  const kosten = payload.find((p:any) => p.dataKey === 'Kosten')?.value ?? 0;
  const pct = budget > 0 ? Math.round(kosten / budget * 100) : 0;
  const over = kosten > budget;
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'12px 16px', boxShadow:'0 4px 20px rgba(0,0,0,.1)', fontSize:12, minWidth:180 }}>
      <p style={{ fontWeight:700, color:'#0f172a', marginBottom:8, fontSize:13 }}>{label}</p>
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:4 }}>
        <span style={{ color:'#3b82f6', fontWeight:600 }}>Budget</span>
        <span style={{ fontWeight:700, color:'#0f172a' }}>{fmtEur(budget)}</span>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:8 }}>
        <span style={{ color: over ? '#ef4444' : '#10b981', fontWeight:600 }}>Kosten</span>
        <span style={{ fontWeight:700, color: over ? '#ef4444' : '#10b981' }}>{fmtEur(kosten)}</span>
      </div>
      <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:8, display:'flex', justifyContent:'space-between' }}>
        <span style={{ color:'#64748b', fontSize:11 }}>Auslastung</span>
        <span style={{ fontWeight:800, color: over ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981', fontSize:13 }}>{pct}%</span>
      </div>
    </div>
  );
};

// Custom Bar Label
const BarLabel = ({ x, y, width, value, budget }: any) => {
  if (!value || !budget || width < 30) return null;
  const pct = Math.round(value / budget * 100);
  const over = value > budget;
  return (
    <text x={x + width / 2} y={y - 5} fill={over ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981'} textAnchor="middle" fontSize={10} fontWeight={700}>
      {pct}%
    </text>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] } = useQuery({ queryKey:['bs-dashboard'], queryFn: async () => { const {data} = await supabase.from('baustellen').select('*').order('created_at',{ascending:false}); return data??[]; }});
  const { data: stunden = [] }    = useQuery({ queryKey:['bs-stunden-dash'], queryFn: async () => { const {data} = await supabase.from('bs_stundeneintraege').select('*,employees(stundensatz,name,kuerzel)'); return data??[]; }});
  const { data: materialien = [] }= useQuery({ queryKey:['bs-mat-dash'], queryFn: async () => { const {data} = await supabase.from('bs_materialien').select('*'); return data??[]; }});
  const { data: nachtraege = [] } = useQuery({ queryKey:['bs-nach-dash'], queryFn: async () => { const {data} = await supabase.from('bs_nachtraege').select('*'); return data??[]; }});
  const { data: eskalationen = [] }= useQuery({ queryKey:['bs-esk-dash'], queryFn: async () => { const {data} = await supabase.from('bs_eskalationen').select('*').eq('gelesen',false); return data??[]; }});

  const bs = baustellen as any[];
  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];
  const esk = eskalationen as any[];

  const bsK = bs.map(b => ({ ...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget??0)) }));

  // Aktive = nicht abgerechnet, nicht_gestartet separat
  const nichtGestartet = bs.filter(b => b.status === 'nicht_gestartet');
  const aktive = bs.filter(b => b.status !== 'abgerechnet' && b.status !== 'nicht_gestartet');
  const totalBudget  = bsK.filter(b => b.status !== 'nicht_gestartet').reduce((s,b) => s + b.effektivBudget, 0);
  const totalKosten  = bsK.filter(b => b.status !== 'nicht_gestartet').reduce((s,b) => s + b.gesamtkosten, 0);
  const totalStunden = sw.reduce((s,w) => s + Number(w.stunden??0), 0);
  const overBudget   = bsK.filter(b => b.overBudget && b.status !== 'nicht_gestartet').length;
  const budgetPct    = totalBudget > 0 ? Math.round(totalKosten / totalBudget * 100) : 0;
  const delta        = totalBudget - totalKosten;

  const statusData = Object.entries(STATUS_CFG).map(([key,cfg]) => ({
    name: cfg.label, value: bs.filter(b => b.status === key).length, color: cfg.color,
  })).filter(d => d.value > 0);

  // Nur Baustellen mit Budget für Chart, nicht_gestartet ausblenden
  const budgetKostenData = bsK
    .filter(b => b.effektivBudget > 0 && b.status !== 'nicht_gestartet')
    .map(b => ({
      name: b.name?.length > 16 ? b.name.slice(0,14)+'…' : b.name,
      Budget: Math.round(b.effektivBudget),
      Kosten: Math.round(b.gesamtkosten),
      pct: b.pct,
      over: b.overBudget,
    }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .dash-card { animation:fadeUp 0.4s ease forwards; opacity:0; }
        .dash-card:nth-child(1){animation-delay:0.05s}
        .dash-card:nth-child(2){animation-delay:0.1s}
        .dash-card:nth-child(3){animation-delay:0.15s}
        .dash-card:nth-child(4){animation-delay:0.2s}
        .bs-row:hover { background:#f8fafc !important; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Baustellen <span style={{ color:'#2563eb' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>
            {new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
        {esk.length > 0 && (
          <div onClick={() => navigate('/baustellen/eskalationen')}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, cursor:'pointer' }}>
            <AlertTriangle size={15} style={{ color:'#ef4444' }} />
            <span style={{ fontSize:13, fontWeight:600, color:'#dc2626' }}>{esk.length} offene Eskalation{esk.length!==1?'en':''}</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { label:'Aktive Baustellen', value:aktive.length, sub:`${bs.length} gesamt · ${nichtGestartet.length} nicht gestartet`, icon:HardHat, color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
          { label:'Gesamtbudget', value:fmtEur(totalBudget), sub:`${aktive.length} aktive Projekte`, icon:Euro, color:'#10b981', bg:'#f0fdf4', border:'#bbf7d0' },
          { label:'Gesamtkosten', value:fmtEur(totalKosten), sub:`${budgetPct}% des Budgets`, icon:TrendingUp, color: totalKosten>totalBudget?'#ef4444':'#f59e0b', bg: totalKosten>totalBudget?'#fef2f2':'#fffbeb', border: totalKosten>totalBudget?'#fecaca':'#fde68a', trend: totalKosten>totalBudget },
          { label:'Gebuchte Stunden', value:`${totalStunden.toFixed(1)}h`, sub:`Alle Baustellen`, icon:Clock, color:'#8b5cf6', bg:'#faf5ff', border:'#ddd6fe' },
        ].map((kpi,i) => (
          <div key={i} className="dash-card" style={{ background:'#fff', border:`1px solid ${kpi.border}`, borderRadius:18, padding:'20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:kpi.color, borderRadius:'18px 18px 0 0' }} />
            <div style={{ width:38, height:38, background:kpi.bg, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
              <kpi.icon size={18} style={{ color:kpi.color }} />
            </div>
            <p style={{ fontSize:26, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.04em' }}>{kpi.value}</p>
            <p style={{ fontSize:12, fontWeight:600, color:'#64748b', margin:'0 0 4px' }}>{kpi.label}</p>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              {'trend' in kpi && kpi.trend && <AlertTriangle size={11} style={{ color:'#ef4444' }} />}
              <p style={{ fontSize:11, color:('trend' in kpi && kpi.trend)?'#ef4444':'#94a3b8', margin:0 }}>{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Over Budget Warning */}
      {overBudget > 0 && (
        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:10 }}>
          <Zap size={16} style={{ color:'#ef4444', flexShrink:0 }} />
          <span style={{ fontSize:13, color:'#dc2626', fontWeight:600 }}>{overBudget} Baustelle{overBudget!==1?'n':''} über Budget</span>
        </div>
      )}

      {/* Nicht gestartet Banner */}
      {nichtGestartet.length > 0 && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <PauseCircle size={16} style={{ color:'#94a3b8', flexShrink:0 }} />
            <span style={{ fontSize:13, color:'#64748b', fontWeight:600 }}>{nichtGestartet.length} Baustelle{nichtGestartet.length!==1?'n':''} noch nicht gestartet</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {nichtGestartet.slice(0,3).map((b:any) => (
              <span key={b.id} onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#f1f5f9', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                {b.name?.length > 20 ? b.name.slice(0,18)+'…' : b.name}
              </span>
            ))}
            {nichtGestartet.length > 3 && <span style={{ fontSize:11, color:'#94a3b8' }}>+{nichtGestartet.length-3} weitere</span>}
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>

        {/* Budget vs Kosten — NEU */}
        <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Budget vs. Kosten</h3>
              <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>Pro Baustelle · Hover für Details</p>
            </div>
            <div style={{ display:'flex', gap:14 }}>
              {[['Budget','#3b82f6'],['Kosten (OK)','#10b981'],['Kosten (Warn)','#f59e0b'],['Kosten (Over)','#ef4444']].map(([l,c]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:c as string }} />
                  <span style={{ fontSize:10, color:'#64748b', fontWeight:500 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {budgetKostenData.length === 0 ? (
            <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1', fontSize:13 }}>Noch keine Baustellen mit Budget</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={budgetKostenData} barGap={6} barCategoryGap="28%" margin={{ top:20, right:10, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:String(v)} />
                  <Tooltip content={<BudgetTooltip />} />
                  {/* Budget Balken — blau mit transparentem Fill und Rand */}
                  <Bar dataKey="Budget" radius={[6,6,0,0]} fill="#3b82f6" fillOpacity={0.15} stroke="#3b82f6" strokeWidth={2} />
                  {/* Kosten Balken — Farbe je nach Auslastung */}
                  <Bar dataKey="Kosten" radius={[6,6,0,0]}>
                    {budgetKostenData.map((entry,i) => {
                      const color = entry.over ? '#ef4444' : entry.pct > 80 ? '#f59e0b' : '#10b981';
                      return <Cell key={i} fill={color} fillOpacity={0.9} />;
                    })}
                    <LabelList
                      content={(props: any) => {
                        const entry = budgetKostenData[props.index];
                        if (!entry) return null;
                        return <BarLabel {...props} budget={entry.Budget} />;
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Summary unter Chart */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16, paddingTop:16, borderTop:'1px solid #f1f5f9' }}>
                {[
                  { label:'Gesamt Budget', value:fmtEur(totalBudget), color:'#3b82f6' },
                  { label:'Gesamt Kosten', value:fmtEur(totalKosten), color: totalKosten>totalBudget?'#ef4444':'#10b981' },
                  { label:'Verbleibendes Budget', value:(delta>=0?'+':'')+fmtEur(delta), color: delta<0?'#ef4444':'#10b981' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign:'center', padding:'10px 8px', background:'#f8fafc', borderRadius:10 }}>
                    <p style={{ fontSize:15, fontWeight:800, color:s.color, margin:'0 0 2px' }}>{s.value}</p>
                    <p style={{ fontSize:10, color:'#94a3b8', margin:0, textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status Pie */}
        <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 3px' }}>Status</h3>
          <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 12px' }}>{bs.length} Baustellen gesamt</p>
          {statusData.length === 0 ? (
            <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1', fontSize:13 }}>Keine Daten</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                  {statusData.map((entry,i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v:any) => [v,'Baustellen']} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
            {statusData.map(d => (
              <div key={d.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:d.color }} />
                  <span style={{ fontSize:12, color:'#475569' }}>{d.name}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Baustellenliste */}
      <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Aktive Baustellen</h3>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>{aktive.length} Projekte · sortiert nach Erstellung</p>
          </div>
          <button onClick={() => navigate('/baustellen/liste')}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12, fontWeight:600, color:'#475569', cursor:'pointer' }}>
            Alle <ArrowRight size={13} />
          </button>
        </div>

        {bsK.filter(b => b.status !== 'nicht_gestartet').length === 0 && (
          <div style={{ padding:'40px 0', textAlign:'center', color:'#cbd5e1', fontSize:14 }}>Noch keine aktiven Baustellen</div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {bsK.filter(b => b.status !== 'nicht_gestartet').slice(0,8).map((b:any) => {
            const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.offen;
            const pct = Math.min(b.pct, 100);
            const barColor = b.overBudget ? '#ef4444' : pct > 75 ? '#f59e0b' : '#2563eb';
            return (
              <div key={b.id} className="bs-row"
                onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                style={{ display:'grid', gridTemplateColumns:'1fr 130px 170px 90px 28px', gap:14, alignItems:'center', padding:'13px 16px', borderRadius:14, border:'1px solid #f1f5f9', cursor:'pointer', transition:'all .15s', background:'transparent' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:2 }}>{b.name}</div>
                  <div style={{ fontSize:11, color:'#94a3b8' }}>{b.a_nummer?`A-${b.a_nummer}`:''}</div>
                </div>
                <div>
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, background:cfg.bg, color:cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>{fmtEur(b.gesamtkosten)} / {fmtEur(b.effektivBudget)}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:barColor }}>{pct}%</span>
                  </div>
                  <div style={{ height:5, background:'#f1f5f9', borderRadius:99 }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:barColor, borderRadius:99, transition:'width .4s' }} />
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:b.overBudget?'#ef4444':'#0f172a' }}>{fmtEur(b.gesamtkosten)}</div>
                </div>
                <ArrowRight size={14} style={{ color:'#cbd5e1' }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
