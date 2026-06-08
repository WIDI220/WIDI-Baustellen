import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface BaustellenParseResult {
  a_nummer: string | null;
  name: string | null;
  kostenstelle: string | null;
  datum: string | null;
  budget: number | null;
  gewerk: 'Hochbau' | 'Elektro';
  antragsteller: string | null;
  abteilung: string | null;
  fehler: string[];
  debug?: string;
}

export async function parseBaustellenPdf(file: File): Promise<BaustellenParseResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  // Text MIT Zeilenumbrüchen sammeln — Y-Position basiert
  const chunks: { text: string; y: number; x: number }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      if (item.str && item.str.trim()) {
        chunks.push({
          text: item.str,
          y: Math.round(item.transform[5]),
          x: Math.round(item.transform[4]),
        });
      }
    }
  }

  // Von oben nach unten sortieren
  chunks.sort((a, b) => b.y - a.y || a.x - b.x);

  // Zeilenweise Text aufbauen
  let fullText = '';
  let lastY = -1;
  for (const chunk of chunks) {
    if (lastY !== -1 && Math.abs(chunk.y - lastY) > 3) fullText += '\n';
    else if (lastY !== -1) fullText += ' ';
    fullText += chunk.text;
    lastY = chunk.y;
  }

  return parseBaustellenText(fullText);
}

function parseBaustellenText(text: string): BaustellenParseResult {
  const result: BaustellenParseResult = {
    a_nummer: null, name: null, kostenstelle: null, datum: null,
    budget: null, gewerk: 'Elektro', antragsteller: null, abteilung: null,
    fehler: [], debug: text.slice(0, 500),
  };

  // ── A-Nummer ──────────────────────────────────────────────────────────────
  // Format: "Auftragsnr. A26-09489" oder "Auftragsnr. A26 -09489" etc.
  const aNrPatterns = [
    /Auftragsnr\.?\s*:?\s*(A\d{2}\s*-?\s*\d{5})/i,
    /Auftrags[-\s]?Nr\.?\s*:?\s*(A\d{2}\s*-?\s*\d{5})/i,
    /\b(A\d{2}-\d{5})\b/,
  ];
  for (const pat of aNrPatterns) {
    const m = text.match(pat);
    if (m) {
      result.a_nummer = m[1].replace(/\s/g, '').toUpperCase();
      // Sicherstellen dass Format A26-09489 korrekt ist
      result.a_nummer = result.a_nummer.replace(/^(A\d{2})(\d{5})$/, '$1-$2');
      break;
    }
  }
  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // ── Kostenstelle ──────────────────────────────────────────────────────────
  const ksMatch = text.match(/Kostenstelle\s*:?\s*(\d{4,8})/i);
  if (ksMatch) result.kostenstelle = ksMatch[1];

  // ── Datum ─────────────────────────────────────────────────────────────────
  const datumMatch = text.match(/Datum\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i);
  if (datumMatch) result.datum = datumMatch[1];

  // ── Betreff ───────────────────────────────────────────────────────────────
  // In diesen PDFs steht "Betreff: Text" auf einer Zeile
  // Manchmal auch "Betreff: \n Text" auf der nächsten
  const betreffMatch =
    text.match(/Betreff\s*:?\s*([^\n]{3,120})/i) ||
    text.match(/Betreff\s*\n\s*([^\n]{3,120})/i);

  if (betreffMatch) {
    const kandidat = betreffMatch[1].trim();
    // Leerzeile oder nur Trennstrich? Dann Fallback
    if (kandidat && kandidat !== '—' && kandidat !== '-') {
      result.name = kandidat;
    }
  }

  // Fallback: Zeile direkt nach "Bestellung/ Auftrag:" — erste fettgedruckte Zeile
  if (!result.name) {
    const auftragsMatch = text.match(/Bestellung\s*\/?\s*Auftrag\s*:?\s*\n+\s*([^\n]{5,120})/i);
    if (auftragsMatch) result.name = auftragsMatch[1].trim();
  }

  // Fallback 2: erste sinnvolle Zeile nach dem Datum
  if (!result.name && result.datum) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const datumIdx = lines.findIndex(l => l.includes(result.datum!));
    if (datumIdx !== -1) {
      for (let i = datumIdx + 1; i < Math.min(datumIdx + 5, lines.length); i++) {
        const line = lines[i];
        if (line.length > 5 && line.length < 150 &&
            !line.match(/^\d/) &&
            !line.match(/GmbH|Str\.|Straße|Tel\.|Fax|IBAN|BIC|Steuer|Klinik|Widi/i) &&
            !line.match(/\d{2}\.\d{2}\.\d{4}/)) {
          result.name = line;
          break;
        }
      }
    }
  }

  if (!result.name) result.fehler.push('Betreff nicht gefunden — bitte manuell eingeben');

  // ── Budget ────────────────────────────────────────────────────────────────
  // "1.000,00 € brutto" oder "Gesamtbetrag ... 1.000,00 €"
  const budgetPatterns = [
    /Gesamtbetrag[^0-9€]*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/i,
    /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€\s*brutto/i,
    /Angebotsbetrag[^0-9]*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i,
    /Brutto[^0-9]*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/i,
  ];
  for (const pat of budgetPatterns) {
    const m = text.match(pat);
    if (m) {
      const numStr = m[1].replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(numStr);
      if (!isNaN(parsed) && parsed > 0) { result.budget = parsed; break; }
    }
  }

  // ── Gewerk ────────────────────────────────────────────────────────────────
  const textLower = text.toLowerCase();
  if (textLower.includes('hochbau') || textLower.includes('maler') ||
      textLower.includes('schreiner') || textLower.includes('trockenbau') ||
      textLower.includes('sanitär') || textLower.includes('heizung') ||
      textLower.includes('umzug') || textLower.includes('reinigung') ||
      textLower.includes('fenster') || textLower.includes('boden') ||
      textLower.includes('fliesen') || textLower.includes('putz')) {
    result.gewerk = 'Hochbau';
  }

  // ── Antragsteller ─────────────────────────────────────────────────────────
  const antragMatch = text.match(/Name des Antragstellers\s*:?\s*([^\n]+)/i);
  if (antragMatch) result.antragsteller = antragMatch[1].trim();

  // ── Abteilung ─────────────────────────────────────────────────────────────
  const abtMatch = text.match(/Abt\.?\s*\/?\s*Stat\.?\s*:?\s*([^\n]+)/i);
  if (abtMatch) result.abteilung = abtMatch[1].trim();

  return result;
}
