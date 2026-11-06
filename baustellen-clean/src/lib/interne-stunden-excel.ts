// Excel-Export für "Interne Stunden"
// Erzeugt eine bearbeitbare .xlsx mit drei Blättern:
//   1. Einträge         – alle Einzelbuchungen (echte Datums- und Zahlenwerte, Filter, Summe als Formel)
//   2. Pro Mitarbeiter  – Stunden je Mitarbeiter und Kategorie (SUMMEWENNS-Formeln auf "Einträge")
//   3. Pro Tag          – Stunden je Tag (SUMMEWENN-Formeln auf "Einträge")
// Die Summen sind Formeln: Ändert man in "Einträge" Stunden, Mitarbeiter oder Kategorie,
// rechnen die anderen Blätter in Excel automatisch neu.
import * as XLSX from 'xlsx';

export interface InterneStundeExport {
  datum: string;                 // 'YYYY-MM-DD'
  stunden: number | string | null;
  beschreibung?: string | null;
  employees?: { name?: string | null; kuerzel?: string | null } | null;
}

const DATUM_FMT = 'DD.MM.YYYY';
const STD_FMT = '#,##0.00';
const OHNE_KAT = 'Ohne Kategorie';

// 'YYYY-MM-DD' -> Excel-Seriennummer (echtes Datum, sortier- und filterbar)
function excelDatum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

