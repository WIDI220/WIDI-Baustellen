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
  istSonderformat: boolean;
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

    chunks.sort((a, b) => b.y - a.y || a.x - b.x);

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

    // Seiten ohne Ticket-Inhalt überspringen (z.B. reine Unterschriftsseiten)
    if (!normalized.includes('Auftragsschein') && !normalized.includes('Arbeitsauftrag')) {
      continue;
    }

    results.push(parseTicketText(normalized, text, p));
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

  // Sonderformat: z.B. "9214(#8773)" — nicht importierbar
  if (!result.a_nummer) {
    const sonderMatch = text.match(/Arbeitsauftrag\s*#\s*(\d{4,5}\s*\(#\d{4,5}\))/i)
      || text.match(/#\s*(\d{4,5}\s*\(#\d{4,5}\))/i);
    if (sonderMatch) {
      result.a_nummer = sonderMatch[1].trim();
      result.istSonderformat = true;
      result.fehler.push('Sonderformat — nicht importierbar (gesplittetes App-Ticket)');
    }
  }

  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // ── Mitarbeiter ───────────────────────────────────────────────────────────
  // Das PDF hat eine klare Struktur: "Mitarbeiter [Leerzeichen] Vorname Nachname"
  // Der Name steht fett direkt nach dem Label — durch pdfjs kommen Label und Wert
  // oft in einer Zeile zusammen als "Mitarbeiter Caspar Epe Termin Datum ..."
  // Strategie: nach "Mitarbeiter" den nächsten 2-3 Wörter nehmen, 
  // stoppen sobald ein bekanntes Label kommt.
  const maMatch = text.match(
    /Mitarbeiter\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,2})/
  );
  if (maMatch) {
    // Sicherstellen dass kein Folge-Label reingekommen ist
    const name = maMatch[1].trim();
    const stoppWoerter = ['Termin', 'Datum', 'Uhrzeit', 'Werkstatt', 'Telefon',
                          'Melder', 'Kostenstelle', 'Konto', 'Vorortung', 'Kundennummer',
                          'Objektnummer'];
    // Ersten Stoppwort-Index finden und Name dort abschneiden
    let sauberName = name;
    for (const stopp of stoppWoerter) {
      const idx = name.indexOf(stopp);
      if (idx !== -1) {
        sauberName = name.slice(0, idx).trim();
        break;
      }
    }
    if (sauberName.length >= 3) {
      result.mitarbeiter = sauberName;
    }
  }

  // Fallback: altes Pattern
  if (!result.mitarbeiter) {
    const altMatch = text.match(
      /Mitarbeiter\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?: [A-ZÄÖÜ][a-zäöüß]+)+)/
    );
    if (altMatch) result.mitarbeiter = altMatch[1].trim();
  }

  if (!result.mitarbeiter) result.fehler.push('Mitarbeiter nicht gefunden');

  // ── Stunden ───────────────────────────────────────────────────────────────
  // Die Gesamtzeit steht IMMER als erste "(HH:MM Std.)" im Arbeitszeiten-Block.
  // Format A: "Arbeitszeiten (01:45 Std.):" — Summe direkt nach dem Label
  // Format B: "Arbeitszeiten:\n14.04.2026 10:08 - 10:23 Uhr (00:15 Std.)"
  // In beiden Fällen nehmen wir die ERSTE (HH:MM Std.) nach "Arbeitszeiten".

  const arbBlock = text.match(/Arbeitszeiten[\s\S]*?(?=Die aufgef|Datum\s+\d|$)/i);
  if (arbBlock) {
    const block = arbBlock[0];
    const gesamtMatch = block.match(/\((\d{1,2}):(\d{2})\s*Std\.\)/i);
    if (gesamtMatch) {
      const h = parseInt(gesamtMatch[1], 10);
      const m = parseInt(gesamtMatch[2], 10);
      result.stunden = Math.round((h + m / 60) * 4) / 4;
    }
    // Datum aus erstem Datum im Block
    const datumMatch = block.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) result.datum = datumMatch[1];
  }

  // Fallback Datum aus Termin Datum
  if (!result.datum) {
    const terminMatch = text.match(/Termin\s+Datum\s*:?\s*(?:[A-Za-zäöü.]+\s*)?([\d]{2}\.[\d]{2}\.[\d]{4})/i);
    if (terminMatch) result.datum = terminMatch[1];
  }

  if (result.stunden === null) {
    result.fehler.push('Arbeitszeiten nicht erkannt — Stunden bitte prüfen');
  }

  // Stunden-Plausibilität
  if (result.stunden !== null && result.stunden <= 0) {
    result.stundenNegativOderNull = true;
    result.fehler.push(`Stunden ungültig (${result.stunden}h)`);
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
