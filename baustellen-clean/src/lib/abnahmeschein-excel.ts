// abnahmeschein-excel.ts
// Generiert einen Abnahmeschein als .xlsx identisch zum Original-Format
// Nutzt SheetJS (xlsx) das bereits im Projekt vorhanden ist

import * as XLSX from 'xlsx';

export interface AbnahmescheinFelder {
  aNummer: string;           // z.B. "A26-09123"
  proj: string;              // Projektbezeichnung
  leistungseinheit: string;  // z.B. "Std.", "Pauschale"
  menge: string;             // z.B. "8,5" oder "1"
  ausgefuehrtAm: string;     // z.B. "02.06.2026"
  ausgefuehrtVon: string;    // Name(n) der Mitarbeiter
  // Optionale Zusatzzeilen (max 5 weitere Positionen)
  zusatzPositionen?: Array<{ leistungseinheit: string; menge: string }>;
}

export function exportAbnahmescheinExcel(felder: AbnahmescheinFelder): void {
  const wb = XLSX.utils.book_new();

  // ── Worksheet als Array of Arrays aufbauen ───────────────────────────────
  // Wir nutzen 51 Zeilen wie im Original (A3:D51)
  // Zeilen-Index 0 = Zeile 1, also Zeile 3 = Index 2
  const aoa: (string | number | null)[][] = Array.from({ length: 55 }, () => [null, null, null, null]);

  // Zeile 3: Titel
  aoa[2][0] = 'Abnahmeschein Sonderdienstleistung';

  // Zeile 5: Kunde
  aoa[4][0] = 'Kunde:';
  aoa[4][1] = 'Märkische Kliniken GmbH - Hellersen';

  // Zeile 6: Adresse
  aoa[5][1] = 'Paulmannshöher Str. 14';

  // Zeile 7: PLZ Ort
  aoa[6][1] = '58515 Lüdenscheid';

  // Zeile 8: Proj
  aoa[7][0] = 'Proj:';
  aoa[7][1] = felder.proj;

  // Zeile 9: KST
  aoa[8][0] = 'KST:';
  aoa[8][1] = 900120;

  // Zeile 12: Header Tabelle
  aoa[11][2] = 'Leistungseinheit';
  aoa[11][3] = 'Menge';

  // Zeile 13: A-Nummer + erste Position
  aoa[12][0] = felder.aNummer || 'A26-';
  aoa[12][2] = felder.leistungseinheit;
  aoa[12][3] = felder.menge;

  // Zusatzpositionen in Zeilen 14-18
  if (felder.zusatzPositionen) {
    felder.zusatzPositionen.slice(0, 5).forEach((pos, i) => {
      aoa[13 + i][2] = pos.leistungseinheit;
      aoa[13 + i][3] = pos.menge;
    });
  }

  // Zeile 19: Ausgeführt am
  aoa[18][0] = `Ausgeführt am: ${felder.ausgefuehrtAm}`;

  // Zeile 22: Ausgeführt von
  aoa[21][0] = `Ausgeführt von: ${felder.ausgefuehrtVon}`;

  // Zeile 25: Unterschrift Kunde
  aoa[24][0] = 'Unterschrift Kunde:_______________________________________';

  // Zeile 31–32: Hinweistext
  aoa[30][0] = 'Bitte vor Unterschrift prüfen, Reklamationen können nur bis zu 24 Stunden nach Beendigung der';
  aoa[31][0] = 'Durchführung entgegen genommen werden.';

  // Zeile 51: Geprüft
  aoa[50][2] = 'Geprüft:__________________';

  // ── Worksheet erstellen ───────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Spaltenbreiten (exakt wie Original) ──────────────────────────────────
  ws['!cols'] = [
    { wch: 14 },   // A: 11.42 → ~14 Zeichen
    { wch: 62 },   // B: 59.71 → ~62 Zeichen
    { wch: 22 },   // C: 20.0
    { wch: 14 },   // D: 12.85
  ];

  // ── Zeilenhöhen (exakt wie Original) ────────────────────────────────────
  ws['!rows'] = [
    null, null,                          // 1-2
    { hpt: 21.75 },                      // 3  Titel
    null,                                // 4
    { hpt: 20.25 },                      // 5  Kunde
    { hpt: 20.25 },                      // 6
    { hpt: 20.25 },                      // 7
    { hpt: 21.0 },                       // 8  Proj
    { hpt: 21.75 },                      // 9  KST
    { hpt: 21.75 },                      // 10
    { hpt: 17.25 },                      // 11
    { hpt: 22.5 },                       // 12 Tabellen-Header
    { hpt: 20.25 },                      // 13 Erste Position
    { hpt: 21.0 },                       // 14
    { hpt: 21.0 },                       // 15
    { hpt: 18.75 },                      // 16
    { hpt: 18.75 },                      // 17
    { hpt: 18.75 },                      // 18
    { hpt: 18.0 },                       // 19 Ausgeführt am
    { hpt: 17.25 },                      // 20
    { hpt: 17.25 },                      // 21
    { hpt: 30.0 },                       // 22 Ausgeführt von
    { hpt: 17.25 },                      // 23
    { hpt: 17.25 },                      // 24
    { hpt: 35.25 },                      // 25 Unterschrift
    { hpt: 23.25 },                      // 26
  ];

  // ── Merged Cells (exakt wie Original) ───────────────────────────────────
  ws['!merges'] = [
    { s: { r: 2,  c: 0 }, e: { r: 2,  c: 1 } },  // A3:B3  - Titel
    { s: { r: 6,  c: 2 }, e: { r: 6,  c: 3 } },  // C7:D7
    { s: { r: 12, c: 0 }, e: { r: 12, c: 1 } },  // A13:B13
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },  // A14:B14
    { s: { r: 18, c: 0 }, e: { r: 18, c: 1 } },  // A19:B19 - Ausgeführt am
    { s: { r: 21, c: 0 }, e: { r: 21, c: 1 } },  // A22:B22 - Ausgeführt von
    { s: { r: 24, c: 0 }, e: { r: 24, c: 1 } },  // A25:B25 - Unterschrift
    { s: { r: 50, c: 2 }, e: { r: 50, c: 3 } },  // C51:D51 - Geprüft
  ];

  // ── Zell-Styles via SheetJS-CE (begrenzte Style-Unterstützung) ───────────
  // SheetJS Community Edition unterstützt keine vollen Styles,
  // aber wir setzen Zahlenformat für Menge-Spalte
  const cellStyle = (bold: boolean, size: number, halign?: string) => ({
    font: { bold, sz: size, name: 'Arial' },
    alignment: { horizontal: halign || 'left', vertical: 'center', wrapText: true },
  });

  // Styles für die wichtigsten Zellen
  const styledCells: Record<string, any> = {
    A3:  { ...ws['A3'],  s: cellStyle(true,  14) },
    A5:  { ...ws['A5'],  s: cellStyle(true,  13) },
    B5:  { ...ws['B5'],  s: cellStyle(false, 13) },
    B6:  { ...ws['B6'],  s: cellStyle(false, 13) },
    B7:  { ...ws['B7'],  s: cellStyle(false, 13) },
    A8:  { ...ws['A8'],  s: cellStyle(true,  13) },
    B8:  { ...ws['B8'],  s: cellStyle(false, 13) },
    A9:  { ...ws['A9'],  s: cellStyle(true,  13) },
    B9:  { ...ws['B9'],  s: cellStyle(false, 13) },
    C12: { ...ws['C12'], s: cellStyle(false, 13, 'center') },
    D12: { ...ws['D12'], s: cellStyle(false, 13, 'center') },
    A13: { ...ws['A13'], s: cellStyle(false, 13) },
    C13: { ...ws['C13'], s: cellStyle(false, 13, 'center') },
    D13: { ...ws['D13'], s: cellStyle(false, 13, 'center') },
    A19: { ...ws['A19'], s: cellStyle(false, 13) },
    A22: { ...ws['A22'], s: cellStyle(false, 13) },
    A25: { ...ws['A25'], s: cellStyle(false, 13) },
    A31: { ...ws['A31'], s: cellStyle(true,  11) },
    A32: { ...ws['A32'], s: cellStyle(true,  11) },
    C51: { ...ws['C51'], s: cellStyle(false, 13) },
  };

  Object.entries(styledCells).forEach(([addr, cell]) => {
    if (ws[addr]) ws[addr] = cell;
  });

  // ── Sheet-Range setzen ───────────────────────────────────────────────────
  ws['!ref'] = 'A1:D55';

  XLSX.utils.book_append_sheet(wb, ws, 'Tabelle 1');

  // ── Download ─────────────────────────────────────────────────────────────
  const datum = felder.ausgefuehrtAm.replace(/\./g, '-');
  const aNr   = felder.aNummer.replace(/[^A-Za-z0-9-]/g, '');
  XLSX.writeFile(wb, `Abnahmeschein_${aNr}_${datum}.xlsx`);
}
