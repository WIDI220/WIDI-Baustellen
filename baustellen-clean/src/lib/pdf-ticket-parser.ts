import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface TicketParseResult {
  seite: number;
  a_nummer: string | null;
  mitarbeiter: string | null;
  datum: string | null;
  datumISO: string | null;
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
    const items = content.items as any[];

    // Text mit Positionsinformation aufbauen — Zeilenumbrüche wenn Y-Position wechselt
    let text = '';
    let lastY = -1;
    for (const item of items) {
      const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2; // auf 2px runden
      if (lastY !== -1 && Math.abs(y - lastY) > 4) text += '\n';
      text += item.str;
      lastY = y;
    }

    results.push(parseTicketText(text, p));
  }

  return results;
}

// Normalisiert Text: entfernt überflüssige Leerzeichen IN Wörtern/Nummern
function normText(t: string): string {
  return t
    .replace(/\r/g, '')
    // Leerzeichen zwischen Buchstabe+Zahl-Kombinationen entfernen (A 26 -> A26, A26 -07 -> A26-07)
    .replace(/([A-Z])\s+(\d)/g, '$1$2')
    .replace(/(\d)\s*-\s*(\d{4,})/g, '$1-$2')
    // Mehrfache Leerzeichen auf eines reduzieren
    .replace(/[ \t]+/g, ' ');
}

function parseTicketText(rawText: string, seite: number): TicketParseResult {
  const text = normText(rawText);
  const result: TicketParseResult = {
    seite, rawText: text,
    a_nummer: null, mitarbeiter: null, datum: null, datumISO: null,
    stunden: null, bemerkung: null, fehler: []
  };

  // A-Nummer — mehrere Muster, auch mit Lücken im Original
  // Muster: "# A26-07430", "Arbeitsauftrag # A26-07430", oder einfach "A26-07430"
  // Nach Normalisierung sollte A26-07430 korrekt sein
  const aNrPatterns = [
    /Arbeitsauftrag\s*#\s*(A\d{2}-\d{5})/i,
    /#\s*(A\d{2}-\d{5})/i,
    /Auftrags(?:schein|nr|nummer)?\s*[#:\s]*\s*(A\d{2}-\d{5})/i,
    /\b(A\d{2}-\d{5})\b/i,
  ];
  for (const pat of aNrPatterns) {
    const m = text.match(pat);
    if (m) { result.a_nummer = m[1].toUpperCase(); break; }
  }
  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // Mitarbeiter
  const maPatterns = [
    /Mitarbeiter\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/,
    /Techniker\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/,
  ];
  for (const pat of maPatterns) {
    const m = text.match(pat);
    if (m) { result.mitarbeiter = m[1].trim(); break; }
  }
  if (!result.mitarbeiter) result.fehler.push('Mitarbeiter nicht gefunden');

  // Arbeitszeiten: "14.04.2026 10:08 - 10:23 Uhr (00:15 Std.)"
  const zeitMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*Uhr[^(]*\((\d{1,2}):(\d{2})\s*Std/i);
  if (zeitMatch) {
    result.datum = zeitMatch[1];
    const h = parseInt(zeitMatch[4], 10) + parseInt(zeitMatch[5], 10) / 60;
    result.stunden = Math.round(h * 4) / 4;
  } else {
    // Fallback: Termin Datum
    const terminMatch = text.match(/Termin\s+Datum\s*:?\s*(?:[A-Za-z.]+\s*)?(\d{2}\.\d{2}\.\d{4})/i);
    if (terminMatch) result.datum = terminMatch[1];
    result.fehler.push('Arbeitszeiten nicht erkannt — Stunden bitte prüfen');
  }

  if (result.datum) {
    const m = result.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) result.datumISO = `${m[3]}-${m[2]}-${m[1]}`;
  }

  // Bemerkung
  const bemMatch = text.match(/Bemerkung\s*:?\s*\n?(.+?)(?:\nArbeitszeiten|\nDatum|\nDie aufgef|$)/is);
  if (bemMatch) result.bemerkung = bemMatch[1].replace(/\n/g, ' ').trim().slice(0, 300);

  return result;
}

export function getMonatFromISO(datumISO: string): string {
  return datumISO.slice(0, 7);
}
