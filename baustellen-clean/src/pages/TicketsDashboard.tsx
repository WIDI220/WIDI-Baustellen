import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Ticket, Clock, CheckCircle, AlertCircle, TrendingUp, Building2, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const STATUS_CFG = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'erledigt',       label: 'Erledigt',       color: '#10b981', bg: '#f0fdf4' },
  { value: 'zur_unterschrift',label: 'Zur Unterschrift',color: '#f59e0b', bg: '#fffbeb' },
  { value: 'abrechenbar',    label: 'Abrechenbar',    color: '#f97316', bg: '#fff7ed' },
  { value: 'abgerechnet',    label: 'Abgerechnet',    color: '#6b7280', bg: '#f9fafb' },
];
const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#f97316','#6b7280'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,.08)', fontSize: 12 }}>
      <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.fill || p.color }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function TicketsDashboard() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month)-1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-dash', activeMonth],
    queryFn: async () => { const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to); return data ?? []; },
  });
  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-dash', activeMonth],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(name, kuerzel, gewerk)').gte('leistungsdatum', from).lte('leistungsdatum', to); return data ?? []; },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true); return data ?? []; },
  });

  const prevDate = new Date(parseInt(year), parseInt(month) - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
  const { data: prevWorklogs = [] } = useQuery({
    queryKey: ['prev-worklogs-dash', activeMonth],
    queryFn: async () => {
      const pFrom = `${prevYear}-${prevMonth}-01`;
      const pLast = new Date(prevYear, prevDate.getMonth() + 1, 0).getDate();
      const pTo = `${prevYear}-${prevMonth}-${String(pLast).padStart(2,'0')}`;
      const { data } = await supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', pFrom).lte('leistungsdatum', pTo);
      return data ?? [];
    },
  });

  const t = tickets as any[];
  const w = worklogs as any[];
  const e = employees as any[];
  const pw = prevWorklogs as any[];

  const totalH = w.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const prevTotalH = pw.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const stundenTrend = prevTotalH > 0 ? ((totalH - prevTotalH) / prevTotalH * 100) : null;

  const erledigtCount   = t.filter((x: any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const inBearb         = t.filter((x: any) => x.status === 'in_bearbeitung').length;
  const abgerechnet     = t.filter((x: any) => x.status === 'abgerechnet').length;

  const hochbauT = t.filter((x: any) => x.gewerk === 'Hochbau');
  const elektroT = t.filter((x: any) => x.gewerk === 'Elektro');
  const hochbauH = w.filter((x: any) => x.employees?.gewerk === 'Hochbau').reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter((x: any) => x.employees?.gewerk === 'Elektro').reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);

  const gewerkData = [
    { name: 'Hochbau', Tickets: hochbauT.length, Stunden: Math.round(hochbauH * 10) / 10, Erledigt: hochbauT.filter((x:any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length },
    { name: 'Elektro', Tickets: elektroT.length, Stunden: Math.round(elektroH * 10) / 10, Erledigt: elektroT.filter((x:any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length },
  ];

  const statusData = STATUS_CFG.map(s => ({
    name: s.label, value: t.filter((x:any) => x.status === s.value).length, color: s.color,
  })).filter(s => s.value > 0);

  const empStunden = e.map((emp: any) => ({
    name: emp.kuerzel,
    fullName: emp.name,
    stunden: Math.round(w.filter((x:any) => x.employee_id === emp.id).reduce((s:number, x:any) => s + Number(x.stunden ?? 0), 0) * 10) / 10,
  })).filter((x:any) => x.stunden > 0).sort((a:any, b:any) => b.stunden - a.stunden);

  const maxH = Math.max(...empStunden.map((x:any) => x.stunden), 1);

  const GEWERK_COLORS: Record<string, string> = { Hochbau: '#2563eb', Elektro: '#10b981' };
  const EMP_COLORS = ['#2563eb','#10b981','#f59e0b','#f97316','#8b5cf6','#ec4899','#06b6d4','#14b8a6'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 32, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes barGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .dash-card { animation: fadeUp 0.4s ease forwards; opacity: 0; }
        .dash-card:nth-child(1) { animation-delay: 0.05s; }
        .dash-card:nth-child(2) { animation-delay: 0.1s; }
        .dash-card:nth-child(3) { animation-delay: 0.15s; }
        .dash-card:nth-child(4) { animation-delay: 0.2s; }
        .emp-bar { animation: barGrow 0.6s ease forwards; transform-origin: left; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Tickets <span style={{ color: '#10b981' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>{monthName} · {t.length} Tickets erfasst</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '6px 14px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>{erledigtCount} erledigt</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'Tickets gesamt', value: t.length, sub: `${inBearb} in Bearbeitung`, icon: Ticket, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Stunden gesamt', value: `${totalH.toFixed(1)}h`, sub: stundenTrend !== null ? `${stundenTrend >= 0 ? '+' : ''}${stundenTrend.toFixed(1)}% zum Vormonat` : 'kein Vormonat', icon: Clock, color: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe', trend: stundenTrend },
          { label: 'In Bearbeitung', value: inBearb, sub: `${t.length > 0 ? Math.round(inBearb/t.length*100) : 0}% des Monats`, icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Abgerechnet', value: abgerechnet, sub: `${erledigtCount} fertiggestellt`, icon: CheckCircle, color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
        ].map((kpi, i) => (
          <div key={i} className="dash-card" style={{
            background: '#fff',
            border: `1px solid ${kpi.border}`,
            borderRadius: 18, padding: '20px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Accent top bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kpi.color, borderRadius: '18px 18px 0 0' }} />
            <div style={{ width: 38, height: 38, background: kpi.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-.04em' }}>{kpi.value}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 4px' }}>{kpi.label}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {'trend' in kpi && kpi.trend !== null && kpi.trend !== undefined ? (
                kpi.trend >= 0
                  ? <ArrowUpRight size={12} style={{ color: '#10b981' }} />
                  : <ArrowDownRight size={12} style={{ color: '#ef4444' }} />
              ) : null}
              <p style={{ fontSize: 11, color: 'trend' in kpi && kpi.trend !== null && kpi.trend !== undefined ? (kpi.trend >= 0 ? '#10b981' : '#ef4444') : '#94a3b8', margin: 0 }}>{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Status Kacheln */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {STATUS_CFG.map(s => {
          const count = t.filter((x:any) => x.status === s.value).length;
          const pct = t.length > 0 ? Math.round(count / t.length * 100) : 0;
          return (
            <div key={s.value} style={{ background: '#fff', border: `1px solid ${s.color}22`, borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, width: `${pct}%`, background: s.color, transition: 'width 1s ease', borderRadius: '0 3px 0 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{s.label}</span>
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-.03em' }}>{count}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{pct}%</p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Gewerk */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Gewerk Vergleich</h2>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 16px' }}>Tickets · Stunden · Erledigt</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={gewerkData} barGap={4} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Tickets"  fill="#2563eb" radius={[5,5,0,0]} />
              <Bar dataKey="Stunden"  fill="#8b5cf6" radius={[5,5,0,0]} />
              <Bar dataKey="Erledigt" fill="#10b981" radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f8fafc' }}>
            {[
              { name: 'Hochbau', Icon: Building2, t: hochbauT.length, h: hochbauH, color: '#2563eb' },
              { name: 'Elektro', Icon: Zap, t: elektroT.length, h: elektroH, color: '#10b981' },
            ].map(g => (
              <div key={g.name} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <g.Icon size={13} style={{ color: g.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{g.name}</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tickets</span><strong style={{ color: '#0f172a' }}>{g.t}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Stunden</span><strong style={{ color: '#0f172a' }}>{g.h.toFixed(1)}h</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Pie */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Status Verteilung</h2>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>{monthName}</p>
          {t.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13 }}>Keine Tickets</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3}>
                  {statusData.map((_:any, i:number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v:any, n:any) => [`${v} Tickets`, n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {statusData.map((s:any, i:number) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span style={{ fontSize: 12, color: '#64748b' }}>{s.name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mitarbeiter Stunden */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Mitarbeiter Stunden</h2>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>{monthName} — geleistete Stunden</p>
        {empStunden.length === 0 ? (
          <p style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Keine Stunden für {monthName}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {empStunden.map((emp:any, i:number) => (
              <div key={emp.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `${EMP_COLORS[i % EMP_COLORS.length]}15`,
                  border: `1px solid ${EMP_COLORS[i % EMP_COLORS.length]}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: EMP_COLORS[i % EMP_COLORS.length] }}>{emp.name}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{emp.fullName}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{emp.stunden}h</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                    <div className="emp-bar" style={{
                      height: '100%',
                      width: `${(emp.stunden / maxH) * 100}%`,
                      background: `linear-gradient(90deg, ${EMP_COLORS[i % EMP_COLORS.length]}, ${EMP_COLORS[i % EMP_COLORS.length]}88)`,
                      borderRadius: 99,
                    }} />
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
