// PDF-Parser ohne KI — nutzt pdfjs-dist um Text zu extrahieren
// Erkennt feste Muster: A-Nummer, Mitarbeiter, Arbeitszeiten, Bemerkung

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 fehlt' });

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjsLib = pdfjs.default ?? pdfjs;

    const buffer = Buffer.from(pdfBase64, 'base64');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;

    const results = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map(i => i.str).join(' ');

      const ergebnis = parseTicketText(text, p);
      results.push(ergebnis);
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('PDF-Parse Fehler:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

function parseTicketText(text, seite) {
  const result = { seite, raw: text, a_nummer: null, mitarbeiter: null, datum: null, stunden: null, bemerkung: null, fehler: [] };

  // A-Nummer: "# A26-07430" oder "A26-07430"
  const aNrMatch = text.match(/#\s*(A\d{2}-\d{5})/i) || text.match(/\b(A\d{2}-\d{5})\b/i);
  if (aNrMatch) result.a_nummer = aNrMatch[1].toUpperCase();
  else result.fehler.push('A-Nummer nicht gefunden');

  // Mitarbeiter: "Mitarbeiter Caspar Epe" oder "Mitarbeiter: Caspar Epe"
  const maMatch = text.match(/Mitarbeiter[:\s]+([A-ZÄÖÜa-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß]+)+)/);
  if (maMatch) result.mitarbeiter = maMatch[1].trim();
  else result.fehler.push('Mitarbeiter nicht gefunden');

  // Arbeitszeiten: "14.04.2026 10:08 - 10:23 Uhr (00:15 Std.)"
  // oder "14.04.2026 08:00 - 16:00 Uhr (08:00 Std.)"
  const zeitMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*Uhr[^(]*\((\d{1,2}):(\d{2})\s*Std/i);
  if (zeitMatch) {
    result.datum = zeitMatch[1]; // DD.MM.YYYY
    const stunden = parseInt(zeitMatch[4], 10) + parseInt(zeitMatch[5], 10) / 60;
    result.stunden = Math.round(stunden * 4) / 4; // auf 0,25 runden
  } else {
    // Fallback: nur Datum
    const datumMatch = text.match(/Termin\s+Datum[:\s]+[A-Za-z.]+\s*(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) result.datum = datumMatch[1];
    result.fehler.push('Arbeitszeiten nicht gefunden');
  }

  // Bemerkung: Text nach "Bemerkung:" bis zum nächsten Abschnitt
  const bemMatch = text.match(/Bemerkung[:\s]+(.+?)(?:Arbeitszeiten|Datum|$)/is);
  if (bemMatch) result.bemerkung = bemMatch[1].trim().slice(0, 300);

  return result;
}
