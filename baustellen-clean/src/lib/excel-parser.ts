import * as XLSX from 'xlsx';

export type FehlerTyp =
  | 'ungueltige_anummer'    // A-Nummer hat falsches Format
  | 'duplikat_datei'        // doppelt in der Datei
  | 'duplikat_db'           // bereits in der Datenbank
  | 'kein_datum'            // Datum fehlt
  | 'falsches_datum'        // Datum außerhalb des Referenzmonats
  | 'kein_gewerk'           // Werkstatt fehlt/unbekannt
  | 'kein_auftragstext';    // Auftragstext fehlt

export type GewerkTyp = 'Hochbau' | 'Elektro' | 'Werdohl' | 'Unbekannt';

export type PruefStatus = 'ok' | 'warnung' | 'fehler' | 'duplikat_datei' | 'duplikat_db';

export interface ParsedTicketRow {
  zeilennr: number;          // Originale Zeile in der Datei
  a_nummer: string;
  gewerk: 'Hochbau' | 'Elektro' | 'Werdohl' | 'Unbekannt';
  eingangsdatum: Date | null;
  melder: string;
  raumnr: string;
  auftragstext: string;
  // Prüfergebnis
  pruefStatus: PruefStatus;
  fehler: FehlerTyp[];       // Alle Fehler dieser Zeile
  hinweis: string;           // Lesbarer Hinweis für die UI
  isDuplicate: boolean;      // Duplikat in Datei
}

export interface ExcelParseResult {
  rows: ParsedTicketRow[];
  parserFehler: string[];    // Fatale Fehler beim Parsen
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): Date {
  const base = new Date(1899, 11, 30);
  return new Date(base.getTime() + serial * 24 * 60 * 60 * 1000);
}

function yearFromANummer(a_nummer: string): number | null {
  const match = a_nummer.match(/^A(\d{2})-/);
  if (!match) return null;
  const yy = parseInt(match[1], 10);
  return yy <= 50 ? 2000 + yy : 1900 + yy;
}

function parseAnyDate(raw: unknown, ticketYear: number, refMonth: number): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = excelSerialToDate(raw);
    if (d.getFullYear() >= 2020 && d.getFullYear() <= 2035) return d;
    return null;
  }
  const text = String(raw).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  const fullMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fullMatch) {
    // Immer deutsches Format: TT.MM.JJJJ
    const day   = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10);
    const year  = parseInt(fullMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (shortYearMatch) {
    const yy = parseInt(shortYearMatch[3], 10);
    return new Date(yy <= 50 ? 2000 + yy : 1900 + yy, parseInt(shortYearMatch[2]) - 1, parseInt(shortYearMatch[1]));
  }
  const shortMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (shortMatch) return new Date(ticketYear, parseInt(shortMatch[2], 10) - 1, parseInt(shortMatch[1], 10));
  return null;
}

function normalizeANummer(raw: unknown, refYear: number): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!str) return null;
  const withPrefix = str.match(/^A(\d{2})-?(\d{4,6})$/);
  if (withPrefix) return `A${withPrefix[1]}-${withPrefix[2].padStart(5, '0')}`;
  const numMatch = str.match(/^(\d{3,6})$/);
  if (numMatch) return `A${String(refYear).slice(-2)}-${numMatch[1].padStart(5, '0')}`;
  return null;
}

function normalizeGewerk(raw: unknown): 'Hochbau' | 'Elektro' | 'Werdohl' | 'Unbekannt' {
  const text = String(raw ?? '').trim().toLowerCase();
  if (text === 'hochbau') return 'Hochbau';
  if (text.includes('elektro') || text.includes('nachricht')) return 'Elektro';
  if (text === 'werdohl') return 'Werdohl';
  if (text === '') return 'Unbekannt';
  return 'Unbekannt';
}

function isCSV(buffer: ArrayBuffer): boolean {
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(buffer.slice(0, 500)));
  return text.includes(';') && (
    text.toLowerCase().includes('auftrags_id') ||
    text.toLowerCase().includes('auftrags-id') ||
    text.toLowerCase().includes('datum')
  );
}

function parseCSV(buffer: ArrayBuffer): { rows: string[][], headers: string[] } {
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(buffer));
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g, '').toLowerCase());
  const rows = lines.slice(1).map(l => l.split(';').map(c => c.trim().replace(/\r/g, '')));
  return { rows, headers };
}

