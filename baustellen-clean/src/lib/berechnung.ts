const STUNDEN_SATZ_DEFAULT = 38.08;

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
  const pct = effektivBudget > 0 ? Math.min(Math.round(gesamtkosten / effektivBudget * 100), 999) : 0;
  const overBudget = gesamtkosten > effektivBudget && effektivBudget > 0;
  const verbleibend = effektivBudget - gesamtkosten;

  return { personalkosten, materialkosten, gesamtkosten, nachtragGenehmigt, nachtragEingereicht, effektivBudget, pct, overBudget, verbleibend };
}

// Auto-Eskalations-Regeln: gibt zurück welche Eskalationen ausgelöst werden sollten
export function pruefeAutoEskalationen(
  baustelle: any,
  stunden: any[],
  materialien: any[],
  nachtraege: any[],
  employees: any[]
): { typ: string; schwere: string; nachricht: string }[] {
  const esks: { typ: string; schwere: string; nachricht: string }[] = [];
  const k = berechneKosten(baustelle.id, stunden, materialien, nachtraege, Number(baustelle.budget ?? 0));

  // Budget-Eskalationen
  if (k.effektivBudget > 0) {
    if (k.pct >= 100) {
      esks.push({ typ: 'budget', schwere: 'kritisch', nachricht: `Budget überschritten! Kosten ${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.gesamtkosten)} übersteigen Budget ${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.effektivBudget)} um ${k.pct - 100}%.` });
    } else if (k.pct >= 90) {
      esks.push({ typ: 'budget', schwere: 'hoch', nachricht: `Budget-Warnung: ${k.pct}% des Budgets verbraucht (${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.gesamtkosten)} von ${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.effektivBudget)}).` });
    } else if (k.pct >= 75) {
      esks.push({ typ: 'budget', schwere: 'mittel', nachricht: `75% des Budgets erreicht: ${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.gesamtkosten)} von ${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(k.effektivBudget)} verbraucht.` });
    }
  }

  // Zeitüberschreitung
  if (baustelle.enddatum && baustelle.status !== 'abgeschlossen' && baustelle.status !== 'abgerechnet') {
    const daysLeft = Math.round((new Date(baustelle.enddatum).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) {
      esks.push({ typ: 'zeit', schwere: 'kritisch', nachricht: `Frist überschritten! Baustelle ist seit ${Math.abs(daysLeft)} Tagen überfällig (Frist war ${new Date(baustelle.enddatum).toLocaleDateString('de-DE')}).` });
    } else if (daysLeft <= 7) {
      esks.push({ typ: 'zeit', schwere: 'hoch', nachricht: `Frist in ${daysLeft} Tag${daysLeft === 1 ? '' : 'en'}: Baustelle muss bis ${new Date(baustelle.enddatum).toLocaleDateString('de-DE')} abgeschlossen sein.` });
    } else if (daysLeft <= 14) {
      esks.push({ typ: 'zeit', schwere: 'mittel', nachricht: `2 Wochen bis zur Frist (${new Date(baustelle.enddatum).toLocaleDateString('de-DE')}). Fortschritt prüfen.` });
    }
  }

  // Personal: Mitarbeiter mit sehr hohen Stunden diese Woche
  const wochenstart = new Date(); wochenstart.setDate(wochenstart.getDate() - wochenstart.getDay() + 1); wochenstart.setHours(0,0,0,0);
  employees.forEach(emp => {
    const wochenStunden = stunden
      .filter(w => w.baustelle_id === baustelle.id && w.mitarbeiter_id === emp.id && new Date(w.datum) >= wochenstart)
      .reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    if (wochenStunden > 60) {
      esks.push({ typ: 'personal', schwere: 'hoch', nachricht: `${emp.name} hat diese Woche ${wochenStunden}h auf dieser Baustelle – Überlastung prüfen.` });
    }
  });

  return esks;
}
