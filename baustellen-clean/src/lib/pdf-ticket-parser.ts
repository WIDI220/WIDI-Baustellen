import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface TicketParseResult {
  seite: number;
  a_nummer: string | null;
  mitarbeiter: string | null;
  datum: string | null;
  datumISO: string | null;
  stunden: number | null;
  bemerkung: string | null;
  fehler: string[];
  rawText: string;
  istSonderformat: boolean;
  stundenNegativOderNull: boolean;
  bemerkungPruefen: boolean;
  bemerkungPruefenGrund: string;
}

// Nur Vornamen — Nachnamen triggern zu viele Fehlalarme
const MITARBEITER_VORNAMEN = [
  'Brian', 'Caspar', 'Christoph', 'Daniel', 'Frank', 'Jan',
  'Jörg', 'Lars', 'Marcel', 'Matthias', 'Muzaffer', 'Pascal',
  'Sigrid', 'Stefan', 'Tarik', 'Thomas', 'Tim', 'Timo',
  'Timur', 'Udo', 'Uwe', 'Valerie',
  // Spitznamen die in Bemerkungen vorkommen
  'Dimi', 'Kubista', 'Epe',
];

// Scannt Bemerkung UND Arbeitsauftrag-Text auf zusätzliche Mitarbeiter/Zeiten
// hauptMitarbeiter wird aus dem Scan ausgeschlossen — er ist ja bereits bekannt
function scanBemerkung(bemerkung: string | null, arbeitsauftrag?: string | null, hauptMitarbeiter?: string | null): { pruefen: boolean; grund: string } {
  const kombiniert = [bemerkung, arbeitsauftrag].filter(Boolean).join(' ');
  if (!kombiniert || kombiniert.trim().length < 5) return { pruefen: false, grund: '' };

  // Normale Zeitformate entfernen die keine Hinweise sind
  const bereinigt = kombiniert
    .replace(/\d{2}:\d{2}\s*Std\./gi, '')
    .replace(/\d{2}\.\d{2}\.\d{4}/g, '')
    .replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*Uhr/gi, '')
    .trim();

  const gefundeneNamen: string[] = [];
  const gefundeneZeiten: string[] = [];
  const gefundeneSchluessel: string[] = [];

  // Mitarbeiternamen suchen — Hauptmitarbeiter ausschließen
  const hauptVorname = hauptMitarbeiter?.split(' ')[0]?.toLowerCase() ?? '';
  for (const name of MITARBEITER_VORNAMEN) {
    if (name.toLowerCase() === hauptVorname) continue; // Hauptmitarbeiter überspringen
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(bereinigt)) {
      if (!gefundeneNamen.includes(name)) gefundeneNamen.push(name);
    }
  }

  // Zeitangaben — echte Stundenangaben
  const zeitPatterns = [
    /\b\d+\s+Stunden?\b/i,
    /\beine\s+Stunde\b/i,
    /\bzwei\s+Stunden?\b/i,
    /\bdrei\s+Stunden?\b/i,
    /\b[1-9]\s*h\b(?!\s*\d)/,
    /Arbeitszeit\s+am\s+\d/i,
  ];

  for (const pat of zeitPatterns) {
    const m = bereinigt.match(pat);
    if (m) {
      const treffer = m[0].trim();
      if (!gefundeneZeiten.includes(treffer)) gefundeneZeiten.push(treffer);
    }
  }

  // Schlüsselwörter für gemeinsame Arbeit
  const schluesselmuster = [
    { pat: /\bvor\s+Ort\s+mit\s+[A-Z]/i, label: 'vor Ort mit...' },
    { pat: /\bzusammen\s+mit\b/i, label: 'zusammen mit' },
    { pat: /\bgemeinsam\b/i, label: 'gemeinsam' },
    { pat: /\bunterstütz/i, label: 'Unterstützung' },
    { pat: /\bund\s+[A-Z][a-z]+\s+\d+\s+Stunde/i, label: 'und [Name] X Stunden' },
    { pat: /[A-Z][a-z]+\s+und\s+[A-Z][a-z]+\s+\d+\s+Stunde/i, label: '[Name] und [Name] X Stunden' },
    { pat: /\bhaben\s+(?:hier\s+)?geholfen\b/i, label: 'haben geholfen' },
    { pat: /\bwar\s+(?:vor\s+Ort\s+)?mit\s+[A-Z]/i, label: 'war mit...' },
  ];

  for (const { pat, label } of schluesselmuster) {
    if (pat.test(bereinigt)) {
      if (!gefundeneSchluessel.includes(label)) gefundeneSchluessel.push(label);
    }
  }

  const hatNamen = gefundeneNamen.length > 0;
  const hatZeit = gefundeneZeiten.length > 0;
  const hatSchluessel = gefundeneSchluessel.length > 0;

  // Jeder bekannte Vorname reicht — lieber zu viel prüfen als zu wenig
  const pruefen = hatNamen || hatZeit || hatSchluessel;

  if (!pruefen) return { pruefen: false, grund: '' };

  const teile: string[] = [];
  if (hatNamen) teile.push(`Name(n): ${gefundeneNamen.join(', ')}`);
  if (hatZeit) teile.push(`Zeit: ${gefundeneZeiten.join(', ')}`);
  if (hatSchluessel) teile.push(gefundeneSchluessel.join(', '));

  return {
    pruefen: true,
    grund: `Bemerkung prüfen — ${teile.join(' · ')}`,
  };
}

