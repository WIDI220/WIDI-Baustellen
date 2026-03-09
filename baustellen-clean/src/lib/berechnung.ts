// Zentrale Berechnungslogik - wird von Dashboard, BaustellenPage und BaustelleDetail genutzt

const STUNDEN_SATZ_DEFAULT = 45;

export function berechneKosten(baustelleId: string, stunden: any[], materialien: any[], nachtraege: any[], budget: number) {
  const personalkosten = stunden
    .filter(w => w.baustelle_id === baustelleId)
    .reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? STUNDEN_SATZ_DEFAULT), 0);

  const materialkosten = materialien
    .filter(m => m.baustelle_id === baustelleId)
    .reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);

  const nachtragGenehmigt = nachtraege
    .filter(n => n.baustelle_id === baustelleId && n.status === 'genehmigt')
    .reduce((s, n) => s + Number(n.betrag ?? 0), 0);

  const nachtragEingereicht = nachtraege
    .filter(n => n.baustelle_id === baustelleId && n.status === 'eingereicht')
    .reduce((s, n) => s + Number(n.betrag ?? 0), 0);

  const gesamtkosten = personalkosten + materialkosten;
  const effektivBudget = budget + nachtragGenehmigt;
  const pct = effektivBudget > 0 ? Math.min(Math.round(gesamtkosten / effektivBudget * 100), 100) : 0;
  const overBudget = gesamtkosten > effektivBudget && effektivBudget > 0;
  const verbleibend = effektivBudget - gesamtkosten;

  return { personalkosten, materialkosten, gesamtkosten, nachtragGenehmigt, nachtragEingereicht, effektivBudget, pct, overBudget, verbleibend };
}
