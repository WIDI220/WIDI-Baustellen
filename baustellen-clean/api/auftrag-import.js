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
              text: `Lies diesen Baustellenauftrag und extrahiere alle Informationen. 
Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Markdown-Backticks.

{
  "name": "Baustellenname aus dem Betreff oder Titel des Auftrags",
  "a_nummer": "A-Nummer oder Auftragsnummer falls vorhanden, sonst leerer String",
  "auftraggeber": "Kunde oder Auftraggeber (z.B. Klinikum Hellersen)",
  "beschreibung": "Vollständige Beschreibung der Arbeiten die gemacht werden sollen",
  "budget": Zahl in Euro als Zahl ohne Währungszeichen (alle Positionen summieren; falls Stunden angegeben: Stunden mal 45 rechnen; falls keine Angabe: 0),
  "budget_details": "Wie das Budget aufgeschlüsselt ist als Text, z.B. '8h à 45€ = 360€ + 200€ Material'",
  "gewerk": "Hochbau oder Elektro oder Beides - aus dem Kontext ableiten",
  "startdatum": "Auftragsdatum als YYYY-MM-DD, falls nicht angegeben heutiges Datum",
  "enddatum": "Frist als YYYY-MM-DD, falls nicht angegeben 14 Tage ab heute",
  "ansprechpartner": "Name des Ansprechpartners oder Unterzeichners, sonst leerer String",
  "adresse": "Ort oder Adresse der Baustelle falls angegeben, sonst leerer String"
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
    const in14 = new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0];
    if (!parsed.startdatum) parsed.startdatum = today;
    if (!parsed.enddatum) parsed.enddatum = in14;
    if (!parsed.budget) parsed.budget = 0;
    if (!parsed.gewerk) parsed.gewerk = 'Hochbau';

    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('Auftrag import error:', e);
    return res.status(500).json({ error: e.message || 'Fehler beim Auslesen' });
  }
}
