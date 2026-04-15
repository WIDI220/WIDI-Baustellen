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

  let fullText = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    let pageText = '';
    let lastY = -1;
    for (const item of items) {
      const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
      if (lastY !== -1 && Math.abs(y - lastY) > 4) pageText += '\n';
      pageText += item.str;
      lastY = y;
    }
    fullText += pageText + '\n\n';
  }

  return parseBaustellenText(fullText);
}

function normText(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/([A-Z])\s+(\d)/g, '$1$2')
    .replace(/(\d)\s*-\s*(\d{4,})/g, '$1-$2')
    .replace(/[ \t]+/g, ' ');
}

function parseBaustellenText(rawText: string): BaustellenParseResult {
  const text = normText(rawText);
  const result: BaustellenParseResult = {
    a_nummer: null, name: null, kostenstelle: null, datum: null,
    budget: null, gewerk: 'Elektro', antragsteller: null, abteilung: null,
    fehler: [], debug: text.slice(0, 500)
  };

  // A-Nummer — Auftragsnr. A26-03475 oder im Text
  const aNrPatterns = [
    /Auftragsnr\.?\s*[:\s]*(A\d{2}-\d{5})/i,
    /Auftrags[-\s]?Nr\.?\s*[:\s]*(A\d{2}-\d{5})/i,
    /\b(A\d{2}-\d{5})\b/,
  ];
  for (const pat of aNrPatterns) {
    const m = text.match(pat);
    if (m) { result.a_nummer = m[1].toUpperCase(); break; }
  }
  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // Kostenstelle
  const ksMatch = text.match(/Kostenstelle\s*:?\s*(\d{4,8})/i);
  if (ksMatch) result.kostenstelle = ksMatch[1];

  // Datum
  const datumMatch = text.match(/Datum\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i);
  if (datumMatch) result.datum = datumMatch[1];

  // Betreff — direkt nach "Betreff:" auf gleicher oder nächster Zeile
  // Zuerst im Original-Text suchen (vor Normalisierung entfernt Zeilenumbrüche nicht)
  const betreffPatterns = [
    /Betreff\s*:\s*([^\n]{3,100})/i,
    /Betreff\s*\n\s*([^\n]{3,100})/i,
  ];
  for (const pat of betreffPatterns) {
    const m = rawText.match(pat);
    if (m && m[1].trim().length > 2) {
      result.name = m[1].trim();
      break;
    }
  }

  // Fallback: Zeile direkt nach "Bestellung/ Auftrag:"
  if (!result.name) {
    const auftragsMatch = rawText.match(/Bestellung\s*\/?\s*Auftrag\s*:?\s*\n+\s*([^\n]{5,120})/i);
    if (auftragsMatch) result.name = auftragsMatch[1].trim();
  }

  // Fallback 2: Erste fettgedruckte lange Zeile nach dem Header (oft der Betreff)
  if (!result.name) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    // Suche eine Zeile die wie ein Betreff aussieht (kein Datum, keine Adresse, keine Zahl am Anfang)
    for (const line of lines) {
      if (line.length > 10 && line.length < 120 &&
          !line.match(/^\d/) &&
          !line.match(/GmbH|Str\.|Straße|Tel\.|Fax|IBAN|BIC|Steuer/) &&
          !line.match(/\d{2}\.\d{2}\.\d{4}/) &&
          line !== 'WIDI Gebäudeservice GmbH') {
        // Nimm die erste plausible Zeile nach der A-Nummer
        if (result.a_nummer && rawText.indexOf(line) > rawText.indexOf(result.a_nummer)) {
          result.name = line;
          break;
        }
      }
    }
  }

  if (!result.name) result.fehler.push('Betreff nicht gefunden — bitte manuell eingeben');

  // Budget
  const bruttoMatch = text.match(/Angebotsbetrag[^0-9]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i) ||
                      text.match(/Brutto[^0-9]*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i);
  if (bruttoMatch) {
    const numStr = bruttoMatch[1].replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(numStr);
    if (!isNaN(parsed) && parsed > 0) result.budget = parsed;
  }

  // Gewerk
  const textLower = rawText.toLowerCase();
  if (textLower.includes('hochbau') || textLower.includes('schreiner') ||
      textLower.includes('maler') || textLower.includes('trockenbau') ||
      textLower.includes('sanitär') || textLower.includes('heizung')) {
    result.gewerk = 'Hochbau';
  }

  // Antragsteller
  const antragMatch = rawText.match(/Name des Antragstellers\s*:?\s*([^\n]+)/i);
  if (antragMatch) result.antragsteller = antragMatch[1].trim();

  // Abteilung
  const abtMatch = rawText.match(/Abt\.?\s*\/?\s*Stat\.?\s*:?\s*([^\n]+)/i);
  if (abtMatch) result.abteilung = abtMatch[1].trim();

  return result;
}
