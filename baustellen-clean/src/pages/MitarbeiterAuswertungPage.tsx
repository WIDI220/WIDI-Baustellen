import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users, Clock, Euro, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';

const STUNDENSATZ = 38.08;
const MONATE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const TABS = ['Übersicht', 'Einzelperson', 'Monatsvergleich'] as const;
type Tab = typeof TABS[number];

function fmt(n: number) { return n.toFixed(1).replace('.', ','); }
function fmtEur(n: number) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }

function monatStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function useMonatsDaten(year: number, month: number) {
  const von = `${monatStr(year, month)}-01`;
  const bis = `${monatStr(year, month)}-31`;

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name,kuerzel,stundensatz').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const { data: ticketStunden = [] } = useQuery({
    queryKey: ['auswertung-tickets', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_worklogs')
        .select('employee_id, stunden, leistungsdatum, ticket_id, tickets(a_nummer, beschreibung)')
        .gte('leistungsdatum', von)
        .lte('leistungsdatum', bis);
      return data ?? [];
    },
  });

  const { data: bauStunden = [] } = useQuery({
    queryKey: ['auswertung-baustellen', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('bs_stundeneintraege')
        .select('mitarbeiter_id, stunden, datum, baustelle_id, baustellen(id, name)')
        .gte('datum', von)
        .lte('datum', bis);
      return data ?? [];
    },
  });

  return { employees, ticketStunden, bauStunden };
}

function useMonatsVergleich(monate: {year:number, month:number}[]) {
  // Alle Monate auf einmal laden
  const queries = monate.map(m => ({
    von: `${monatStr(m.year, m.month)}-01`,
    bis: `${monatStr(m.year, m.month)}-31`,
    label: `${MONATE[m.month-1]} ${m.year}`,
  }));

  const { data: allTicket = [] } = useQuery({
    queryKey: ['vergleich-tickets', monate.map(m => monatStr(m.year, m.month)).join(',')],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_worklogs')
        .select('employee_id, stunden, leistungsdatum')
        .gte('leistungsdatum', queries[0].von)
        .lte('leistungsdatum', queries[queries.length-1].bis);
      return data ?? [];
    },
    enabled: monate.length > 0,
  });

  const { data: allBau = [] } = useQuery({
    queryKey: ['vergleich-bau', monate.map(m => monatStr(m.year, m.month)).join(',')],
    queryFn: async () => {
      const { data } = await supabase
        .from('bs_stundeneintraege')
        .select('mitarbeiter_id, stunden, datum')
        .gte('datum', queries[0].von)
        .lte('datum', queries[queries.length-1].bis);
      return data ?? [];
    },
    enabled: monate.length > 0,
  });

  return queries.map(q => ({
    label: q.label,
    tickets: Math.round((allTicket as any[]).filter(w => w.leistungsdatum >= q.von && w.leistungsdatum <= q.bis).reduce((s:number,w:any) => s + Number(w.stunden??0), 0) * 10) / 10,
    baustellen: Math.round((allBau as any[]).filter(w => w.datum >= q.von && w.datum <= q.bis).reduce((s:number,w:any) => s + Number(w.stunden??0), 0) * 10) / 10,
  }));
}

