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
        model: 'claude-haiku-4-5',
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
              text: `Lies diesen Baustellenauftrag und extrahiere folgende Informationen.
Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Markdown-Backticks.

WICHTIG: Das Budget-Feld IMMER auf 0 setzen - das wird manuell eingetragen.
Extrahiere NUR: Name, Auftraggeber, Beschreibung, Gewerk, Termine, Adresse.

{
  "name": "Baustellenname aus Betreff oder Titel",
  "a_nummer": "A-Nummer oder Auftragsnummer, sonst leerer String",
  "auftraggeber": "Auftraggeber/Kunde",
  "beschreibung": "Beschreibung der Arbeiten (NUR die Tätigkeiten, KEINE Preise oder Stundensätze erwähnen)",
  "budget": 0,
  "budget_details": "",
  "gewerk": "Hochbau oder Elektro oder Beides",
  "startdatum": "Auftragsdatum als YYYY-MM-DD",
  "enddatum": "Frist als YYYY-MM-DD, falls nicht angegeben 14 Tage ab heute",
  "ansprechpartner": "Name des Ansprechpartners, sonst leerer String",
  "adresse": "Ort oder Adresse, sonst leerer String"
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

    // Fallbacks
    const today = new Date().toISOString().split('T')[0];
    const in14  = new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0];
    if (!parsed.startdatum) parsed.startdatum = today;
    if (!parsed.enddatum)   parsed.enddatum   = in14;
    if (!parsed.gewerk)     parsed.gewerk     = 'Hochbau';

    // Budget immer auf 0 - wird manuell eingetragen
    parsed.budget        = 0;
    parsed.budget_details = '';
    parsed.budget_typ    = 'festpreis';
    parsed.budget_menge  = 0;

    // Stundensatz-Angaben aus Beschreibung entfernen (keine falschen Werte zeigen)
    if (parsed.beschreibung) {
      parsed.beschreibung = parsed.beschreibung
        .replace(/\d+h\s*(Arbeit(szeit)?)?\s*(à|a|x|\*)\s*\d+[,.]?\d*\s*€[^\n]*/gi, '')
        .replace(/Budget[^\n]*(€|Euro)[^\n]*/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('Auftrag import error:', e);
    return res.status(500).json({ error: e.message || 'Fehler beim Auslesen' });
  }
}
