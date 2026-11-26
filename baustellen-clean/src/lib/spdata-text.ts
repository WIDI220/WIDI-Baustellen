// SP Data „Monatsauswertung Professional“ (digitaler PDF-Export, eine Seite je Mitarbeiter) direkt im Browser auslesen.
// Kein Server, keine KI: die Werte stehen als Text in der PDF und werden über die Spaltenpositionen zugeordnet.
// Für eingescannte Monatsabrechnungen (ohne Text) bleibt der Weg über /api/spdata-lesen.
import type { SpSeite, SpTag } from './zeiterfassung';

interface It { s: string; x: number; r: number; y: number }

const MONATE: Record<string, string> = {
  januar: '01', februar: '02', 'märz': '03', maerz: '03', april: '04', mai: '05', juni: '06', juli: '07',
  august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};
const RX_ZAHL = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const zahl = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const r2 = (v: number) => Math.round(v * 100) / 100;

const tagSumme = (tage: SpTag[] | undefined, f: (t: SpTag) => number | null | undefined) => r2((tage || []).reduce((s, t) => s + (Number(f(t)) || 0), 0));

type Spalte = 'ges' | 'soll' | 'pause' | 'ist' | 'bew' | 'bestand' | 'ubew' | 'ubestand';

function spalten(items: It[]): { links: { k: Spalte; x: number }[]; abwX: number } {
  const find = (rx: RegExp, nth = 0) => {
    const treffer = items.filter(i => rx.test(i.s));
    if (!treffer.length) return undefined;
    const oben = Math.max(...treffer.map(i => i.y));
    return treffer.filter(i => Math.abs(i.y - oben) < 3).sort((a, b) => a.x - b.x)[nth];
  };
  const ges = find(/^Ges\.$/), soll = find(/^Soll$/), pause = find(/^Pause$/), ist = find(/^Ist-Zeit$/);
  const bew1 = find(/^Bewegung$/, 0), best1 = find(/^Bestand$/, 0), bew2 = find(/^Bewegung$/, 1), best2 = find(/^Bestand$/, 1);
  const abw = find(/^Abwesenheit/);
  // Standardpositionen des Exports, falls eine Überschrift fehlt
  const links: { k: Spalte; x: number }[] = [
    { k: 'ges', x: ges?.x ?? 185 }, { k: 'soll', x: soll?.x ?? 232 }, { k: 'pause', x: pause?.x ?? 281 }, { k: 'ist', x: ist?.x ?? 324 },
    { k: 'bew', x: bew1?.x ?? 361 }, { k: 'bestand', x: best1?.x ?? 396 }, { k: 'ubew', x: bew2?.x ?? 421 }, { k: 'ubestand', x: best2?.x ?? 455 },
  ];
  return { links, abwX: abw?.x ?? 484 };
}

// Zahl (rechtsbündig) der Spalte zuordnen, deren Überschrift links vom rechten Rand der Zahl beginnt
function spalteVon(r: number, links: { k: Spalte; x: number }[]): Spalte | null {
  let k: Spalte | null = null;
  for (const l of links) if (l.x < r) k = l.k;
  return k;
}

function zeilen(items: It[]): It[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: It[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= 2) last.push(it); else rows.push([it]);
  }
  rows.forEach(r => r.sort((a, b) => a.x - b.x));
  return rows;
}

