/**
 * NRW Feiertage – algorithmisch berechnet, kein API-Call nötig.
 * Gibt ein Objekt zurück: { 'YYYY-MM-DD': 'Feiertagsname' }
 */
export function getNRWFeiertage(year: number): Record<string, string> {
  // Ostersonntag via Gauß-Algorithmus
  const k  = Math.floor(year / 100);
  const m  = 15 + Math.floor((3 * k + 3) / 4) - Math.floor((8 * k + 13) / 25);
  const s  = 2 - Math.floor((3 * k + 3) / 4);
  const a  = year % 19;
  const d  = (19 * a + m) % 30;
  const r  = Math.floor(d / 29) + (Math.floor(d / 28) - Math.floor(d / 29)) * Math.floor(a / 11);
  const og = 21 + d - r;
  const sz = 7 - (year + Math.floor(year / 4) + s) % 7;
  const oe = 7 - (og - sz) % 7;
  const os = og + oe; // Tage ab 21. März

  function ostern(): Date {
    if (os <= 31) return new Date(year, 2, os); // März
    return new Date(year, 3, os - 31);           // April
  }

  function addDays(date: Date, days: number): Date {
    const d2 = new Date(date);
    d2.setDate(d2.getDate() + days);
    return d2;
  }

  function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const osterSonntag = ostern();

  const feiertage: Record<string, string> = {
    // Feste Feiertage
    [`${year}-01-01`]: 'Neujahr',
    [`${year}-01-06`]: 'Heilige Drei Könige',
    [`${year}-05-01`]: 'Tag der Arbeit',
    [`${year}-10-03`]: 'Tag der Deutschen Einheit',
    [`${year}-11-01`]: 'Allerheiligen',
    [`${year}-12-25`]: '1. Weihnachtstag',
    [`${year}-12-26`]: '2. Weihnachtstag',

    // Bewegliche Feiertage (relativ zu Ostern)
    [fmt(addDays(osterSonntag, -2))]:  'Karfreitag',
    [fmt(addDays(osterSonntag,  1))]:  'Ostermontag',
    [fmt(addDays(osterSonntag, 39))]:  'Christi Himmelfahrt',
    [fmt(addDays(osterSonntag, 50))]:  'Pfingstmontag',
    [fmt(addDays(osterSonntag, 60))]:  'Fronleichnam',
  };

  return feiertage;
}
