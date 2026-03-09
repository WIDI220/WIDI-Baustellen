import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, Package, ArrowRight, CheckCircle, PauseCircle } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string,string> = { offen:'#94a3b8', in_bearbeitung:'#3b82f6', pausiert:'#f59e0b', abgeschlossen:'#10b981', abgerechnet:'#8b5cf6' };
const STATUS_LABELS: Record<string,string> = { offen:'Offen', in_bearbeitung:'In Bearbeitung', pausiert:'Pausiert', abgeschlossen:'Abgeschlossen', abgerechnet:'Abgerechnet' };

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] } = useQuery({ queryKey: ['bs-dashboard'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; } });
  const { data: stunden = [] } = useQuery({ queryKey: ['bs-stunden-dash'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(stundensatz)'); return data ?? []; } });
  const { data: materialien = [] } = useQuery({ queryKey: ['bs-mat-dash'], queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-dash'], queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*'); return data ?? []; } });
  const { data: eskalationen = [] } = useQuery({ queryKey: ['bs-esk-dash'], queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*').eq('gelesen', false); return data ?? []; } });

  const bs = baustellen as any[];
  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];
  const esk = eskalationen as any[];

  // Gesamtberechnungen mit Nachträgen
  const alleKosten = bs.map(b => berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0)));
  const gesamtBudget = bs.reduce((s, b) => s + Number(b.budget ?? 0), 0);
  const gesamtNachtraege = alleKosten.reduce((s, k) => s + k.nachtragGenehmigt, 0);
  const gesamtEffektivBudget = gesamtBudget + gesamtNachtraege;
  const gesamtPersonal = alleKosten.reduce((s, k) => s + k.personalkosten, 0);
  const gesamtMaterial = alleKosten.reduce((s, k) => s + k.materialkosten, 0);
  const gesamtkosten = gesamtPersonal + gesamtMaterial;
  const overBudgetCount = alleKosten.filter(k => k.overBudget).length;

  // Status Verteilung
  const statusData = Object.entries(STATUS_LABELS)
    .map(([k, label]) => ({ name: label, value: bs.filter(b => b.status === k).length, color: STATUS_COLORS[k] }))
    .filter(d => d.value > 0);

  // Budget vs Kosten Chart - top 6 nach Budget
  const budgetData = bs
    .filter(b => Number(b.budget ?? 0) > 0)
    .sort((a, b) => Number(b.budget) - Number(a.budget))
    .slice(0, 6)
    .map(b => {
      const k = berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0));
      return {
        name: b.name.length > 12 ? b.name.substring(0, 12) + '…' : b.name,
        'Budget': Math.round(k.effektivBudget),
        'Kosten': Math.round(k.gesamtkosten),
        over: k.overBudget,
      };
    });

  // Kosten Aufteilung Gesamt
  const kostenPie = [
    { name: 'Personal', value: Math.round(gesamtPersonal), color: '#1e3a5f' },
    { name: 'Material', value: Math.round(gesamtMaterial), color: '#0ea5e9' },
  ].filter(k => k.value > 0);

  // Aktive Baustellen mit Kosten für die Liste
  const aktiveBaustellen = bs
    .filter(b => b.status === 'in_bearbeitung' || b.status === 'offen')
    .slice(0, 5)
    .map(b => ({ ...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0)) }));

  const kpis = [
    { label: 'Baustellen gesamt', value: bs.length, sub: `${bs.filter(b=>b.status==='in_bearbeitung').length} aktiv`, icon: HardHat, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Effektives Budget', value: fmtEur(gesamtEffektivBudget), sub: gesamtNachtraege > 0 ? `+${fmtEur(gesamtNachtraege)} Nachträge` : 'inkl. Nachträge', icon: Euro, color: 'text-[#1e3a5f]', bg: 'bg-[#1e3a5f]/5' },
    { label: 'Gesamtkosten', value: fmtEur(gesamtkosten), sub: `${Math.round(gesamtkosten/gesamtEffektivBudget*100)||0}% des Budgets`, icon: TrendingUp, color: gesamtkosten > gesamtEffektivBudget ? 'text-red-500' : 'text-emerald-600', bg: gesamtkosten > gesamtEffektivBudget ? 'bg-red-50' : 'bg-emerald-50' },
    { label: 'Personalkosten', value: fmtEur(gesamtPersonal), sub: `${sw.length} Einträge`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Materialkosten', value: fmtEur(gesamtMaterial), sub: `${mat.length} Positionen`, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Über Budget', value: overBudgetCount, sub: overBudgetCount > 0 ? 'Baustellen prüfen!' : 'Alles im Rahmen', icon: AlertTriangle, color: overBudgetCount > 0 ? 'text-red-500' : 'text-emerald-500', bg: overBudgetCount > 0 ? 'bg-red-50' : 'bg-emerald-50' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{color: p.fill}} className="font-medium">{p.name}: {fmtEur(p.value)}</p>
        ))}
        {payload[0]?.payload.over && <p className="text-red-500 font-bold mt-1">⚠ Budget überschritten!</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{bs.length} Baustellen · {bs.filter(b=>b.status==='in_bearbeitung').length} aktiv · Stand heute</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Eskalationen Banner */}
      {esk.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-red-700">{esk.length} ungelesene Eskalation{esk.length > 1 ? 'en' : ''} – sofortige Aufmerksamkeit erforderlich!</p>
          <button onClick={() => navigate('/eskalationen')} className="ml-auto text-xs text-red-600 font-medium hover:underline flex-shrink-0">Ansehen →</button>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Budget vs Kosten */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700">Budget vs. Kosten</h2>
          <p className="text-xs text-gray-400 mb-4">Inkl. genehmigter Nachträge · Top 6 nach Budget</p>
          {budgetData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Noch keine Daten</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={budgetData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${Math.round(v/1000)}k€`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Budget" fill="#e2e8f0" radius={[4,4,0,0]} />
                <Bar dataKey="Kosten" radius={[4,4,0,0]}
                  fill="#1e3a5f"
                  label={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700">Status-Übersicht</h2>
          <p className="text-xs text-gray-400 mb-4">{bs.length} Baustellen gesamt</p>
          {statusData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Keine Baustellen</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, name: any) => [`${v} Baustellen`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {statusData.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: d.color}} />
                      <span className="text-xs text-gray-600">{d.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kostenaufteilung + Aktive Baustellen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kosten Pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700">Kostenaufteilung</h2>
          <p className="text-xs text-gray-400 mb-3">Alle Baustellen gesamt</p>
          {kostenPie.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Noch keine Kosten</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={kostenPie} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                    {kostenPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtEur(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {kostenPie.map(k => (
                  <div key={k.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{background: k.color}} />
                      <span className="text-xs text-gray-600">{k.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-800">{fmtEur(k.value)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 flex justify-between">
                  <span className="text-xs text-gray-500 font-medium">Gesamt</span>
                  <span className="text-xs font-bold text-gray-900">{fmtEur(gesamtkosten)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Aktive Baustellen Liste */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Aktive Baustellen</h2>
              <p className="text-xs text-gray-400 mt-0.5">Mit aktuellen Kosten inkl. Nachträge</p>
            </div>
            <button onClick={() => navigate('/baustellen')} className="text-xs text-[#1e3a5f] font-medium hover:underline flex items-center gap-1">
              Alle <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {aktiveBaustellen.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Keine aktiven Baustellen</div>
            )}
            {aktiveBaustellen.map((b: any) => (
              <div key={b.id} onClick={() => navigate(`/baustellen/${b.id}`)} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${b.status === 'in_bearbeitung' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <HardHat className={`h-4 w-4 ${b.status === 'in_bearbeitung' ? 'text-blue-500' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{b.auftraggeber || '–'}</span>
                    {b.nachtragGenehmigt > 0 && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">+{fmtEur(b.nachtragGenehmigt)} Nachträge</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {/* Budget Bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${b.pct}%`, background: b.overBudget ? '#ef4444' : b.pct > 80 ? '#f59e0b' : '#1e3a5f' }} />
                    </div>
                    <span className={`text-xs font-bold ${b.overBudget ? 'text-red-500' : 'text-gray-600'}`}>{b.pct}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtEur(b.gesamtkosten)} / {fmtEur(b.effektivBudget)}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