// ─── Haupt-Parser ─────────────────────────────────────────────────────────────

export function parseExcelFile(buffer: ArrayBuffer, refYearMonth: string): ExcelParseResult {
  const [refYearStr, refMonthStr] = refYearMonth.split('-');
  const refYear = parseInt(refYearStr, 10);
  const refMonth = parseInt(refMonthStr, 10);

  const parserFehler: string[] = [];
  const rows: ParsedTicketRow[] = [];
  const seenNummern = new Map<string, number>(); // a_nummer → zeilennr

  const csvMode = isCSV(buffer);

  // Rohdaten lesen
  let rawRows: Array<{ zeilennr: number; rawId: unknown; rawDatum: unknown; rawWerk: unknown; rawMelder: unknown; rawRaum: unknown; rawText: unknown }> = [];

  if (csvMode) {
    const { rows: csvRows, headers } = parseCSV(buffer);
    const hi = (name: string) => headers.findIndex(h => h.includes(name));
    const colId    = hi('auftragsnr') >= 0 ? hi('auftragsnr') : (hi('auftrags_id') >= 0 ? hi('auftrags_id') : (hi('auftrags-id') >= 0 ? hi('auftrags-id') : 0));
    const colDatum = hi('beginn') >= 0 ? hi('beginn') : (hi('datum') >= 0 ? hi('datum') : 1);
    const colWerk  = hi('werkstatt') >= 0 ? hi('werkstatt') : 9;
    const colMeld  = hi('ansprechpartner') >= 0 ? hi('ansprechpartner') : (hi('melder') >= 0 ? hi('melder') : 2);
    const colRaum  = hi('verortung') >= 0 ? hi('verortung') : (hi('raumnr') >= 0 ? hi('raumnr') : (hi('raum_id') >= 0 ? hi('raum_id') : 4));
    const colText  = hi('auftragstext') >= 0 ? hi('auftragstext') : 5;

    csvRows.forEach((row, i) => {
      if (!row || row.every(c => !c)) return; // leere Zeile
      rawRows.push({
        zeilennr: i + 2,
        rawId:    row[colId],
        rawDatum: row[colDatum],
        rawWerk:  row[colWerk],
        rawMeld:  row[colMeld],
        rawRaum:  row[colRaum],
        rawText:  row[colText],
      } as any);
    });
  } else {
    // Excel-Format — Header-basiert (unabhängig von Spaltenreihenfolge)
    try {
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
      if (!data.length) { parserFehler.push('Leere Datei'); return { rows, parserFehler }; }

      // Header-Zeile normalisieren
      const headers = (data[0] as unknown[]).map(h => String(h ?? '').trim().toLowerCase());
      const hi = (names: string[]) => {
        for (const n of names) {
          const idx = headers.findIndex(h => h.includes(n));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const colId    = hi(['auftragsnr', 'auftrags_id', 'auftrags-id', 'a-nummer', 'anummer', 'id']);
      const colDatum = hi(['beginn', 'datum', 'eingangsdatum', 'date']);
      const colWerk  = hi(['werkstatt', 'gewerk', 'werk']);
      const colMeld  = hi(['ansprechpartner', 'melder', 'meld']);
      const colRaum  = hi(['verortung', 'raumnr', 'raum_id', 'raum']);
      const colText  = hi(['auftragstext', 'text', 'beschreibung', 'auftrag']);

      // Fallback auf feste Positionen wenn Header nicht erkannt
      const idCol    = colId    >= 0 ? colId    : 0;
      const datCol   = colDatum >= 0 ? colDatum : 1;
      const wrkCol   = colWerk  >= 0 ? colWerk  : 2;
      const mldCol   = colMeld  >= 0 ? colMeld  : -1;
      const rauCol   = colRaum  >= 0 ? colRaum  : -1;
      const txtCol   = colText  >= 0 ? colText  : -1;

      data.slice(1).forEach((row, i) => {
        if (!row || !(row as unknown[])[idCol]) return;
        rawRows.push({
          zeilennr: i + 2,
          rawId:    (row as unknown[])[idCol],
          rawDatum: (row as unknown[])[datCol],
          rawWerk:  wrkCol >= 0 ? (row as unknown[])[wrkCol] : '',
          rawMeld:  mldCol >= 0 ? (row as unknown[])[mldCol] : '',
          rawRaum:  rauCol >= 0 ? (row as unknown[])[rauCol] : '',
          rawText:  txtCol >= 0 ? (row as unknown[])[txtCol] : '',
        } as any);
      });
    } catch (e: any) {
      parserFehler.push(`Excel-Datei konnte nicht gelesen werden: ${e.message}`);
      return { rows, parserFehler };
    }
  }

  // Jede Zeile validieren
  for (const raw of rawRows) {
    const fehler: FehlerTyp[] = [];
    const hinweise: string[] = [];

    // A-Nummer
    const a_nummer = normalizeANummer((raw as any).rawId, refYear);
    if (!a_nummer) {
      fehler.push('ungueltige_anummer');
      hinweise.push(`Ungültige A-Nummer: "${(raw as any).rawId}"`);
    }

    // Datum
    const ticketYear = a_nummer ? (yearFromANummer(a_nummer) ?? refYear) : refYear;
    const eingangsdatum = parseAnyDate((raw as any).rawDatum, ticketYear, refMonth);
    if (!(raw as any).rawDatum || (raw as any).rawDatum === '') {
      fehler.push('kein_datum');
      hinweise.push('Kein Datum');
    } else if (!eingangsdatum) {
      fehler.push('kein_datum');
      hinweise.push(`Datum nicht erkannt: "${(raw as any).rawDatum}"`);
    } else {
      if (eingangsdatum.getFullYear() !== refYear || eingangsdatum.getMonth() + 1 !== refMonth) {
        fehler.push('falsches_datum');
        hinweise.push(`Datum ${eingangsdatum.toLocaleDateString('de-DE')} ≠ ${refMonth}/${refYear}`);
      }
    }

    // Gewerk
    const gewerk = normalizeGewerk((raw as any).rawWerk);
    if (gewerk === 'Unbekannt') {
      fehler.push('kein_gewerk');
      hinweise.push(`Unbekanntes Gewerk: "${(raw as any).rawWerk ?? '–'}"`);
    }

    // Auftragstext
    const auftragstext = String((raw as any).rawText ?? '').trim();
    if (!auftragstext) {
      fehler.push('kein_auftragstext');
      hinweise.push('Kein Auftragstext');
    }

    // Duplikat in Datei
    let isDuplicate = false;
    if (a_nummer) {
      if (seenNummern.has(a_nummer)) {
        isDuplicate = true;
        fehler.push('duplikat_datei');
        hinweise.push(`Duplikat von Zeile ${seenNummern.get(a_nummer)}`);
      } else {
        seenNummern.set(a_nummer, raw.zeilennr);
      }
    }

    // Status bestimmen
    let pruefStatus: PruefStatus = 'ok';
    if (fehler.includes('ungueltige_anummer') || fehler.includes('duplikat_datei')) {
      pruefStatus = isDuplicate ? 'duplikat_datei' : 'fehler';
    } else if (fehler.length > 0) {
      pruefStatus = 'warnung';
    }

    rows.push({
      zeilennr: raw.zeilennr,
      a_nummer: a_nummer ?? String((raw as any).rawId ?? '').trim(),
      gewerk,
      eingangsdatum,
      melder: String((raw as any).rawMeld ?? '').trim(),
      raumnr: String((raw as any).rawRaum ?? '').trim(),
      auftragstext,
      pruefStatus,
      fehler,
      hinweis: hinweise.join(' · '),
      isDuplicate,
    });
  }

  return { rows, parserFehler };
}

// Zweiter Pass: DB-Duplikate markieren (wird nach dem DB-Query aufgerufen)
export function markiereDbDuplikate(
  rows: ParsedTicketRow[],
  existingSet: Set<string>
): ParsedTicketRow[] {
  return rows.map(row => {
    if (!row.fehler.includes('ungueltige_anummer') && existingSet.has(row.a_nummer)) {
      return {
        ...row,
        pruefStatus: 'duplikat_db' as PruefStatus,
        fehler: [...row.fehler, 'duplikat_db' as FehlerTyp],
        hinweis: row.hinweis ? `${row.hinweis} · Bereits in DB` : 'Bereits in DB',
      };
    }
    return row;
  });
}