// Spaltenbuchstabe aus 0-basiertem Index (0 -> A, 26 -> AA)
function spalte(i: number): string {
  let s = ''; i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// Die Zeiterfassungs-App schreibt "Kategorie – Text" in die Beschreibung → aufteilen
export function teileBeschreibung(b?: string | null): { kategorie: string; text: string } {
  const roh = (b ?? '').trim();
  const m = roh.match(/^([^\n–]{1,30}?)\s+–\s*([\s\S]*)$/);
  // Zeilenumbrüche aus der App zu einer Zeile zusammenfassen, damit die Excel-Zeilen kompakt bleiben
  const einzeilig = (t: string) => t.split(/\s*\n+\s*/).map(x => x.trim()).filter(Boolean).join(' · ');
  if (m) return { kategorie: m[1].trim(), text: einzeilig(m[2]) };
  return { kategorie: OHNE_KAT, text: einzeilig(roh) };
}

export function buildInterneStundenWorkbook(eintraege: InterneStundeExport[], zeitraumLabel: string): XLSX.WorkBook {
  const rows = [...eintraege]
    .filter(e => e && e.datum)
    .map(e => ({
      ...e,
      ...teileBeschreibung(e.beschreibung),
      std: Number(e.stunden ?? 0) || 0,
      employees: { name: e.employees?.name || '(ohne Mitarbeiter)', kuerzel: e.employees?.kuerzel || '' },
    }))
    .sort((a, b) =>
      a.datum.localeCompare(b.datum) ||
      String(a.employees?.name ?? '').localeCompare(String(b.employees?.name ?? ''), 'de'));
  const gesamt = rows.reduce((s, e) => s + e.std, 0);

  // ── Blatt 1: Einträge ──  A Datum | B Mitarbeiter | C Kürzel | D Kategorie | E Stunden | F Beschreibung
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Datum', 'Mitarbeiter', 'Kürzel', 'Kategorie', 'Stunden', 'Beschreibung'],
    ...rows.map(e => [excelDatum(e.datum), e.employees?.name ?? '', e.employees?.kuerzel ?? '', e.kategorie, e.std, e.text]),
  ]);
  const n = rows.length, erste = 2, letzte = n + 1;
  for (let r = erste; r <= letzte; r++) {
    ws1[`A${r}`].z = DATUM_FMT;
    ws1[`E${r}`].z = STD_FMT;
  }
  const summe1 = letzte + 2;
  ws1[`A${summe1}`] = { t: 's', v: 'Gesamt (gefiltert)' };
  ws1[`E${summe1}`] = n > 0
    ? { t: 'n', f: `SUBTOTAL(9,E${erste}:E${letzte})`, v: gesamt, z: STD_FMT }
    : { t: 'n', v: 0, z: STD_FMT };
  ws1['!ref'] = `A1:F${summe1}`;
  ws1['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 70 }];
  if (n > 0) ws1['!autofilter'] = { ref: `A1:F${letzte}` };

  // Formel-Bereiche auf "Einträge" (großzügig, damit neu eingefügte Zeilen mitzählen)
  const bis = Math.max(letzte, 2) + 500;
  const rg = (c: string) => `'Einträge'!$${c}$2:$${c}$${bis}`;

  // ── Blatt 2: Pro Mitarbeiter × Kategorie ──
  const kategorien = [...new Set(rows.map(e => e.kategorie))]
    .sort((a, b) => (a === OHNE_KAT ? 1 : b === OHNE_KAT ? -1 : a.localeCompare(b, 'de')));
  const ma = new Map<string, { name: string; kuerzel: string; std: number; anz: number; kat: Record<string, number> }>();
  for (const e of rows) {
    const name = e.employees?.name ?? '';
    const cur = ma.get(name) ?? { name, kuerzel: e.employees?.kuerzel ?? '', std: 0, anz: 0, kat: {} };
    cur.std += e.std; cur.anz += 1; cur.kat[e.kategorie] = (cur.kat[e.kategorie] ?? 0) + e.std;
    ma.set(name, cur);
  }
  const maListe = [...ma.values()].sort((a, b) => b.std - a.std);
  const k0 = 2;                               // erste Kategorie-Spalte (C)
  const cGes = spalte(k0 + kategorien.length); // Gesamt
  const cAnz = spalte(k0 + kategorien.length + 1); // Anzahl Einträge
  const ws2 = XLSX.utils.aoa_to_sheet([['Mitarbeiter', 'Kürzel', ...kategorien, 'Gesamt', 'Einträge']]);
  maListe.forEach((m, i) => {
    const r = i + 2;
    ws2[`A${r}`] = { t: 's', v: m.name };
    ws2[`B${r}`] = { t: 's', v: m.kuerzel };
    kategorien.forEach((k, j) => {
      const c = spalte(k0 + j);
      ws2[`${c}${r}`] = { t: 'n', f: `SUMIFS(${rg('E')},${rg('B')},$A${r},${rg('D')},${c}$1)`, v: m.kat[k] ?? 0, z: STD_FMT };
    });
    ws2[`${cGes}${r}`] = { t: 'n', f: `SUMIF(${rg('B')},$A${r},${rg('E')})`, v: m.std, z: STD_FMT };
    ws2[`${cAnz}${r}`] = { t: 'n', f: `COUNTIF(${rg('B')},$A${r})`, v: m.anz };
  });
  const summe2 = maListe.length + 3;
  ws2[`A${summe2}`] = { t: 's', v: 'Gesamt' };
  const letzteMA = maListe.length + 1;
  [...kategorien.map((_, j) => spalte(k0 + j)), cGes, cAnz].forEach((c, j) => {
    const istAnz = c === cAnz;
    const wert = istAnz ? rows.length
      : c === cGes ? gesamt
      : rows.filter(e => e.kategorie === kategorien[j]).reduce((s, e) => s + e.std, 0);
    ws2[`${c}${summe2}`] = maListe.length
      ? { t: 'n', f: `SUM(${c}2:${c}${letzteMA})`, v: wert, ...(istAnz ? {} : { z: STD_FMT }) }
      : { t: 'n', v: 0 };
  });
  ws2['!ref'] = `A1:${cAnz}${summe2}`;
  ws2['!cols'] = [{ wch: 24 }, { wch: 8 }, ...kategorien.map(k => ({ wch: Math.max(10, k.length + 2) })), { wch: 10 }, { wch: 10 }];

  // ── Blatt 3: Pro Tag ──
  const proTag = new Map<string, number>();
  for (const e of rows) { const d = e.datum.slice(0, 10); proTag.set(d, (proTag.get(d) ?? 0) + e.std); }
  const tage = [...proTag.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const ws3 = XLSX.utils.aoa_to_sheet([['Datum', 'Wochentag', 'Stunden']]);
  tage.forEach(([iso, std], i) => {
    const r = i + 2;
    ws3[`A${r}`] = { t: 'n', v: excelDatum(iso), z: DATUM_FMT };
    ws3[`B${r}`] = { t: 's', v: new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long' }) };
    ws3[`C${r}`] = { t: 'n', f: `SUMIF(${rg('A')},A${r},${rg('E')})`, v: std, z: STD_FMT };
  });
  const summe3 = tage.length + 3;
  ws3[`A${summe3}`] = { t: 's', v: 'Gesamt' };
  ws3[`C${summe3}`] = tage.length
    ? { t: 'n', f: `SUM(C2:C${tage.length + 1})`, v: gesamt, z: STD_FMT }
    : { t: 'n', v: 0, z: STD_FMT };
  ws3['!ref'] = `A1:C${summe3}`;
  ws3['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Interne Stunden ${zeitraumLabel}`, Author: 'WIDI Controlling' };
  XLSX.utils.book_append_sheet(wb, ws1, 'Einträge');
  XLSX.utils.book_append_sheet(wb, ws2, 'Pro Mitarbeiter');
  XLSX.utils.book_append_sheet(wb, ws3, 'Pro Tag');
  return wb;
}

export function exportInterneStundenExcel(eintraege: InterneStundeExport[], zeitraumLabel: string, dateiZeitraum: string) {
  const wb = buildInterneStundenWorkbook(eintraege, zeitraumLabel);
  XLSX.writeFile(wb, `Interne_Stunden_${dateiZeitraum}.xlsx`);
}
