import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, Package, ArrowRight, CheckCircle } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string,string> = { offen:'#94a3b8', in_bearbeitung:'#3b82f6', pausiert:'#f59e0b', abgeschlossen:'#10b981', abgerechnet:'#8b5cf6' };
const STATUS_LABELS: Record<string,string> = { offen:'Offen', in_bearbeitung:'In Bearbeitung', pausiert:'Pausiert', abgeschlossen:'Abgeschlossen', abgerechnet:'Abgerechnet' };

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card p-3 text-xs" style={{minWidth:'140px'}}>
      <p className="font-semibold mb-2" style={{color:'#0f1f3d'}}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{color:'#6b7a99'}}>{p.name}</span>
          <span className="font-bold" style={{color:p.fill||p.stroke}}>{typeof p.value === 'number' && p.value > 100 ? fmtEur(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] } = useQuery({ queryKey: ['bs-dashboard'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', {ascending:false}); return data ?? []; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-dash'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(stundensatz,name)'); return data ?? []; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-dash'],    queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-dash'],   queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*'); return data ?? []; } });
  const { data: eskalationen = [] }=useQuery({ queryKey: ['bs-esk-dash'],   queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*').eq('gelesen', false); return data ?? []; } });

  const bs = baustellen as any[], sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[], esk = eskalationen as any[];

  const alleKosten = bs.map(b => ({...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget??0))}));
  const gesamtBudget = bs.reduce((s,b) => s+Number(b.budget??0), 0);
  const gesamtNachtraege = alleKosten.reduce((s,k) => s+k.nachtragGenehmigt, 0);
  const effektivBudget = gesamtBudget + gesamtNachtraege;
  const gesamtPersonal = alleKosten.reduce((s,k) => s+k.personalkosten, 0);
  const gesamtMaterial = alleKosten.reduce((s,k) => s+k.materialkosten, 0);
  const gesamtkosten = gesamtPersonal + gesamtMaterial;
  const overBudgetCount = alleKosten.filter(k => k.overBudget).length;
  const gesamtH = sw.reduce((s,w) => s+Number(w.stunden??0), 0);
  const budgetPct = effektivBudget > 0 ? Math.min(Math.round(gesamtkosten/effektivBudget*100), 100) : 0;

  // Kosten-Timeline: letzte 8 Wochen (aus Stunden-Einträgen)
  const now = new Date();
  const weekData = Array.from({length:8}, (_,i) => {
    const start = new Date(now); start.setDate(start.getDate() - (7-i)*7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const label = `KW${Math.ceil((start.getDate()+(new Date(start.getFullYear(), start.getMonth(),1).getDay()||7)-1)/7)}`;
    const kosten = sw.filter(w => { const d = new Date(w.datum); return d >= start && d < end; })
      .reduce((s,w) => s + Number(w.stunden??0)*Number(w.employees?.stundensatz??38.08), 0);
    return { label, kosten: Math.round(kosten) };
  });

  // Budget-Vergleich Top 6
  const budgetChart = alleKosten
    .filter(b => Number(b.effektivBudget) > 0)
    .sort((a,b) => Number(b.effektivBudget)-Number(a.effektivBudget))
    .slice(0,6)
    .map(b => ({
      name: b.name.length>14 ? b.name.substring(0,14)+'…' : b.name,
      Budget: Math.round(b.effektivBudget),
      Kosten: Math.round(b.gesamtkosten),
      over: b.overBudget,
    }));

  // Status Pie
  const statusPie = Object.entries(STATUS_LABELS)
    .map(([k,v]) => ({name:v, value:bs.filter(b=>b.status===k).length, color:STATUS_COLORS[k]}))
    .filter(d => d.value > 0);

  // Aktive Baustellen
  const aktive = alleKosten.filter(b => b.status === 'in_bearbeitung' || b.status === 'offen').slice(0,5);

  const kpis = [
    { label:'Aktive Baustellen', value:bs.filter(b=>b.status==='in_bearbeitung').length, sub:`von ${bs.length} gesamt`, icon:HardHat, c:'#3b82f6', bg:'rgba(59,130,246,.1)' },
    { label:'Effekt. Budget', value:fmtEur(effektivBudget), sub:gesamtNachtraege>0?`+${fmtEur(gesamtNachtraege)} Nachträge`:'inkl. Nachträge', icon:Euro, c:'#1e3a5f', bg:'rgba(30,58,95,.08)' },
    { label:'Gesamtkosten', value:fmtEur(gesamtkosten), sub:`${budgetPct}% des Budgets`, icon:TrendingUp, c:gesamtkosten>effektivBudget?'#ef4444':'#10b981', bg:gesamtkosten>effektivBudget?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)' },
    { label:'Personalkosten', value:fmtEur(gesamtPersonal), sub:`${Math.round(gesamtH*10)/10}h erfasst`, icon:Clock, c:'#8b5cf6', bg:'rgba(139,92,246,.1)' },
    { label:'Materialkosten', value:fmtEur(gesamtMaterial), sub:`${mat.length} Positionen`, icon:Package, c:'#f97316', bg:'rgba(249,115,22,.1)' },
    { label:'Über Budget', value:overBudgetCount, sub:overBudgetCount>0?'⚠ Prüfen!':'Alles im Rahmen', icon:AlertTriangle, c:overBudgetCount>0?'#ef4444':'#10b981', bg:overBudgetCount>0?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{fontFamily:'DM Sans', fontWeight:700, fontSize:'1.5rem', color:'#0f1f3d', letterSpacing:'-.02em'}}>Dashboard</h1>
          <p className="text-sm mt-1" style={{color:'#6b7a99'}}>{bs.length} Baustellen · {bs.filter(b=>b.status==='in_bearbeitung').length} aktiv</p>
        </div>
        {esk.length > 0 && (
          <button onClick={() => navigate('/eskalationen')} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all hover:scale-[1.02]"
            style={{background:'rgba(239,68,68,.1)', color:'#dc2626', border:'1px solid rgba(239,68,68,.2)'}}>
            <AlertTriangle className="h-4 w-4" />{esk.length} Eskalation{esk.length>1?'en':''} →
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="card kpi-card p-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{background:k.bg}}>
              <k.icon className="h-4 w-4" style={{color:k.c}} />
            </div>
            <p className="text-xl font-bold count-up leading-tight" style={{color:'#0f1f3d'}}>{k.value}</p>
            <p className="text-xs mt-0.5" style={{color:'#6b7a99'}}>{k.label}</p>
            <p className="text-[10px] mt-0.5" style={{color:'#9ca3af'}}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kosten Timeline */}
        <div className="lg:col-span-2 card p-5">
          <h3 className="text-sm font-semibold mb-0.5" style={{color:'#0f1f3d'}}>Personalkosten – letzte 8 Wochen</h3>
          <p className="text-xs mb-4" style={{color:'#9ca3af'}}>Wochentliche Lohnkosten aller Baustellen</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weekData}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v=>`${Math.round(v/1000)}k`} tick={{ fontSize:10, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="kosten" name="Kosten" stroke="#1e3a5f" strokeWidth={2} fill="url(#costGrad)" dot={false} activeDot={{r:4, fill:'#1e3a5f'}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status Pie */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-0.5" style={{color:'#0f1f3d'}}>Status</h3>
          <p className="text-xs mb-3" style={{color:'#9ca3af'}}>{bs.length} Baustellen gesamt</p>
          {statusPie.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Keine Baustellen</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                    {statusPie.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v:any, n:any) => [`${v}x`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {statusPie.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:d.color}} />
                      <span className="text-xs" style={{color:'#6b7a99'}}>{d.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{color:'#0f1f3d'}}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Budget vs Kosten */}
        <div className="lg:col-span-3 card p-5">
          <h3 className="text-sm font-semibold mb-0.5" style={{color:'#0f1f3d'}}>Budget vs. Kosten</h3>
          <p className="text-xs mb-4" style={{color:'#9ca3af'}}>Inkl. genehmigter Nachträge · Top 6</p>
          {budgetChart.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Noch keine Daten</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={budgetChart} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize:9, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v=>`${Math.round(v/1000)}k€`} tick={{ fontSize:9, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="Budget" name="Budget" fill="#e2e8f0" radius={[4,4,0,0]} />
                <Bar dataKey="Kosten" name="Kosten" radius={[4,4,0,0]}
                  fill="#1e3a5f"
                  // red if over budget per entry handled by recharts Cell
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Aktive Baustellen */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{borderColor:'#eef1f9'}}>
            <h3 className="text-sm font-semibold" style={{color:'#0f1f3d'}}>Aktive Baustellen</h3>
            <button onClick={() => navigate('/baustellen')} className="text-xs font-medium flex items-center gap-1 hover:gap-2 transition-all" style={{color:'#3b82f6'}}>
              Alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {aktive.length === 0 && <div className="flex items-center justify-center h-32 text-sm" style={{color:'#d1d5db'}}>Keine aktiven Baustellen</div>}
            {aktive.map((b: any) => (
              <div key={b.id} onClick={() => navigate(`/baustellen/${b.id}`)} className="px-5 py-3.5 cursor-pointer transition-colors hover:bg-blue-50/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{color:'#0f1f3d'}}>{b.name}</p>
                    <p className="text-xs truncate" style={{color:'#9ca3af'}}>{b.auftraggeber||'–'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{color: b.overBudget ? '#ef4444' : '#0f1f3d'}}>{b.pct}%</p>
                    <p className="text-[10px]" style={{color:'#9ca3af'}}>{fmtEur(b.gesamtkosten)}</p>
                  </div>
                </div>
                <div className="mt-2 w-full rounded-full overflow-hidden" style={{background:'#eef1f9', height:'4px'}}>
                  <div className="h-full rounded-full progress-bar" style={{width:`${Math.min(b.pct,100)}%`, background: b.overBudget?'#ef4444': b.pct>80?'#f59e0b':'#1e3a5f'}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kosten Aufteilung */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label:'Personalkosten', value: gesamtPersonal, pct: gesamtkosten>0?Math.round(gesamtPersonal/gesamtkosten*100):0, color:'#1e3a5f', light:'rgba(30,58,95,.08)' },
          { label:'Materialkosten', value: gesamtMaterial, pct: gesamtkosten>0?Math.round(gesamtMaterial/gesamtkosten*100):0, color:'#f97316', light:'rgba(249,115,22,.08)' },
        ].map(k => (
          <div key={k.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium" style={{color:'#6b7a99'}}>{k.label}</p>
              <p className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:k.light, color:k.color}}>{k.pct}%</p>
            </div>
            <p className="text-2xl font-bold" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{fmtEur(k.value)}</p>
            <div className="mt-3 rounded-full overflow-hidden" style={{background:'#eef1f9', height:'6px'}}>
              <div className="h-full rounded-full progress-bar" style={{width:`${k.pct}%`, background:k.color}} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
