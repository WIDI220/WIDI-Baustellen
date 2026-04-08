export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, context } = req.body;
    if (!messages) return res.status(400).json({ error: 'messages fehlt' });

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    const SYSTEM_PROMPT = `Du bist der interne KI-Assistent des WIDI Hellersen GmbH Controlling- und Facility-Management-Systems.

ÜBER DAS SYSTEM:
Das System verwaltet zwei Bereiche:
1. BAUSTELLEN-SYSTEM: Baustellen (Hochbau + Elektro) mit Budget, Personal- und Materialkosten, Nachträgen, Fotos, Eskalationen
2. TICKET-SYSTEM: Instandhaltungsaufträge (Hausmeister) mit A-Nummern im Format A26-XXXXX oder A25-XXXXX

WICHTIGE DETAILS:
- Tickets kommen aus monatlichen Hausmeister-Excel-Dateien (Sheet "Instandhaltung")
- A-Nummern Format: A26-XXXXX (Jahr 2026), A25-XXXXX (Jahr 2025)
- Gewerk: Hochbau oder Elektro — bestimmt durch Stunden-Spalten in der Excel
- Stunden IMMER in 0,25-Schritten (also 0.25, 0.5, 0.75, 1.0 usw.)
- Mitarbeiter-Kürzel: MK=Matthias Kubista, CE=Caspar Epe, UG=Uwe Gräwe, UB=Uwe Bartelt, CR=Christoph Reitz, SB=Sigrid Büter, SG=Stefan Giesmann, FW=Frank Werner, TB=Timo Bartelt, TW=Timur Van der Werf, MM=Adrian Jargon (früher AJ/PP), JN=Jonas Neuhoff, MG=?, TA=Tarik Alkan
- Zwei Gewerk-Gruppen: Hochbau und Elektro
- Baustellen haben Status: nicht_gestartet, offen, in_bearbeitung, pausiert, abgeschlossen, abgerechnet
- Tickets haben Status: in_bearbeitung, erledigt, zur_unterschrift, abrechenbar, abgerechnet
- Budget-Typen: festpreis, stunden, stueckzahl
- Vormonat-Tickets: Tickets aus Jan/Feb die im März erledigt wurden — Ticket bleibt im ursprünglichen Monat, Stunden kommen in März (leistungsdatum)

NUTZER:
Jan Paredis — Controller / Projektmanager, einziger Nutzer des Systems (j.paredis@widi-hellersen.de)

TECH-STACK:
React + Vite + TypeScript + Supabase + Vercel
Repo: WIDI220/WIDI-Baustellen (main)
URL: widi-baustellen.vercel.app

WICHTIGE REGELN:
- Antworte IMMER auf Deutsch
- Kurz und direkt — keine langen Einleitungen
- Bei Bug-Meldungen: fasse präzise zusammen was nicht funktioniert
- Bei Datenfragen: erkläre welche SQL-Abfrage nötig wäre
- Bei Import-Fragen: Hausmeister Excel → Sheet "Instandhaltung", DDMM Datumsformat
- ON CONFLICT DO NOTHING bei Worklog-Inserts
- bs_stundeneintraege NIEMALS direkt anfassen

${context ? `\nAKTUELLE SYSTEMDATEN:\n${context}` : ''}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text ?? 'Keine Antwort erhalten.';
    return res.status(200).json({ text });

  } catch (e) {
    console.error('Chat API Error:', e);
    return res.status(500).json({ error: e.message ?? 'Unbekannter Fehler' });
  }
}
