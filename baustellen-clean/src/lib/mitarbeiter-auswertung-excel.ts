// Excel-Export für die Mitarbeiter-Auswertung (alle Mitarbeiter oder ein einzelner)
// Blätter:
//   1. Übersicht       – je Mitarbeiter: Stunden nach Bereich, Gesamt, Kosten, Urlaub/Krank (Formeln)
//   2. Buchungen       – jede einzelne Buchung des Monats (echte Datums-/Zahlenwerte, Filter)
//   3. Pro Tag         – jeder Kalendertag des Monats nach Bereich (Formeln)
//   4. Abwesenheiten   – Urlaub / Krank
//   5. Verlauf         – Stunden je Monat nach Bereich
// Übersicht und Pro Tag rechnen per SUMMEWENNS auf "Buchungen": Änderungen dort rechnen automatisch mit.
import * as XLSX from 'xlsx';

export const BEREICHE = ['Tickets', 'Baustellen', 'Begehungen', 'Intern', 'DGUV'] as const;
export type Bereich = typeof BEREICHE[number];

export interface MAExport { id: string; name: string; kuerzel?: string | null; gewerk?: string | null; satz: number }
export interface BuchungExport { datum: string; maId: string; bereich: Bereich; stunden: number; bezug?: string | null; beschreibung?: string | null }
export interface AbwesenheitExport { datum: string; maId: string; typ: string }
export interface VerlaufExport { ym: string; werte: Record<Bereich, number> }

export interface MAWorkbookInput {
  monatLabel: string;            // z. B. "Oktober 2026"
  ym: string;                    // 'YYYY-MM'
  auswahlLabel: string;          // "Alle Mitarbeiter" oder Name
  mitarbeiter: MAExport[];       // bereits auf die Auswahl gefiltert
  buchungen: BuchungExport[];
  abwesenheiten: AbwesenheitExport[];
  verlauf: VerlaufExport[];
}

