// Liest die monatliche Sammelrechnung (PDF-Export „sammelrechnung_JJJJ_MM.pdf“) aus.
// Ergebnis: Belege (Rechnung, interner Buchungsbeleg, Gutschrift, Storno …) und ihre Positionen.
// Die Textzeilen werden aus der PDF so nachgebaut, dass Spalten durch mindestens zwei Leerzeichen
// getrennt sind (wie „pdftotext -layout“); darauf arbeiten die Muster unten.

export interface SrBeleg {
  beleg: string;
  typ: string;
  kunde: string;
  kdnr: string;
  belegdatum: string; // TT.MM.JJJJ
  faellig: string;
  bezug: string;
  kopf: string;
  a_nummer: string | null; // erste A-Nr. im Kopf (Auftragsrechnung)
  netto: number | null;
  steuer: number | null;
  brutto: number | null;
}

export interface SrPosition {
  beleg: string;
  typ: string;
  kunde: string;
  belegdatum: string;
  kst: string | null;
  abteilung: string | null;
  leistungsdatum: string; // TT.MM.JJJJ
  menge: number;
  einheit: string;
  leistung: string;
  text: string;
  ep: number;
  gp: number; // Gutschrift/Storno negativ
  a_nummer: string | null;
}

export interface SrErgebnis {
  belege: SrBeleg[];
  positionen: SrPosition[];
  pruefung: { belegeMitAbweichung: number; belegeOhneNetto: number };
}

const NEG_TYPEN = ['Gutschrift', 'Stornorechnung'];
const RX_ANR = /A2\d-\d{5}/;

function num(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

// ── PDF → Textzeilen (Layout) ────────────────────────────────────────────────
export interface TextItemLike { str: string; transform: number[]; width: number; height?: number }

export function itemsToLines(items: TextItemLike[]): string[] {
  const its = items.filter(i => i.str && i.str.trim() !== '');
  if (!its.length) return [];
  // Zeichenbreite schätzen (Median der Breite je Zeichen)
  const cws = its.filter(i => i.str.length > 0 && i.width > 0).map(i => i.width / i.str.length).sort((a, b) => a - b);
  const cw = cws.length ? cws[Math.floor(cws.length / 2)] : 5;
  // Zeilen nach y gruppieren (Toleranz ~ 40 % der Zeichenhöhe)
  const sorted = [...its].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const rows: TextItemLike[][] = [];
  let curY: number | null = null;
  for (const it of sorted) {
    const y = it.transform[5];
    const tol = Math.max(2, (it.height || Math.abs(it.transform[3]) || 8) * 0.4);
    if (curY === null || Math.abs(y - curY) > tol) { rows.push([it]); curY = y; }
    else rows[rows.length - 1].push(it);
  }
  return rows.map(r => {
    r.sort((a, b) => a.transform[4] - b.transform[4]);
    let line = '';
    let endX = 0;
    r.forEach((it, idx) => {
      const x = it.transform[4];
      if (idx > 0) {
        const gap = x - endX;
        if (gap > cw * 1.6) line += ' '.repeat(Math.max(2, Math.round(gap / cw)));
        else if (gap > cw * 0.2 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
      } else {
        line += ' '.repeat(Math.max(0, Math.round(x / cw / 2)));
      }
      line += it.str;
      endX = x + it.width;
    });
    return line.replace(/\s+$/, '');
  });
}

export async function pdfToLines(buffer: ArrayBuffer, onProgress?: (seite: number, gesamt: number) => void): Promise<string[]> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items as TextItemLike[]));
    lines.push('');
    onProgress?.(p, pdf.numPages);
  }
  return lines;
}

