// Erkennt Budget-Typ automatisch anhand der Eingabe:
// "120h" oder "120 std" oder "120 stunden" → Stundenbudget × 38,08 €
// "50 stk" oder "50x" oder "50 stück" → Stückzahl
// "5000" oder "5.000" oder "5000 €" → Festpreis direkt

export const STUNDENSATZ = 38.08;

export type BudgetTyp = 'festpreis' | 'stunden' | 'stueckzahl';

export interface BudgetErkennungResult {
  typ: BudgetTyp;
  menge: number;
  budget: number; // berechneter Euro-Betrag
  anzeige: string; // z.B. "120h × 38,08 € = 4.569,60 €"
}

export function erkenneBudget(input: string): BudgetErkennungResult | null {
  if (!input.trim()) return null;

  const clean = input.trim().toLowerCase()
    .replace(/\./g, '') // 5.000 → 5000
    .replace(/,/g, '.') // 5,5 → 5.5
    .replace(/€/g, '')
    .trim();

  const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  // Stunden: endet auf h, std, stunden, oder enthält "stunden"
  const stundenMatch = clean.match(/^([\d.]+)\s*(h|std|stunden?|std)$/);
  if (stundenMatch) {
    const menge = parseFloat(stundenMatch[1]);
    const budget = Math.round(menge * STUNDENSATZ * 100) / 100;
    return {
      typ: 'stunden',
      menge,
      budget,
      anzeige: `${menge}h × ${fmtEur(STUNDENSATZ)} = ${fmtEur(budget)}`,
    };
  }

  // Stückzahl: endet auf stk, stück, stücke, x (nach Zahl)
  const stueckMatch = clean.match(/^([\d.]+)\s*(stk|stück|stücke|stucke|x|pcs?)$/);
  if (stueckMatch) {
    const menge = parseFloat(stueckMatch[1]);
    return {
      typ: 'stueckzahl',
      menge,
      budget: menge,
      anzeige: `${menge} Stück`,
    };
  }

  // Festpreis: reine Zahl (mit optionalem Euro-Zeichen)
  const preisMatch = clean.match(/^([\d.]+)$/);
  if (preisMatch) {
    const budget = parseFloat(preisMatch[1]);
    if (!isNaN(budget) && budget > 0) {
      return {
        typ: 'festpreis',
        menge: budget,
        budget,
        anzeige: fmtEur(budget),
      };
    }
  }

  return null;
}

export function budgetAnzeige(b: any): string {
  const fmtEur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  if (!b) return '–';
  const typ = b.budget_typ || 'festpreis';
  const menge = Number(b.budget_menge ?? 0);
  const budget = Number(b.budget ?? 0);
  if (typ === 'stunden' && menge > 0) return `${menge}h × ${fmtEur(STUNDENSATZ)} = ${fmtEur(budget)}`;
  if (typ === 'stueckzahl' && menge > 0) return `${menge} Stück`;
  return fmtEur(budget);
}
