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
  // Neu: Flags für Prüfqueue
  istSonderformat: boolean;   // z.B. 9214(#8773) — wird nicht importiert
  stundenNegativOderNull: boolean;
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
    const normalized = text
      .replace(/\bA\s*(\d{2})\s*-\s*(\d{5})\b/gi, 'A$1-$2')
      .replace(/\s+/g, ' ');

    const parsed = parseTicketText(normalized, text, p);

    // Seiten ohne Ticket-Inhalt überspringen (z.B. reine Unterschriftsseiten)
    if (!parsed.a_nummer && !parsed.mitarbeiter && parsed.stunden === null && parsed.fehler.length >= 2) {
      // Prüfen ob es überhaupt ein Auftragsschein ist
      if (!normalized.includes('Auftragsschein') && !normalized.includes('Arbeitsauftrag')) {
        continue;
      }
    }

    results.push(parsed);
  }

  return results;
}

function parseTicketText(text: string, rawText: string, seite: number): TicketParseResult {
  const result: TicketParseResult = {
    seite, rawText,
    a_nummer: null, mitarbeiter: null, datum: null, datumISO: null,
    stunden: null, bemerkung: null, fehler: [],
    istSonderformat: false,
    stundenNegativOderNull: false,
  };

  // ── A-Nummer ──────────────────────────────────────────────────────────────
  // Standard: A26-07244
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

  // Sonderformat erkennen: z.B. "9214(#8773)" oder "9673(#9612)"
  // Diese werden NICHT importiert, landen in der Prüfqueue
  if (!result.a_nummer) {
    const sonderMatch = text.match(/Arbeitsauftrag\s*#\s*(\d{4,5}\s*\(#\d{4,5}\))/i)
      || text.match(/#\s*(\d{4,5}\s*\(#\d{4,5}\))/i);
    if (sonderMatch) {
      result.a_nummer = sonderMatch[1].trim(); // Rohnummer speichern für Anzeige
      result.istSonderformat = true;
      result.fehler.push('Sonderformat — nicht importierbar (gesplittetes App-Ticket)');
    }
  }

  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // ── Mitarbeiter ───────────────────────────────────────────────────────────
  // Im PDF steht "Mitarbeiter [Vorname Nachname]" mit dem Namen auf der GLEICHEN
  // oder der NÄCHSTEN Zeile direkt dahinter, fett.
  // Strategie: alles nach "Mitarbeiter" bis zum nächsten Label nehmen,
  // dann nur den ersten vollen Namen extrahieren.
  const maRaw = text.match(
    /Mitarbeiter\s*:?\s*\n?\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+(?:\s+[A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)*)/
  );
  if (maRaw) {
    // Nur bis zum ersten Leerzeichen nach einem vollständigen Namen
    // Sicherstellen dass kein Label wie "Termin" oder "Datum" mitkommt
    const candidate = maRaw[1].trim();
    // Wenn Kandidat ein bekanntes Label enthält → verwerfen
    const verboteneWoerter = ['Termin', 'Datum', 'Uhrzeit', 'Werkstatt', 'Telefon', 'Melder', 'Kostenstelle', 'Konto', 'Vorortung'];
    const istSauber = !verboteneWoerter.some(w => candidate.includes(w));
    if (istSauber && candidate.length >= 3) {
      result.mitarbeiter = candidate;
    }
  }

  if (!result.mitarbeiter) result.fehler.push('Mitarbeiter nicht gefunden');

  // ── Stunden ───────────────────────────────────────────────────────────────
  // Logik: Die Gesamtzeit steht als "(HH:MM Std.)" in der Arbeitszeiten-Zeile.
  // Format 1: "Arbeitszeiten (01:45 Std.):" — Summe steht direkt nach "Arbeitszeiten"
  // Format 2: Nur eine Zeile "14.04.2026 10:08 - 10:23 Uhr (00:15 Std.)"
  // Wir nehmen IMMER die erste "(HH:MM Std.)" die nach dem Wort "Arbeitszeiten" kommt.
  
  const arbZeitBlock = text.match(/Arbeitszeiten[^]*?(?=Die aufgef|Datum\s+\d|$)/i);
  if (arbZeitBlock) {
    const block = arbZeitBlock[0];
    
    // Gesamtzeit: steht entweder direkt "Arbeitszeiten (01:45 Std.):" 
    // oder am Ende der letzten Einzelzeile als Summenangabe
    // → Wir suchen die ERSTE (HH:MM Std.) im Block
    const gesamtMatch = block.match(/\((\d{1,2}):(\d{2})\s*Std\.\)/i);
    if (gesamtMatch) {
      const h = parseInt(gesamtMatch[1], 10);
      const m = parseInt(gesamtMatch[2], 10);
      result.stunden = Math.round((h + m / 60) * 4) / 4;
    }

    // Datum: erstes Datum im Arbeitszeiten-Block
    const datumMatch = block.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) result.datum = datumMatch[1];
  }

  // Fallback Datum aus Termin Datum
  if (!result.datum) {
    const terminMatch = text.match(/Termin\s+Datum\s*:?\s*(?:[A-Za-zäöü.]+\s*)?([\d]{2}\.[\d]{2}\.[\d]{4})/i);
    if (terminMatch) result.datum = terminMatch[1];
  }

  if (!result.stunden && result.stunden !== 0) {
    result.fehler.push('Arbeitszeiten nicht erkannt — Stunden bitte prüfen');
  }

  // Stunden-Plausibilität
  if (result.stunden !== null && result.stunden <= 0) {
    result.stundenNegativOderNull = true;
    result.fehler.push(`Stunden ungültig (${result.stunden}h) — Ticket zur Prüfung`);
  }

  // Datum → ISO
  if (result.datum) {
    const m = result.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) result.datumISO = `${m[3]}-${m[2]}-${m[1]}`;
  }

  // ── Bemerkung ─────────────────────────────────────────────────────────────
  const bemMatch = text.match(/Bemerkung\s*:?\s*\n?(.+?)(?:\nArbeitszeiten|\nDatum|\nDie aufgef|$)/is);
  if (bemMatch) result.bemerkung = bemMatch[1].replace(/\n/g, ' ').trim().slice(0, 300);

  return result;
}

export function getMonatFromISO(datumISO: string): string {
  return datumISO.slice(0, 7);
}