// ── Textzeilen → Belege und Positionen ───────────────────────────────────────
export function parseSammelrechnung(lines: string[]): SrErgebnis {
  const hdr = /Lüdenscheid\s+(Rechnung|Gutschrift|interner Buchungsbeleg|Storno[\w-]*|Stornorechnung|Teilrechnung|Schlussrechnung)\s+(\d+)\s*$/;
  // Einheit + Leistung: bekannte Einheiten dürfen mit nur einem Leerzeichen am Leistungstext stehen
  const posRe1 = /^\s*(\d{2}\.\d{2}\.\d{4})\s+(-?[\d.]+,\d+)\s+(Stk\.|Std\.|psch\.|€|m²|lfd\. m)\s+(.+?)\s{2,}(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const posRe2 = /^\s*(\d{2}\.\d{2}\.\d{4})\s+(-?[\d.]+,\d+)\s+(\S+(?: \S+)?)\s{2,}(.+?)\s{2,}(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
  const posRe = { test: (l: string) => posRe1.test(l) || posRe2.test(l), exec: (l: string) => posRe1.exec(l) || posRe2.exec(l) };
  const kst1 = /Abteilung\/Kst\s+(.*?)\s+-\s+(\d{6})\s*$/;
  const kst2 = /Kostenstelle:\s*(\d{6})\s*$/;
  type Cur = SrBeleg & { _kopf: string[]; _inkopf: boolean };
  const belege: Cur[] = [];
  const positionen: (SrPosition & { _text: string[] })[] = [];
  let cur: Cur | null = null;
  let kst: string | null = null, abt: string | null = null;
  let last: (SrPosition & { _text: string[] }) | null = null;
  let inSchein = false;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = hdr.exec(l);
    if (m) {
      let kunde = '';
      for (const l2 of lines.slice(i + 1, i + 6)) { if (l2.trim()) { kunde = l2.trim().split(/\s{3,}/)[0]; break; } }
      cur = { beleg: m[2], typ: m[1], kunde, kdnr: '', belegdatum: '', faellig: '', bezug: '', kopf: '', a_nummer: null, netto: null, steuer: null, brutto: null, _kopf: [], _inkopf: false };
      belege.push(cur); kst = null; abt = null; last = null; inSchein = false;
      continue;
    }
    if (l.includes('Auftragsschein / Arbeitsauftrag')) { inSchein = true; last = null; continue; }
    if (!cur || inSchein) continue;
    const s = l.trim();
    if (s.startsWith('Datum') && s.includes('Leistung')) { cur._inkopf = true; continue; }
    if (cur._inkopf && (kst1.test(l) || kst2.test(l) || posRe.test(l))) cur._inkopf = false;
    if (cur._inkopf && s && !s.startsWith('Seite')) cur._kopf.push(s);
    const kd = /Kundennummer\s+(\S+)/.exec(l); if (kd && !cur.kdnr) cur.kdnr = kd[1];
    const bd = /Belegdatum\s+(\S+)/.exec(l); if (bd && !cur.belegdatum) cur.belegdatum = bd[1];
    const fa = /Fällig am\s+(\S+)/.exec(l); if (fa && !cur.faellig) cur.faellig = fa[1];
    if (/^((Teil)?[Gg]utschrift zu|Storno zu|zu Rechnung|Sammelrechnung)/.test(s) && !cur.bezug) cur.bezug = s;
    let mk = kst1.exec(l);
    if (mk) { abt = mk[1]; kst = mk[2]; last = null; continue; }
    mk = kst2.exec(l);
    if (mk) { abt = ''; kst = mk[1]; last = null; continue; }
    const mp = posRe.exec(l);
    if (mp) {
      last = { beleg: cur.beleg, typ: cur.typ, kunde: cur.kunde, belegdatum: cur.belegdatum, kst, abteilung: abt, leistungsdatum: mp[1], menge: num(mp[2]), einheit: mp[3], leistung: mp[4].trim(), text: '', ep: num(mp[5]), gp: num(mp[6]), a_nummer: null, _text: [] };
      positionen.push(last);
      continue;
    }
    const sums: [keyof SrBeleg, RegExp][] = [
      ['netto', /(Zwischensumme EUR|Nettobetrag)\s+(-?[\d.]+,\d{2})/],
      ['steuer', /(Erst\. n\. abzgsf\. Vst\.|MwSt\.)\s*\([\d,]+ %\)\s+(-?[\d.]+,\d{2})/],
      ['brutto', /(Rechnungsbetrag EUR|Rechnungsbetrag \(brutto\)|Gutschriftsbetrag \(brutto\)|Gesamtbetrag)\s+(-?[\d.]+,\d{2})/],
    ];
    for (const [key, re] of sums) {
      const mm = re.exec(l);
      if (mm) { (cur as any)[key] = num(mm[2]); last = null; }
    }
    if (last && s && !/^(Seite |Datum |EUR|Powered)/.test(s)) last._text.push(s);
  }

  const outB: SrBeleg[] = belege.map(({ _kopf, _inkopf, ...b }) => {
    const kopf = _kopf.join(' / ').split(' / EUR')[0];
    const neg = NEG_TYPEN.includes(b.typ);
    const sign = (v: number | null) => (v == null ? null : neg ? -Math.abs(v) : v);
    return { ...b, kopf, a_nummer: (RX_ANR.exec(kopf) || [null])[0], netto: sign(b.netto), steuer: sign(b.steuer), brutto: sign(b.brutto) };
  });
  const bmap = new Map(outB.map(b => [b.beleg, b]));
  const outP: SrPosition[] = positionen.map(({ _text, ...p }) => {
    const text = _text.join(' ');
    const neg = NEG_TYPEN.includes(p.typ);
    const b = bmap.get(p.beleg);
    return {
      ...p, text, belegdatum: b?.belegdatum || p.belegdatum,
      gp: neg ? -Math.abs(p.gp) : p.gp, ep: neg ? -Math.abs(p.ep) : p.ep,
      a_nummer: (RX_ANR.exec(`${p.leistung} ${text}`) || [null])[0] || b?.a_nummer || null,
    };
  });
  // Plausibilität: Summe der Positionen = Netto je Beleg
  let abw = 0, ohne = 0;
  for (const b of outB) {
    if (b.netto == null) { ohne++; continue; }
    const sum = outP.filter(p => p.beleg === b.beleg).reduce((s, p) => s + p.gp, 0);
    if (Math.abs(sum - b.netto) > 0.05) abw++;
  }
  return { belege: outB, positionen: outP, pruefung: { belegeMitAbweichung: abw, belegeOhneNetto: ohne } };
}

// Leistungsmonat (JJJJ-MM) = häufigster Monat der Leistungsdaten
export function leistungsmonat(pos: SrPosition[]): string | null {
  const c = new Map<string, number>();
  for (const p of pos) { const [, m, y] = p.leistungsdatum.split('.'); const k = `${y}-${m}`; c.set(k, (c.get(k) || 0) + 1); }
  let best: string | null = null, n = 0;
  c.forEach((v, k) => { if (v > n) { n = v; best = k; } });
  return best;
}