export function seiteAuswerten(items: It[]): SpSeite | null {
  const titel = items.find(i => /^Monatsauswertung$/.test(i.s));
  const per = items.find(i => /^Monat\w*\s*\/\s*\d{4}$/i.test(i.s) || /^[A-Za-zäÄ]+\s*\/\s*\d{4}$/.test(i.s));
  if (!titel || !per) return null;
  const [mName, jahr] = per.s.split('/').map(s => s.trim());
  const mm = MONATE[mName.toLowerCase()];
  if (!mm) return null;
  const monat = `${jahr}-${mm}`;

  const pnLabel = items.find(i => /^Personalnummer:?$/.test(i.s));
  const personalnummer = pnLabel ? items.find(i => Math.abs(i.y - pnLabel.y) < 3 && i.x > pnLabel.x + 20 && /^[A-Z]*\d+$/.test(i.s))?.s ?? null : null;
  // Name: links unter dem Titel, Form „Nachname, Vorname“
  const name = items.filter(i => i.x < 60 && i.y < titel.y && i.y > (pnLabel?.y ?? 0) && /^[^\d:]+,\s*[^\d:]+$/.test(i.s))
    .sort((a, b) => b.y - a.y)[0]?.s.trim();
  if (!name) return null;
  const standL = items.find(i => /^Stand:?$/.test(i.s));
  const standS = standL ? items.find(i => Math.abs(i.y - standL.y) < 3 && i.x > standL.x && /^\d{2}\.\d{2}\.\d{4}$/.test(i.s))?.s : null;
  const stand = standS ? `${standS.slice(6, 10)}-${standS.slice(3, 5)}-${standS.slice(0, 2)}` : null;

  const { links, abwX } = spalten(items);
  const tage: SpTag[] = [];
  let summe: Partial<Record<Spalte, number>> | null = null;

  for (const row of zeilen(items)) {
    const datumIt = row.find(i => i.x < 80 && /^\d{2}\.\d{2}$/.test(i.s));
    const istSumme = row.some(i => /^Summe:?$/.test(i.s));
    if (!datumIt && !istSumme) continue;
    const werte: Partial<Record<Spalte, number>> = {};
    for (const i of row) {
      if (!RX_ZAHL.test(i.s) || i.x >= abwX - 2) continue;
      const k = spalteVon(i.r, links);
      if (k && werte[k] == null) werte[k] = zahl(i.s);
    }
    if (istSumme) { summe = werte; continue; }
    const [tt, mo] = datumIt!.s.split('.');
    if (mo !== mm) continue;
    const feiertag = row.some(i => i.s === '(' || i.s.startsWith(')')) || row.some(i => /^\(\d{2}\.\d{2}\)\*?$/.test(i.s));
    const zeiten = row.filter(i => /^\d{2}:\d{2}$/.test(i.s) && i.x < links[0].x);
    const anw = zeiten.filter(i => i.x < 120);
    const z = anw.length >= 2 ? anw : zeiten;
    const grund = row.filter(i => i.x >= abwX - 2 && !RX_ZAHL.test(i.s)).map(i => i.s).join(' ').trim() || null;
    const ist = werte.ist ?? null;
    const krank = grund && /krank/i.test(grund) ? (ist ?? werte.soll ?? 0) : null;
    const urlaub = grund && /urlaub/i.test(grund) ? (ist ?? werte.soll ?? 0) : null;
    const bew = werte.bew ?? null;
    if (werte.ges == null && ist == null && werte.soll == null && bew == null && !grund && !z.length) {
      tage.push({ datum: `${monat}-${tt}`, feiertag: feiertag || undefined } as SpTag);
      continue;
    }
    tage.push({
      datum: `${monat}-${tt}`, kommt_geht: z.length >= 2 ? `${z[0].s}-${z[z.length - 1].s}` : null,
      ges: werte.ges ?? null, soll: werte.soll ?? null, pause: werte.pause ?? null, ist,
      krank, urlaub, flexi: bew != null && bew < 0 ? bew : null, ue_std: bew != null && bew > 0 ? bew : null,
      bestand: werte.bestand ?? null, grund, feiertag: feiertag || undefined,
    } as SpTag);
  }

  const sum = (f: (t: SpTag) => number | null | undefined) => tagSumme(tage, f);
  const ue = sum(t => t.ue_std), fl = sum(t => t.flexi);
  return {
    name, personalnummer, monat, stand,
    summe: {
      ges: summe?.ges ?? sum(t => t.ges), soll: summe?.soll ?? sum(t => t.soll), pause: summe?.pause ?? sum(t => t.pause),
      ao: null, ist: summe?.ist ?? sum(t => t.ist),
      krank: sum(t => t.krank) || null, urlaub: sum(t => t.urlaub) || null,
      ue_std: ue, flexi: fl,
    },
    tage,
  };
}

// Liefert null, wenn die PDF keinen auswertbaren Text enthält (z. B. Scan) – dann Server-Weg nutzen.
export async function spDataTextLesen(buffer: ArrayBuffer): Promise<SpSeite[] | null> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const seiten: SpSeite[] = [];
  let textGefunden = false;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: It[] = [];
    for (const i of content.items as any[]) {
      const str = String(i.str || '');
      if (!str.trim()) continue;
      const x = i.transform[4], y = i.transform[5], w = i.width || 0;
      // Mehrere Zahlen in einem Textstück („0,87 104,43“) nach Zeichenposition aufteilen
      const teile = str.trim().split(/\s+/);
      if (teile.length > 1 && teile.every(t => RX_ZAHL.test(t))) {
        const cw = w / Math.max(1, str.length);
        let pos = 0;
        for (const t of teile) {
          const idx = str.indexOf(t, pos); pos = idx + t.length;
          items.push({ s: t, x: x + idx * cw, r: x + pos * cw, y });
        }
      } else items.push({ s: str.trim(), x, r: x + w, y });
    }
    if (items.length > 20) textGefunden = true;
    const s = seiteAuswerten(items);
    if (!s) continue;
    // Geht ein Mitarbeiter über mehrere Seiten, Tage zusammenführen
    const prev = seiten[seiten.length - 1];
    if (prev && prev.name === s.name && prev.monat === s.monat) {
      const bekannt = new Set((prev.tage || []).map(t => t.datum));
      prev.tage = [...(prev.tage || []), ...(s.tage || []).filter(t => !bekannt.has(t.datum))];
      if (s.summe.ist != null) prev.summe = { ...s.summe, krank: tagSumme(prev.tage, t => t.krank) || null, urlaub: tagSumme(prev.tage, t => t.urlaub) || null, ue_std: tagSumme(prev.tage, t => t.ue_std), flexi: tagSumme(prev.tage, t => t.flexi) };
    } else seiten.push(s);
  }
  if (!textGefunden) return null;
  return seiten;
}
