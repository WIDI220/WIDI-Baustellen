// Baustellen-PDF-Parser — läuft im Browser, kein Server, kein KI
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface BaustellenParseResult {
  a_nummer: string | null;
  name: string | null;
  kostenstelle: string | null;
  datum: string | null;      // Datum des Auftragsscheins
  budget: number | null;     // Bruttobetrag falls vorhanden
  gewerk: 'Hochbau' | 'Elektro';
  antragsteller: string | null;
  abteilung: string | null;
  fehler: string[];
}

export async function parseBaustellenPdf(file: File): Promise<BaustellenParseResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;

  // Alle Seiten Text sammeln
  let fullText = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    let pageText = '';
    let lastY = -1;
    for (const item of items) {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY !== -1 && Math.abs(y - lastY) > 3) pageText += '\n';
      pageText += item.str;
      lastY = y;
    }
    fullText += pageText + '\n\n';
  }

  return parseBaustellenText(fullText);
}

function parseBaustellenText(text: string): BaustellenParseResult {
  const result: BaustellenParseResult = {
    a_nummer: null, name: null, kostenstelle: null, datum: null,
    budget: null, gewerk: 'Elektro', antragsteller: null, abteilung: null, fehler: []
  };

  // A-Nummer: "Auftragsnr. A26-03475" oder "A26-03475"
  const aNrMatch = text.match(/Auftragsnr\.?\s*[:\s]*(A\d{2}-\d{5})/i) ||
                   text.match(/Auftrags[- ]?Nr\.?\s*[:\s]*(A\d{2}-\d{5})/i) ||
                   text.match(/\b(A\d{2}-\d{5})\b/);
  if (aNrMatch) result.a_nummer = aNrMatch[1].toUpperCase();
  else result.fehler.push('A-Nummer nicht gefunden');

  // Kostenstelle
  const ksMatch = text.match(/Kostenstelle\s+(\d{4,8})/i);
  if (ksMatch) result.kostenstelle = ksMatch[1];

  // Datum
  const datumMatch = text.match(/Datum\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (datumMatch) result.datum = datumMatch[1];

  // Betreff / Name
  const betreffMatch = text.match(/Betreff[:\s]*\n?([^\n]+)/i);
  if (betreffMatch && betreffMatch[1].trim().length > 2) {
    result.name = betreffMatch[1].trim();
  } else {
    // Fallback: erste fette/große Zeile nach "Bestellung/Auftrag"
    const auftragsMatch = text.match(/Bestellung\s*\/?\s*Auftrag[:\s]*\n+([^\n]{5,80})/i);
    if (auftragsMatch) result.name = auftragsMatch[1].trim();
  }
  if (!result.name) result.fehler.push('Betreff nicht gefunden — bitte manuell eingeben');

  // Budget: "Angebotsbetrag (brutto) 9.394,65" oder "9.394,65 €"
  const bruttoMatch = text.match(/Angebotsbetrag.*?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR)?/i) ||
                      text.match(/Brutto.*?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:€|EUR)?/i);
  if (bruttoMatch) {
    const numStr = bruttoMatch[1].replace(/\./g, '').replace(',', '.');
    result.budget = parseFloat(numStr);
  }

  // Gewerk aus Werkstatt/Gewerkeschlüssel oder Kontext
  const textLower = text.toLowerCase();
  if (textLower.includes('hochbau') || textLower.includes('schreiner') || textLower.includes('maler') || textLower.includes('trockenbau')) {
    result.gewerk = 'Hochbau';
  } else {
    result.gewerk = 'Elektro'; // Standard
  }

  // Antragsteller / Name des Antragstellers
  const antragMatch = text.match(/Name des Antragstellers[:\s]+([^\n]+)/i);
  if (antragMatch) result.antragsteller = antragMatch[1].trim();

  // Abteilung
  const abtMatch = text.match(/Abt\.?\s*\/?\s*Stat\.?\s*[:\s]+([^\n]+)/i);
  if (abtMatch) result.abteilung = abtMatch[1].trim();

  return result;
}
