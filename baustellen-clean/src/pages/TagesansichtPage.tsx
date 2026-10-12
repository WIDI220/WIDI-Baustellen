import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * Tagesansicht: Was hat eine Person (oder alle) an einem gewählten Tag gebucht?
 * Nur lesend. Abwesenheit erscheint nur als "Abwesend" (ohne Grund).
 */

type Art = 'Ticket' | 'Baustelle' | 'Intern' | 'Geplant' | 'Abwesend';
interface Zeile { id: string; kuerzel: string; art: Art; titel: string; detail: string; notiz: string; stunden: number }

const FARBE = { Ticket: '#3b82f6', Baustelle: '#f59e0b', Intern: '#10b981' } as const;
const MAX_STUNDEN_TAG = 10;
const VERLAUF_TAGE = 28;

// ── Datumshelfer (lokal, ohne Zeitzonen-Fallen) ─────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const istWochenende = (s: string) => [0, 6].includes(parse(s).getDay());
function arbeitstag(s: string, richtung: 1 | -1) { let t = addDays(s, richtung); while (istWochenende(t)) t = addDays(t, richtung); return t; }
function letzterArbeitstag() { let t = iso(new Date()); while (istWochenende(t)) t = addDays(t, -1); return t; }
const h = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',') || '0'} h`;
const num = (v: unknown) => Number(v ?? 0) || 0;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Supabase liefert max. 1000 Zeilen pro Abfrage → seitenweise holen
async function alle(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function TagesansichtPage() {
  const [tag, setTag] = useState(letzterArbeitstag);
  const [person, setPerson] = useState<string>(''); // kuerzel, '' = alle

  const { data: employees = [] } = useQuery({
    queryKey: ['tag-employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('id,kuerzel,name,gewerk').eq('aktiv', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const byId = useMemo(() => new Map((employees as any[]).map(e => [e.id, e])), [employees]);

  // ── Daten des gewählten Tages ──────────────────────────────────────────
  const { data: tagDaten, isLoading, error, refetch } = useQuery({
    queryKey: ['tag-daten', tag],
    queryFn: async () => {
      const [wl, bs, it, pl, ab] = await Promise.all([
        alle(() => supabase.from('ticket_worklogs').select('id,ticket_id,employee_id,stunden').eq('leistungsdatum', tag)),
        alle(() => supabase.from('bs_stundeneintraege').select('id,baustelle_id,mitarbeiter_id,stunden,beschreibung').eq('datum', tag)),
        alle(() => supabase.from('interne_stunden').select('id,employee_id,stunden,beschreibung').eq('datum', tag)),
        alle(() => supabase.from('wochenplanung').select('id,mitarbeiter_id,typ,baustelle_id,bezeichnung,stunden').eq('datum', tag)),
        // bewusst ohne "typ": Abwesenheit wird nur als "Abwesend" gezeigt
        alle(() => supabase.from('mitarbeiter_abwesenheiten').select('id,employee_id').eq('datum', tag)),
      ]);

      const ticketIds = [...new Set(wl.map(r => r.ticket_id).filter(Boolean))];
      const bsIds = [...new Set([...bs, ...pl].map(r => r.baustelle_id).filter(Boolean))];
      const [tickets, baustellen] = await Promise.all([
        Promise.all(chunk(ticketIds, 100).map(ids => supabase.from('tickets').select('id,a_nummer,raumnr,auftragstext,beschreibung,erledigungsbemerkung').in('id', ids))),
        Promise.all(chunk(bsIds, 100).map(ids => supabase.from('baustellen').select('id,name').in('id', ids))),
      ]);
      return {
        wl, bs, it, pl, ab,
        tickets: new Map(tickets.flatMap(r => r.data ?? []).map((t: any) => [t.id, t])),
        baustellen: new Map(baustellen.flatMap(r => r.data ?? []).map((b: any) => [b.id, b])),
      };
    },
  });

  // ── Verlauf der letzten 28 Tage ────────────────────────────────────────
  const { data: verlaufRoh } = useQuery({
    queryKey: ['tag-verlauf', tag],
    queryFn: async () => {
      const von = addDays(tag, -(VERLAUF_TAGE - 1));
      const [wl, bs, it] = await Promise.all([
        alle(() => supabase.from('ticket_worklogs').select('employee_id,stunden,leistungsdatum').gte('leistungsdatum', von).lte('leistungsdatum', tag)),
        alle(() => supabase.from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum').gte('datum', von).lte('datum', tag)),
        alle(() => supabase.from('interne_stunden').select('employee_id,stunden,datum').gte('datum', von).lte('datum', tag)),
      ]);
      return { wl, bs, it };
    },
    staleTime: 60_000,
  });

  const gewaehlt = person ? (employees as any[]).find(e => e.kuerzel === person) : null;
  const k = (id: string) => byId.get(id)?.kuerzel ?? '?';

  // ── Alle Zeilen des Tages (alle Personen) ──────────────────────────────
  const zeilen: Zeile[] = useMemo(() => {
    if (!tagDaten) return [];
    const out: Zeile[] = [];
    for (const r of tagDaten.wl) {
      const t: any = tagDaten.tickets.get(r.ticket_id) ?? {};
      const text = t.auftragstext || t.beschreibung || '';
      out.push({
        id: `t${r.id}`, kuerzel: k(r.employee_id), art: 'Ticket', titel: t.a_nummer ?? '(Ticket unbekannt)',
        detail: [t.raumnr, text && `"${text}"`].filter(Boolean).join(' · '), notiz: t.erledigungsbemerkung ?? '', stunden: num(r.stunden),
      });
    }
    for (const r of tagDaten.bs) {
      out.push({ id: `b${r.id}`, kuerzel: k(r.mitarbeiter_id), art: 'Baustelle', titel: (tagDaten.baustellen.get(r.baustelle_id) as any)?.name ?? '(Baustelle unbekannt)', detail: '', notiz: r.beschreibung ?? '', stunden: num(r.stunden) });
    }
    for (const r of tagDaten.it) {
      out.push({ id: `i${r.id}`, kuerzel: k(r.employee_id), art: 'Intern', titel: 'Interne Stunden', detail: '', notiz: r.beschreibung ?? '', stunden: num(r.stunden) });
    }
    for (const r of tagDaten.pl) {
      const bsName = r.baustelle_id ? (tagDaten.baustellen.get(r.baustelle_id) as any)?.name : '';
      out.push({ id: `p${r.id}`, kuerzel: k(r.mitarbeiter_id), art: 'Geplant', titel: bsName || r.bezeichnung || r.typ || 'Plan', detail: r.typ ?? '', notiz: '', stunden: num(r.stunden) });
    }
    for (const r of tagDaten.ab) {
      out.push({ id: `a${r.id}`, kuerzel: k(r.employee_id), art: 'Abwesend', titel: 'Abwesend', detail: '', notiz: '', stunden: 0 });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagDaten, employees]);

  // ── Übersicht je Person ────────────────────────────────────────────────
  const proPerson = useMemo(() => (employees as any[]).map(e => {
    const z = zeilen.filter(x => x.kuerzel === e.kuerzel);
    const s = (a: Art) => z.filter(x => x.art === a).reduce((acc, x) => acc + x.stunden, 0);
    const ticket = s('Ticket'), baustelle = s('Baustelle'), intern = s('Intern'), geplant = s('Geplant');
    const abwesend = z.some(x => x.art === 'Abwesend');
    const summe = ticket + baustelle + intern;
    const status = abwesend ? 'Abwesend' : summe > MAX_STUNDEN_TAG ? 'Sehr lang' : summe > 0 ? 'Gebucht' : geplant > 0 ? 'Geplant, nichts gebucht' : '–';
    return { kuerzel: e.kuerzel, name: e.name, ticket, baustelle, intern, summe, geplant, abwesend, status };
  }).filter(p => p.summe > 0 || p.geplant > 0 || p.abwesend), [employees, zeilen]);

  const sichtbar = person ? zeilen.filter(z => z.kuerzel === person) : zeilen;
  const gebucht = sichtbar.filter(z => ['Ticket', 'Baustelle', 'Intern'].includes(z.art));
  const sum = (a: Art) => sichtbar.filter(z => z.art === a).reduce((acc, z) => acc + z.stunden, 0);
  const cnt = (a: Art) => sichtbar.filter(z => z.art === a).length;
  const hGes = sum('Ticket') + sum('Baustelle') + sum('Intern');
  const abwNamen = proPerson.filter(p => p.abwesend).map(p => p.kuerzel);

  // ── Hinweise: Doppelbuchungen und sehr lange Tage ──────────────────────
  const hinweise = useMemo(() => {
    const out: string[] = [];
    const seen = new Map<string, number>();
    for (const z of zeilen.filter(x => ['Ticket', 'Baustelle', 'Intern'].includes(x.art))) {
      const key = `${z.kuerzel}|${z.art}|${z.titel}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen) {
      if (n > 1) { const [kz, art, titel] = key.split('|'); out.push(`${kz}: ${art} „${titel}“ wurde ${n}-mal gebucht – mögliche Doppelbuchung.`); }
    }
    for (const p of proPerson) {
      if (p.summe > MAX_STUNDEN_TAG) out.push(`${p.kuerzel}: ${h(p.summe)} an einem Tag gebucht – bitte prüfen.`);
    }
    return person ? out.filter(x => x.startsWith(`${person}:`)) : out;
  }, [zeilen, proPerson, person]);

  // ── Verlaufsdiagramm ───────────────────────────────────────────────────
  const verlauf = useMemo(() => {
    if (!verlaufRoh) return [];
    const id = gewaehlt?.id;
    const map = new Map<string, { tag: string; label: string; Ticket: number; Baustelle: number; Intern: number }>();
    for (let i = VERLAUF_TAGE - 1; i >= 0; i--) {
      const t = addDays(tag, -i);
      if (istWochenende(t)) continue;
      map.set(t, { tag: t, label: parse(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), Ticket: 0, Baustelle: 0, Intern: 0 });
    }
    const add = (rows: any[], emp: string, datum: string, art: 'Ticket' | 'Baustelle' | 'Intern') => {
      for (const r of rows) { if (id && r[emp] !== id) continue; const e = map.get(r[datum]); if (e) e[art] += num(r.stunden); }
    };
    add(verlaufRoh.wl, 'employee_id', 'leistungsdatum', 'Ticket');
    add(verlaufRoh.bs, 'mitarbeiter_id', 'datum', 'Baustelle');
    add(verlaufRoh.it, 'employee_id', 'datum', 'Intern');
    return [...map.values()];
  }, [verlaufRoh, gewaehlt, tag]);

  const tagLabel = parse(tag).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 };
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: 13, padding: '7px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
  const nav: React.CSSProperties = { border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' };

  const KPI = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ ...card, flex: '1 1 150px' }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8', minHeight: 16 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Tagesansicht</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Was wurde an einem Tag gebucht? Person und Tag wählen – darunter stehen alle Buchungen im Einzelnen.</p>
      </div>

      {/* Auswahl */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#64748b' }}>Person
          <select value={person} onChange={e => setPerson(e.target.value)} style={{ ...nav, minWidth: 200, fontSize: 13 }}>
            <option value="">Alle Mitarbeiter</option>
            {(employees as any[]).map(e => <option key={e.id} value={e.kuerzel}>{e.name} ({e.kuerzel})</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#64748b' }}>Tag
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button aria-label="Voriger Arbeitstag" style={nav} onClick={() => setTag(arbeitstag(tag, -1))}><ChevronLeft size={14} /></button>
            <input type="date" value={tag} min="2025-01-01" max="2099-12-31" onChange={e => e.target.value && setTag(e.target.value)} style={{ ...nav, fontSize: 13 }} />
            <button aria-label="Nächster Arbeitstag" style={nav} onClick={() => setTag(arbeitstag(tag, 1))}><ChevronRight size={14} /></button>
            <button style={{ ...nav, fontSize: 13 }} onClick={() => setTag(letzterArbeitstag())}>Letzter Arbeitstag</button>
            <button style={{ ...nav, fontSize: 13 }} onClick={() => refetch()}>Neu laden</button>
          </span>
        </label>
      </div>

      <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{tagLabel} · {gewaehlt ? `${gewaehlt.name} (${gewaehlt.kuerzel})` : 'Alle Mitarbeiter'}</div>

      {error && <div style={{ ...card, color: '#b91c1c' }}>Die Daten konnten nicht geladen werden. Bitte „Neu laden“ versuchen.</div>}
      {istWochenende(tag) && <div style={{ ...card, color: '#64748b' }}>Dieser Tag ist ein Wochenende.</div>}

      {/* Kennzahlen */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <KPI label="Gebucht" value={isLoading ? '…' : h(hGes)} sub={sum('Geplant') ? `geplant waren ${h(sum('Geplant'))}` : 'nichts geplant'} />
        <KPI label="Tickets" value={isLoading ? '…' : h(sum('Ticket'))} sub={`${cnt('Ticket')} Buchungen`} />
        <KPI label="Baustellen" value={isLoading ? '…' : h(sum('Baustelle'))} sub={`${cnt('Baustelle')} Buchungen`} />
        <KPI label="Intern" value={isLoading ? '…' : h(sum('Intern'))} sub="interne Stunden" />
        <KPI label="Geplant" value={isLoading ? '…' : h(sum('Geplant'))} sub={abwNamen.length ? `Abwesend: ${abwNamen.join(', ')}` : 'niemand abwesend'} />
      </div>

      {/* Hinweise */}
      {hinweise.length > 0 && (
        <div style={{ ...card, borderColor: '#fcd34d', background: '#fffbeb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#92400e' }}><AlertTriangle size={16} /> Hinweise zum Tag</div>
          <p style={{ fontSize: 12, color: '#92400e', margin: '4px 0 8px' }}>Mögliche Doppelbuchungen und auffällig lange Tage, die du prüfen solltest.</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#78350f', display: 'grid', gap: 4 }}>{hinweise.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {/* Alle Mitarbeiter */}
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Alle Mitarbeiter an diesem Tag</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>Ein Klick auf eine Zeile zeigt die Buchungen dieser Person.</p>
        {proPerson.length === 0 ? <div style={{ color: '#94a3b8', padding: '8px 0' }}>Keine Buchungen, Pläne oder Abwesenheiten an diesem Tag.</div> : (
          <div style={{ overflowX: 'auto', maxHeight: 360 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Kürzel', 'Name', 'Tickets', 'Baustellen', 'Intern', 'Gesamt', 'Geplant', 'Status'].map((c, i) => <th key={c} style={{ ...th, textAlign: i >= 2 && i <= 6 ? 'right' : 'left' }}>{c}</th>)}</tr></thead>
              <tbody>
                {proPerson.map(p => (
                  <tr key={p.kuerzel} onClick={() => setPerson(person === p.kuerzel ? '' : p.kuerzel)} style={{ cursor: 'pointer', background: person === p.kuerzel ? '#f5f3ff' : undefined }}>
                    <td style={td}>{p.kuerzel}</td><td style={td}>{p.name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{h(p.ticket)}</td><td style={{ ...td, textAlign: 'right' }}>{h(p.baustelle)}</td><td style={{ ...td, textAlign: 'right' }}>{h(p.intern)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: p.summe > MAX_STUNDEN_TAG ? '#b91c1c' : undefined }}>{h(p.summe)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{h(p.geplant)}</td><td style={td}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verlauf */}
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Stunden der letzten 28 Tage</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>{gewaehlt ? gewaehlt.name : 'Alle Mitarbeiter'}, 28 Tage bis zum gewählten Tag. Ein Klick auf einen Balken wählt den Tag.</p>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={verlauf} onClick={(s: any) => { const t = s?.activePayload?.[0]?.payload?.tag; if (t) setTag(t); }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit=" h" width={48} />
              <Tooltip formatter={(v: any) => h(Number(v))} />
              <Legend />
              <Bar dataKey="Ticket" stackId="a" fill={FARBE.Ticket} />
              <Bar dataKey="Baustelle" stackId="a" fill={FARBE.Baustelle} />
              <Bar dataKey="Intern" stackId="a" fill={FARBE.Intern} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Einzelne Buchungen */}
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Buchungen und Pläne des Tages</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>Ticket-Stunden mit Auftrag und Erledigungsbemerkung, Baustellen- und interne Stunden mit der erfassten Tätigkeit. Graue Zeilen sind geplant, nicht gebucht.</p>
        {!isLoading && sichtbar.length === 0 ? <div style={{ color: '#94a3b8', padding: '8px 0' }}>Für diesen Tag gibt es in dieser Auswahl keine Buchungen.</div> : (
          <div style={{ overflowX: 'auto', maxHeight: 520 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Kürzel', 'Art', 'Auftrag', 'Worum es ging', 'Tätigkeit', 'Stunden'].map((c, i) => <th key={c} style={{ ...th, textAlign: i === 5 ? 'right' : 'left' }}>{c}</th>)}</tr></thead>
              <tbody>
                {[...sichtbar].sort((a, b) => a.kuerzel.localeCompare(b.kuerzel) || a.art.localeCompare(b.art)).map(z => (
                  <tr key={z.id} style={{ color: z.art === 'Geplant' || z.art === 'Abwesend' ? '#94a3b8' : undefined }}>
                    <td style={td}>{z.kuerzel}</td>
                    <td style={td}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 6, background: (FARBE as any)[z.art] ?? '#cbd5e1' }} />{z.art}</td>
                    <td style={td}>{z.titel}</td><td style={{ ...td, minWidth: 180 }}>{z.detail}</td><td style={{ ...td, minWidth: 180 }}>{z.notiz}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{z.art === 'Abwesend' ? '–' : h(z.stunden)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#94a3b8' }}>Alle Zahlen kommen live aus der Datenbank. Abwesenheit erscheint nur als „Abwesend“, ohne Grund.</p>
    </div>
  );
}
