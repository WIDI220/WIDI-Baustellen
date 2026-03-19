export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, fileName, pageNumber, employees } = req.body;
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
- Christoph Epe (Kürzel: CE)
- Christoph Reitz (Kürzel: CR)
- Sigrid Büter (Kürzel: SB)
- Stefan Giesmann (Kürzel: SG)`;

    const prompt = `Du analysierst einen gescannten Arbeitsauftrag (Ticket) der Märkischen Kliniken GmbH.

MITARBEITERLISTE – NUR diese Personen kommen vor:
${empList}

═══════════════════════════════════════════════════════
AUFGABE: Extrahiere die folgenden 7 Felder präzise.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, kein Text davor oder danach.
═══════════════════════════════════════════════════════

━━━ FELD 1: a_nummer ━━━
Suche nach "Auftragsnr." oder "Auftrags-Nr." auf dem Formular.
Format ist immer: A26-XXXXX oder A25-XXXXX (Buchstabe A, 2-stellige Jahreszahl, Bindestrich, 5 Ziffern).
Beispiele: "A26-01284", "A25-00891"
Wenn nicht lesbar: null

━━━ FELD 2: werkstatt ━━━
Suche nach "Werkstatt:" auf dem Formular.
Typische Werte: "Hochbau", "Elektrotechnik", "Elektro", "HLS"
Exakt übernehmen was dort steht.

━━━ FELD 3: mitarbeiter_namen (ARRAY) ━━━
Finde ALLE Mitarbeiter die auf diesem Ticket stehen.
Schaue an diesen Stellen: Feld "Name:", Stempel, handschriftliche Einträge, Kürzel in der Tabelle.

ERKENNUNGSREGELN (in Priorität):
1. Stempel mit Kürzel (SG, TA, FW, UG, TB, MK, CE, CR, SB) → direkt aus Liste zuordnen, sehr sicher
2. Nachname allein (Werner, Giesmann, Alkan...) → aus Liste zuordnen  
3. Voller Name → direkt übernehmen
4. Ähnelt einem Kürzel → best-match aus Liste

PFLICHT: Gib IMMER einen nicht-leeren Array zurück wenn irgendetwas erkennbar ist.
Bei 2 Mitarbeitern (z.B. "SG / TA"): ["Stefan Giesmann", "Tarik Alkan"]

━━━ FELD 4: mitarbeiter_name ━━━
Der ERSTE Mitarbeiter aus mitarbeiter_namen als einzelner String.

━━━ FELD 5: leistungsdatum ━━━
Das handschriftliche Datum in der Tabelle unter "Datum:".
IMMER umwandeln zu Format YYYY-MM-DD.

Häufige Schreibweisen auf diesen Formularen:
- "06.01.26" → "2026-01-06"
- "6.1.26" → "2026-01-06"  
- "15.12.25" → "2025-12-15"
- "3.3.26" → "2026-03-03"
- Zweistellige Jahreszahl: 25 = 2025, 26 = 2026, 27 = 2027

Bei mehreren Datumszeilen: das FRÜHESTE Datum nehmen.
Wenn kein Datum erkennbar: null

━━━ FELD 6: stunden_gesamt ━━━
Die Zahl(en) in der Spalte "Std./Stk." (Stunden/Stück) der Arbeitstabelle.

KRITISCHE LESEREGELN für Handschrift:
• Komma ist IMMER Dezimaltrennzeichen: "1,5" = 1.5, "0,5" = 0.5, "2,5" = 2.5
• Gültige Stundenwerte auf diesen Formularen: 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0
• Stunden sind FAST NIE über 8.0 für eine einzelne Zeile
• Bei mehreren ausgefüllten Zeilen: ALLE addieren
• Leere Zeilen ignorieren

HÄUFIGE LESEFEHLER VERMEIDEN:
✗ "1,0" wird fälschlich als "10" gelesen → RICHTIG: 1.0
✗ "1,5" wird fälschlich als "15" gelesen → RICHTIG: 1.5
✗ "0,5" wird fälschlich als "05" gelesen → RICHTIG: 0.5
✗ "2,0" wird fälschlich als "20" gelesen → RICHTIG: 2.0
✗ "1,75" wird fälschlich als "175" gelesen → RICHTIG: 1.75

WENN du eine Zahl über 8 siehst: Lies nochmal – fast sicher ein Lesefehler.
Teile durch 10 wenn es Sinn macht: 15 → 1.5, 25 → 2.5, 10 → 1.0

━━━ FELD 7: konfidenz ━━━
Gesamtsicherheit von 0.0 bis 1.0:
- Stempel + klare Schrift: 0.95
- Klare Handschrift: 0.85  
- Leicht unleserlich: 0.75
- Schwer lesbar: 0.65
- Fast unleserlich: 0.55

Antworte NUR mit diesem JSON (kein Text davor/danach):
{"a_nummer":"A26-01284","werkstatt":"Hochbau","mitarbeiter_namen":["Stefan Giesmann"],"mitarbeiter_name":"Stefan Giesmann","leistungsdatum":"2026-01-06","stunden_gesamt":1.5,"konfidenz":0.9}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

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
              { type: 'text', text: prompt }
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
