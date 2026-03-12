export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STUNDENSATZ = 38.08;

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

WICHTIG für das Budget:
- Falls eine Stundenanzahl angegeben ist: Stunden × ${STUNDENSATZ} Euro rechnen (KEIN Material einrechnen!)
- Falls ein Festpreis angegeben ist: diesen direkt übernehmen
- Falls Stückzahl angegeben: Stückzahl als Zahl angeben
- Material gehört NICHT ins Budget
- budget_typ: "stunden" wenn Stunden angegeben, "festpreis" wenn Festbetrag, "stueckzahl" wenn Stückzahl
- budget_menge: die rohe Zahl (Stunden ODER Festbetrag ODER Stückzahl)

{
  "name": "Baustellenname aus dem Betreff oder Titel",
  "a_nummer": "A-Nummer oder Auftragsnummer falls vorhanden, sonst leerer String",
  "auftraggeber": "Kunde oder Auftraggeber",
  "beschreibung": "Vollständige Beschreibung der Arbeiten",
  "budget_typ": "stunden" oder "festpreis" oder "stueckzahl",
  "budget_menge": Zahl (Stunden ODER Festbetrag ODER Stückzahl),
  "budget": Berechnetes Budget in Euro (bei Stunden: Stunden × ${STUNDENSATZ}, bei Festpreis: direkt, bei Stückzahl: Stückzahl),
  "budget_details": "Aufschlüsselung als Text z.B. '230h × ${STUNDENSATZ}€ = ${230*STUNDENSATZ}€ (ohne Material)'",
  "gewerk": "Hochbau oder Elektro oder Beides",
  "startdatum": "Auftragsdatum als YYYY-MM-DD",
  "enddatum": "Frist als YYYY-MM-DD, falls nicht angegeben 14 Tage ab heute",
  "ansprechpartner": "Name des Ansprechpartners, sonst leerer String",
  "adresse": "Ort oder Adresse der Baustelle, sonst leerer String"
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
    if (!parsed.startdatum)  parsed.startdatum  = today;
    if (!parsed.enddatum)    parsed.enddatum    = in14;
    if (!parsed.budget_typ)  parsed.budget_typ  = 'festpreis';
    if (!parsed.budget_menge)parsed.budget_menge= parsed.budget || 0;
    if (!parsed.gewerk)      parsed.gewerk      = 'Hochbau';

    // Sicherheitsnetz: Budget nochmal korrekt berechnen - IMMER mit 38.08
    if (parsed.budget_typ === 'stunden') {
      parsed.budget = Math.round(parsed.budget_menge * STUNDENSATZ * 100) / 100;
      parsed.budget_details = `${parsed.budget_menge}h × ${STUNDENSATZ}€ = ${parsed.budget}€ (Material nicht enthalten)`;
    }

    // Stundensatz in Beschreibung korrigieren falls KI falschen Wert schreibt
    if (parsed.beschreibung) {
      parsed.beschreibung = parsed.beschreibung
        .replace(/à\s*45\s*€/gi, `à ${STUNDENSATZ}€`)
        .replace(/x\s*45\s*€/gi, `× ${STUNDENSATZ}€`)
        .replace(/\*\s*45\s*€/gi, `× ${STUNDENSATZ}€`)
        .replace(/45\s*Euro\/h/gi, `${STUNDENSATZ} Euro/h`)
        .replace(/Stundensatz:\s*45/gi, `Stundensatz: ${STUNDENSATZ}`);
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('Auftrag import error:', e);
    return res.status(500).json({ error: e.message || 'Fehler beim Auslesen' });
  }
}
