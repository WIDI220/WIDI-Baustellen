import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Ticket, Clock, CheckCircle, AlertCircle, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const STATUS_CFG = [
  { value: 'in_bearbeitung',  label: 'In Bearbeitung',  color: '#3b82f6' },
  { value: 'erledigt',        label: 'Erledigt',        color: '#10b981' },
  { value: 'zur_unterschrift',label: 'Zur Unterschrift',color: '#f59e0b' },
  { value: 'abrechenbar',     label: 'Abrechenbar',     color: '#f97316' },
  { value: 'abgerechnet',     label: 'Abgerechnet',     color: '#6b7280' },
];

const EMP_COLORS = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

function Tooltip2({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1e293b', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'10px 14px' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:20, fontSize:12, marginBottom:2 }}>
          <span style={{ color:p.fill||p.color, fontWeight:500 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#fff' }}>{p.value}{p.name==='Stunden'?'h':''}</span>
        </div>
      ))}
    </div>
  );
}

export default function TicketsDashboard() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month)-1, 1)
    .toLocaleString('de-DE', { month:'long', year:'numeric' });

  // Vormonat
  const prevDate = new Date(parseInt(year), parseInt(month)-2, 1);
  const prevYear = prevDate.getFullYear().toString();
  const prevMonth = String(prevDate.getMonth()+1).padStart(2,'0');



  // Worklogs des Monats — für Stunden
  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-dash', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs')
        .select('*, employees(id,name,kuerzel), tickets(id,gewerk)')
        .gte('leistungsdatum', from).lte('leistungsdatum', to);
      return data ?? [];
    },
  });

  // Vormonat Worklogs
  const { data: prevWorklogs = [] } = useQuery({
    queryKey: ['prev-worklogs-dash', activeMonth],
    queryFn: async () => {
      const pFrom = `${prevYear}-${prevMonth}-01`;
      const pLast = new Date(parseInt(prevYear), parseInt(prevMonth), 0).getDate();
      const pTo = `${prevYear}-${prevMonth}-${String(pLast).padStart(2,'0')}`;
      const { data } = await supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', pFrom).lte('leistungsdatum', pTo);
      return data ?? [];
    },
  });

  // Tickets des aktiven Monats (nach Eingangsdatum)
  const { data: monthTickets = [] } = useQuery({
    queryKey: ['tickets-dash-month', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true); return data ?? []; },
  });

  const t = monthTickets as any[];    // nur Monat
  const w = worklogs as any[];
  const pw = prevWorklogs as any[];
  const emps = employees as any[];

  // Stunden
  const totalH = w.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const prevH  = pw.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const trend  = prevH > 0 ? ((totalH - prevH) / prevH * 100) : null;

  // Status (alle Tickets, aktueller Stand)
  const statusData = STATUS_CFG.map(s => ({
    name: s.label, value: t.filter((x:any) => x.status === s.value).length, color: s.color,
  })).filter(s => s.value > 0);

  const erledigtMonat = t.filter((x:any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const inBearb = t.filter((x:any) => x.status === 'in_bearbeitung').length;

  // Gewerk — nach Worklogs des Monats, verknüpft mit Ticket-Gewerk
  const hochbauW = w.filter((x:any) => x.tickets?.gewerk === 'Hochbau');
  const elektroW = w.filter((x:any) => x.tickets?.gewerk === 'Elektro');
  const hochbauH = hochbauW.reduce((s:number,x:any)=>s+Number(x.stunden??0),0);
  const elektroH = elektroW.reduce((s:number,x:any)=>s+Number(x.stunden??0),0);

  // Tickets des Monats nach Gewerk
  const hochbauT = t.filter((x:any) => x.gewerk === 'Hochbau');
  const elektroT = t.filter((x:any) => x.gewerk === 'Elektro');
  const hochbauErl = hochbauT.filter((x:any)=>['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const elektroErl = elektroT.filter((x:any)=>['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;

  // Gewerk Chart: Tickets + Stunden — keine "Tickets gesamt" Bar
  const gewerkData = [
    { name:'Hochbau', Tickets: hochbauT.length, Stunden: Math.round(hochbauH*4)/4, Erledigt: hochbauErl },
    { name:'Elektro', Tickets: elektroT.length, Stunden: Math.round(elektroH*4)/4, Erledigt: elektroErl },
  ];

  // Mitarbeiter Stunden + Tickets
  const empData = emps.map((emp:any, i:number) => {
    const logs = w.filter((x:any) => x.employee_id === emp.id);
    const stunden = Math.round(logs.reduce((s:number,x:any)=>s+Number(x.stunden??0),0)*4)/4;
    const tickets = new Set(logs.map((x:any)=>x.ticket_id)).size;
    return { name: emp.kuerzel||emp.name.split(' ')[0], fullName: emp.name, Stunden: stunden, Tickets: tickets, farbe: EMP_COLORS[i%EMP_COLORS.length] };
  }).filter((e:any)=>e.Stunden>0||e.Tickets>0).sort((a:any,b:any)=>b.Stunden-a.Stunden);

  const maxH = Math.max(...empData.map((x:any)=>x.Stunden), 1);

  const card = (color:string) => ({
    background:'#fff', borderRadius:18, padding:'20px', border:`1px solid ${color}20`,
    position:'relative' as const, overflow:'hidden' as const,
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes grow{from{width:0}to{width:var(--w)}}
        .dc{animation:fadeUp .4s ease both}
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Tickets <span style={{ color:'#10b981' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>{monthName} · {t.length} Tickets</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'6px 14px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#065f46' }}>{erledigtMonat} erledigt</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { label:'Tickets im Monat', val:t.length, sub:`${monthName}`, color:'#2563eb' },
          { label:'Stunden gesamt', val:`${(Math.round(totalH*4)/4).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1')}h`, sub: trend!==null?`${trend>=0?'+':''}${trend.toFixed(1)}% vs. Vormonat`:'kein Vormonat', color:'#8b5cf6', trend },
          { label:'In Bearbeitung', val:inBearb, sub:`${t.length>0?Math.round(inBearb/t.length*100):0}% der Monatstickets`, color:'#f59e0b' },
          { label:'Erledigt',       val:erledigtMonat,       sub:`${t.length>0?Math.round(erledigtMonat/t.length*100):0}% Erledigungsquote`, color:'#10b981' },
        ].map((k,i)=>(
          <div key={i} className="dc" style={{ ...card(k.color), animationDelay:`${i*.06}s` }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color }} />
            <p style={{ fontSize:28, fontWeight:900, color:k.color, margin:'4px 0 4px', letterSpacing:'-.04em' }}>{k.val}</p>
            <p style={{ fontSize:12, fontWeight:700, color:'#64748b', margin:'0 0 4px' }}>{k.label}</p>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              {'trend' in k && k.trend!=null && (k.trend>=0 ? <ArrowUpRight size={12} style={{color:'#10b981'}}/> : <ArrowDownRight size={12} style={{color:'#ef4444'}}/>)}
              <p style={{ fontSize:11, color: 'trend' in k && k.trend!=null ? (k.trend>=0?'#10b981':'#ef4444') : '#94a3b8', margin:0 }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Status Kacheln */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {STATUS_CFG.map(s=>{
          const count = t.filter((x:any)=>x.status===s.value).length;
          const pct = t.length>0?Math.round(count/t.length*100):0;
          return (
            <div key={s.value} style={{ background:'#fff', border:`1px solid ${s.color}22`, borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', bottom:0, left:0, height:3, width:`${pct}%`, background:s.color, transition:'width 1s ease' }} />
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }} />
                <span style={{ fontSize:11, fontWeight:600, color:'#64748b' }}>{s.label}</span>
              </div>
              <p style={{ fontSize:26, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.03em' }}>{count}</p>
              <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{pct}%</p>
            </div>
          );
        })}
      </div>

      {/* Charts: Gewerk + Status */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Gewerk Vergleich — Tickets + Stunden, KEIN "Tickets gesamt" */}
        <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:'#0f172a', margin:'0 0 3px' }}>Gewerk Vergleich</h2>
          <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 16px' }}>Erledigt · Stunden je Gewerk · {monthName}</p>
          {hochbauT.length===0 && elektroT.length===0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1', fontSize:13 }}>Keine Tickets für {monthName}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gewerkData} barGap={8} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:13, fill:'#0f172a', fontWeight:700 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="t" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="s" orientation="right" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip content={<Tooltip2 />} />
                  <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                  <Bar yAxisId="t" dataKey="Erledigt" fill="rgba(16,185,129,0.85)" radius={[6,6,0,0]} />
                  <Bar yAxisId="s" dataKey="Stunden"  fill="rgba(139,92,246,0.85)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14, paddingTop:14, borderTop:'1px solid #f8fafc' }}>
                {[{name:'Hochbau',t:hochbauT.length,erl:hochbauErl,h:hochbauH,c:'#2563eb'},{name:'Elektro',t:elektroT.length,erl:elektroErl,h:elektroH,c:'#10b981'}].map(g=>(
                  <div key={g.name} style={{ background:'#f8fafc', borderRadius:12, padding:'10px 12px' }}>
                    <p style={{ fontSize:12, fontWeight:800, color:'#0f172a', margin:'0 0 6px' }}>{g.name}</p>
                    <div style={{ fontSize:11, color:'#64748b', display:'flex', flexDirection:'column', gap:3 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span>Tickets</span><strong style={{color:g.c}}>{g.t}</strong></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span>Erledigt</span><strong style={{color:'#10b981'}}>{g.erl}</strong></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span>Stunden</span><strong style={{color:'#8b5cf6'}}>{(Math.round(g.h*4)/4).toFixed(2).replace(/\.00$/,'').replace(/(\.[1-9])0$/,'$1')}h</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status Verteilung — Horizontal Bars */}
        <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:'#0f172a', margin:'0 0 3px' }}>Status Verteilung</h2>
          <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 20px' }}>{t.length} Tickets · {monthName}</p>
          {t.length===0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1', fontSize:13 }}>Keine Tickets</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {STATUS_CFG.map(s => {
                const count = t.filter((x:any) => x.status === s.value).length;
                const pct = t.length > 0 ? (count / t.length * 100) : 0;
                return (
                  <div key={s.value}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:9, height:9, borderRadius:'50%', background:s.color, flexShrink:0 }} />
                        <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{s.label}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:12, color:'#94a3b8' }}>{pct.toFixed(0)}%</span>
                        <span style={{ fontSize:13, fontWeight:800, color:s.color, minWidth:28, textAlign:'right' }}>{count}</span>
                      </div>
                    </div>
                    <div style={{ height:7, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:s.color, borderRadius:99, transition:'width .8s cubic-bezier(.16,1,.3,1)' }} />
                    </div>
                  </div>
                );
              })}
              {/* Gesamtbalken */}
              <div style={{ marginTop:8, paddingTop:12, borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>Erledigungsquote</span>
                <span style={{ fontSize:13, fontWeight:800, color:'#10b981' }}>
                  {t.length > 0 ? Math.round(t.filter((x:any)=>['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length / t.length * 100) : 0}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mitarbeiter Stunden + Tickets — kombiniert */}
      <div style={{ background:'#fff', borderRadius:18, padding:24, border:'1px solid #f1f5f9' }}>
        <h2 style={{ fontSize:15, fontWeight:800, color:'#0f172a', margin:'0 0 3px' }}>Mitarbeiter Leistung</h2>
        <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 20px' }}>{monthName} · Stunden und Tickets</p>
        {empData.length===0 ? (
          <p style={{ color:'#cbd5e1', fontSize:13, textAlign:'center', padding:'24px 0' }}>Keine Stunden für {monthName}</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {empData.map((emp:any,i:number)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`${emp.farbe}15`, border:`1px solid ${emp.farbe}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:emp.farbe }}>{emp.name.slice(0,2)}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{emp.fullName}</span>
                    <div style={{ display:'flex', gap:12, fontSize:12 }}>
                      <span style={{ color:'#2563eb', fontWeight:700 }}>{emp.Stunden}h</span>
                      <span style={{ color:'#10b981', fontWeight:700 }}>{emp.Tickets} Tickets</span>
                    </div>
                  </div>
                  <div style={{ height:7, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(emp.Stunden/maxH)*100}%`, background:`linear-gradient(90deg,${emp.farbe},${emp.farbe}88)`, borderRadius:99, transition:'width .8s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
