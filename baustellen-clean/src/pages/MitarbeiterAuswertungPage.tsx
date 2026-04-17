import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Users, Clock, Euro, TrendingUp, ChevronLeft, ChevronRight, Award, Target, Zap, BarChart2, Sun, Stethoscope, Calendar, Download, FileText } from 'lucide-react';

const STUNDENSATZ = 38.08;
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TABS = ['Übersicht', 'Einzelperson', 'Monatsabschluss'] as const;
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
  const [kalYear, setKalYear] = useState(now.getFullYear());
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);

  const von = `${monatStr(year, month)}-01`;
  const letzterTag = new Date(year, month, 0).getDate();
  const bis = `${monatStr(year, month)}-${String(letzterTag).padStart(2, '0')}`;
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

  // Monatliche Aggregation direkt per SQL — kein Frontend-Filtering, keine Typ-Probleme
  const { data: gesamtverlauf = [] } = useQuery({
    queryKey: ['monatsverlauf-gesamt'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_monatsverlauf_gesamt');
      return (data ?? []).map((r: any) => ({
        monat: r.monat,
        label: r.monat.slice(0,7),
        Tickets: Number(r.tickets_h),
        Baustellen: Number(r.baustellen_h),
        Begehungen: Number(r.begehungen_h),
        Intern: Number(r.intern_h),
        Gesamt: Number(r.gesamt_h),
      }));
    },
  });

  const { data: verlaufRaw = [] } = useQuery({
    queryKey: ['ausw-verlauf-sql'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monatsverlauf');
      if (error) {
        // Fallback: manuell aggregieren falls RPC nicht existiert
        const [t, b, bg, i] = await Promise.all([
          supabase.rpc('get_tickets_pro_monat'),
          supabase.rpc('get_bau_pro_monat'),
          supabase.rpc('get_beg_pro_monat'),
          supabase.rpc('get_intern_pro_monat'),
        ]);
        return null;
      }
      return data ?? [];
    },
    staleTime: 60000,
  });

  // Einzeldaten für Einzelperson-Verlauf
  const { data: ticketAll = [] } = useQuery({
    queryKey: ['ausw-tickets-raw'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs')
        .select('employee_id, stunden, leistungsdatum');
      return (data ?? []).map((r: any) => ({
        employee_id: r.employee_id,
        stunden: Number(r.stunden ?? 0),
        monat: String(r.leistungsdatum ?? '').slice(0, 7),
      }));
    },
    staleTime: 60000,
  });
  const { data: bauAll = [] } = useQuery({
    queryKey: ['ausw-bau-raw'],
    queryFn: async () => {
      const { data } = await supabase.from('bs_stundeneintraege')
        .select('mitarbeiter_id, stunden, datum');
      return (data ?? []).map((r: any) => ({
        mitarbeiter_id: r.mitarbeiter_id,
        stunden: Number(r.stunden ?? 0),
        monat: String(r.datum ?? '').slice(0, 7),
      }));
    },
    staleTime: 60000,
  });
  const { data: begehungenAll = [] } = useQuery({
    queryKey: ['ausw-beg-raw'],
    queryFn: async () => {
      const { data } = await supabase.from('begehungen')
        .select('mitarbeiter, stunden, datum_von');
      return (data ?? []).map((r: any) => ({
        mitarbeiter: r.mitarbeiter,
        stunden: Number(r.stunden ?? 0),
        monat: String(r.datum_von ?? '').slice(0, 7),
      }));
    },
    staleTime: 60000,
  });
  const { data: interneAll = [] } = useQuery({
    queryKey: ['ausw-intern-raw'],
    queryFn: async () => {
      const { data } = await supabase.from('interne_stunden')
        .select('employee_id, stunden, datum');
      return (data ?? []).map((r: any) => ({
        employee_id: r.employee_id,
        stunden: Number(r.stunden ?? 0),
        monat: String(r.datum ?? '').slice(0, 7),
      }));
    },
    staleTime: 60000,
  });

  const { data: abwesenheiten = [], refetch: refetchAbw } = useQuery({
    queryKey: ['abwesenheiten', selectedMA ?? 'none', kalYear],
    queryFn: async () => {
      if (!selectedMA) return [];
      const { data } = await supabase
        .from('mitarbeiter_abwesenheiten')
        .select('*')
        .eq('employee_id', selectedMA)
        .gte('datum', `${kalYear}-01-01`)
        .lte('datum', `${kalYear}-12-31`);
      return data ?? [];
    },
    enabled: !!selectedMA,
  });

  async function toggleAbwesenheit(empId: string, datum: string, typ: 'urlaub' | 'krank') {
    const existing = (abwesenheiten as any[]).find((a: any) => a.datum === datum);
    setPendingToggle(datum);
    if (existing) {
      if (existing.typ === typ) {
        await supabase.from('mitarbeiter_abwesenheiten').delete().eq('id', existing.id);
      } else {
        await supabase.from('mitarbeiter_abwesenheiten').update({ typ }).eq('id', existing.id);
      }
    } else {
      await supabase.from('mitarbeiter_abwesenheiten').insert({ employee_id: empId, datum, typ });
    }
    setPendingToggle(null);
    refetchAbw();
  }

  const { data: abwesenheitenMonat = [] } = useQuery({
    queryKey: ['abwesenheiten-monat', year, month],
    queryFn: async () => {
      const von2 = `${year}-${String(month).padStart(2,'0')}-01`;
      const bis2 = `${year}-${String(month).padStart(2,'0')}-31`;
      const { data } = await supabase
        .from('mitarbeiter_abwesenheiten')
        .select('*, employees(name)')
        .gte('datum', von2)
        .lte('datum', bis2);
      return data ?? [];
    },
  });

  const { data: interneStunden = [] } = useQuery({
    queryKey: ['interne-stunden-ma', year, month],
    queryFn: async () => {
      const von2 = `${year}-${String(month).padStart(2,'0')}-01`;
      const lastDay2 = new Date(year, month, 0).getDate();
      const bis2 = `${year}-${String(month).padStart(2,'0')}-${String(lastDay2).padStart(2,'0')}`;
      const { data } = await supabase
        .from('interne_stunden')
        .select('employee_id, stunden, datum')
        .gte('datum', von2)
        .lte('datum', bis2);
      return data ?? [];
    },
  });

  const { data: begehungenMonat = [] } = useQuery({
    queryKey: ['begehungen-monat', year, month],
    queryFn: async () => {
      const von2 = `${year}-${String(month).padStart(2,'0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const bis2 = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
      const { data } = await supabase
        .from('begehungen')
        .select('*')
        .gte('datum_von', von2)
        .lte('datum_von', bis2);
      return data ?? [];
    },
  });

  function exportMonatsabschlussCSV() {
    const rows = maStats.map(e => {
      const urlaubTage = (abwesenheitenMonat as any[]).filter((a:any) => {
        const emp = employees as any[];
        const em = emp.find((x:any) => x.id === e.id);
        return a.employee_id === e.id && a.typ === 'urlaub';
      }).length;
      const krankTage = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ === 'krank').length;
      return [e.name, e.tH.toFixed(1), e.bH.toFixed(1), (e.begH||0).toFixed(1), (e.intH||0).toFixed(1), e.gesamt.toFixed(1), e.kosten.toFixed(2), urlaubTage, krankTage].join(';');
    });
    const header = 'Mitarbeiter;Ticket-Std;Baustellen-Std;Begehungen-Std;Interne-Std;Gesamt-Std;Kosten (€);Urlaub-Tage;Krank-Tage';
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Monatsabschluss_${monatLabel.replace(' ','_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }



  const emps = employees as any[];
  const tw = ticketStunden as any[];
  const bw = bauStunden as any[];

  // MA-Stats für aktuellen Monat
  const begehungen = begehungenMonat as any[];

  const maStats = useMemo(() => emps.map((e, i) => {
    const tH = tw.filter(w => w.employee_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const bH = bw.filter(w => w.mitarbeiter_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const begH = (begehungenMonat as any[])
      .filter(b => {
        const bMit = (b.mitarbeiter ?? '').trim().toLowerCase();
        if (!bMit) return false;
        const eName = (e.name ?? '').trim().toLowerCase();
        const eKuerzel = (e.kuerzel ?? '').trim().toLowerCase();
        // Exakter Name-Match
        if (bMit === eName) return true;
        // Kürzel-Match
        if (bMit === eKuerzel) return true;
        // Teilname-Match (Vor- oder Nachname)
        const nameParts = eName.split(' ').filter((p: string) => p.length > 2);
        if (nameParts.some((p: string) => bMit.includes(p))) return true;
        return false;
      })
      .reduce((s: number, b: any) => s + Number(b.stunden ?? 0), 0);
    const intH = (interneStunden as any[]).filter(x => x.employee_id === e.id).reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
    const gesamt = tH + bH + begH + intH;
    const satz = Number(e.stundensatz ?? STUNDENSATZ);
    const kosten = gesamt * satz;
    return { ...e, tH, bH, begH, intH, gesamt, kosten, satz, farbe: FARBEN[i % FARBEN.length] };
  }).sort((a, b) => b.gesamt - a.gesamt), [emps, tw, bw, begehungenMonat, interneStunden]);

  const totalH = maStats.reduce((s, e) => s + e.gesamt, 0);
  const totalKosten = maStats.reduce((s, e) => s + e.kosten, 0);
  const topMA = maStats[0];
  const aktivMA = maStats.filter(e => e.gesamt > 0).length;

  // Begehungen-Matching Hilfsfunktion
  function matchBegehung(bMit: string, emp: any): boolean {
    if (!bMit) return false;
    const bm = bMit.trim().toLowerCase();
    const eName = (emp.name ?? '').trim().toLowerCase();
    const eKuerzel = (emp.kuerzel ?? '').trim().toLowerCase();
    if (bm === eName || bm === eKuerzel) return true;
    const nameParts = eName.split(' ').filter((p: string) => p.length > 2);
    return nameParts.some((p: string) => bm.includes(p));
  }

  // Alle Monate mit Daten ermitteln und aggregieren
  const verlauf6 = useMemo(() => {
    // Alle vorhandenen Monate aus allen Quellen sammeln
    const monatsSet = new Set<string>();
    (ticketAll as any[]).forEach(w => { const d = String(w.leistungsdatum ?? ''); if (d.length >= 7) monatsSet.add(d.slice(0, 7)); });
    (bauAll as any[]).forEach(w => { const d = String(w.datum ?? ''); if (d.length >= 7) monatsSet.add(d.slice(0, 7)); });
    (begehungenAll as any[]).forEach(w => { const d = String(w.datum_von ?? ''); if (d.length >= 7) monatsSet.add(d.slice(0, 7)); });
    (interneAll as any[]).forEach(w => { const d = String(w.datum ?? ''); if (d.length >= 7) monatsSet.add(d.slice(0, 7)); });

    const heute = new Date().toISOString().slice(0, 7);
    return Array.from(monatsSet).filter(ym => ym >= '2025-11' && ym <= heute).sort().map(ym => {
      const [y2str, m2str] = ym.split('-');
      const y2 = parseInt(y2str); const m2 = parseInt(m2str);
      const lastDay = new Date(y2, m2, 0).getDate();
      const v = `${ym}-01`; const b = `${ym}-${String(lastDay).padStart(2, '0')}`;
      const tH2   = (ticketAll as any[]).filter(w => { const d = String(w.leistungsdatum ?? ''); return d >= v && d <= b; }).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const bH2   = (bauAll as any[]).filter(w => { const d = String(w.datum ?? ''); return d >= v && d <= b; }).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const begH2 = (begehungenAll as any[]).filter(w => { const d = String(w.datum_von ?? ''); return d >= v && d <= b; }).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const intH2 = (interneAll as any[]).filter(w => { const d = String(w.datum ?? ''); return d >= v && d <= b; }).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const gesamt = Math.round((tH2 + bH2 + begH2 + intH2) * 10) / 10;
      return {
        monat: `${MONATE[m2 - 1]} ${y2 !== new Date().getFullYear() ? y2 : ''}`.trim(),
        ym,
        Tickets:    Math.round(tH2   * 10) / 10,
        Baustellen: Math.round(bH2   * 10) / 10,
        Begehungen: Math.round(begH2 * 10) / 10,
        Intern:     Math.round(intH2 * 10) / 10,
        Gesamt:     gesamt,
      };
    });
  }, [ticketAll, bauAll, begehungenAll, interneAll]);

  // Radar-Daten für ausgewählten MA
  const selectedEmp = maStats.find(e => e.id === selectedMA) ?? maStats[0];

  const cardStyle = (accent: string) => ({
    background: '#fff', borderRadius: 16, padding: '20px 22px',
    border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)',
    borderLeft: `4px solid ${accent}`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ma-kpi { animation:fadeUp 0.4s ease forwards; opacity:0; }
        .ma-kpi:nth-child(1){animation-delay:0.05s}
        .ma-kpi:nth-child(2){animation-delay:0.1s}
        .ma-kpi:nth-child(3){animation-delay:0.15s}
        .ma-kpi:nth-child(4){animation-delay:0.2s}
        .ma-row:hover { background:#f8fafc !important; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:'0 0 4px', letterSpacing:'-.03em' }}>
            Mitarbeiter <span style={{ color:'#8b5cf6' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Kombinierte Auswertung Tickets + Baustellen</p>
        </div>
        {/* Monatsnavigation */}
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'8px 12px' }}>
          <button onClick={prevMonth} style={{ padding:'5px 9px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', display:'flex', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';}}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a', minWidth:150, textAlign:'center' }}>{monatLabel}</span>
          <button onClick={nextMonth} style={{ padding:'5px 9px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', display:'flex', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';}}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:3, background:'#f1f5f9', borderRadius:14, padding:4, width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding:'8px 22px', borderRadius:11, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all .15s',
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#0f172a' : '#94a3b8',
            boxShadow: activeTab === t ? '0 2px 8px rgba(0,0,0,.07)' : 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══════════════════ TAB: ÜBERSICHT ═══════════════════ */}
      {activeTab === 'Übersicht' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Entwicklung 6 Monate ── */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>Stundenentwicklung</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Letzte 6 Monate · Tickets, Baustellen, DGUV, Begehungen, Intern</p>
              </div>
              {/* Gesamt des letzten Monats */}
              {(gesamtverlauf as any[]).length > 0 && (() => {
                const letzter = (gesamtverlauf as any[])[(gesamtverlauf as any[]).length - 1];
                const vorletzter = (gesamtverlauf as any[]).length > 1 ? (gesamtverlauf as any[])[(gesamtverlauf as any[]).length - 2] : null;
                const diff = vorletzter ? letzter.Gesamt - vorletzter.Gesamt : 0;
                return (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{fmt(letzter.Gesamt)}h</div>
                    <div style={{ fontSize: 11, color: diff >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {diff >= 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}h vs. Vormonat
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Grafik */}
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={gesamtverlauf as any[]} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
                <defs>
                  {[
                    { key: 'Tickets',    color: '#3b82f6' },
                    { key: 'Baustellen', color: '#10b981' },
                    { key: 'Begehungen', color: '#f59e0b' },
                    { key: 'Intern',     color: '#8b5cf6' },
                  ].map(({ key, color }) => (
                    <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }}
                  formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}h`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {[
                  { key: 'Tickets',    color: '#3b82f6' },
                  { key: 'Baustellen', color: '#10b981' },
                  { key: 'Begehungen', color: '#f59e0b' },
                  { key: 'Intern',     color: '#8b5cf6' },
                ].map(({ key, color }) => (
                  <Area key={key} type="monotone" dataKey={key} stackId="1"
                    stroke={color} strokeWidth={1.5}
                    fill={`url(#grad-${key})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            {/* Zahlentabelle */}
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Monat', 'Tickets', 'Baustellen', 'Begehungen', 'Intern', 'Gesamt'].map(h => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: h === 'Monat' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(gesamtverlauf as any[]).map((row: any, i: number) => {
                    const prev = i > 0 ? (gesamtverlauf as any[])[i - 1] : null;
                    const trend = prev ? row.Gesamt - prev.Gesamt : null;
                    return (
                      <tr key={row.monat} style={{ borderBottom: '1px solid #f8fafc', background: i === (gesamtverlauf as any[]).length - 1 ? 'rgba(99,102,241,0.03)' : 'transparent' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {row.monat}
                          {trend !== null && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: trend >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                              {trend >= 0 ? '↑' : '↓'}{Math.abs(trend).toFixed(0)}h
                            </span>
                          )}
                        </td>
                        {[
                          { v: row.Tickets,    c: '#3b82f6' },
                          { v: row.Baustellen, c: '#10b981' },
                          { v: row.Begehungen, c: '#f59e0b' },
                          { v: row.Intern,     c: '#8b5cf6' },
                        ].map(({ v, c }, ci) => (
                          <td key={ci} style={{ padding: '8px 12px', textAlign: 'right', color: v > 0 ? c : '#94a3b8', fontWeight: v > 0 ? 700 : 400 }}>
                            {v > 0 ? `${fmt(v)}h` : '–'}
                          </td>
                        ))}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {fmt(row.Gesamt)}h
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {[
              { label:'Aktive Mitarbeiter', value:aktivMA, sub:`von ${emps.length} gesamt`, icon:Users, color:'#8b5cf6', border:'#ddd6fe' },
              { label:'Stunden gesamt', value:`${fmt(totalH)}h`, sub:monatLabel, icon:Clock, color:'#2563eb', border:'#bfdbfe' },
              { label:'Personalkosten', value:fmtEur(totalKosten), sub:'inkl. alle MA', icon:Euro, color:'#10b981', border:'#bbf7d0' },
              { label:'Top Performer', value:topMA?.kuerzel??'–', sub:topMA?`${fmt(topMA.gesamt)}h`:'', icon:Award, color:'#f59e0b', border:'#fde68a' },
            ].map(k => (
              <div key={k.label} className="ma-kpi" style={{ background:'#fff', borderRadius:18, padding:'20px', border:`1px solid ${k.border}`, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, borderRadius:'18px 18px 0 0' }} />
                <div style={{ width:38, height:38, background:`${k.color}15`, border:`1px solid ${k.color}25`, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
                  <k.icon size={18} style={{ color:k.color }} />
                </div>
                <p style={{ fontSize:26, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.04em' }}>{k.value}</p>
                <p style={{ fontSize:12, fontWeight:600, color:'#64748b', margin:'0 0 3px' }}>{k.label}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{k.sub}</p>
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
                <Bar dataKey="tH"   name="Tickets"    fill="#3b82f6" radius={[0,0,0,0]} />
                <Bar dataKey="bH"   name="Baustellen" fill="#10b981" radius={[0,0,0,0]} />
                <Bar dataKey="begH" name="Begehungen" fill="#f59e0b" radius={[0,0,0,0]} />
                <Bar dataKey="intH" name="Intern"     fill="#8b5cf6" radius={[5,5,0,0]} />
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
                      className="ma-row" style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', transition:'background .1s' }}
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

          {/* ── MA Auswahl ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {maStats.map(e => (
              <button key={e.id} onClick={() => setSelectedMA(e.id)} style={{
                padding: '7px 14px', borderRadius: 10, border: '2px solid',
                borderColor: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#e2e8f0',
                background: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe + '15' : '#fff',
                color: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#64748b',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>{e.kuerzel}</button>
            ))}
          </div>

          {selectedEmp && (() => {
            const monatVon = `${year}-${String(month).padStart(2,'0')}-01`;
            const monatBis = `${year}-${String(month).padStart(2,'0')}-${String(new Date(year, month, 0).getDate()).padStart(2,'0')}`;
            const abwMonat = (abwesenheiten as any[]).filter((a:any) => a.datum >= monatVon && a.datum <= monatBis);
            const urlaubTage = abwMonat.filter((a:any) => a.typ === 'urlaub').length;
            const krankTage  = abwMonat.filter((a:any) => a.typ === 'krank').length;
            const urlaubH    = Math.round(urlaubTage * 8 * 4) / 4;
            const krankH     = Math.round(krankTage  * 8 * 4) / 4;
            const gesamtMitAbw = selectedEmp.gesamt + urlaubH + krankH;

            // Balken-Prozente
            const pT   = gesamtMitAbw > 0 ? (selectedEmp.tH   / gesamtMitAbw * 100) : 0;
            const pB   = gesamtMitAbw > 0 ? (selectedEmp.bH   / gesamtMitAbw * 100) : 0;
            const pBeg = gesamtMitAbw > 0 ? ((selectedEmp.begH||0) / gesamtMitAbw * 100) : 0;
            const pInt = gesamtMitAbw > 0 ? ((selectedEmp.intH||0) / gesamtMitAbw * 100) : 0;
            const pU   = gesamtMitAbw > 0 ? (urlaubH / gesamtMitAbw * 100) : 0;
            const pK   = gesamtMitAbw > 0 ? (krankH  / gesamtMitAbw * 100) : 0;

            // Monatsverlauf (6 Monate) inkl. Urlaub/Krank
            const personVerlauf = verlauf6.map(mv => {
              const v = `${mv.ym}-01`;
              const lastD = new Date(parseInt(mv.ym.slice(0,4)), parseInt(mv.ym.slice(5,7)), 0).getDate();
              const b = `${mv.ym}-${String(lastD).padStart(2,'0')}`;
              const tH2   = (ticketAll as any[]).filter(w => w.employee_id === selectedEmp.id && String(w.leistungsdatum ?? '') >= v && String(w.leistungsdatum ?? '') <= b).reduce((s:number, w:any) => s + Number(w.stunden??0), 0);
              const bH2   = (bauAll as any[]).filter(w => w.mitarbeiter_id === selectedEmp.id && String(w.datum ?? '') >= v && String(w.datum ?? '') <= b).reduce((s:number, w:any) => s + Number(w.stunden??0), 0);
              const begH2 = (begehungenAll as any[]).filter(w => String(w.datum_von ?? '') >= v && String(w.datum_von ?? '') <= b && matchBegehung(w.mitarbeiter, selectedEmp)).reduce((s:number, w:any) => s + Number(w.stunden??0), 0);
              const intH2 = (interneAll as any[]).filter(w => w.employee_id === selectedEmp.id && String(w.datum ?? '') >= v && String(w.datum ?? '') <= b).reduce((s:number, w:any) => s + Number(w.stunden??0), 0);
              return {
                monat: mv.monat,
                Tickets:    Math.round(tH2 * 4) / 4,
                Baustellen: Math.round(bH2 * 4) / 4,
                Begehungen: Math.round(begH2 * 4) / 4,
                Intern:     Math.round(intH2 * 4) / 4,
              };
            });

            const STUNDEN_FELDER = [
              { label: 'Tickets',     h: selectedEmp.tH,          color: '#3b82f6', bg: '#eff6ff' },
              { label: 'Baustellen',  h: selectedEmp.bH,          color: '#10b981', bg: '#f0fdf4' },
              { label: 'Begehungen',  h: selectedEmp.begH||0,     color: '#f59e0b', bg: '#fffbeb' },
              { label: 'Intern',      h: selectedEmp.intH||0,     color: '#8b5cf6', bg: '#f5f3ff' },
              { label: 'Urlaub',      h: urlaubH,                  color: '#10b981', bg: '#dcfce7' },
              { label: 'Krank',       h: krankH,                   color: '#ef4444', bg: '#fee2e2' },
            ].filter(f => f.h > 0);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Name + Gesamtstunden Header ── */}
                <div style={{ background: `linear-gradient(135deg, ${selectedEmp.farbe}18, ${selectedEmp.farbe}08)`, border: `1px solid ${selectedEmp.farbe}30`, borderRadius: 18, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: selectedEmp.farbe, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff' }}>{selectedEmp.kuerzel}</div>
                      <div>
                        <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>{selectedEmp.name}</p>
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{monatLabel}</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 36, fontWeight: 900, color: selectedEmp.farbe, margin: 0, letterSpacing: '-.05em' }}>{fmt(gesamtMitAbw)}h</p>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Gesamtstunden inkl. Abwesenheit</p>
                  </div>
                </div>

                {/* ── Stunden Aufschlüsselung ── */}
                <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 16px', letterSpacing: '-.01em' }}>Stunden-Aufschlüsselung</p>

                  {/* Gestapelter Fortschrittsbalken */}
                  <div style={{ height: 14, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 20, background: '#f1f5f9' }}>
                    {[
                      { pct: pT,   color: '#3b82f6' },
                      { pct: pB,   color: '#10b981' },
                      { pct: pBeg, color: '#f59e0b' },
                      { pct: pInt, color: '#8b5cf6' },
                      { pct: pU,   color: '#86efac' },
                      { pct: pK,   color: '#fca5a5' },
                    ].filter(s => s.pct > 0).map((s, i) => (
                      <div key={i} style={{ width: `${s.pct}%`, background: s.color, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                    ))}
                  </div>

                  {/* Einzelne Felder */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {STUNDEN_FELDER.map(f => (
                      <div key={f.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: f.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{f.label}</span>
                            {f.label === 'Urlaub' && <span style={{ fontSize: 11, color: '#94a3b8' }}>({urlaubTage} Tage × 8h)</span>}
                            {f.label === 'Krank'  && <span style={{ fontSize: 11, color: '#94a3b8' }}>({krankTage} Tage × 8h)</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{gesamtMitAbw > 0 ? Math.round(f.h / gesamtMitAbw * 100) : 0}%</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: f.color, minWidth: 48, textAlign: 'right' }}>{fmt(f.h)}h</span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${gesamtMitAbw > 0 ? f.h / gesamtMitAbw * 100 : 0}%`, background: f.color, borderRadius: 99, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Urlaub & Krank Karten ── */}
                {(urlaubTage > 0 || krankTage > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sun size={20} style={{ color: '#16a34a' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Urlaub</p>
                        <p style={{ fontSize: 26, fontWeight: 900, color: '#15803d', margin: 0, letterSpacing: '-.04em' }}>{urlaubTage} <span style={{ fontSize: 13, fontWeight: 600 }}>Tage</span></p>
                        <p style={{ fontSize: 12, color: '#4ade80', margin: 0 }}>{fmt(urlaubH)}h angerechnet</p>
                      </div>
                    </div>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Stethoscope size={20} style={{ color: '#dc2626' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Krank</p>
                        <p style={{ fontSize: 26, fontWeight: 900, color: '#b91c1c', margin: 0, letterSpacing: '-.04em' }}>{krankTage} <span style={{ fontSize: 13, fontWeight: 600 }}>Tage</span></p>
                        <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{fmt(krankH)}h angerechnet</p>
                      </div>
                    </div>
                  </div>
                )}



                {/* ── Jahreskalender ── */}
                <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Calendar size={16} style={{ color: '#8b5cf6' }} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Urlaub & Krank {kalYear}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {[['#10b981','Urlaub'],['#ef4444','Krank']].map(([c,l]) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                          <span style={{ fontSize: 11, color: '#64748b' }}>{l}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                        <button onClick={() => setKalYear(y => y-1)} style={{ width:28, height:28, borderRadius:7, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronLeft size={12}/></button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 36, textAlign: 'center' }}>{kalYear}</span>
                        <button onClick={() => setKalYear(y => y+1)} style={{ width:28, height:28, borderRadius:7, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronRight size={12}/></button>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                    {Array.from({ length: 12 }, (_, moIdx) => {
                      const moNr = moIdx + 1;
                      const letzterTag = new Date(kalYear, moIdx+1, 0).getDate();
                      let startWt = new Date(kalYear, moIdx, 1).getDay(); if (startWt===0) startWt=7;
                      const abwMap: Record<string,string> = {};
                      (abwesenheiten as any[]).forEach((a:any) => { abwMap[a.datum] = a.typ; });
                      return (
                        <div key={moIdx}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', margin: '0 0 5px' }}>
                            {new Date(kalYear, moIdx, 1).toLocaleString('de-DE', { month: 'long' })}
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1.5, marginBottom: 2 }}>
                            {['Mo','Di','Mi','Do','Fr','Sa','So'].map(wt => (
                              <div key={wt} style={{ fontSize: 7, color: '#cbd5e1', textAlign: 'center', fontWeight: 600 }}>{wt}</div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1.5 }}>
                            {Array.from({ length: startWt-1 }, (_,k) => <div key={`e${k}`} />)}
                            {Array.from({ length: letzterTag }, (_, d) => {
                              const tag = d+1;
                              const datumStr = `${kalYear}-${String(moNr).padStart(2,'0')}-${String(tag).padStart(2,'0')}`;
                              const typ = abwMap[datumStr];
                              const isWe = [0,6].includes(new Date(kalYear, moIdx, tag).getDay());
                              const isToday = datumStr === new Date().toISOString().slice(0,10);
                              return (
                                <div key={tag}
                                  onClick={() => {
                                    if (isWe) return;
                                    if (!typ) toggleAbwesenheit(selectedEmp.id, datumStr, 'urlaub');
                                    else if (typ==='urlaub') toggleAbwesenheit(selectedEmp.id, datumStr, 'krank');
                                    else { const ex = (abwesenheiten as any[]).find((a:any)=>a.datum===datumStr); if(ex) supabase.from('mitarbeiter_abwesenheiten').delete().eq('id',ex.id).then(()=>refetchAbw()); }
                                  }}
                                  style={{
                                    aspectRatio:'1', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center',
                                    fontSize: 8, fontWeight: typ ? 700 : 400,
                                    cursor: isWe ? 'default' : 'pointer',
                                    background: typ==='urlaub'?'#dcfce7':typ==='krank'?'#fee2e2':isToday?'#eff6ff':isWe?'transparent':'#f8fafc',
                                    color: typ==='urlaub'?'#15803d':typ==='krank'?'#dc2626':isToday?'#2563eb':isWe?'#e2e8f0':'#64748b',
                                  }}>
                                  {tag}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ TAB: MONATSABSCHLUSS ═══════════════════ */}
      {activeTab === 'Monatsabschluss' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header mit Monat-Nav + Export */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={prevMonth} style={{ width:34, height:34, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronLeft size={15}/></button>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:18, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>{monatLabel}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:'1px 0 0' }}>Monatsabschluss</p>
              </div>
              <button onClick={nextMonth} style={{ width:34, height:34, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronRight size={15}/></button>
            </div>
            <button onClick={exportMonatsabschlussCSV}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'linear-gradient(135deg,#8b5cf6,#7c3aed)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(139,92,246,.3)' }}>
              <Download size={14}/> CSV exportieren
            </button>
          </div>

          {/* Gesamt-KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
            {[
              { label:'Gesamtstunden', value:`${maStats.reduce((s,e)=>s+e.gesamt,0).toFixed(1)}h`, color:'#8b5cf6', border:'#ddd6fe' },
              { label:'Ticket-Stunden', value:`${maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h`, color:'#3b82f6', border:'#bfdbfe' },
              { label:'Baustellen-Std.', value:`${maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h`, color:'#10b981', border:'#bbf7d0' },
              { label:'Begehungs-Std.', value:`${maStats.reduce((s,e)=>s+(e.begH||0),0).toFixed(1)}h`, color:'#f59e0b', border:'#fde68a' },
              { label:'Interne Std.', value:`${fmt(maStats.reduce((s,e)=>s+(e.intH||0),0))}h`, color:'#8b5cf6', border:'#e9d5ff' },
              { label:'Personalkosten', value:new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(maStats.reduce((s,e)=>s+e.kosten,0)), color:'#8b5cf6', border:'#ddd6fe' },
            ].map((k,i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, border:`1px solid ${k.border}`, padding:'14px 18px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color }} />
                <p style={{ fontSize:22, fontWeight:900, color:k.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{k.value}</p>
                <p style={{ fontSize:11, color:'#64748b', margin:0 }}>{k.label}</p>
              </div>
            ))}
          </div>

          {/* Mitarbeiter-Tabelle */}
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:8 }}>
              <FileText size={16} style={{ color:'#8b5cf6' }} />
              <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Mitarbeiter-Übersicht · {monatLabel}</p>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                  {['Mitarbeiter','Ticket-Std.','Baustellen-Std.','Begehungen','Intern','Gesamt','Kosten','Urlaub','Krank'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign: h==='Mitarbeiter'?'left':'right', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maStats.map((e, i) => {
                  const urlaubTage = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='urlaub').length;
                  const krankTage  = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='krank').length;
                  return (
                    <tr key={e.id} style={{ borderBottom:'1px solid #f8fafc' }}
                      onMouseEnter={ev=>(ev.currentTarget as HTMLElement).style.background='#f8fafc'}
                      onMouseLeave={ev=>(ev.currentTarget as HTMLElement).style.background='transparent'}>
                      <td style={{ padding:'13px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:10, background:`${e.farbe}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:12, fontWeight:800, color:e.farbe }}>{e.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}</span>
                          </div>
                          <span style={{ fontWeight:600, color:'#0f172a' }}>{e.name}</span>
                        </div>
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#3b82f6', fontWeight:600 }}>{e.tH.toFixed(1)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#10b981', fontWeight:600 }}>{e.bH.toFixed(1)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#f59e0b', fontWeight:600 }}>{(e.begH||0).toFixed(1)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#8b5cf6', fontWeight:600 }}>{fmt(e.intH||0)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        <span style={{ fontWeight:800, color:e.farbe, fontSize:14 }}>{e.gesamt.toFixed(1)}h</span>
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#0f172a' }}>
                        {new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(e.kosten)}
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        {urlaubTage > 0
                          ? <span style={{ background:'#f0fdf4', color:'#15803d', fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{urlaubTage}T</span>
                          : <span style={{ color:'#e2e8f0' }}>—</span>}
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        {krankTage > 0
                          ? <span style={{ background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{krankTage}T</span>
                          : <span style={{ color:'#e2e8f0' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
                {/* Summenzeile */}
                <tr style={{ background:'#f8fafc', borderTop:'2px solid #f1f5f9' }}>
                  <td style={{ padding:'13px 16px', fontWeight:800, color:'#0f172a' }}>Gesamt</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#3b82f6' }}>{maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#10b981' }}>{maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#f59e0b' }}>{maStats.reduce((s,e)=>s+(e.begH||0),0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#8b5cf6' }}>{fmt(maStats.reduce((s,e)=>s+(e.intH||0),0))}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:900, color:'#0f172a', fontSize:15 }}>{maStats.reduce((s,e)=>s+e.gesamt,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:900, color:'#0f172a', fontSize:15 }}>
                    {new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(maStats.reduce((s,e)=>s+e.kosten,0))}
                  </td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#15803d' }}>
                    {(abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='urlaub').length}T
                  </td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#dc2626' }}>
                    {(abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='krank').length}T
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Stunden-Chart */}
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:24 }}>
            <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Stunden-Vergleich · {monatLabel}</p>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 20px' }}>Tickets vs. Baustellen pro Mitarbeiter</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={maStats.map(e=>({ name:e.kuerzel||e.name.split(' ')[0], Tickets:Math.round(e.tH*10)/10, Baustellen:Math.round(e.bH*10)/10, Begehungen:Math.round((e.begH||0)*10)/10, Intern:Math.round((e.intH||0)*10)/10 }))} barGap={4} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} unit="h"/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="Tickets"    fill="#3b82f6" radius={[0,0,0,0]}/>
                <Bar dataKey="Baustellen" fill="#10b981" radius={[0,0,0,0]}/>
                <Bar dataKey="Begehungen" fill="#f59e0b" radius={[0,0,0,0]}/>
                <Bar dataKey="Intern"     fill="#8b5cf6" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}

    </div>
  );
}
