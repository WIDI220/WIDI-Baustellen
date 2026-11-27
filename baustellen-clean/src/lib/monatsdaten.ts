// Hilfsfunktionen für die Kachel „Monatsdaten“
import * as XLSX from 'xlsx';
import { db } from '@/lib/md-db';

// Nur Technik: Sammelrechnungen werden ausschließlich für diese Kostenstellen gespeichert und ausgewertet
export const ZIEL_KST = ['244801', '244802', '244803'];
export const KST_NAME: Record<string, string> = {
  '244800': 'Material', '244801': 'Elektro / Prüfungen', '244802': 'Sanitär / Hygiene', '244803': 'Hochbau / Instandhaltung',
};
export const RX_ANR = /A2\d-\d{5}/;

export function monatGrenzen(monat: string) {
  const [y, m] = monat.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { von: `${monat}-01`, bis: `${monat}-${String(last).padStart(2, '0')}`, label: new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' }) };
}

export function vormonat(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonat(monat: string, delta: number): string {
  const [y, m] = monat.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const eur = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '–' : Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const zahl = (n: number | null | undefined, d = 2) =>
  n == null || isNaN(Number(n)) ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: d });

// „1.234,56“, „1234.56“, 1234.56 → number | null
export function parseZahl(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[€\s]/g, '').replace(/h$/i, '');
  if (s === '' || s === '-' || s === '–') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// TT.MM.JJJJ → JJJJ-MM-TT
export function deDatumZuIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Alle Zeilen holen (Supabase liefert je Abfrage höchstens 1000)
export async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await build(from, from + step - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < step) break;
  }
  return out;
}

// Namen vergleichen: „Müller, Hans“ = „Hans Müller“ = „hans  müller“
export function nameKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-zäöüß ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

// Excel einlesen → Zeilen als Arrays
export async function leseExcel(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

// Kopfzeile suchen und Spalten anhand von Mustern zuordnen
export function findeSpalten(rows: unknown[][], muster: Record<string, RegExp>, pflicht: string): { header: number; spalten: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r] || [];
    const spalten: Record<string, number> = {};
    row.forEach((c, i) => {
      const t = String(c ?? '').trim();
      if (!t) return;
      for (const [k, re] of Object.entries(muster)) if (spalten[k] === undefined && re.test(t)) { spalten[k] = i; break; }
    });
    if (spalten[pflicht] !== undefined) return { header: r, spalten };
  }
  return null;
}

export function downloadExcel(dateiname: string, blatt: string, rows: (string | number | null)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 0 ? 28 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws, blatt);
  XLSX.writeFile(wb, dateiname);
}

export async function logUpload(monat: string | null, art: string, dateiname: string, zeilen: number, email?: string) {
  await db().from('md_uploads').insert({ monat, art, dateiname, zeilen, user_email: email ?? null });
}

// Gültigen Satz (Verrechnung/Kosten) für Team und Monat
export function satzFuer(saetze: any[], art: 'verrechnung' | 'kosten', team: string | null, monat: string): number | null {
  const bis = monatGrenzen(monat).bis;
  const passend = saetze
    .filter(s => s.art === art && s.gueltig_ab <= bis && (s.team === (team || 'alle') || s.team === 'alle'))
    .sort((a, b) => (a.team === 'alle' ? 1 : 0) - (b.team === 'alle' ? 1 : 0) || (a.gueltig_ab < b.gueltig_ab ? 1 : -1));
  return passend.length ? Number(passend[0].satz) : null;
}

// ── PDF-Listen (Lohnauswertung, AG-Liste) ─────────────────────────────────────
// Zahl-Token im deutschen Format: 12  12,5  1.234,56  -3,25
const RX_ZAHL = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

export interface MaPdfTreffer { employee_id: string; name: string; werte: { ueberstunden?: number; sonntag_stunden?: number; sonntag_zulage_eur?: number; bezahlte_stunden?: number }; zeile: string }

