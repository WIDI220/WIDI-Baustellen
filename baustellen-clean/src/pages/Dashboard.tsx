import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, Package, ArrowUpRight } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string,string> = { offen:'#94a3b8', in_bearbeitung:'#3b82f6', pausiert:'#f59e0b', abgeschlossen:'#10b981', abgerechnet:'#6b7280' };
const STATUS_LABELS: Record<string,string> = { offen:'Offen', in_bearbeitung:'In Bearbeitung', pausiert:'Pausiert', abgeschlossen:'Abgeschlossen', abgerechnet:'Abgerechnet' };
const PIE_COLORS = ['#94a3b8','#3b82f6','#f59e0b','#10b981','#6b7280'];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] } = useQuery({ queryKey: ['bs-dashboard'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*'); return data ?? []; } });
  const { data: stunden = [] } = useQuery({ queryKey: ['bs-stunden-dash'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(stundensatz)'); return data ?? []; } });
  const { data: materialien = [] } = useQuery({ queryKey: ['bs-mat-dash'], queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-dash'], queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*'); return data ?? []; } });
  const { data: eskalationen = [] } = useQuery({ queryKey: ['bs-esk-dash'], queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*').eq('gelesen', false); return data ?? []; } });

  const bs = baustellen as any[];
  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];
  const esk = eskalationen as any[];

  const gesamtBudget = bs.reduce((s, b) => s + Number(b.budget ?? 0), 0);
  const personalkosten = sw.reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? 45), 0);
  const materialkosten = mat.reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);
  const nachtragGenehmigt = nach.filter((n: any) => n.status === 'genehmigt').reduce((s, n) => s + Number(n.betrag ?? 0), 0);
  const gesamtkosten = personalkosten + materialkosten;

  const statusData = Object.entries(STATUS_LABELS).map(([k, label]) => ({
    name: label, value: bs.filter(b => b.status === k).length
  })).filter(d => d.value > 0);

  const budgetData = bs.slice(0, 8).map(b => {
    const bStunden = sw.filter(w => w.baustelle_id === b.id).reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? 45), 0);
    const bMat = mat.filter(m => m.baustelle_id === b.id).reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);
    return { name: b.name.split(' ').slice(0, 2).join(' '), Budget: Number(b.budget ?? 0), Kosten: Math.round(bStunden + bMat) };
  }).filter(d => d.Budget > 0);

  const kpis = [
    { label: 'Aktive Baustellen', value: bs.filter(b => b.status === 'in_bearbeitung').length, icon: HardHat, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Gesamtbudget', value: fmtEur(gesamtBudget), icon: Euro, color: 'text-[#1e3a5f]', bg: 'bg-[#1e3a5f]/5' },
    { label: 'Gesamtkosten', value: fmtEur(gesamtkosten), icon: TrendingUp, color: gesamtkosten > gesamtBudget ? 'text-red-500' : 'text-emerald-600', bg: gesamtkosten > gesamtBudget ? 'bg-red-50' : 'bg-emerald-50' },
    { label: 'Personalkosten', value: fmtEur(personalkosten), icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Materialkosten', value: fmtEur(materialkosten), icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Eskalationen', value: esk.length, icon: AlertTriangle, color: esk.length > 0 ? 'text-red-500' : 'text-gray-400', bg: esk.length > 0 ? 'bg-red-50' : 'bg-gray-50' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{bs.length} Baustellen · {bs.filter(b=>b.status==='in_bearbeitung').length} aktiv</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Budget vs. Kosten</h2>
          <p className="text-xs text-gray-400 mb-4">Alle Baustellen im Vergleich</p>
          {budgetData.length === 0 ? <p className="text-sm text-gray-300 text-center py-8">Keine Daten</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={budgetData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmtEur(v)} />
                <Bar dataKey="Budget" fill="#1e3a5f" radius={[5,5,0,0]} />
                <Bar dataKey="Kosten" fill="#0ea5e9" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Status Verteilung</h2>
          <p className="text-xs text-gray-400 mb-2">Alle {bs.length} Baustellen</p>
          {statusData.length === 0 ? <p className="text-sm text-gray-300 text-center py-8">Keine Baustellen</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {statusData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Aktive Baustellen Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Aktive Baustellen</h2>
        {bs.filter(b => b.status === 'in_bearbeitung').length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-6">Keine aktiven Baustellen</p>
        ) : (
          <div className="space-y-3">
            {bs.filter(b => b.status === 'in_bearbeitung').map(b => {
              const bStunden = sw.filter(w => w.baustelle_id === b.id).reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? 45), 0);
              const bMat = mat.filter(m => m.baustelle_id === b.id).reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);
              const kosten = bStunden + bMat;
              const budget = Number(b.budget ?? 0);
              const pct = budget > 0 ? Math.min(Math.round(kosten / budget * 100), 100) : 0;
              const overBudget = kosten > budget && budget > 0;
              return (
                <div key={b.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/baustellen/${b.id}`)}>
                  <div className="w-10 h-10 bg-[#1e3a5f]/5 rounded-xl flex items-center justify-center flex-shrink-0">
                    <HardHat className="h-5 w-5 text-[#1e3a5f]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm text-gray-800 truncate">{b.name}</p>
                      <span className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-gray-600'}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: overBudget ? '#ef4444' : '#1e3a5f' }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">{b.auftraggeber}</span>
                      <span className="text-xs text-gray-500">{fmtEur(kosten)} / {fmtEur(budget)}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Eskalationen */}
      {esk.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{esk.length} offene Eskalation(en)</h2>
          <div className="space-y-2">
            {esk.slice(0, 3).map((e: any) => (
              <div key={e.id} className="bg-white rounded-xl p-3 flex items-start gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold mt-0.5 ${e.schwere === 'kritisch' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{e.schwere}</span>
                <p className="text-sm text-gray-700">{e.nachricht}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
