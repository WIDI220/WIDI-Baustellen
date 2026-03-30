export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, fileName, pageNumber, employees, uploadMonth, uploadYear } = req.body;
    const now = new Date();
    const aktuellerMonat = uploadMonth ?? String(now.getMonth() + 1).padStart(2, '0');
    const aktuellesJahr = uploadYear ?? String(now.getFullYear());
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 fehlt' });

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    const empList = employees && employees.length > 0
      ? employees.map(e => `- ${e.name} (Kürzel: ${e.kuerzel})`).join('\n')
      : `- Frank Werner (Kürzel: FW)
- Uwe Gräwe (Kürzel: UG)
- Tarik Alkan (Kürzel: TA)
- Timo Bartelt (Kürzel: TB)
- Matthias Kubista (Kürzel: MK)
- Caspar Epe (Kürzel: CE)
- Christoph Reitz (Kürzel: CR)
- Sigrid Büter (Kürzel: SB)
- Stefan Giesmann (Kürzel: SG)
- Timur Van der Werf (Kürzel: TW)
- Paredis Pascal (Kürzel: PP)
- Marcel Münch (Kürzel: MM)`;

    const prompt = `Analysiere diesen Arbeitsauftrag der Märkischen Kliniken GmbH.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt ohne Text davor oder danach.

MITARBEITERLISTE (nur diese Personen existieren):
${empList}

FELDER ZUM AUSLESEN:

1. a_nummer
Wo: Oben links, Zeile "Auftragsnr.:"
Format: A26-XXXXX oder A25-XXXXX (gedruckt, nicht handschriftlich)
Fehlt: null

2. werkstatt  
Wo: Rechte Seite der Auftragsdaten, Zeile "Werkstatt:"
Werte: exakt so übernehmen wie gedruckt — "Elektrotechnik", "Hochbau", "HLS"
WICHTIG: Lies was wirklich dort steht. Elektrotechnik ≠ Hochbau.

3. mitarbeiter_namen (Array)
Wo: Unterer Teil des Formulars, Zeile "Bearbeiter: WIDI Gebäudeservice GmbH (LÜD)" — rechts daneben steht handschriftlich "Name: [Handschrift]"
NUR dieses handschriftliche Name-Feld auslesen.
Matching: 
  - 2 Großbuchstaben (MK, SG, CE...) → exakt gegen Kürzel matchen
  - Nachname erkennbar → aus Liste suchen
  - Unsicher → lieber weglassen als falsch raten

4. mitarbeiter_name
Erster Eintrag aus mitarbeiter_namen als String.

5. leistungsdatum
Wo: In der ARBEITSTABELLE (mit Spalten Datum/Von/Bis/Std) — handschriftlich in der "Datum" Spalte
NICHT: "Beauftragt von ... am XX.XX.XXXX" — das ist das Eingangsdatum, IGNORIEREN
Format: YYYY-MM-DD. 26=2026, 25=2025.
Kontext: Upload-Monat ist {{UPLOAD_MONTH}}/{{UPLOAD_YEAR}}
Kein Datum erkennbar: null

6. stunden_gesamt
Wo: Spalte "Std./Stk." in der Arbeitstabelle (4. Spalte, nach Von und Bis)
Komma ist Dezimalzeichen: 0,5→0.5  1,5→1.5  0,25→0.25
Mehrere Zeilen: alle addieren
Plausibilitätsprüfung: Bis minus Von sollte ungefähr gleich sein
Nicht lesbar: null

7. arbeitszeit_von / arbeitszeit_bis
Uhrzeiten aus Spalten "Von" und "Bis" der ersten Zeile. Format HH:MM. Sonst null.

8. konfidenz
0.0-1.0 — Sicherheit bei Name + Stunden zusammen.

Antworte NUR mit:
{"a_nummer":"A26-02015","werkstatt":"Elektrotechnik","mitarbeiter_namen":["Matthias Kubista"],"mitarbeiter_name":"Matthias Kubista","leistungsdatum":"2026-01-14","stunden_gesamt":0.5,"arbeitszeit_von":"12:15","arbeitszeit_bis":"12:45","konfidenz":0.85}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    // Monat/Jahr in Prompt einsetzen
    const finalPrompt = prompt
      .replace(/{{UPLOAD_MONTH}}/g, aktuellerMonat)
      .replace(/{{UPLOAD_YEAR}}/g, aktuellesJahr);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          temperature: 0,
          messages: [{
            role: 'user',
            content: [
              { 
                type: 'image', 
                source: { 
                  type: 'base64', 
                  media_type: 'image/png', 
                  data: imageBase64 
                } 
              },
              { type: 'text', text: finalPrompt }
            ]
          }]
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        return res.status(200).json({
          success: false,
          error: `Claude API ${response.status}: ${errText.slice(0, 200)}`,
          fileName, pageNumber
        });
      }

      const data = await response.json();
      const rawText = data.content[0]?.text ?? '';
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(200).json({ 
          success: false, 
          error: 'Kein JSON in Antwort', 
          raw: rawText, 
          fileName, pageNumber 
        });
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Stunden-Validierung: Werte über 8 sind fast immer Lesefehler
      if (parsed.stunden_gesamt && parsed.stunden_gesamt > 8) {
        const korrigiert = parsed.stunden_gesamt / 10;
        if (korrigiert >= 0.25 && korrigiert <= 8) {
          parsed.stunden_gesamt_original = parsed.stunden_gesamt;
          parsed.stunden_gesamt = korrigiert;
          parsed.stunden_korrigiert = true;
        }
      }

      // mitarbeiter_namen immer als Array
      if (!parsed.mitarbeiter_namen || !Array.isArray(parsed.mitarbeiter_namen)) {
        parsed.mitarbeiter_namen = parsed.mitarbeiter_name ? [parsed.mitarbeiter_name] : [];
      }

      // Konfidenz senken wenn Stunden korrigiert wurden
      if (parsed.stunden_korrigiert) {
        parsed.konfidenz = Math.min(parsed.konfidenz ?? 0.8, 0.75);
      }

      return res.status(200).json({ 
        success: true, 
        result: parsed,
        raw: rawText
      });

    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(200).json({ 
          success: false, 
          error: `Timeout nach 30s | Datei: ${fileName} | Seite: ${pageNumber}` 
        });
      }
      throw fetchErr;
    }

  } catch (err) {
    return res.status(500).json({ error: err.message, fileName, pageNumber });
  }
}
