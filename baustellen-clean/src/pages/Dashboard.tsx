import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, CheckCircle2, ArrowRight, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  offen:          { label:'Offen',          color:'#94a3b8', bg:'#f1f5f9' },
  in_bearbeitung: { label:'In Bearbeitung', color:'#3b82f6', bg:'#eff6ff' },
  pausiert:       { label:'Pausiert',       color:'#f59e0b', bg:'#fffbeb' },
  abgeschlossen:  { label:'Abgeschlossen',  color:'#10b981', bg:'#f0fdf4' },
  abgerechnet:    { label:'Abgerechnet',    color:'#8b5cf6', bg:'#faf5ff' },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 20px rgba(0,0,0,.08)', fontSize:12 }}>
      <p style={{ fontWeight:600, color:'#0f172a', marginBottom:6 }}>{label}</p>
      {payload.map((p:any,i:number) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:2 }}>
          <span style={{ color:p.fill }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#0f172a' }}>{fmtEur(p.value)}</span>
        </div>
      ))}
    </div>
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
  const aktive = bs.filter(b => b.status !== 'abgerechnet');
  const totalBudget  = bsK.reduce((s,b) => s + b.effektivBudget, 0);
  const totalKosten  = bsK.reduce((s,b) => s + b.gesamtkosten, 0);
  const totalStunden = sw.reduce((s,w) => s + Number(w.stunden??0), 0);
  const overBudget   = bsK.filter(b => b.overBudget).length;
  const budgetPct    = totalBudget > 0 ? Math.round(totalKosten / totalBudget * 100) : 0;

  const statusData = Object.entries(STATUS_CFG).map(([key,cfg]) => ({
    name: cfg.label, value: bs.filter(b => b.status === key).length, color: cfg.color,
  })).filter(d => d.value > 0);

  const budgetKostenData = bsK.map(b => ({
    name: b.name?.length > 16 ? b.name.slice(0,14)+'…' : b.name,
    Budget: Math.round(b.effektivBudget),
    Kosten: Math.round(b.gesamtkosten),
  }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes barGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }
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
          { label:'Aktive Baustellen', value:aktive.length, sub:`${bs.length} gesamt`, icon:HardHat, color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
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

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
        {/* Budget vs Kosten */}
        <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Budget vs. Kosten</h3>
              <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>Pro Baustelle im Überblick</p>
            </div>
            <div style={{ display:'flex', gap:14 }}>
              {[['Budget','#e2e8f0'],['Kosten','#2563eb']].map(([l,c]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:c as string }} />
                  <span style={{ fontSize:11, color:'#64748b', fontWeight:500 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {budgetKostenData.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1', fontSize:13 }}>Noch keine Baustellen</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={budgetKostenData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Budget" fill="#e2e8f0" radius={[6,6,0,0]} />
                <Bar dataKey="Kosten" radius={[6,6,0,0]}>
                  {budgetKostenData.map((entry,i) => (
                    <Cell key={i} fill={entry.Kosten > entry.Budget ? '#ef4444' : '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Alle Baustellen</h3>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>{bs.length} Projekte · sortiert nach Erstellung</p>
          </div>
          <button onClick={() => navigate('/baustellen/liste')}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12, fontWeight:600, color:'#475569', cursor:'pointer' }}>
            Alle <ArrowRight size={13} />
          </button>
        </div>

        {bsK.length === 0 && (
          <div style={{ padding:'40px 0', textAlign:'center', color:'#cbd5e1', fontSize:14 }}>Noch keine Baustellen angelegt</div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {bsK.slice(0,8).map((b:any) => {
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
