import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Clock, Ticket, Users } from 'lucide-react';

const FARBEN = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#1e293b', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'10px 14px' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6, fontWeight:600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:20, fontSize:12, marginBottom:2 }}>
          <span style={{ color:p.color, fontWeight:500 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'#fff' }}>{p.value}{p.name === 'Stunden' ? 'h' : ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalysePage() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month)-1, 1)
    .toLocaleString('de-DE', { month:'long', year:'numeric' });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true); return data ?? []; },
  });
  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-analyse', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs')
        .select('*, employees(id,name,kuerzel), tickets(id,a_nummer,gewerk,status)')
        .gte('leistungsdatum', from).lte('leistungsdatum', to);
      return data ?? [];
    },
  });
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-analyse', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*')
        .gte('eingangsdatum', from).lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  const t = tickets as any[];
  const w = worklogs as any[];
  const emps = employees as any[];

  const totalH = w.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const totalT = t.length;
  const erledigt = t.filter((x: any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const aktiveMA = new Set(w.map((x: any) => x.employee_id)).size;
  const erledigungsQuote = totalT > 0 ? Math.round(erledigt / totalT * 100) : 0;

  // Mitarbeiter Stats
  const maData = emps.map((emp: any, i: number) => {
    const logs = w.filter((x: any) => x.employee_id === emp.id);
    const stunden = logs.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
    const ticketSet = new Set(logs.map((x: any) => x.ticket_id));
    return {
      name: emp.kuerzel || emp.name.split(' ')[0],
      fullName: emp.name,
      Stunden: Math.round(stunden * 10) / 10,
      Tickets: ticketSet.size,
      farbe: FARBEN[i % FARBEN.length],
    };
  }).filter((e: any) => e.Stunden > 0 || e.Tickets > 0)
    .sort((a: any, b: any) => b.Stunden - a.Stunden);

  // Gewerk
  const hochbauT = t.filter((x: any) => x.gewerk === 'Hochbau');
  const elektroT = t.filter((x: any) => x.gewerk === 'Elektro');
  const hochbauIds = new Set(hochbauT.map((x: any) => x.id));
  const elektroIds = new Set(elektroT.map((x: any) => x.id));
  const hochbauH = w.filter((x: any) => hochbauIds.has(x.ticket_id)).reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter((x: any) => elektroIds.has(x.ticket_id)).reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const hochbauErl = hochbauT.filter((x:any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const elektroErl = elektroT.filter((x:any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;

  const gewerkData = [
    { name: 'Hochbau', 'Tickets gesamt': hochbauT.length, Erledigt: hochbauErl, Stunden: Math.round(hochbauH*10)/10 },
    { name: 'Elektro', 'Tickets gesamt': elektroT.length, Erledigt: elektroErl, Stunden: Math.round(elektroH*10)/10 },
  ];

  const kpiStyle = (color: string) => ({
    background:'#fff', borderRadius:16, padding:'18px 20px',
    border:`1px solid ${color}20`, position:'relative' as const, overflow:'hidden' as const,
  });

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize:24, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
          Analyse <span style={{ color:'#3b82f6' }}>{monthName}</span>
        </h1>
        <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>Ticket-Auswertung · Stunden · Mitarbeiter-Leistung</p>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { label:'Tickets gesamt', value: totalT, icon:Ticket, color:'#3b82f6' },
          { label:'Erledigt', value:`${erledigt} (${erledigungsQuote}%)`, icon:TrendingUp, color:'#10b981' },
          { label:'Stunden gesamt', value:`${totalH.toFixed(1)}h`, icon:Clock, color:'#8b5cf6' },
          { label:'Aktive Mitarbeiter', value: aktiveMA, icon:Users, color:'#f59e0b' },
        ].map((k, i) => (
          <div key={i} style={kpiStyle(k.color)}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color }} />
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:`${k.color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <k.icon size={15} style={{ color:k.color }} />
              </div>
              <span style={{ fontSize:10, color:'#94a3b8', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>{k.label}</span>
            </div>
            <p style={{ fontSize:28, fontWeight:900, color:k.color, margin:0, letterSpacing:'-.04em' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Mitarbeiter Chart — volle Breite */}
      {maData.length > 0 ? (
        <div style={{ background:'#fff', borderRadius:18, padding:'24px 28px', border:'1px solid #f1f5f9' }}>
          <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>
            Mitarbeiter-Leistung · {monthName}
          </h2>
          <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Stunden und Tickets pro Mitarbeiter im Vergleich</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={maData} barGap={6} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:12, fill:'#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="s" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
              <YAxis yAxisId="t" orientation="right" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:12, paddingTop:12 }} />
              <Bar yAxisId="s" dataKey="Stunden" fill="#2563eb" radius={[6,6,0,0]} />
              <Bar yAxisId="t" dataKey="Tickets" fill="#10b981" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Mitarbeiter-Karten */}
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${maData.length},1fr)`, gap:10, marginTop:20, paddingTop:18, borderTop:'1px solid #f1f5f9' }}>
            {maData.map((e: any, i: number) => (
              <div key={i} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', border:'1px solid #f1f5f9' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`${e.farbe}15`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:800, color:e.farbe }}>{e.name.slice(0,2).toUpperCase()}</span>
                </div>
                <p style={{ fontSize:12, fontWeight:700, color:'#0f172a', margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.fullName}</p>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, paddingTop:8, borderTop:'1px solid #e2e8f0' }}>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ fontSize:16, fontWeight:900, color:'#2563eb', margin:0 }}>{e.Stunden}h</p>
                    <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>Stunden</p>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <p style={{ fontSize:16, fontWeight:900, color:'#10b981', margin:0 }}>{e.Tickets}</p>
                    <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>Tickets</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Gewerk — volle Breite, groß */}
      <div style={{ background:'#fff', borderRadius:18, padding:'24px 28px', border:'1px solid #f1f5f9' }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:'#0f172a', margin:'0 0 3px', letterSpacing:'-.02em' }}>Gewerk Vergleich</h2>
        <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 20px' }}>Tickets gesamt · Erledigt · Stunden nach Hochbau und Elektro</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={gewerkData} barGap={8} barCategoryGap="45%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize:15, fill:'#0f172a', fontWeight:'bold' as const }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize:12, paddingTop:12 }} />
            <Bar dataKey="Tickets gesamt" fill="rgba(37,99,235,0.85)" radius={[8,8,0,0]} />
            <Bar dataKey="Erledigt"       fill="rgba(16,185,129,0.85)" radius={[8,8,0,0]} />
            <Bar dataKey="Stunden"        fill="rgba(139,92,246,0.85)" radius={[8,8,0,0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Gewerk Zusammenfassung */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:20, paddingTop:18, borderTop:'1px solid #f1f5f9' }}>
          {[
            { name:'Hochbau', emoji:'🏗', tickets:hochbauT.length, erledigt:hochbauErl, stunden:Math.round(hochbauH*10)/10 },
            { name:'Elektro', emoji:'⚡', tickets:elektroT.length, erledigt:elektroErl, stunden:Math.round(elektroH*10)/10 },
          ].map((g, i) => {
            const quote = g.tickets > 0 ? Math.round(g.erledigt/g.tickets*100) : 0;
            return (
              <div key={i} style={{ background:'#f8fafc', borderRadius:14, padding:'16px 18px', border:'1px solid #f1f5f9' }}>
                <p style={{ fontSize:14, fontWeight:800, color:'#0f172a', margin:'0 0 14px' }}>{g.emoji} {g.name}</p>
                {[
                  { label:'Tickets gesamt', val:g.tickets, color:'#2563eb', pct: totalT > 0 ? g.tickets/totalT : 0 },
                  { label:'Erledigt', val:g.erledigt, color:'#10b981', pct: g.tickets > 0 ? g.erledigt/g.tickets : 0 },
                  { label:'Stunden', val:`${g.stunden}h`, color:'#8b5cf6', pct: totalH > 0 ? g.stunden/totalH : 0 },
                ].map((row, j) => (
                  <div key={j} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, color:'#64748b' }}>{row.label}</span>
                      <strong style={{ fontSize:12, color:row.color }}>{row.val}</strong>
                    </div>
                    <div style={{ height:4, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.round(row.pct*100)}%`, background:row.color, borderRadius:99, transition:'width .5s ease' }} />
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid #e2e8f0', marginTop:4 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>Erledigungsquote</span>
                  <strong style={{ fontSize:14, color: quote >= 70 ? '#10b981' : '#f59e0b' }}>{quote}%</strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leer-State */}
      {maData.length === 0 && t.length === 0 && (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'48px 24px', textAlign:'center' }}>
          <p style={{ color:'#94a3b8', fontSize:14, fontWeight:600, margin:0 }}>Keine Daten für {monthName}</p>
          <p style={{ color:'#cbd5e1', fontSize:13, margin:'4px 0 0' }}>Importiere Tickets oder trage Stunden ein</p>
        </div>
      )}
    </div>
  );
}
