// Datenzugriff für die Kachel „Monatsdaten“.
// Unter /monatsdaten-demo läuft die Seite ohne Anmeldung mit erfundenen Beispieldaten im Browser-Speicher:
// nichts wird in die Datenbank geschrieben, nichts Echtes wird angezeigt.
import { supabase } from '@/integrations/supabase/client';

export const isDemo = () => typeof window !== 'undefined' && window.location.pathname.startsWith('/monatsdaten-demo');

type Row = Record<string, any>;
const store: Record<string, Row[]> = {};
let seeded = false;

function uid() { return 'demo-' + Math.random().toString(36).slice(2, 10); }

function seed() {
  if (seeded) return; seeded = true;
  const emp = [
    ['Anna Beispiel', 'AB', 'Elektro', 'Elektro'], ['Ben Muster', 'BM', 'Elektro', 'HM Elektro'], ['Carla Probe', 'CP', 'Hochbau', 'Hochbau'],
    ['David Test', 'DT', 'Hochbau', 'Hausmeister'], ['Emil Demo', 'ED', 'Elektro', 'Elektro'], ['Frida Fiktiv', 'FF', 'Hochbau', 'Hochbau'],
    ['Gero Platzhalter', 'GP', 'Elektro', 'Nachrichtentechnik'], ['Hanna Vorlage', 'HV', 'Hochbau', 'Hausmeister'],
  ];
  store.employees = emp.map(([name, kuerzel, gewerk, team], i) => ({ id: `emp-${i}`, name, kuerzel, gewerk, team, aktiv: true, stundensatz: 38.94 }));
  store.ticket_worklogs = []; store.bs_stundeneintraege = []; store.interne_stunden = [];
  const baustellen = [
    { name: '[A26-13933] Beispiel Umbau Station', a_nummer: 'A26-13933', status: 'in_bearbeitung' },
    { name: '[A26-16303] Beispiel Elektroinstallation', a_nummer: 'A26-16303', status: 'abgeschlossen' },
    { name: 'Beispiel ohne A-Nr.', a_nummer: null, status: 'in_bearbeitung' },
  ];
  let r = 7;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let m = 1; m <= 11; m++) {
    const mm = String(m).padStart(2, '0');
    for (const e of store.employees) {
      for (let d = 1; d <= 26; d += 1) {
        const datum = `2026-${mm}-${String(d).padStart(2, '0')}`;
        const dow = new Date(datum).getDay(); if (dow === 0 || dow === 6) continue;
        const t = Math.round(rnd() * 8) / 2;
        if (t > 0) store.ticket_worklogs.push({ id: uid(), employee_id: e.id, stunden: t, leistungsdatum: datum });
        if (rnd() < 0.35) {
          const b = baustellen[Math.floor(rnd() * baustellen.length)];
          store.bs_stundeneintraege.push({ id: uid(), mitarbeiter_id: e.id, stunden: 2, datum, baustelle_id: b.name, baustellen: b });
        }
        if (rnd() < 0.15) store.interne_stunden.push({ id: uid(), employee_id: e.id, stunden: 1, datum });
      }
    }
  }
  store.dguv_mess_importe = [{ monat: '2026-10', kunde: 'Beispiel', gesamt: 967 }, { monat: '2026-09', kunde: 'Beispiel', gesamt: 3888 }];
  store.md_saetze = [
    { id: uid(), gueltig_ab: '2026-01-01', art: 'verrechnung', team: 'alle', satz: 38.94, bemerkung: 'Demo' },
    { id: uid(), gueltig_ab: '2026-01-01', art: 'kosten', team: 'alle', satz: 31.5, bemerkung: 'Demo-Wert' },
  ];
  store.md_teamkosten = [{ id: uid(), monat: '2026-10', team: 'alle', kostenart: 'Fahrzeug', betrag: 850, bemerkung: 'Demo' }];
  store.md_ma_monat = store.employees.slice(0, 5).map((e, i) => ({
    id: uid(), monat: '2026-09', employee_id: e.id, mitarbeiter_name: e.name, ueberstunden: 4 + i, sonntag_stunden: i % 2 ? 8 : 0,
    sonntag_zulage_eur: i % 2 ? 96 : 0, bezahlte_stunden: 168, bemerkung: null, quelle: 'Demo',
  }));
  for (const t of ['md_leistungsmengen', 'md_sr_belege', 'md_sr_positionen', 'md_ag_status', 'md_uploads']) store[t] = [];
}

