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
- Caspar Epe (Kürzel: CE)
- Christoph Reitz (Kürzel: CR)
- Sigrid Büter (Kürzel: SB)
- Stefan Giesmann (Kürzel: SG)
- Timur Van der Werf (Kürzel: TW)
- Paredis Pascal (Kürzel: PP)
- Marcel Münch (Kürzel: MM)`;

    const prompt = `Du analysierst einen gescannten Arbeitsauftrag (Ticket) der Märkischen Kliniken GmbH.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, kein Text davor oder danach.

MITARBEITERLISTE – nur diese Personen sind möglich:
${empList}

━━━ FELD 1: a_nummer ━━━
Suche nach "Auftragsnr." oben links auf dem Formular.
Format: A26-XXXXX oder A25-XXXXX
Wenn nicht lesbar: null

━━━ FELD 2: werkstatt ━━━
Suche nach "Werkstatt:" — typische Werte: "Hochbau", "Elektrotechnik", "HLS"
Exakt übernehmen.

━━━ FELD 3: mitarbeiter_namen (ARRAY) ━━━
Das Formular hat einen Abschnitt "Durchführung" mit dem Feld "Name:".
Dieses Feld kann EINEN oder MEHRERE Namen enthalten — übereinander, nebeneinander oder beide.
LIES ALLE Namen die dort stehen. Schaue auch auf den "Erledigungsvermerk".

MATCHING-REGELN:
- Voller Name (z.B. "Stefan Giesmann") → direkt übernehmen, exakt so wie in der Liste
- Nachname allein (z.B. "Giesmann") → suche in der Liste welcher Mitarbeiter diesen Nachnamen hat
- Abkürzung + Nachname (z.B. "St. Giesmann") → Nachname matchen → Stefan Giesmann
- Kürzel (z.B. "SG", "TB", "FW") → EXAKT gegen die Kürzel in der Liste matchen, keine Verwechslung
- Unbekannter Name → trotzdem zurückgeben wie geschrieben

WICHTIG: Kürzel sind EXAKT 2 Buchstaben. SG ist Stefan Giesmann, NICHT Sigrid Büter (SB).
WICHTIG: Lies das Feld vollständig — wenn zwei Namen übereinander stehen, gib beide zurück.
WICHTIG: Gib IMMER einen nicht-leeren Array zurück wenn irgendetwas erkennbar ist.

━━━ FELD 4: mitarbeiter_name ━━━
Der erste Mitarbeiter aus mitarbeiter_namen als einzelner String.

━━━ FELD 5: leistungsdatum ━━━
Das handschriftliche Datum aus der Arbeitstabelle unter "Datum:".
Wenn mehrere Zeilen ausgefüllt sind: nimm das SPÄTESTE (= letzte) Datum.
Format YYYY-MM-DD. Zweistelliges Jahr: 25=2025, 26=2026.
Beispiele: "06.01.26" → "2026-01-06", "5.1.26" → "2026-01-06"
Wenn kein Datum: null

━━━ FELD 6: stunden_gesamt ━━━
Die Arbeitstabelle hat genau diese Spalten von links nach rechts:
  [Datum] | [Von (Uhrzeit)] | [Bis (Uhrzeit)] | [Std./Stk.] | [Ausgeführte Arbeiten]

SCHRITT 1 — Finde die Spalte "Std./Stk.":
Sie ist die 4. Spalte, steht NACH Von/Bis und VOR der Beschreibung. Oft schmal.
Nur in dieser Spalte stehen Stundenwerte wie: 0,25 / 0,5 / 0,75 / 1,0 / 1,5 / 2,0 / 2,5 usw.

SCHRITT 2 — Lies JEDE Zeile der Std./Stk. Spalte einzeln:
• Komma = Dezimaltrennzeichen: "2,0"=2.0 "0,5"=0.5 "1,5"=1.5 "0,25"=0.25 "1,75"=1.75
• Handschrift ohne Komma: "20" in Std./Stk. ist fast immer "2,0"=2.0, "15"=1.5, "10"=1.0, "05"=0.5
• Wenn Von/Bis ergibt z.B. 2.0h aber Std./Stk. zeigt 0.75h → nimm Von/Bis (Std./Stk. falsch gelesen)
• Mehrere ausgefüllte Zeilen → ALLE Werte aus Std./Stk. addieren → das ist stunden_gesamt
• Es ist normal dass mehrere Zeilen = mehrere Tage bedeuten — alle addieren
• Leere Zeilen ignorieren

SCHRITT 3 — Was NIEMALS Stunden sind:
• Uhrzeiten mit Doppelpunkt (14:00, 7:45, 9:10) → das sind Von/Bis Zeiten, KEINE Stunden
• Datumswerte (05.01, 6.1.26, 29.12) → das ist das Datum, KEINE Stunden
• Zahlen aus der Beschreibungsspalte → ignorieren

SCHRITT 4 — Plausibilitätsprüfung mit Von/Bis:
Berechne für JEDE Zeile die Differenz Bis minus Von, dann alle addieren.
Beispiel: Zeile 1: 14:00–14:45 = 0.75h + Zeile 2: 7:45–9:15 = 1.5h → Summe = 2.25h
• Weichen Std./Stk. Summe und Von/Bis Summe um mehr als 0.5h ab → nimm Von/Bis Summe
• Std./Stk. leer oder unleserlich → berechne komplett aus Von/Bis
• Von/Bis nicht ausgefüllt → nimm nur Std./Stk.

━━━ FELD 7: arbeitszeit_von ━━━
Uhrzeit aus der Spalte "Von:" der ersten Zeile. Format "HH:MM". Sonst null.

━━━ FELD 8: arbeitszeit_bis ━━━
Uhrzeit aus der Spalte "Bis:" der ersten Zeile. Format "HH:MM". Sonst null.

━━━ FELD 9: konfidenz ━━━
0.0–1.0 — wie sicher bist du bei Mitarbeiter UND Stunden zusammen?
Klare Handschrift: 0.85–0.95. Unleserlich: 0.55–0.70.

Antworte NUR mit diesem JSON:
{"a_nummer":"A26-01284","werkstatt":"Hochbau","mitarbeiter_namen":["Stefan Giesmann","Frank Werner"],"mitarbeiter_name":"Stefan Giesmann","leistungsdatum":"2026-01-06","stunden_gesamt":1.5,"arbeitszeit_von":"09:00","arbeitszeit_bis":"10:30","konfidenz":0.9}`;

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