export async function parsePdfTickets(file: File): Promise<TicketParseResult[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const results: TicketParseResult[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];

    const chunks: { text: string; y: number; x: number }[] = [];
    for (const item of items) {
      if (item.str && item.str.trim()) {
        chunks.push({
          text: item.str,
          y: Math.round(item.transform[5]),
          x: Math.round(item.transform[4]),
        });
      }
    }

    chunks.sort((a, b) => b.y - a.y || a.x - b.x);

    let text = '';
    let lastY = -1;
    for (const chunk of chunks) {
      if (lastY !== -1 && Math.abs(chunk.y - lastY) > 3) text += '\n';
      else if (lastY !== -1) text += ' ';
      text += chunk.text;
      lastY = chunk.y;
    }

    const normalized = text
      .replace(/\bA\s*(\d{2})\s*-\s*(\d{5})\b/gi, 'A$1-$2')
      .replace(/\s+/g, ' ');

    if (!normalized.includes('Auftragsschein') && !normalized.includes('Arbeitsauftrag')) {
      continue;
    }

    results.push(parseTicketText(normalized, text, p));
  }

  return results;
}

function parseTicketText(text: string, rawText: string, seite: number): TicketParseResult {
  const result: TicketParseResult = {
    seite, rawText,
    a_nummer: null, mitarbeiter: null, datum: null, datumISO: null,
    stunden: null, bemerkung: null, fehler: [],
    istSonderformat: false,
    stundenNegativOderNull: false,
    bemerkungPruefen: false,
    bemerkungPruefenGrund: '',
  };

  // ── A-Nummer ──────────────────────────────────────────────────────────────
  const aNrPatterns = [
    /Arbeitsauftrag\s*#\s*(A\d{2}-\d{5})/i,
    /#\s*(A\d{2}-\d{5})/i,
    /Auftrags(?:schein|nr\.?)?\s*[#:\s]*(A\d{2}-\d{5})/i,
    /\b(A\d{2}-\d{5})\b/i,
  ];
  for (const pat of aNrPatterns) {
    const m = text.match(pat);
    if (m) { result.a_nummer = m[1].toUpperCase(); break; }
  }

  if (!result.a_nummer) {
    const sonderMatch = text.match(/Arbeitsauftrag\s*#\s*(\d{4,5}\s*\(#\d{4,5}\))/i)
      || text.match(/#\s*(\d{4,5}\s*\(#\d{4,5}\))/i);
    if (sonderMatch) {
      result.a_nummer = sonderMatch[1].trim();
      result.istSonderformat = true;
      result.fehler.push('Sonderformat — nicht importierbar (gesplittetes App-Ticket)');
    }
  }

  if (!result.a_nummer) result.fehler.push('A-Nummer nicht gefunden');

  // ── Mitarbeiter ───────────────────────────────────────────────────────────
  const maMatch = text.match(
    /Mitarbeiter\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,2})/
  );
  if (maMatch) {
    const name = maMatch[1].trim();
    const stoppWoerter = ['Termin', 'Datum', 'Uhrzeit', 'Werkstatt', 'Telefon',
                          'Melder', 'Kostenstelle', 'Konto', 'Vorortung',
                          'Kundennummer', 'Objektnummer'];
    let sauberName = name;
    for (const stopp of stoppWoerter) {
      const idx = name.indexOf(stopp);
      if (idx !== -1) { sauberName = name.slice(0, idx).trim(); break; }
    }
    if (sauberName.length >= 3) result.mitarbeiter = sauberName;
  }

  if (!result.mitarbeiter) {
    const altMatch = text.match(
      /Mitarbeiter\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?: [A-ZÄÖÜ][a-zäöüß]+)+)/
    );
    if (altMatch) result.mitarbeiter = altMatch[1].trim();
  }

  if (!result.mitarbeiter) result.fehler.push('Mitarbeiter nicht gefunden');

  // ── Stunden ───────────────────────────────────────────────────────────────
  const arbBlock = text.match(/Arbeitszeiten[\s\S]*?(?=Die aufgef|Datum\s+\d|$)/i);
  if (arbBlock) {
    const block = arbBlock[0];
    const gesamtMatch = block.match(/\((\d{1,2}):(\d{2})\s*Std\.\)/i);
    if (gesamtMatch) {
      const h = parseInt(gesamtMatch[1], 10);
      const m = parseInt(gesamtMatch[2], 10);
      result.stunden = Math.round((h + m / 60) * 4) / 4;
    }
    const datumMatch = block.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) result.datum = datumMatch[1];
  }

  if (!result.datum) {
    const terminMatch = text.match(/Termin\s+Datum\s*:?\s*(?:[A-Za-zäöü.]+\s*)?([\d]{2}\.[\d]{2}\.[\d]{4})/i);
    if (terminMatch) result.datum = terminMatch[1];
  }

  if (result.stunden === null) {
    result.fehler.push('Arbeitszeiten nicht erkannt — Stunden bitte prüfen');
  }

  if (result.stunden !== null && result.stunden <= 0) {
    result.stundenNegativOderNull = true;
    result.fehler.push(`Stunden ungültig (${result.stunden}h)`);
  }

  if (result.datum) {
    const m = result.datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) result.datumISO = `${m[3]}-${m[2]}-${m[1]}`;
  }

  // ── Bemerkung ─────────────────────────────────────────────────────────────
  const bemMatch = text.match(/Bemerkung\s*:?\s*\n?([\s\S]+?)(?=\nArbeitszeiten|\nDatum\s+\d|\nDie aufgef|$)/i);
  if (bemMatch) {
    result.bemerkung = bemMatch[1].replace(/\n/g, ' ').trim().slice(0, 400);
  }

  // ── Arbeitsauftrag-Text extrahieren (für Scan auf zusätzliche MA) ─────────
  let arbeitsauftragText: string | null = null;
  const auftragsMatch = text.match(/Arbeitsauftrag\s*:?\s*\n?([\s\S]+?)(?=\nBemerkung|\nArbeitszeiten|\nDatum\s+\d|$)/i);
  if (auftragsMatch) {
    arbeitsauftragText = auftragsMatch[1].replace(/\n/g, ' ').trim().slice(0, 400);
  }

  // ── Scan auf zusätzliche MA/Zeiten in Bemerkung + Arbeitsauftrag ──────────
  if (!result.istSonderformat) {
    const scan = scanBemerkung(result.bemerkung, arbeitsauftragText, result.mitarbeiter);
    result.bemerkungPruefen = scan.pruefen;
    result.bemerkungPruefenGrund = scan.grund;
  }

  return result;
}

export function getMonatFromISO(datumISO: string): string {
  return datumISO.slice(0, 7);
}
