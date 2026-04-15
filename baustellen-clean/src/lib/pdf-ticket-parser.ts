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
  rawText: string;
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

    // Alle Textstücke sammeln mit Y-Position
    const chunks: { text: string; y: number; x: number }[] = [];
    for (const item of items) {
      if (item.str && item.str.trim()) {
        chunks.push({
          text: item.str,
          y: Math.round(item.transform[5]),
          x: Math.round(item.transform[4]),
        });
      }
    }

    // Nach Y sortieren (von oben nach unten), dann X
    chunks.sort((a, b) => b.y - a.y || a.x - b.x);

    // Text mit Zeilenumbrüchen zusammenbauen
    let text = '';
    let lastY = -1;
    for (const chunk of chunks) {
      if (lastY !== -1 && Math.abs(chunk.y - lastY) > 3) text += '\n';
      else if (lastY !== -1) text += ' ';
      text += chunk.text;
      lastY = chunk.y;
    }

    // Normalisierung: Leerzeichen in A-Nummern entfernen
    // "A 26-07244", "A26 -07244", "A26- 07244" → "A26-07244"
    const normalized = text
      .replace(/\bA\s*(\d{2})\s*-\s*(\d{5})\b/gi, 'A$1-$2')
      .replace(/\s+/g, ' ');

    results.push(parseTicketText(normalized, text, p));
  }

  return results;
}

function parseTicketText(text: string, rawText: string, seite: number): TicketParseResult {
  const result: TicketParseResult = {
    seite, rawText,
    a_nummer: null, mitarbeiter: null, datum: null, datumISO: null,
    stunden: null, bemerkung: null, fehler: []
  };

  // A-Nummer — nach Normalisierung sollte A26-07244 korrekt sein
  const aNrPatterns = [
    /Arbeitsauftrag\s*#\s*(A\d{2}-\d{5})/i,
    /#\s*(A\d{2}-\d{5})/i,
    /Auftrags(?:schein|nr\.?)?\s*[#:\s]*(A\d{2}-\d{5})/i,
    /\b(A\d{2}-\d{5})\b/i,
  ];
  for (const pat of aNrPatterns) {
    const m = text.match(pat);
    if (m) { result.a_nummer = m[1].toUpperCase(); break; }
  }
  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // Mitarbeiter
  const maPatterns = [
    /Mitarbeiter\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?: [A-ZÄÖÜ][a-zäöüß]+)+)/,
    /Techniker\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?: [A-ZÄÖÜ][a-zäöüß]+)+)/,
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
