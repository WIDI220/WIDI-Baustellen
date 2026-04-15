import * as XLSX from 'xlsx';

export interface ParsedTicketRow {
  a_nummer: string;
  gewerk: 'Hochbau' | 'Elektro';
  eingangsdatum: Date | null;
  melder: string;
  raumnr: string;
  auftragstext: string;
  rowIndex: number;
  isDuplicate: boolean;
  warning?: string;
}

export interface ExcelParseResult {
  rows: ParsedTicketRow[];
  errors: string[];
  warnings: string[];
}

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
    if (d.getFullYear() >= 2020 && d.getFullYear() <= 2030) return d;
    return null;
  }
  const text = String(raw).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  const fullMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fullMatch) return new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
  const shortYearMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (shortYearMatch) {
    const yy = parseInt(shortYearMatch[3], 10);
    return new Date(yy <= 50 ? 2000 + yy : 1900 + yy, parseInt(shortYearMatch[2]) - 1, parseInt(shortYearMatch[1]));
  }
  const shortMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (shortMatch) return new Date(ticketYear, parseInt(shortMatch[2], 10) - 1, parseInt(shortMatch[1], 10));
  return null;
}

function normalizeTicketNummer(raw: unknown, refYear: number): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (!str) return null;
  const withPrefix = str.match(/^A(\d{2})-?(\d{4,6})$/);
  if (withPrefix) return `A${withPrefix[1]}-${withPrefix[2].padStart(5, '0')}`;
  const numMatch = str.match(/^(\d{3,6})$/);
  if (numMatch) return `A${String(refYear).slice(-2)}-${numMatch[1].padStart(5, '0')}`;
  return null;
}

// Erkennt ob CSV (Semikolon) oder Excel
function isCSV(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 3));
  // UTF-8 BOM oder Textstart
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(buffer.slice(0, 200)));
  return text.includes(';') && (text.toLowerCase().includes('auftrags') || text.toLowerCase().includes('datum'));
}

function parseCSV(buffer: ArrayBuffer, refYear: number, refMonth: number): { rows: any[][], headers: string[] } {
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(buffer));
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g, ''));
  const rows = lines.slice(1).map(l => l.split(';').map(c => c.trim().replace(/\r/g, '')));
  return { rows, headers };
}

export function parseExcelFile(buffer: ArrayBuffer, refYearMonth: string): ExcelParseResult {
  const [refYearStr, refMonthStr] = refYearMonth.split('-');
  const refYear = parseInt(refYearStr, 10);
  const refMonth = parseInt(refMonthStr, 10);

  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ParsedTicketRow[] = [];
  const seenNummern = new Map<string, number>();

  // Erkenne CSV vs Excel
  const csvMode = isCSV(buffer);

  if (csvMode) {
    // ── CSV Format: auftrags_id;datum;werkstatt;melder;telefonnummer;raumnr;auftragstext ──
    const { rows: rawRows, headers } = parseCSV(buffer, refYear, refMonth);
    // Header-Mapping (case-insensitive)
    const hi = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    const colId      = hi('auftrags_id') >= 0 ? hi('auftrags_id') : 0;
    const colDatum   = hi('datum') >= 0 ? hi('datum') : 1;
    const colWerk    = hi('werkstatt') >= 0 ? hi('werkstatt') : 2;
    const colMelder  = hi('melder') >= 0 ? hi('melder') : 3;
    const colTel     = hi('telefon') >= 0 ? hi('telefon') : 4;
    const colRaum    = hi('raumnr') >= 0 ? hi('raumnr') : 5;
    const colText    = hi('auftragstext') >= 0 ? hi('auftragstext') : 6;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || !row[colId]) continue;

      const a_nummer = normalizeTicketNummer(row[colId], refYear);
      if (!a_nummer) {
        warnings.push(`Zeile ${i + 2}: Ungültige Ticket-Nr. "${row[colId]}" – übersprungen`);
        continue;
      }

      const ticketYear = yearFromANummer(a_nummer) ?? refYear;
      const eingangsdatum = parseAnyDate(row[colDatum], ticketYear, refMonth);
      if (row[colDatum] && !eingangsdatum) {
        warnings.push(`Zeile ${i + 2}: Datum "${row[colDatum]}" nicht erkannt`);
      }

      // Gewerk: Elektrotechnik + Nachrichtentechnik → Elektro, Hochbau → Hochbau
      const werkRaw = String(row[colWerk] ?? '').trim().toLowerCase();
      const gewerk: 'Hochbau' | 'Elektro' = werkRaw === 'hochbau' ? 'Hochbau' : 'Elektro';

      const melder      = String(row[colMelder] ?? '').trim();
      const raumnr      = String(row[colRaum]   ?? '').trim();
      const auftragstext = String(row[colText]  ?? '').trim();

      let isDuplicate = false;
      if (seenNummern.has(a_nummer)) {
        isDuplicate = true;
        warnings.push(`Zeile ${i + 2}: Duplikat von Zeile ${seenNummern.get(a_nummer)} (${a_nummer})`);
      } else {
        seenNummern.set(a_nummer, i + 2);
      }

      rows.push({ a_nummer, gewerk, eingangsdatum, melder, raumnr, auftragstext, rowIndex: i + 2, isDuplicate });
    }
  } else {
    // ── Excel Format (altes Format) ──
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as unknown[];
      if (!row || row.length === 0 || !row[0]) continue;

      const a_nummer = normalizeTicketNummer(row[0], refYear);
      if (!a_nummer) {
        warnings.push(`Zeile ${i + 1}: Ungültige Ticket-Nr. "${row[0]}" – übersprungen`);
        continue;
      }

      const ticketYear = yearFromANummer(a_nummer) ?? refYear;
      const eingangsdatum = parseAnyDate(row[1], ticketYear, refMonth);

      const gewerkText = String(row[2] ?? '').trim().toLowerCase();
      const elektroMark = String(row[3] ?? '').trim().toLowerCase();
      const gewerk: 'Hochbau' | 'Elektro' =
        gewerkText === 'elektro' ? 'Elektro' :
        elektroMark === 'x' ? 'Elektro' : 'Hochbau';

      let isDuplicate = false;
      if (seenNummern.has(a_nummer)) {
        isDuplicate = true;
        warnings.push(`Zeile ${i + 1}: Duplikat (${a_nummer})`);
      } else {
        seenNummern.set(a_nummer, i + 1);
      }

      rows.push({ a_nummer, gewerk, eingangsdatum, melder: '', raumnr: '', auftragstext: '', rowIndex: i + 1, isDuplicate });
    }
  }

  return { rows, errors, warnings };
}