// ─── Tab: Übersicht ───────────────────────────────────────────────────────────
function TabUebersicht({ year, month, onSelectMA }: { year: number; month: number; onSelectMA: (id: string) => void }) {
  const { employees, ticketStunden, bauStunden } = useMonatsDaten(year, month);

  const stats = useMemo(() => {
    return (employees as any[]).map(e => {
      const tH = (ticketStunden as any[]).filter(w => w.employee_id === e.id).reduce((s,w) => s + Number(w.stunden??0), 0);
      const bH = (bauStunden as any[]).filter(w => w.mitarbeiter_id === e.id).reduce((s,w) => s + Number(w.stunden??0), 0);
      return { ...e, ticketH: Math.round(tH*10)/10, bauH: Math.round(bH*10)/10, gesamt: Math.round((tH+bH)*10)/10 };
    }).filter(e => e.gesamt > 0).sort((a,b) => b.gesamt - a.gesamt);
  }, [employees, ticketStunden, bauStunden]);

  const totalT = stats.reduce((s,e) => s + e.ticketH, 0);
  const totalB = stats.reduce((s,e) => s + e.bauH, 0);
  const total = totalT + totalB;

  const kpis = [
    { label: 'Gesamt Stunden', value: `${fmt(total)}h`, sub: `${stats.length} Mitarbeiter`, icon: Clock, farbe: '#1a3356' },
    { label: 'Tickets', value: `${fmt(totalT)}h`, sub: `${total > 0 ? Math.round(totalT/total*100) : 0}% der Zeit`, icon: TrendingUp, farbe: '#3B8BD4' },
    { label: 'Baustellen', value: `${fmt(totalB)}h`, sub: `${total > 0 ? Math.round(totalB/total*100) : 0}% der Zeit`, icon: TrendingUp, farbe: '#107A57' },
    { label: 'Lohnkosten', value: fmtEur(total * STUNDENSATZ), sub: `@ ${STUNDENSATZ}€/h`, icon: Euro, farbe: '#2d1b69' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{k.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '600', color: k.farbe, letterSpacing: '-.02em' }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Mitarbeiter-Liste */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '16px' }}>
          Stundenverteilung – {MONATE[month-1]} {year}
        </div>

        {stats.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>Keine Stunden in diesem Monat erfasst.</p>
        )}

        {stats.map(e => {
          const maxH = stats[0]?.gesamt || 1;
          const initials = e.name.split(' ').map((n:string) => n[0]).join('').slice(0,2).toUpperCase();
          return (
            <div
              key={e.id}
              onClick={() => onSelectMA(e.id)}
              style={{ marginBottom: '14px', cursor: 'pointer', padding: '12px', borderRadius: '10px', transition: 'background .15s' }}
              onMouseEnter={el => (el.currentTarget as HTMLElement).style.background = '#f8faff'}
              onMouseLeave={el => (el.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(30,58,95,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: '#1e3a5f' }}>{initials}</div>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#0f1f3d' }}>{e.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                  <span style={{ color: '#3B8BD4' }}>T: {fmt(e.ticketH)}h</span>
                  <span style={{ color: '#107A57' }}>B: {fmt(e.bauH)}h</span>
                  <span style={{ color: '#0f1f3d', fontWeight: '600' }}>{fmt(e.gesamt)}h</span>
                </div>
              </div>
              {/* Balken */}
              <div style={{ height: '8px', background: '#f0f2f5', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', height: '100%', width: `${(e.gesamt/maxH)*100}%` }}>
                  {e.ticketH > 0 && <div style={{ flex: e.ticketH, background: '#3B8BD4', borderRadius: e.bauH === 0 ? '4px' : '4px 0 0 4px' }} />}
                  {e.bauH > 0 && <div style={{ flex: e.bauH, background: '#107A57', borderRadius: e.ticketH === 0 ? '4px' : '0 4px 4px 0', marginLeft: e.ticketH > 0 ? '2px' : 0 }} />}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '11px', color: '#3B8BD4' }}>■ Tickets</span>
          <span style={{ fontSize: '11px', color: '#107A57' }}>■ Baustellen</span>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>· klick auf Mitarbeiter = Detailansicht</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Einzelperson ────────────────────────────────────────────────────────
function TabEinzelperson({ year, month, selectedId, onSelectId }: { year: number; month: number; selectedId: string; onSelectId: (id:string)=>void }) {
  const { employees, ticketStunden, bauStunden } = useMonatsDaten(year, month);

  const emp = (employees as any[]).find(e => e.id === selectedId);

  const myTickets = useMemo(() => {
    const grouped: Record<string, { id:string; name:string; stunden:number }> = {};
    (ticketStunden as any[]).filter(w => w.employee_id === selectedId).forEach(w => {
      const id = w.ticket_id;
      const name = w.tickets?.a_nummer ? `T-${w.tickets.a_nummer}` : 'Ticket';
      if (!grouped[id]) grouped[id] = { id, name, stunden: 0 };
      grouped[id].stunden += Number(w.stunden ?? 0);
    });
    return Object.values(grouped).sort((a,b) => b.stunden - a.stunden);
  }, [ticketStunden, selectedId]);

  const myBau = useMemo(() => {
    const grouped: Record<string, { id:string; name:string; stunden:number }> = {};
    (bauStunden as any[]).filter(w => w.mitarbeiter_id === selectedId).forEach(w => {
      const id = w.baustelle_id;
      const name = w.baustellen?.name ?? 'Baustelle';
      if (!grouped[id]) grouped[id] = { id, name, stunden: 0 };
      grouped[id].stunden += Number(w.stunden ?? 0);
    });
    return Object.values(grouped).sort((a,b) => b.stunden - a.stunden);
  }, [bauStunden, selectedId]);

  const totalT = myTickets.reduce((s,t) => s + t.stunden, 0);
  const totalB = myBau.reduce((s,b) => s + b.stunden, 0);
  const total = totalT + totalB;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Mitarbeiter wählen */}
      <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#6b7a99', fontWeight: '500' }}>Mitarbeiter:</span>
        {(employees as any[]).map(e => (
          <button key={e.id} onClick={() => onSelectId(e.id)} style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', border: '1.5px solid',
            borderColor: e.id === selectedId ? '#2d1b69' : '#e5e9f2',
            background: e.id === selectedId ? '#2d1b69' : '#fff',
            color: e.id === selectedId ? '#fff' : '#6b7a99',
            fontWeight: e.id === selectedId ? '500' : '400',
          }}>{e.name}</button>
        ))}
      </div>

      {emp && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
            {[
              { label: 'Gesamt', value: `${fmt(total)}h`, farbe: '#0f1f3d' },
              { label: 'Tickets', value: `${fmt(totalT)}h`, farbe: '#3B8BD4' },
              { label: 'Baustellen', value: `${fmt(totalB)}h`, farbe: '#107A57' },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', borderRadius: '14px', padding: '16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '26px', fontWeight: '600', color: k.farbe }}>{k.value}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{fmtEur(parseFloat(k.value) * STUNDENSATZ)}</div>
              </div>
            ))}
          </div>

          {/* Detail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Tickets */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#3B8BD4', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px', borderLeft: '3px solid #3B8BD4', paddingLeft: '8px' }}>
                Tickets – {fmt(totalT)}h
              </div>
              {myTickets.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px' }}>Keine Ticket-Stunden</p>}
              {myTickets.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '13px', color: '#374151' }}>{t.name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#3B8BD4' }}>{fmt(t.stunden)}h</span>
                </div>
              ))}
            </div>

            {/* Baustellen */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#107A57', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px', borderLeft: '3px solid #107A57', paddingLeft: '8px' }}>
                Baustellen – {fmt(totalB)}h
              </div>
              {myBau.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px' }}>Keine Baustellen-Stunden</p>}
              {myBau.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '13px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{b.name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#107A57', flexShrink: 0, marginLeft: '8px' }}>{fmt(b.stunden)}h</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Monatsvergleich ─────────────────────────────────────────────────────
function TabMonate({ year, month }: { year: number; month: number }) {
  // Letzten 6 Monate berechnen
  const monate = useMemo(() => {
    const result = [];
    for (let i = 5; i >= 0; i--) {
      let m = month - i;
      let y = year;
      while (m <= 0) { m += 12; y -= 1; }
      result.push({ year: y, month: m });
    }
    return result;
  }, [year, month]);

  const daten = useMonatsVergleich(monate);

  const max = Math.max(...daten.map(d => d.tickets + d.baustellen), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Balkendiagramm */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f1f3d', marginBottom: '6px' }}>Stunden der letzten 6 Monate</div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }}>Tickets + Baustellen kombiniert</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={daten} barSize={28} barGap={4}>
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" width={40} />
            <Tooltip
              formatter={(v: number, name: string) => [`${fmt(v)}h`, name === 'tickets' ? 'Tickets' : 'Baustellen']}
              contentStyle={{ borderRadius: '10px', border: '0.5px solid #e5e9f2', fontSize: '13px' }}
            />
            <Legend formatter={(v) => v === 'tickets' ? 'Tickets' : 'Baustellen'} wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="tickets" stackId="a" fill="#3B8BD4" radius={[0,0,4,4]} name="tickets" />
            <Bar dataKey="baustellen" stackId="a" fill="#107A57" radius={[4,4,0,0]} name="baustellen" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabelle */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Detailübersicht</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, auto)', gap: '0', borderRadius: '10px', overflow: 'hidden', border: '1px solid #f0f0f0' }}>
          {/* Header */}
          {['Monat','Tickets','Baustellen','Gesamt','Kosten'].map(h => (
            <div key={h} style={{ background: '#f8faff', padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</div>
          ))}
          {/* Daten */}
          {daten.map((d, i) => {
            const gesamt = d.tickets + d.baustellen;
            const isAktuell = i === daten.length - 1;
            return [
              <div key={d.label+'-m'} style={{ padding: '11px 14px', fontSize: '13px', fontWeight: isAktuell ? '600' : '400', color: isAktuell ? '#0f1f3d' : '#374151', borderTop: '1px solid #f5f5f5', background: isAktuell ? '#f8faff' : '#fff' }}>{d.label}</div>,
              <div key={d.label+'-t'} style={{ padding: '11px 14px', fontSize: '13px', color: '#3B8BD4', fontWeight: '500', borderTop: '1px solid #f5f5f5', background: isAktuell ? '#f8faff' : '#fff' }}>{fmt(d.tickets)}h</div>,
              <div key={d.label+'-b'} style={{ padding: '11px 14px', fontSize: '13px', color: '#107A57', fontWeight: '500', borderTop: '1px solid #f5f5f5', background: isAktuell ? '#f8faff' : '#fff' }}>{fmt(d.baustellen)}h</div>,
              <div key={d.label+'-g'} style={{ padding: '11px 14px', fontSize: '13px', fontWeight: '600', color: '#0f1f3d', borderTop: '1px solid #f5f5f5', background: isAktuell ? '#f8faff' : '#fff' }}>{fmt(gesamt)}h</div>,
              <div key={d.label+'-k'} style={{ padding: '11px 14px', fontSize: '13px', color: '#6b7a99', borderTop: '1px solid #f5f5f5', background: isAktuell ? '#f8faff' : '#fff' }}>{fmtEur(gesamt * STUNDENSATZ)}</div>,
            ];
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function MitarbeiterAuswertungPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('Übersicht');
  const [selectedMA, setSelectedMA] = useState('');

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function handleSelectMA(id: string) {
    setSelectedMA(id);
    setTab('Einzelperson');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>Mitarbeiter-Auswertung</h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Tickets + Baustellen kombiniert · {MONATE[month-1]} {year}</p>
        </div>

        {/* Monatsnavigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={prevMonth} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e9f2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7a99' }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ background: '#2d1b69', color: '#fff', borderRadius: '8px', padding: '6px 16px', fontSize: '13px', fontWeight: '500', minWidth: '110px', textAlign: 'center' }}>
            {MONATE[month-1]} {year}
          </div>
          <button onClick={nextMonth} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e5e9f2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7a99' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: '#fff', borderRadius: '12px', padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px',
              background: tab === t ? '#2d1b69' : 'transparent',
              color: tab === t ? '#fff' : '#6b7a99',
              fontWeight: tab === t ? '500' : '400',
              transition: 'all .15s',
            }}
          >{t}</button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      {tab === 'Übersicht' && <TabUebersicht year={year} month={month} onSelectMA={handleSelectMA} />}
      {tab === 'Einzelperson' && <TabEinzelperson year={year} month={month} selectedId={selectedMA} onSelectId={setSelectedMA} />}
      {tab === 'Monatsvergleich' && <TabMonate year={year} month={month} />}
    </div>
  );
}