class Q {
  private filters: ((r: Row) => boolean)[] = [];
  private _order: { c: string; asc: boolean }[] = [];
  private _limit: number | null = null;
  private _range: [number, number] | null = null;
  private _single = false;
  private _head = false;
  private _op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private _payload: any = null;
  private _onConflict: string[] = [];
  constructor(private table: string) { seed(); store[table] = store[table] || []; }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (opts?.head) this._head = true; return this; }
  eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this; }
  gte(c: string, v: any) { this.filters.push(r => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filters.push(r => r[c] <= v); return this; }
  in(c: string, vs: any[]) { const s = new Set(vs); this.filters.push(r => s.has(r[c])); return this; }
  not(c: string, op: string, v: any) { if (op === 'is' && v === null) this.filters.push(r => r[c] != null); return this; }
  or(expr: string) {
    const parts = expr.split(',').map(p => p.split('.'));
    this.filters.push(r => parts.some(([c, op, ...v]) => (op === 'eq' ? String(r[c]) === v.join('.') : op === 'is' ? r[c] == null : false)));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this._order.push({ c, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this._limit = n; return this; }
  range(a: number, b: number) { this._range = [a, b]; return this; }
  maybeSingle() { this._single = true; return this; }
  insert(rows: Row | Row[]) { this._op = 'insert'; this._payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string }) { this._op = 'upsert'; this._payload = Array.isArray(rows) ? rows : [rows]; this._onConflict = (o?.onConflict || 'id').split(','); return this; }
  update(obj: Row) { this._op = 'update'; this._payload = obj; return this; }
  delete() { this._op = 'delete'; return this; }

  private run() {
    const tab = store[this.table];
    const match = (r: Row) => this.filters.every(f => f(r));
    if (this._op === 'insert') { this._payload.forEach((p: Row) => tab.push({ id: uid(), created_at: new Date().toISOString(), ...p })); return { data: null, error: null }; }
    if (this._op === 'upsert') {
      this._payload.forEach((p: Row) => {
        const i = tab.findIndex(r => this._onConflict.every(k => r[k] === p[k]));
        if (i >= 0) tab[i] = { ...tab[i], ...p }; else tab.push({ id: uid(), created_at: new Date().toISOString(), ...p });
      });
      return { data: null, error: null };
    }
    if (this._op === 'update') { tab.forEach((r, i) => { if (match(r)) tab[i] = { ...r, ...this._payload }; }); return { data: null, error: null }; }
    if (this._op === 'delete') {
      const weg = tab.filter(match);
      store[this.table] = tab.filter(r => !match(r));
      if (this.table === 'md_sr_belege') { const b = new Set(weg.map(r => r.beleg)); store.md_sr_positionen = store.md_sr_positionen.filter(p => !b.has(p.beleg)); }
      return { data: null, error: null };
    }
    let rows = tab.filter(match);
    if (this._head) return { data: null, count: rows.length, error: null };
    for (const o of [...this._order].reverse()) rows = [...rows].sort((a, b) => (a[o.c] > b[o.c] ? 1 : a[o.c] < b[o.c] ? -1 : 0) * (o.asc ? 1 : -1));
    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    if (this._limit != null) rows = rows.slice(0, this._limit);
    if (this._single) return { data: rows[0] ?? null, error: null };
    return { data: rows.map(r => ({ ...r })), error: null };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return rej ? rej(e) : Promise.reject(e); } }
}

const demoDb = { from: (t: string) => new Q(t) };

export function db(): any { return isDemo() ? demoDb : supabase; }
