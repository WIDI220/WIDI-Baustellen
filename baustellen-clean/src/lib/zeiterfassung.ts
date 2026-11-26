// Stundenabgleich: SP Data (Zeiterfassung Personal) · Plus/Minus-Liste Fr. Denker · WIDI-System
import { supabase } from '@/integrations/supabase/client';
import { parseZahl } from '@/lib/monatsdaten';

// ── Namen zuordnen (unscharf: „Alkan, Tarek“ ↔ „Tarik Alkan“, „von Berge“ ↔ „vom Berge“) ──
const PARTIKEL = new Set(['von', 'vom', 'van', 'der', 'den', 'de', 'zu', 'zum']);
function toks(s: string): string[] {
  return String(s || '').toLowerCase().replace(/[^a-zäöüß ]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !PARTIKEL.has(t));
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function matchEmployee<E extends { id: string; name: string; aktiv?: boolean }>(name: string, employees: E[]): { e: E | null; exakt: boolean } {
  const a = toks(name);
  if (!a.length) return { e: null, exakt: false };
  const scored = employees.map(e => {
    const b = toks(e.name);
    if (!b.length) return { e, s: 99 };
    // jedes Token von a dem besten Token von b zuordnen
    const s = a.reduce((sum, t) => sum + Math.min(...b.map(u => lev(t, u))), 0) + Math.abs(a.length - b.length) * 2;
    return { e, s: s - (e.aktiv === false ? -0.5 : 0) };
  }).sort((x, y) => x.s - y.s);
  const best = scored[0], zweit = scored[1];
  if (!best || best.s > 3) return { e: null, exakt: false };
  if (zweit && zweit.s - best.s < 1) return { e: null, exakt: false };
  return { e: best.e, exakt: best.s === 0 };
}

// ── Plus/Minus-Liste Fr. Denker (Excel) ──
export interface DenkerZeile {
  name: string; plus: number | null; minus: number | null; auszahlung: number | null;
  zuschlaege: Record<string, number>;
}
const ZUSCHLAG_SPALTEN: [string, RegExp][] = [
  ['so_std', /^so-?std/i], ['ft_std', /^ft/i], ['rb_werk', /rb\s*werk/i], ['rb_so_ft', /rb\s*so/i],
  ['rb_wegezeit', /rb\s*\/?\s*wegez/i], ['rb_einsatz', /rb\s*\/?\s*einsatz/i], ['teamleitung', /teamleit/i], ['nacht', /nacht/i],
];
export const ZUSCHLAG_LABEL: Record<string, string> = {
  so_std: 'So-Std. %', ft_std: 'FT %', rb_werk: 'RB werk.', rb_so_ft: 'RB So/FT', rb_wegezeit: 'RB/Wegezeit', rb_einsatz: 'RB/Einsatz', teamleitung: 'Teamleitung', nacht: 'Nacht %',
};
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

// Kopfzeile der Plus/Minus-Liste: eine Zeile mit „Plus…“ und „Minus…“ (z. B. Plusstunden/Minusstunden, Plus-Std., Plus/Minus)
function denkerKopf(rows: unknown[][]): number {
  return rows.slice(0, 20).findIndex(r => {
    const t = (r || []).map(c => String(c ?? '').toLowerCase());
    return t.some(x => /plus/.test(x)) && t.some(x => /minus/.test(x));
  });
}
export function istDenkerListe(rows: unknown[][]): boolean {
  if (denkerKopf(rows) >= 0) return true;
  return rows.slice(0, 5).some(r => (r || []).some(c => /plus.*minus/i.test(String(c ?? ''))));
}

export function parseDenker(rows: unknown[][]): { monat: string | null; zeilen: DenkerZeile[] } {
  let monat: string | null = null;
  for (const r of rows.slice(0, 6)) for (const c of r || []) {
    const s = String(c ?? '').toLowerCase();
    const mi = MONATE.findIndex(m => s.includes(m)); const y = /(20\d{2})/.exec(s);
    if (mi >= 0 && y) monat = `${y[1]}-${String(mi + 1).padStart(2, '0')}`;
  }
  const h = denkerKopf(rows);
  if (h < 0) return { monat, zeilen: [] };
  const head = (rows[h] || []).map(c => String(c ?? '').trim());
  const idx = (re: RegExp) => head.findIndex(x => re.test(x));
  let iName = idx(/name|mitarbeiter/i); if (iName < 0) iName = 0;
  const iPlus = idx(/plus/i), iMinus = idx(/minus/i), iAus = idx(/auszahl|saldo|differenz/i);
  const zIdx = ZUSCHLAG_SPALTEN.map(([k, re]) => [k, idx(re)] as [string, number]).filter(([, i]) => i >= 0);
  const zeilen: DenkerZeile[] = [];
  for (const r of rows.slice(h + 1)) {
    const name = String(r?.[iName] ?? '').trim();
    if (!name || /summe|gesamt/i.test(name) || !/[a-zäöüß]/i.test(name)) continue;
    const z: Record<string, number> = {};
    for (const [k, i] of zIdx) { const v = parseZahl(r[i]); if (v != null && v !== 0) z[k] = v; }
    zeilen.push({ name, plus: parseZahl(r[iPlus]), minus: parseZahl(r[iMinus]), auszahlung: iAus >= 0 ? parseZahl(r[iAus]) : null, zuschlaege: z });
  }
  return { monat, zeilen };
}

// ── SP Data (PDF, auch Scan) über die Server-Funktion auslesen ──
export interface SpTag { datum: string; kommt_geht?: string | null; ges?: number | null; pause?: number | null; soll?: number | null; ist?: number | null; krank?: number | null; urlaub?: number | null; flexi?: number | null; ue_std?: number | null; grund?: string | null }
export interface SpSeite {
  name: string; personalnummer?: string | null; monat?: string | null; stand?: string | null;
  summe: { ges?: number | null; soll?: number | null; pause?: number | null; ao?: number | null; ist?: number | null; krank?: number | null; urlaub?: number | null; flexi?: number | null; ue_std?: number | null };
  tage?: SpTag[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function spDataLesen(file: File): Promise<SpSeite[]> {
  if (file.size > 3_000_000) throw new Error('PDF ist größer als 3 MB – bitte in kleinere Dateien aufteilen (z. B. 10 Mitarbeiter je Datei)');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Nicht angemeldet');
  const res = await fetch('/api/spdata-lesen', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pdf: toBase64(await file.arrayBuffer()), dateiname: file.name }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Fehler ${res.status}`);
  return (j.seiten || []) as SpSeite[];
}

// ── Prüfungen je Mitarbeiter ──
export interface AbgleichZeile {
  employee_id: string | null; name: string; ohneBuchung?: boolean;
  modell?: { brutto: number; feiertagH: number; netto: number; moDo: number; fr: number };
  sp?: any; denker?: any; widiH: number; widiTage: Record<string, number>;
  anwesend: number | null; quote: number | null;
  ampel: 'grün' | 'gelb' | 'rot' | 'grau'; hinweise: string[];
}

export function pruefe(z: AbgleichZeile): AbgleichZeile {
  const h: string[] = []; let rot = false, gelb = false;
  const sp = z.sp, d = z.denker;
  const n = (v: any) => (v == null ? null : Number(v));
  const f = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sp) { h.push('SP Data fehlt'); }
  if (!d || d.plusstunden == null) { h.push('Plus/Minus-Liste fehlt'); }
  if (sp && d && d.plusstunden != null) {
    const ue = n(sp.ue_std) ?? 0, fl = n(sp.flexi) ?? 0;
    if (Math.abs((n(d.plusstunden) ?? 0) - ue) > 0.015) { rot = true; h.push(`Plusstunden Liste ${f(n(d.plusstunden) ?? 0)} ≠ SP Data Ü-Std. ${f(ue)}`); }
    if (Math.abs((n(d.minusstunden) ?? 0) - Math.abs(Math.min(fl, 0))) > 0.015 && Math.abs((n(d.minusstunden) ?? 0) - Math.abs(fl)) > 0.015) { rot = true; h.push(`Minusstunden Liste ${f(n(d.minusstunden) ?? 0)} ≠ SP Data Flexi ${f(fl)}`); }
  }
  if (d && d.plusstunden != null && d.auszahlung_std != null) {
    const soll = (n(d.plusstunden) ?? 0) - (n(d.minusstunden) ?? 0);
    if (Math.abs(soll - (n(d.auszahlung_std) ?? 0)) > 0.015) { gelb = true; h.push(`Auszahlung ${f(n(d.auszahlung_std) ?? 0)} ≠ Plus − Minus ${f(soll)}`); }
  }
  // Soll SP Data gegen Arbeitszeitmodell (mit bzw. ohne Feiertage)
  if (sp && z.modell && sp.soll != null) {
    const ss = Number(sp.soll);
    if (Math.abs(ss - z.modell.brutto) > 0.02 && Math.abs(ss - z.modell.netto) > 0.02) {
      gelb = true; h.push(`Soll SP Data ${f(ss)} ≠ Arbeitszeitmodell ${f(z.modell.netto)}${z.modell.feiertagH ? ` (+ ${f(z.modell.feiertagH)} Feiertag)` : ''} – Modell Mo–Do ${f(z.modell.moDo)} / Fr ${f(z.modell.fr)} prüfen`);
    }
  }
  // Saldo Ist − Soll muss Ü-Std. + Flexi ergeben
  if (sp && sp.ist != null && sp.soll != null && (sp.ue_std != null || sp.flexi != null)) {
    const saldo = Number(sp.ist) - Number(sp.soll), kto = (n(sp.ue_std) ?? 0) + (n(sp.flexi) ?? 0);
    if (Math.abs(saldo - kto) > 0.02) { gelb = true; h.push(`Saldo Ist − Soll ${f(saldo)} ≠ Ü-Std. + Flexi ${f(kto)}`); }
  }
  // Pausenregel je Tag (0,5 h ab > 6 h, + 0,25 h bei > 9 h Arbeitszeit)
  if (sp?.tage) {
    const abw: string[] = [];
    for (const t of sp.tage as SpTag[]) {
      if (t.ges == null || t.ist == null || (n(t.krank) ?? 0) > 0 || (n(t.urlaub) ?? 0) > 0) continue;
      const soll = Number(t.ges) - pauseRegel(t.ges);
      if (Math.abs(soll - Number(t.ist)) > 0.02) abw.push(`${t.datum.slice(8, 10)}.${t.datum.slice(5, 7)}. (Ges. ${f(Number(t.ges))}, Ist ${f(Number(t.ist))}, nach Pausenregel ${f(soll)})`);
    }
    if (abw.length) { gelb = true; h.push(`Pause weicht von der Regel ab: ${abw.slice(0, 4).join(', ')}${abw.length > 4 ? ` … (+${abw.length - 4})` : ''}`); }
  }
  if (z.ohneBuchung) { h.push('bucht nicht im WIDI-System – Stundenvergleich entfällt'); }
  else if (z.anwesend != null) {
    if (z.widiH > z.anwesend + 0.5) { rot = true; h.push(`im WIDI-System ${f(z.widiH - z.anwesend)} h mehr gebucht als anwesend`); }
    else if (z.anwesend > 0 && z.quote != null && z.quote < 0.7) { gelb = true; h.push(`${f(z.anwesend - z.widiH)} h anwesend, aber nicht im WIDI-System gebucht`); }
  }
  // Tagesabgleich: Krank/Urlaub mit Buchungen im WIDI-System
  if (sp?.tage && !z.ohneBuchung) {
    const konflikt: string[] = [];
    for (const t of sp.tage as SpTag[]) {
      const abw = (n(t.krank) ?? 0) > 0 || (n(t.urlaub) ?? 0) > 0 || /krank|urlaub/i.test(t.grund || '');
      if (abw && (z.widiTage[t.datum] ?? 0) > 0) konflikt.push(`${t.datum.slice(8, 10)}.${t.datum.slice(5, 7)}. (${t.grund || ((n(t.krank) ?? 0) > 0 ? 'Krank' : 'Urlaub')}, ${f(z.widiTage[t.datum])} h gebucht)`);
    }
    if (konflikt.length) { rot = true; h.push(`Buchungen an Abwesenheitstagen: ${konflikt.join(', ')}`); }
  }
  const ampel = rot ? 'rot' : gelb ? 'gelb' : (!sp || !d || d.plusstunden == null) ? 'grau' : 'grün';
  return { ...z, ampel, hinweise: h };
}

// ── Arbeitszeitmodell, Feiertage NRW, Pausenregel (alle Werte in Zeitminuten = Industriestunden, 0,25 = 15 Min.) ──
export const hhmm = (h: number | null | undefined) => {
  if (h == null || isNaN(Number(h))) return '';
  const neg = h < 0; const m = Math.round(Math.abs(h) * 60);
  return `${neg ? '−' : ''}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h:min`;
};

function ostersonntag(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, monat - 1, tag));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusTage = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// Gesetzliche Feiertage Nordrhein-Westfalen
export function feiertageNRW(y: number): Record<string, string> {
  const o = ostersonntag(y);
  return {
    [`${y}-01-01`]: 'Neujahr', [iso(plusTage(o, -2))]: 'Karfreitag', [iso(plusTage(o, 1))]: 'Ostermontag', [`${y}-05-01`]: 'Tag der Arbeit',
    [iso(plusTage(o, 39))]: 'Christi Himmelfahrt', [iso(plusTage(o, 50))]: 'Pfingstmontag', [iso(plusTage(o, 60))]: 'Fronleichnam',
    [`${y}-10-03`]: 'Tag der Deutschen Einheit', [`${y}-11-01`]: 'Allerheiligen', [`${y}-12-25`]: '1. Weihnachtstag', [`${y}-12-26`]: '2. Weihnachtstag',
  };
}

export interface SollTag { datum: string; wt: string; soll: number; feiertag?: string }
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// Soll laut Arbeitszeitmodell (Mo–Do / Fr), Feiertage getrennt ausgewiesen
export function sollModell(monat: string, moDo = 8, fr = 7): { brutto: number; feiertagH: number; netto: number; tage: SollTag[]; feiertage: SollTag[] } {
  const [y, m] = monat.split('-').map(Number);
  const ft = feiertageNRW(y);
  const tage: SollTag[] = [];
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const dt = new Date(Date.UTC(y, m - 1, d)); const w = dt.getUTCDay();
    if (w === 0 || w === 6) continue;
    tage.push({ datum: iso(dt), wt: WT[w], soll: w === 5 ? fr : moDo, feiertag: ft[iso(dt)] });
  }
  const brutto = tage.reduce((s, t) => s + t.soll, 0);
  const feiertage = tage.filter(t => t.feiertag);
  const feiertagH = feiertage.reduce((s, t) => s + t.soll, 0);
  return { brutto, feiertagH, netto: brutto - feiertagH, tage, feiertage };
}

// Pausenregel SP Data: ab mehr als 6 h Anwesenheit 0,5 h; bei mehr als 9 h Arbeitszeit zusätzlich 0,25 h
export function pauseRegel(ges: number | null | undefined): number {
  const g = Number(ges || 0);
  if (g <= 6) return 0;
  return g - 0.5 > 9 ? 0.75 : 0.5;
}
