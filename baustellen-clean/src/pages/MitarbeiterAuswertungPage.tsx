import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Users, Clock, Euro, TrendingUp, ChevronLeft, ChevronRight, Award, Target, Zap, BarChart2 } from 'lucide-react';

const STUNDENSATZ = 38.08;
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TABS = ['Übersicht', 'Einzelperson', 'Monatsvergleich'] as const;
type Tab = typeof TABS[number];

function fmt(n: number) { return n.toFixed(1).replace('.', ','); }
function fmtEur(n: number) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }
function monatStr(year: number, month: number) { return `${year}-${String(month).padStart(2, '0')}`; }

const FARBEN = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 2 }}>
          <span style={{ color: p.color || p.fill, fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>{typeof p.value === 'number' ? `${fmt(p.value)}h` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function MitarbeiterAuswertungPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<Tab>('Übersicht');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedMA, setSelectedMA] = useState<string | null>(null);

  const von = `${monatStr(year, month)}-01`;
  const bis = `${monatStr(year, month)}-31`;
  const monatLabel = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel,stundensatz,gewerk').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: ticketStunden = [] } = useQuery({
    queryKey: ['ausw-tickets', year, month],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('employee_id,stunden,leistungsdatum').gte('leistungsdatum', von).lte('leistungsdatum', bis); return data ?? []; },
  });

  const { data: bauStunden = [] } = useQuery({
    queryKey: ['ausw-bau', year, month],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum').gte('datum', von).lte('datum', bis); return data ?? []; },
  });

  // 6 Monate für Verlauf
  const { data: ticketAll = [] } = useQuery({
    queryKey: ['ausw-tickets-all'],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('employee_id,stunden,leistungsdatum'); return data ?? []; },
  });
  const { data: bauAll = [] } = useQuery({
    queryKey: ['ausw-bau-all'],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum'); return data ?? []; },
  });

  const emps = employees as any[];
  const tw = ticketStunden as any[];
  const bw = bauStunden as any[];

  // MA-Stats für aktuellen Monat
  const maStats = useMemo(() => emps.map((e, i) => {
    const tH = tw.filter(w => w.employee_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const bH = bw.filter(w => w.mitarbeiter_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const gesamt = tH + bH;
    const satz = Number(e.stundensatz ?? STUNDENSATZ);
    const kosten = gesamt * satz;
    return { ...e, tH, bH, gesamt, kosten, satz, farbe: FARBEN[i % FARBEN.length] };
  }).sort((a, b) => b.gesamt - a.gesamt), [emps, tw, bw]);

  const totalH = maStats.reduce((s, e) => s + e.gesamt, 0);
  const totalKosten = maStats.reduce((s, e) => s + e.kosten, 0);
  const topMA = maStats[0];
  const aktivMA = maStats.filter(e => e.gesamt > 0).length;

  // 6-Monats-Verlauf
  const verlauf6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - (5 - i), 1);
      const y2 = d.getFullYear(); const m2 = d.getMonth() + 1;
      const v = `${monatStr(y2, m2)}-01`; const b = `${monatStr(y2, m2)}-31`;
      const tH2 = (ticketAll as any[]).filter(w => w.leistungsdatum >= v && w.leistungsdatum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const bH2 = (bauAll as any[]).filter(w => w.datum >= v && w.datum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      return { monat: MONATE[m2 - 1], Tickets: Math.round(tH2 * 10) / 10, Baustellen: Math.round(bH2 * 10) / 10, Gesamt: Math.round((tH2 + bH2) * 10) / 10 };
    });
  }, [ticketAll, bauAll, year, month]);

  // Radar-Daten für ausgewählten MA
  const selectedEmp = maStats.find(e => e.id === selectedMA) ?? maStats[0];

  const cardStyle = (accent: string) => ({
    background: '#fff', borderRadius: 16, padding: '20px 22px',
    border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)',
    borderLeft: `4px solid ${accent}`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
            Mitarbeiter <span style={{ color: '#8b5cf6' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Kombinierte Auswertung Tickets + Baustellen</p>
        </div>
        {/* Monatsnavigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
          <button onClick={prevMonth} style={{ padding: '4px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b', display: 'flex' }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', minWidth: 140, textAlign: 'center' }}>{monatLabel}</span>
          <button onClick={nextMonth} style={{ padding: '4px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b', display: 'flex' }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 14, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#0f172a' : '#64748b',
            boxShadow: activeTab === t ? '0 2px 8px rgba(0,0,0,.08)' : 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══════════════════ TAB: ÜBERSICHT ═══════════════════ */}
      {activeTab === 'Übersicht' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { label: 'Aktive Mitarbeiter', value: aktivMA, sub: `von ${emps.length} gesamt`, icon: Users, color: '#8b5cf6', bg: 'linear-gradient(135deg,#faf5ff,#ede9fe)' },
              { label: 'Stunden gesamt', value: `${fmt(totalH)}h`, sub: monatLabel, icon: Clock, color: '#3b82f6', bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)' },
              { label: 'Personalkosten', value: fmtEur(totalKosten), sub: 'inkl. alle MA', icon: Euro, color: '#10b981', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' },
              { label: 'Top Performer', value: topMA?.kuerzel ?? '–', sub: topMA ? `${fmt(topMA.gesamt)}h` : '', icon: Award, color: '#f59e0b', bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)' },
            ].map(k => (
              <div key={k.label} style={{ background: k.bg, borderRadius: 16, padding: '18px 20px', border: '1px solid rgba(0,0,0,.04)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -8, right: -8, width: 50, height: 50, borderRadius: '50%', background: k.color, opacity: .1 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' }}>{k.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 3px', letterSpacing: '-.02em' }}>{k.value}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
                  </div>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <k.icon size={16} style={{ color: '#fff' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stundenbalken pro MA */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Stunden pro Mitarbeiter</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Tickets (blau) · Baustellen (grün) · {monatLabel}</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={maStats.filter(e => e.gesamt > 0)} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="kuerzel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tH" name="Tickets" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                <Bar dataKey="bH" name="Baustellen" fill="#10b981" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* MA-Tabelle */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Detailtabelle</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    {['Mitarbeiter', 'Gewerk', 'Tickets', 'Baustellen', 'Gesamt', 'Stundensatz', 'Kosten', 'Anteil'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Mitarbeiter' ? 'left' : 'right', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maStats.map((e, i) => (
                    <tr key={e.id} onClick={() => { setSelectedMA(e.id); setActiveTab('Einzelperson'); }}
                      style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={el => (el.currentTarget as HTMLElement).style.background = '#f8fafc'}
                      onMouseLeave={el => (el.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 12px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: e.farbe + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: e.farbe }}>{e.kuerzel?.slice(0, 2)}</div>
                          {e.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>{e.gewerk ?? '–'}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{fmt(e.tH)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(e.bH)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(e.gesamt)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>{e.satz.toFixed(2)}€</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmtEur(e.kosten)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                            <div style={{ height: '100%', width: `${totalH > 0 ? Math.round(e.gesamt / totalH * 100) : 0}%`, background: e.farbe, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#64748b', minWidth: 30 }}>{totalH > 0 ? Math.round(e.gesamt / totalH * 100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafc' }}>
                    <td colSpan={2} style={{ padding: '12px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Gesamt</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>{fmt(maStats.reduce((s, e) => s + e.tH, 0))}h</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{fmt(maStats.reduce((s, e) => s + e.bH, 0))}h</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{fmt(totalH)}h</td>
                    <td />
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{fmtEur(totalKosten)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB: EINZELPERSON ═══════════════════ */}
      {activeTab === 'Einzelperson' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* MA Auswahl */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {maStats.map(e => (
              <button key={e.id} onClick={() => setSelectedMA(e.id)} style={{
                padding: '8px 16px', borderRadius: 12, border: '2px solid',
                borderColor: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#e2e8f0',
                background: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe + '15' : '#fff',
                color: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#64748b',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>{e.name}</button>
            ))}
          </div>

          {selectedEmp && (() => {
            // Monats-Verlauf für diese Person
            const personVerlauf = Array.from({ length: 6 }, (_, i) => {
              const d = new Date(year, month - 1 - (5 - i), 1);
              const y2 = d.getFullYear(); const m2 = d.getMonth() + 1;
              const v = `${monatStr(y2, m2)}-01`; const b = `${monatStr(y2, m2)}-31`;
              const tH2 = (ticketAll as any[]).filter(w => w.employee_id === selectedEmp.id && w.leistungsdatum >= v && w.leistungsdatum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
              const bH2 = (bauAll as any[]).filter(w => w.mitarbeiter_id === selectedEmp.id && w.datum >= v && w.datum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
              return { monat: MONATE[m2 - 1], Tickets: Math.round(tH2 * 10) / 10, Baustellen: Math.round(bH2 * 10) / 10 };
            });

            const avgH = personVerlauf.reduce((s, m) => s + m.Tickets + m.Baustellen, 0) / 6;
            const maxH = Math.max(...personVerlauf.map(m => m.Tickets + m.Baustellen));

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Person KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                  {[
                    { label: 'Tickets diesen Monat', value: `${fmt(selectedEmp.tH)}h`, color: '#3b82f6' },
                    { label: 'Baustellen diesen Monat', value: `${fmt(selectedEmp.bH)}h`, color: '#10b981' },
                    { label: 'Gesamt diesen Monat', value: `${fmt(selectedEmp.gesamt)}h`, color: '#8b5cf6' },
                    { label: 'Personalkosten', value: fmtEur(selectedEmp.kosten), color: '#f59e0b' },
                  ].map(k => (
                    <div key={k.label} style={cardStyle(k.color)}>
                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>{k.label}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Insights */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>6-Monats-Schnitt</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{fmt(avgH)}h</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Ø pro Monat</p>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Zap size={16} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Spitzenwert</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{fmt(maxH)}h</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Bestes Monat (6 Mon.)</p>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Target size={16} style={{ color: '#10b981' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Anteil Tickets</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                      {selectedEmp.gesamt > 0 ? Math.round(selectedEmp.tH / selectedEmp.gesamt * 100) : 0}%
                    </p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>vs. Baustellen</p>
                  </div>
                </div>

                {/* Verlauf Chart */}
                <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>6-Monats-Verlauf – {selectedEmp.name}</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Stunden pro Monat aufgeschlüsselt</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personVerlauf} barGap={4} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Tickets" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                      <Bar dataKey="Baustellen" fill="#10b981" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ TAB: MONATSVERGLEICH ═══════════════════ */}
      {activeTab === 'Monatsvergleich' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Gesamt-Verlauf */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Gesamtstunden – 6-Monats-Verlauf</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Tickets + Baustellen kombiniert</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={verlauf6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Tickets" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} />
                <Line type="monotone" dataKey="Baustellen" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                <Line type="monotone" dataKey="Gesamt" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4, fill: '#8b5cf6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gestapelter Vergleich pro Monat */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Mitarbeiter-Vergleich nach Monat</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Gestapelt pro Person</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={verlauf6} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Tickets" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Baustellen" stackId="a" fill="#10b981" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monats-Tabelle */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Monatstabelle</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  {['Monat', 'Tickets', 'Baustellen', 'Gesamt', 'Δ Vormonat'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Monat' ? 'left' : 'right', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {verlauf6.map((m, i) => {
                  const prev = i > 0 ? verlauf6[i - 1].Gesamt : null;
                  const delta = prev !== null ? m.Gesamt - prev : null;
                  return (
                    <tr key={m.monat} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{m.monat}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{fmt(m.Tickets)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(m.Baustellen)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(m.Gesamt)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {delta !== null && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? '#10b981' : '#ef4444' }}>
                            {delta >= 0 ? '+' : ''}{fmt(delta)}h
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
