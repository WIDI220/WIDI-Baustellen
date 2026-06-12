// abnahmeschein-excel.ts
// Generiert Abnahmeschein als .xlsx — identisch zum Original, voll bearbeitbar
// Browser-Download via Blob URL (kein XLSX.writeFile das im Browser scheitern kann)

import * as XLSX from 'xlsx';

export interface AbnahmescheinDaten {
  aNummer:        string;   // z.B. "A26-09123"
  proj:           string;   // Projektbezeichnung / Leistungsbeschreibung
  leistungseinheit: string; // z.B. "Std." oder "Pauschale"
  menge:          string;   // z.B. "8.5"
  ausgefuehrtAm:  string;   // z.B. "02.06.2026"
  ausgefuehrtVon: string;   // Kommaseparierte Mitarbeiter
}

export function exportAbnahmescheinExcel(d: AbnahmescheinDaten): void {
  const wb = XLSX.utils.book_new();

  // 55 Zeilen, 4 Spalten — alles null initialisieren
  const aoa: (string | number | null)[][] =
    Array.from({ length: 55 }, () => Array(4).fill(null));

  // ── Statische Inhalte (exakt wie Original) ──────────────────────────────
  aoa[2][0]  = 'Abnahmeschein Sonderdienstleistung'; // A3
  aoa[4][0]  = 'Kunde:';                              // A5
  aoa[4][1]  = 'Märkische Kliniken GmbH - Hellersen'; // B5
  aoa[5][1]  = 'Paulmannshöher Str. 14';              // B6
  aoa[6][1]  = '58515 Lüdenscheid';                   // B7
  aoa[7][0]  = 'Proj:';                               // A8
  aoa[8][0]  = 'KST:';                                // A9
  aoa[8][1]  = 900120;                                // B9
  aoa[11][2] = 'Leistungseinheit';                    // C12
  aoa[11][3] = 'Menge';                               // D12

  // ── Dynamische Inhalte ───────────────────────────────────────────────────
  aoa[7][1]  = d.proj;                                // B8  Projekt
  aoa[12][0] = d.aNummer;                             // A13 A-Nummer
  aoa[12][2] = d.leistungseinheit;                    // C13 Leistungseinheit
  aoa[12][3] = d.menge;                               // D13 Menge
  aoa[18][0] = `Ausgeführt am: ${d.ausgefuehrtAm}`;  // A19
  aoa[21][0] = `Ausgeführt von: ${d.ausgefuehrtVon}`; // A22
  aoa[24][0] = 'Unterschrift Kunde:_______________________________________'; // A25
  aoa[30][0] = 'Bitte vor Unterschrift prüfen, Reklamationen können nur bis zu 24 Stunden nach Beendigung der'; // A31
  aoa[31][0] = 'Durchführung entgegen genommen werden.'; // A32
  aoa[50][2] = 'Geprüft:__________________';          // C51

  // ── Worksheet ───────────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!ref'] = 'A1:D55';

  // ── Spaltenbreiten (exakt wie Original) ─────────────────────────────────
  ws['!cols'] = [
    { wch: 14 },  // A
    { wch: 62 },  // B
    { wch: 22 },  // C
    { wch: 14 },  // D
  ];

  // ── Zeilenhöhen (exakt wie Original) ────────────────────────────────────
  const rh = (hpt: number) => ({ hpt });
  ws['!rows'] = [
    null, null,               // 1-2
    rh(21.75),                // 3  Titel
    null,                     // 4
    rh(20.25),                // 5  Kunde
    rh(20.25),                // 6
    rh(20.25),                // 7
    rh(21.0),                 // 8  Proj
    rh(21.75),                // 9  KST
    rh(21.75),                // 10
    rh(17.25),                // 11
    rh(22.5),                 // 12 Tabellen-Header
    rh(20.25),                // 13 Erste Position
    rh(21.0),                 // 14
    rh(21.0),                 // 15
    rh(18.75),                // 16
    rh(18.75),                // 17
    rh(18.75),                // 18
    rh(18.0),                 // 19 Ausgeführt am
    rh(17.25),                // 20
    rh(17.25),                // 21
    rh(30.0),                 // 22 Ausgeführt von
    rh(17.25),                // 23
    rh(17.25),                // 24
    rh(35.25),                // 25 Unterschrift
    rh(23.25),                // 26
  ];

  // ── Merged Cells (exakt wie Original) ───────────────────────────────────
  ws['!merges'] = [
    { s: { r: 2,  c: 0 }, e: { r: 2,  c: 1 } },  // A3:B3
    { s: { r: 6,  c: 2 }, e: { r: 6,  c: 3 } },  // C7:D7
    { s: { r: 12, c: 0 }, e: { r: 12, c: 1 } },  // A13:B13
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },  // A14:B14
    { s: { r: 18, c: 0 }, e: { r: 18, c: 1 } },  // A19:B19
    { s: { r: 21, c: 0 }, e: { r: 21, c: 1 } },  // A22:B22
    { s: { r: 24, c: 0 }, e: { r: 24, c: 1 } },  // A25:B25
    { s: { r: 50, c: 2 }, e: { r: 50, c: 3 } },  // C51:D51
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Tabelle 1');

  // ── Browser-Download via Blob ────────────────────────────────────────────
  // XLSX.writeFile scheitert manchmal im Browser → Blob ist zuverlässiger
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const datum = d.ausgefuehrtAm.replace(/\./g, '-');
  const aNr   = d.aNummer.replace(/[^A-Za-z0-9-]/g, '');
  a.href      = url;
  a.download  = `Abnahmeschein_${aNr}_${datum}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
