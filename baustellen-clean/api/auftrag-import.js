export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'Keine PDF-Daten' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            {
              type: 'text',
              text: `Lies diesen Baustellenauftrag und extrahiere die Daten als JSON.
Antworte NUR mit dem JSON-Objekt, kein Text, keine Backticks.

REGEL 1 – BETREFF (wichtigste Regel):
Der Baustellenname ist IMMER der Betreff des Dokuments.
Suche nach: "Betreff:", "Re:", "Betrifft:", "Subject:", fett gedruckter Zeile nach der Anrede, oder der Überschrift des Auftrags.
Kopiere den Betreff WÖRTLICH, genau so wie er im Dokument steht.
Kürze ihn nicht, füge nichts hinzu. Nur wenn wirklich kein Betreff erkennbar ist: kurze Beschreibung der Tätigkeit.

REGEL 2 – A-NUMMER:
Suche nach Mustern wie: A-12345, A12345, Auftrags-Nr., Bestell-Nr., oder Nummern direkt im Betreff.
Gibt nur die reine Zahl zurück, z.B. "20917" (ohne "A-" Präfix, ohne "Nr.").
Wenn keine gefunden: leerer String "".

REGEL 3 – BESCHREIBUNG:
Nur Tätigkeiten beschreiben. KEINE Preise, Stundensätze, Euro-Beträge erwähnen.

REGEL 4 – BUDGET:
Immer 0. Wird manuell eingetragen.

{
  "betreff_original": "Exakter Betreff-Text aus dem Dokument, oder '' wenn keiner",
  "name": "Exakter Betreff-Text (WÖRTLICH kopiert), oder kurze Tätigkeitsbeschreibung",
  "a_nummer": "Nur die Zahl, z.B. '20917', oder ''",
  "auftraggeber": "Name des Auftraggebers/Kunden",
  "beschreibung": "Beschreibung der Arbeiten – nur Tätigkeiten, keine Preise",
  "gewerk": "Hochbau oder Elektro oder Beides",
  "startdatum": "YYYY-MM-DD oder ''",
  "enddatum": "YYYY-MM-DD oder ''",
  "ansprechpartner": "Name oder ''",
  "adresse": "Adresse/Ort oder ''"
}`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content?.find(c => c.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Datum-Fallbacks
    const today = new Date().toISOString().split('T')[0];
    const in14  = new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0];
    if (!parsed.startdatum) parsed.startdatum = today;
    if (!parsed.enddatum)   parsed.enddatum   = in14;
    if (!parsed.gewerk)     parsed.gewerk     = 'Hochbau';

    // A-Nummer bereinigen: nur Ziffern/Buchstaben, kein Präfix
    if (parsed.a_nummer) {
      parsed.a_nummer = parsed.a_nummer
        .replace(/^(A[-\s]?|Nr\.?\s*:?\s*|Auftrags?[-\s]?Nr\.?\s*:?\s*)/i, '')
        .trim();
    }

    // Name-Fallback: Betreff verwenden wenn Name leer oder generisch
    const genericNames = ['bauauftrag', 'auftrag', 'baustelle', 'bestellung', 'auftrag erteilt'];
    if (!parsed.name || genericNames.includes(parsed.name.trim().toLowerCase())) {
      parsed.name = parsed.betreff_original || 'Unbenannte Baustelle';
    }

    // Budget immer 0
    parsed.budget        = 0;
    parsed.budget_details = '';
    parsed.budget_typ    = 'festpreis';
    parsed.budget_menge  = 0;

    // Euro-Angaben aus Beschreibung entfernen
    if (parsed.beschreibung) {
      parsed.beschreibung = parsed.beschreibung
        .replace(/\d+[,.]?\d*\s*(€|Euro)(\s*\/\s*h)?[^\n]*/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('Import error:', e);
    return res.status(500).json({ error: e.message || 'Fehler beim Auslesen' });
  }
}