// Liest Zeilen einer Lohn-/Zeitauswertung: Zeile mit Mitarbeitername → Zahlen in der Reihenfolge der Kopfzeile
export function maAusPdfZeilen(lines: string[], employees: { id: string; name: string; kuerzel?: string | null }[]): { treffer: MaPdfTreffer[]; reihenfolge: string[] } {
  type K = 'ueberstunden' | 'sonntag_stunden' | 'sonntag_zulage_eur' | 'bezahlte_stunden';
  const kw: [K, RegExp][] = [
    ['ueberstunden', /(ü|ue)berstund|mehrarbeit|ü-?std/i],
    ['sonntag_zulage_eur', /sonntag\S*\s*(zulage|zuschlag)|zulage|zuschlag|€|eur\b/i],
    ['sonntag_stunden', /sonntag\S*\s*(std|stund|\(h\))|so\.?-?std/i],
    ['bezahlte_stunden', /bezahlt|ist-?std|ist-?stunden|anwesen|gesamtstunden/i],
  ];
  let reihenfolge: K[] = ['ueberstunden', 'sonntag_stunden', 'sonntag_zulage_eur'];
  const kopf = lines.find(l => /(ü|ue)berstund|sonntag|mehrarbeit/i.test(l));
  if (kopf) {
    const spalten = kopf.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    const r: K[] = [];
    for (const sp of spalten) {
      for (const [k, re] of kw) if (re.test(sp) && !r.includes(k)) { r.push(k); break; }
    }
    if (r.length) reihenfolge = r;
  }
  const keys = employees.map(e => ({ e, toks: nameKey(e.name).split(' ').filter(t => t.length > 1), kz: (e.kuerzel || '').toLowerCase() }));
  const treffer: MaPdfTreffer[] = [];
  const gesehen = new Set<string>();
  for (const l of lines) {
    const low = ' ' + l.toLowerCase().replace(/[^a-zäöüß0-9,.\- ]/g, ' ') + ' ';
    const m = keys.find(k => !gesehen.has(k.e.id) && k.toks.length > 0 && k.toks.every(t => low.includes(' ' + t + ' ') || low.includes(' ' + t + ',')));
    if (!m) continue;
    // Zahlen nach dem letzten Namensteil
    const lastPos = Math.max(...m.toks.map(t => low.lastIndexOf(t) + t.length));
    const rest = low.slice(lastPos).split(/\s+/).map(s => s.replace(/[€h]$/i, '')).filter(s => RX_ZAHL.test(s));
    if (!rest.length) continue;
    const werte: MaPdfTreffer['werte'] = {};
    reihenfolge.forEach((k, i) => { if (rest[i] != null) werte[k] = parseZahl(rest[i]) ?? undefined; });
    treffer.push({ employee_id: m.e.id, name: m.e.name, werte, zeile: l.trim() });
    gesehen.add(m.e.id);
  }
  return { treffer, reihenfolge };
}

export interface AgPdfZeile { a_nummer: string; beschreibung: string | null; status_ag: string | null; auftragssumme: number | null; verbucht: number | null; kommentar: string | null }

// AG-Liste als PDF: je Zeile mit A-Nr. → Status, Beträge (1. = Auftragssumme, 2. = verbucht), Rest = Beschreibung
export function agAusPdfZeilen(lines: string[]): AgPdfZeile[] {
  const STATUS = /(In Arbeit|Offen|Übertragen|Erledigt|Abgeschlossen|Storniert|Widi-Leistungsschein beanstandet|beanstandet|Neu|Freigegeben)/i;
  const out: AgPdfZeile[] = []; const seen = new Set<string>();
  for (const l of lines) {
    const m = /A2\d-\d{5}/.exec(l.toUpperCase());
    if (!m || seen.has(m[0])) continue;
    seen.add(m[0]);
    const rest = l.slice(l.toUpperCase().indexOf(m[0]) + m[0].length);
    const st = STATUS.exec(rest);
    const betraege = (rest.match(/-?\d{1,3}(\.\d{3})*,\d{2}(?!\d)/g) || []).map(x => parseZahl(x));
    let beschr = rest.replace(STATUS, ' ').replace(/-?\d{1,3}(\.\d{3})*,\d{2}(?!\d)/g, ' ').replace(/\d{2}\.\d{2}\.\d{4}/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (beschr.length > 300) beschr = beschr.slice(0, 300);
    out.push({ a_nummer: m[0], beschreibung: beschr || null, status_ag: st ? st[1] : null, auftragssumme: betraege[0] ?? null, verbucht: betraege[1] ?? null, kommentar: null });
  }
  return out;
}
