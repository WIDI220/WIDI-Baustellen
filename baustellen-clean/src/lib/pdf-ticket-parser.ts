// PDF-Ticket-Parser — läuft komplett im Browser mit pdfjs-dist
// Keine KI, keine API, keine Serverless Functions

import * as pdfjsLib from 'pdfjs-dist';

// Worker konfigurieren
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface TicketParseResult {
  seite: number;
  a_nummer: string | null;
  mitarbeiter: string | null;
  datum: string | null;       // DD.MM.YYYY
  datumISO: string | null;    // YYYY-MM-DD
  stunden: number | null;
  bemerkung: string | null;
  fehler: string[];
  rawText?: string;
}

export async function parsePdfTickets(file: File): Promise<TicketParseResult[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const results: TicketParseResult[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Text mit Zeilenumbrüchen zusammenbauen
    const items = content.items as any[];
    let text = '';
    let lastY = -1;
    for (const item of items) {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY !== -1 && Math.abs(y - lastY) > 3) text += '\n';
      text += item.str;
      lastY = y;
    }
    results.push(parseTicketText(text, p));
  }

  return results;
}

function parseTicketText(text: string, seite: number): TicketParseResult {
  const result: TicketParseResult = {
    seite, rawText: text,
    a_nummer: null, mitarbeiter: null, datum: null, datumISO: null,
    stunden: null, bemerkung: null, fehler: []
  };

  // A-Nummer: "# A26-07430" oder "Arbeitsauftrag # A26-07430" oder "A26-07430"
  const aNrMatch = text.match(/#\s*(A\d{2}-\d{5})/i) || text.match(/Arbeitsauftrag\s+#?\s*(A\d{2}-\d{5})/i) || text.match(/\b(A\d{2}-\d{5})\b/i);
  if (aNrMatch) result.a_nummer = aNrMatch[1].toUpperCase();
  else result.fehler.push('A-Nummer nicht gefunden');

  // Mitarbeiter: "Mitarbeiter Caspar Epe" oder "Mitarbeiter: Caspar Epe"
  const maMatch = text.match(/Mitarbeiter[:\s]+([A-ZÄÖÜa-zäöüß][a-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß][a-zäöüß]+)+)/);
  if (maMatch) result.mitarbeiter = maMatch[1].trim();
  else result.fehler.push('Mitarbeiter nicht gefunden');

  // Arbeitszeiten: "14.04.2026 10:08 - 10:23 Uhr (00:15 Std.)"
  const zeitMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*Uhr[^(]*\((\d{1,2}):(\d{2})\s*Std/i);
  if (zeitMatch) {
    result.datum = zeitMatch[1];
    const h = parseInt(zeitMatch[4], 10) + parseInt(zeitMatch[5], 10) / 60;
    result.stunden = Math.round(h * 4) / 4;
  } else {
    // Fallback: Termin Datum aus Header
    const terminMatch = text.match(/Termin[^0-9]*(\d{2}\.\d{2}\.\d{4})/);
    if (terminMatch) result.datum = terminMatch[1];
    result.fehler.push('Arbeitszeiten nicht erkannt — Stunden bitte manuell prüfen');
  }

  // Datum zu ISO konvertieren
  if (result.datum) {
    const m = result.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) result.datumISO = `${m[3]}-${m[2]}-${m[1]}`;
  }

  // Bemerkung: Text nach "Bemerkung:" bis nächster Abschnitt
  const bemMatch = text.match(/Bemerkung[:\s\n]+(.+?)(?:\nArbeitszeiten|\nDatum|\nDie aufgef|$)/is);
  if (bemMatch) result.bemerkung = bemMatch[1].replace(/\n/g, ' ').trim().slice(0, 300);

  return result;
}

// Datum-Hilfsfunktion für Monat aus ISO-Datum
export function getMonatFromISO(datumISO: string): string {
  return datumISO.slice(0, 7); // "2026-04"
}