const DATUM_FMT = 'DD.MM.YYYY';
const STD_FMT = '#,##0.00';
const EUR_FMT = '#,##0.00 "€"';
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function excelDatum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}
function spalte(i: number): string {
  let s = ''; i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
const einzeilig = (t?: string | null) => String(t ?? '').split(/\s*\n+\s*/).map(x => x.trim()).filter(Boolean).join(' · ');
const rund2 = (n: number) => Math.round(n * 100) / 100;

export function buildMitarbeiterWorkbook(inp: MAWorkbookInput): XLSX.WorkBook {
  const maById = new Map(inp.mitarbeiter.map(m => [m.id, m]));
  const name = (id: string) => maById.get(id)?.name ?? '(unbekannt)';

  // ── Buchungen (Basis für alle Formeln) ──  A Datum | B Mitarbeiter | C Kürzel | D Bereich | E Stunden | F Bezug | G Beschreibung
  const buch = inp.buchungen
    .filter(b => b.datum && maById.has(b.maId))
    .map(b => ({ ...b, stunden: Number(b.stunden) || 0 }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || name(a.maId).localeCompare(name(b.maId), 'de') || BEREICHE.indexOf(a.bereich) - BEREICHE.indexOf(b.bereich));
  const wsB = XLSX.utils.aoa_to_sheet([
    ['Datum', 'Mitarbeiter', 'Kürzel', 'Bereich', 'Stunden', 'Bezug', 'Beschreibung'],
    ...buch.map(b => [excelDatum(b.datum), name(b.maId), maById.get(b.maId)?.kuerzel ?? '', b.bereich, b.stunden, einzeilig(b.bezug), einzeilig(b.beschreibung)]),
  ]);
  const nB = buch.length, letzteB = nB + 1;
  for (let r = 2; r <= letzteB; r++) { wsB[`A${r}`].z = DATUM_FMT; wsB[`E${r}`].z = STD_FMT; }
  const summeB = letzteB + 2;
  const gesamtStd = buch.reduce((s, b) => s + b.stunden, 0);
  wsB[`A${summeB}`] = { t: 's', v: 'Gesamt (gefiltert)' };
  wsB[`E${summeB}`] = nB ? { t: 'n', f: `SUBTOTAL(9,E2:E${letzteB})`, v: rund2(gesamtStd), z: STD_FMT } : { t: 'n', v: 0, z: STD_FMT };
  wsB['!ref'] = `A1:G${summeB}`;
  wsB['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 34 }, { wch: 60 }];
  if (nB) wsB['!autofilter'] = { ref: `A1:G${letzteB}` };

  const bis = Math.max(letzteB, 2) + 500;
  const rg = (c: string) => `'Buchungen'!$${c}$2:$${c}$${bis}`;

  // ── Abwesenheiten ──  A Datum | B Mitarbeiter | C Typ
  const abw = inp.abwesenheiten
    .filter(a => a.datum && maById.has(a.maId))
    .map(a => ({ ...a, typ: a.typ === 'krank' ? 'Krank' : a.typ === 'urlaub' ? 'Urlaub' : a.typ }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || name(a.maId).localeCompare(name(b.maId), 'de'));
  const wsA = XLSX.utils.aoa_to_sheet([['Datum', 'Mitarbeiter', 'Typ'], ...abw.map(a => [excelDatum(a.datum), name(a.maId), a.typ])]);
  for (let r = 2; r <= abw.length + 1; r++) wsA[`A${r}`].z = DATUM_FMT;
  wsA['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 10 }];
  if (abw.length) wsA['!autofilter'] = { ref: `A1:C${abw.length + 1}` };
  const bisA = abw.length + 1 + 200;
  const rgA = (c: string) => `'Abwesenheiten'!$${c}$2:$${c}$${bisA}`;

  // ── Übersicht ──  A Name | B Kürzel | C Gewerk | D..H Bereiche | I Gesamt | J Satz | K Kosten | L Urlaub | M Krank
  const kopfU = ['Mitarbeiter', 'Kürzel', 'Gewerk', ...BEREICHE, 'Gesamt', 'Stundensatz', 'Kosten', 'Urlaub-Tage', 'Krank-Tage'];
  const bCol = (j: number) => spalte(3 + j);                    // D..H
  const cGes = spalte(3 + BEREICHE.length);                      // I
  const cSatz = spalte(4 + BEREICHE.length);                     // J
  const cKost = spalte(5 + BEREICHE.length);                     // K
  const cUrl = spalte(6 + BEREICHE.length);                      // L
  const cKr = spalte(7 + BEREICHE.length);                       // M
  const stat = inp.mitarbeiter.map(m => {
    const meine = buch.filter(b => b.maId === m.id);
    const proB = Object.fromEntries(BEREICHE.map(be => [be, meine.filter(b => b.bereich === be).reduce((s, b) => s + b.stunden, 0)])) as Record<Bereich, number>;
    const ges = BEREICHE.reduce((s, be) => s + proB[be], 0);
    return { m, proB, ges,
      url: abw.filter(a => a.maId === m.id && a.typ === 'Urlaub').length,
      kr: abw.filter(a => a.maId === m.id && a.typ === 'Krank').length };
  }).sort((a, b) => b.ges - a.ges || a.m.name.localeCompare(b.m.name, 'de'));

  const wsU = XLSX.utils.aoa_to_sheet([
    [`Mitarbeiter-Auswertung ${inp.monatLabel} – ${inp.auswahlLabel}`], [],
    kopfU,
  ]);
  const kopfZeile = 3, ersteU = 4;
  stat.forEach((s, i) => {
    const r = ersteU + i;
    wsU[`A${r}`] = { t: 's', v: s.m.name };
    wsU[`B${r}`] = { t: 's', v: s.m.kuerzel ?? '' };
    wsU[`C${r}`] = { t: 's', v: s.m.gewerk ?? '' };
    BEREICHE.forEach((be, j) => {
      const c = bCol(j);
      wsU[`${c}${r}`] = { t: 'n', f: `SUMIFS(${rg('E')},${rg('B')},$A${r},${rg('D')},${c}$${kopfZeile})`, v: rund2(s.proB[be]), z: STD_FMT };
    });
    wsU[`${cGes}${r}`] = { t: 'n', f: `SUM(${bCol(0)}${r}:${bCol(BEREICHE.length - 1)}${r})`, v: rund2(s.ges), z: STD_FMT };
    wsU[`${cSatz}${r}`] = { t: 'n', v: s.m.satz, z: EUR_FMT };
    wsU[`${cKost}${r}`] = { t: 'n', f: `${cGes}${r}*${cSatz}${r}`, v: rund2(s.ges * s.m.satz), z: EUR_FMT };
    wsU[`${cUrl}${r}`] = { t: 'n', f: `COUNTIFS(${rgA('B')},$A${r},${rgA('C')},"Urlaub")`, v: s.url };
    wsU[`${cKr}${r}`] = { t: 'n', f: `COUNTIFS(${rgA('B')},$A${r},${rgA('C')},"Krank")`, v: s.kr };
  });
  const letzteU = ersteU + stat.length - 1;
  const summeU = letzteU + 2;
  wsU[`A${summeU}`] = { t: 's', v: 'Gesamt' };
  const summenSpalten: [string, number, string | undefined][] = [
    ...BEREICHE.map((be, j) => [bCol(j), stat.reduce((s, x) => s + x.proB[be], 0), STD_FMT] as [string, number, string]),
    [cGes, stat.reduce((s, x) => s + x.ges, 0), STD_FMT],
    [cKost, stat.reduce((s, x) => s + x.ges * x.m.satz, 0), EUR_FMT],
    [cUrl, stat.reduce((s, x) => s + x.url, 0), undefined],
    [cKr, stat.reduce((s, x) => s + x.kr, 0), undefined],
  ];
  for (const [c, wert, fmt] of summenSpalten) {
    wsU[`${c}${summeU}`] = stat.length
      ? { t: 'n', f: `SUM(${c}${ersteU}:${c}${letzteU})`, v: rund2(wert), ...(fmt ? { z: fmt } : {}) }
      : { t: 'n', v: 0 };
  }
  wsU['!ref'] = `A1:${cKr}${summeU}`;
  wsU['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 10 }, ...BEREICHE.map(() => ({ wch: 11 })), { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 10 }];
  if (stat.length) wsU['!autofilter'] = { ref: `A${kopfZeile}:${cKr}${letzteU}` };

  // ── Pro Tag ──  jeder Kalendertag; A Datum | B Wochentag | C..G Bereiche | H Gesamt | I Abwesenheit (nur Einzelperson)
  const [jy, jm] = inp.ym.split('-').map(Number);
  const tageImMonat = new Date(jy, jm, 0).getDate();
  const einzel = inp.mitarbeiter.length === 1;
  const kopfT = ['Datum', 'Wochentag', ...BEREICHE, 'Gesamt', ...(einzel ? ['Abwesenheit'] : [])];
  const wsT = XLSX.utils.aoa_to_sheet([kopfT]);
  const tCol = (j: number) => spalte(2 + j);                     // C..G
  const tGes = spalte(2 + BEREICHE.length);                      // H
  for (let d = 1; d <= tageImMonat; d++) {
    const r = d + 1;
    const iso = `${inp.ym}-${String(d).padStart(2, '0')}`;
    const tagBuch = buch.filter(b => b.datum.slice(0, 10) === iso);
    wsT[`A${r}`] = { t: 'n', v: excelDatum(iso), z: DATUM_FMT };
    wsT[`B${r}`] = { t: 's', v: WOCHENTAGE[new Date(jy, jm - 1, d).getDay()] };
    BEREICHE.forEach((be, j) => {
      const c = tCol(j);
      wsT[`${c}${r}`] = { t: 'n', f: `SUMIFS(${rg('E')},${rg('A')},$A${r},${rg('D')},${c}$1)`, v: rund2(tagBuch.filter(b => b.bereich === be).reduce((s, b) => s + b.stunden, 0)), z: STD_FMT };
    });
    wsT[`${tGes}${r}`] = { t: 'n', f: `SUM(${tCol(0)}${r}:${tCol(BEREICHE.length - 1)}${r})`, v: rund2(tagBuch.reduce((s, b) => s + b.stunden, 0)), z: STD_FMT };
    if (einzel) {
      const a = abw.find(x => x.datum.slice(0, 10) === iso);
      wsT[`${spalte(3 + BEREICHE.length)}${r}`] = { t: 's', v: a?.typ ?? '' };
    }
  }
  const summeT = tageImMonat + 3;
  wsT[`A${summeT}`] = { t: 's', v: 'Gesamt' };
  [...BEREICHE.map((_, j) => tCol(j)), tGes].forEach((c, j) => {
    const wert = j < BEREICHE.length ? buch.filter(b => b.bereich === BEREICHE[j]).reduce((s, b) => s + b.stunden, 0) : gesamtStd;
    wsT[`${c}${summeT}`] = { t: 'n', f: `SUM(${c}2:${c}${tageImMonat + 1})`, v: rund2(wert), z: STD_FMT };
  });
  wsT['!ref'] = `A1:${spalte(kopfT.length - 1)}${summeT}`;
  wsT['!cols'] = [{ wch: 12 }, { wch: 12 }, ...BEREICHE.map(() => ({ wch: 11 })), { wch: 10 }, ...(einzel ? [{ wch: 12 }] : [])];

  // ── Verlauf ──  A Monat | B..F Bereiche | G Gesamt
  const verlauf = [...inp.verlauf].sort((a, b) => a.ym.localeCompare(b.ym));
  const wsV = XLSX.utils.aoa_to_sheet([['Monat', ...BEREICHE, 'Gesamt']]);
  verlauf.forEach((v, i) => {
    const r = i + 2;
    const [vy, vm] = v.ym.split('-').map(Number);
    wsV[`A${r}`] = { t: 's', v: `${MONATE[vm - 1]} ${vy}` };
    BEREICHE.forEach((be, j) => { wsV[`${spalte(1 + j)}${r}`] = { t: 'n', v: rund2(v.werte[be] ?? 0), z: STD_FMT }; });
    wsV[`${spalte(1 + BEREICHE.length)}${r}`] = { t: 'n', f: `SUM(B${r}:${spalte(BEREICHE.length)}${r})`, v: rund2(BEREICHE.reduce((s, be) => s + (v.werte[be] ?? 0), 0)), z: STD_FMT };
  });
  wsV['!ref'] = `A1:${spalte(1 + BEREICHE.length)}${Math.max(verlauf.length + 1, 1)}`;
  wsV['!cols'] = [{ wch: 16 }, ...BEREICHE.map(() => ({ wch: 11 })), { wch: 10 }];

  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Mitarbeiter-Auswertung ${inp.monatLabel} – ${inp.auswahlLabel}`, Author: 'WIDI Controlling' };
  XLSX.utils.book_append_sheet(wb, wsU, 'Übersicht');
  XLSX.utils.book_append_sheet(wb, wsB, 'Buchungen');
  XLSX.utils.book_append_sheet(wb, wsT, 'Pro Tag');
  XLSX.utils.book_append_sheet(wb, wsA, 'Abwesenheiten');
  XLSX.utils.book_append_sheet(wb, wsV, 'Verlauf');
  return wb;
}

export function dateinameMA(ym: string, auswahlLabel: string) {
  const sauber = auswahlLabel.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Mitarbeiter_Auswertung_${ym}_${sauber}.xlsx`;
}

export function exportMitarbeiterExcel(inp: MAWorkbookInput) {
  XLSX.writeFile(buildMitarbeiterWorkbook(inp), dateinameMA(inp.ym, inp.auswahlLabel));
}
