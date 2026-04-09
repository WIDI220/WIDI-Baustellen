import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell,
} from 'recharts';
import { TrendingUp, Award, Calendar, Target, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];
const MONAT_NAMEN = ['', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function scoreColor(pct: number) {
  return pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444';
}

function fmtM(m: string) {
  if (!m) return '';
  const [, mo] = m.split('-');
  return MONAT_NAMEN[parseInt(mo)] ?? m;
}

// ── Dark Tooltip ──────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', minWidth: 140 }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 2 }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>{typeof p.value === 'number' ? p.value.toLocaleString('de-DE') : p.value}</span>
        </div>
      ))}
    </div>
  );
}


export default function DGUVMessAuswertung() {
  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear);
  // ── Daten laden ──────────────────────────────────────────────────────────
  const { data: pruefer = [] } = useQuery({
    queryKey: ['dguv-pruefer'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer').select('*').eq('aktiv', true).order('name'); return data ?? []; }
  });

  const { data: messungen = [] } = useQuery({
    queryKey: ['dguv-messungen-jahr', year],
    queryFn: async () => {
      const { data } = await supabase
        .from('dguv_messungen')
        .select('pruefer_name, pruef_datum, ergebnis, import_monat')
        .gte('pruef_datum', `${year}-01-01`)
        .lte('pruef_datum', `${year}-12-31`)
        .order('pruef_datum');
      return data ?? [];
    }
  });

  const { data: alleMonate = [] } = useQuery({
    queryKey: ['dguv-alle-monate'],
    queryFn: async () => {
      const { data } = await supabase.from('dguv_messungen').select('import_monat');
      const jahre = [...new Set((data ?? []).map((r: any) => r.import_monat?.slice(0, 4)))].filter(Boolean).map(Number).sort();
      return jahre;
    }
  });

  const p   = pruefer   as any[];
  const m   = messungen as any[];
  const soll = p[0]?.soll_monat ?? 0;

  // Prüfer-Name Matching
  const matchName = (csvName: string) => {
    const found = p.find((pr: any) => pr.name?.toLowerCase().trim() === csvName?.toLowerCase().trim());
    return found?.name ?? csvName;
  };
  const matchKuerzel = (csvName: string) => {
    const found = p.find((pr: any) => pr.name?.toLowerCase().trim() === csvName?.toLowerCase().trim());
    return found?.kuerzel ?? csvName?.slice(0, 2).toUpperCase();
  };

  // ── Monatsdaten für Hauptchart ───────────────────────────────────────────
  const monatsDaten = useMemo(() => {
    const allePruefer = [...new Set(m.map((r: any) => r.pruefer_name))];
    const byMonat: Record<number, Record<string, number>> = {};
    for (let i = 1; i <= 12; i++) byMonat[i] = {};

    m.forEach((r: any) => {
      const mo = new Date(r.pruef_datum).getMonth() + 1;
      const name = matchName(r.pruefer_name);
      byMonat[mo][name] = (byMonat[mo][name] ?? 0) + 1;
    });

    // Nur Monate mit Daten
    const result = [];
    for (let i = 1; i <= 12; i++) {
      const hasData = Object.values(byMonat[i]).some(v => v > 0);
      if (!hasData) continue;
      const total = Object.values(byMonat[i]).reduce((s, v) => s + v, 0);
      result.push({
        monat: MONAT_NAMEN[i],
        monatNr: i,
        gesamt: total,
        ...Object.fromEntries(
          allePruefer.map(n => [matchName(n), byMonat[i][matchName(n)] ?? 0])
        ),
      });
    }
    return result;
  }, [m, p]);

  // ── Prüfer-Stats ─────────────────────────────────────────────────────────
  const prueférStats = useMemo(() => {
    const byP: Record<string, { ist: number; bestanden: number; monate: Set<string> }> = {};
    m.forEach((r: any) => {
      const name = matchName(r.pruefer_name);
      if (!byP[name]) byP[name] = { ist: 0, bestanden: 0, monate: new Set() };
      byP[name].ist++;
      if ((r.ergebnis ?? '').toLowerCase().includes('bestanden') && !(r.ergebnis ?? '').toLowerCase().includes('nicht')) {
        byP[name].bestanden++;
      }
      byP[name].monate.add(r.import_monat);
    });

    return Object.entries(byP).map(([name, d], i) => ({
      name,
      kuerzel: matchKuerzel(name),
      ist: d.ist,
      bestanden: d.bestanden,
      aktiveMonate: d.monate.size,
      sollJahr: soll * d.monate.size,
      score: (soll * d.monate.size) > 0 ? Math.round(d.ist / (soll * d.monate.size) * 100) : 0,
      farbe: COLORS[i % COLORS.length],
    })).sort((a, b) => b.ist - a.ist);
  }, [m, p, soll]);

  // ── Trend-Linie (Gesamtmessungen pro Monat) ──────────────────────────────
  const trendData = monatsDaten.map(d => ({ monat: d.monat, Messungen: d.gesamt, Soll: soll * p.filter((x: any) => x.aktiv).length }));

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const gesamtJahr    = m.length;
  const aktiveMonate  = new Set(m.map((r: any) => r.import_monat)).size;
  const avgMonat      = aktiveMonate > 0 ? Math.round(gesamtJahr / aktiveMonate) : 0;
  const gesamtSollJahr = soll * p.filter((x: any) => x.aktiv).length * aktiveMonate;
  const jahresScore   = gesamtSollJahr > 0 ? Math.round(gesamtJahr / gesamtSollJahr * 100) : 0;
  const allePruefer   = [...new Set(m.map((r: any) => matchName(r.pruefer_name)))];
  const jahre         = alleMonate as number[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 40, fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* ── Header mit Jahr-Selektor ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            DGUV <span style={{ color: '#f59e0b' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
            Messungen · Prüfer-Leistung · Soll/Ist-Analyse — {year}
          </p>
        </div>

        {/* Jahr Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '6px 10px' }}>
          <button onClick={() => setYear(y => y - 1)}
            style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: 8, color: '#64748b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f1f5f9'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            {(jahre.length > 0 ? jahre : [curYear]).map(y => (
              <button key={y} onClick={() => setYear(y)}
                style={{ padding: '5px 14px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: y === year ? 700 : 500, cursor: 'pointer', background: y === year ? '#f59e0b' : 'transparent', color: y === year ? '#fff' : '#64748b', transition: 'all .15s' }}>
                {y}
              </button>
            ))}
          </div>
          <button onClick={() => setYear(y => y + 1)}
            style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: 8, color: '#64748b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f1f5f9'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Keine Daten */}
      {m.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '64px', textAlign: 'center', color: '#94a3b8' }}>
          <BarChart2 size={48} style={{ marginBottom: 16, opacity: .2 }} />
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#64748b' }}>Keine Messungen für {year}</p>
          <p style={{ fontSize: 13, margin: 0 }}>Lade unter "Messungen Import" eine CSV-Datei hoch</p>
        </div>
      )}

      {m.length > 0 && (
        <>
          {/* ── KPI Karten ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              {
                label: 'Messungen gesamt', value: gesamtJahr.toLocaleString('de-DE'),
                sub: `${aktiveMonate} Monate importiert`, icon: BarChart2, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a',
              },
              {
                label: 'Ø pro Monat', value: avgMonat.toLocaleString('de-DE'),
                sub: `Soll: ${(soll * p.filter((x:any)=>x.aktiv).length).toLocaleString('de-DE')}/Monat`, icon: TrendingUp, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
              },
              {
                label: 'Jahres-Score', value: jahresScore + '%',
                sub: jahresScore >= 100 ? '✓ Jahresziel erreicht' : jahresScore >= 80 ? 'Nahe am Ziel' : 'Unter Ziel', icon: Target, color: scoreColor(jahresScore), bg: scoreColor(jahresScore) + '12', border: scoreColor(jahresScore) + '30',
              },
              {
                label: 'Aktive Prüfer', value: allePruefer.length + '',
                sub: `${p.filter((x:any)=>x.aktiv).length} im System aktiv`, icon: Award, color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0',
              },
            ].map((k, i) => (
              <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 16, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: '16px 16px 0 0' }} />
                <k.icon size={17} style={{ color: k.color, marginBottom: 10 }} />
                <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-.03em' }}>{k.value}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 3px' }}>{k.label}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* ── HAUPTCHART: Gestapelter Balken nach Prüfer ──────────────────── */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Messungen pro Monat — {year}</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Gestapelt nach Prüfer · Linie = Soll-Stückzahl</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {allePruefer.map((name, i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                    {name}
                  </div>
                ))}
                {soll > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                    <div style={{ width: 16, height: 2, background: '#94a3b8', borderRadius: 1 }} />
                    Soll
                  </div>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monatsDaten} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString('de-DE')} />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
                {allePruefer.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]}
                    radius={i === allePruefer.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
                {soll > 0 && (
                  <Line
                    type="monotone"
                    data={trendData}
                    dataKey="Soll"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    legendType="none"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Unteres Grid: Pie + Prüfer-Tabelle ──────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>

            {/* Proportional Bars */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Anteil pro Prüfer</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>Anteil an Gesamtmessungen {year}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {prueférStats.map((pr, i) => {
                  const pct = gesamtJahr > 0 ? Math.round(pr.ist / gesamtJahr * 100) : 0;
                  return (
                    <div key={pr.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: pr.farbe + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: pr.farbe }}>{pr.kuerzel}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{pr.name}</span>
                        </div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: pr.farbe }}>{pr.ist.toLocaleString('de-DE')}</span>
                      </div>
                      <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${pr.farbe},${pr.farbe}aa)`, borderRadius: 99, transition: 'width .6s ease' }}/>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        <span>{pct}% der Gesamtmessungen</span>
                        <span>{pr.aktiveMonate} Monate aktiv</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Gesamt</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{gesamtJahr.toLocaleString('de-DE')}</span>
                </div>
              </div>
            </div>

            {/* Prüfer-Tabelle */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 14px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Prüfer-Leistung {year}</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Soll/Ist · Score · Bestanden-Quote</p>
              </div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    {['Prüfer', 'Messungen', 'Soll Gesamt', 'Score', 'Bestanden', 'Ø/Monat'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Prüfer' ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prueférStats.map((pr, i) => {
                    const bestandenPct = pr.ist > 0 ? Math.round(pr.bestanden / pr.ist * 100) : 0;
                    const avgM = pr.aktiveMonate > 0 ? Math.round(pr.ist / pr.aktiveMonate) : 0;
                    return (
                      <tr key={pr.name} style={{ borderBottom: i < prueférStats.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: pr.farbe + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: pr.farbe }}>{pr.kuerzel}</span>
                            </div>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{pr.name}</p>
                              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{pr.aktiveMonate} Monate aktiv</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{pr.ist.toLocaleString('de-DE')}</span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#64748b' }}>
                          {pr.sollJahr > 0 ? pr.sollJahr.toLocaleString('de-DE') : '–'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(pr.score) }}>{pr.score}%</span>
                            <div style={{ width: 80, height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(pr.score, 100)}%`, background: scoreColor(pr.score), borderRadius: 99 }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: bestandenPct >= 95 ? '#10b981' : '#f59e0b' }}>{bestandenPct}%</span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>
                          {avgM.toLocaleString('de-DE')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Gesamt-Zeile */}
                {prueférStats.length > 1 && (
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>Gesamt</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, fontSize: 16, color: '#f59e0b' }}>
                        {gesamtJahr.toLocaleString('de-DE')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b' }}>
                        {gesamtSollJahr > 0 ? gesamtSollJahr.toLocaleString('de-DE') : '–'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: scoreColor(jahresScore) }}>
                        {jahresScore}%
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ── Trend-Linie ─────────────────────────────────────────────────── */}
          {monatsDaten.length >= 2 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Verlauf — Gesamtmessungen</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Monatliche Entwicklung · gestrichelt = Soll</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="monat" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString('de-DE')} />
                  <Tooltip content={<DarkTooltip />} cursor={{ stroke: '#f1f5f9', strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="Messungen" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  {soll > 0 && <Line type="monotone" dataKey="Soll" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
