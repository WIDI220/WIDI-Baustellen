import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart2, TrendingUp, Award, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Farben ────────────────────────────────────────────────────────────────
const COLORS = ['#2563eb','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4'];
function scoreColor(pct: number) { return pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444'; }
function fmtMonat(m: string) {
  const [y,mo] = m.split('-');
  const n = ['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `${n[parseInt(mo)]} ${y}`;
}

// ── Gauge Diagramm (Tacho-Style) ──────────────────────────────────────────
function GaugeChart({ ist, soll, name, farbe }: { ist: number; soll: number; name: string; farbe: string }) {
  const pct    = soll > 0 ? Math.min(ist / soll * 100, 120) : 0;
  const angle  = -210 + (pct / 120) * 240;
  const r      = 54;
  const cx     = 70; const cy = 72;
  const toRad  = (d: number) => d * Math.PI / 180;
  const arcX   = (a: number) => cx + r * Math.cos(toRad(a));
  const arcY   = (a: number) => cy + r * Math.sin(toRad(a));
  // Bogen von -210° bis angle
  const startA = -210; const endA = startA + (pct / 120) * 240;
  const laf    = endA - startA > 180 ? 1 : 0;
  const col    = scoreColor(pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Hintergrund-Bogen */}
        <path d={`M ${arcX(startA)} ${arcY(startA)} A ${r} ${r} 0 1 1 ${arcX(-210+240)} ${arcY(-210+240)}`}
          fill="none" stroke="#f1f5f9" strokeWidth="10" strokeLinecap="round"/>
        {/* Wert-Bogen */}
        {pct > 0 && (
          <path d={`M ${arcX(startA)} ${arcY(startA)} A ${r} ${r} 0 ${laf} 1 ${arcX(endA)} ${arcY(endA)}`}
            fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"/>
        )}
        {/* Zeiger */}
        <line
          x1={cx} y1={cy}
          x2={cx + (r - 14) * Math.cos(toRad(angle))}
          y2={cy + (r - 14) * Math.sin(toRad(angle))}
          stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="4" fill={col}/>
        {/* Wert */}
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="13" fontWeight="800" fill={col}>{Math.round(pct)}%</text>
        {/* Ist */}
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="9" fill="#94a3b8">{ist.toLocaleString('de-DE')} / {soll.toLocaleString('de-DE')}</text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{name}</p>
        <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, fontWeight: 600, background: col + '18', color: col }}>
          {pct >= 100 ? '✓ Ziel erreicht' : pct >= 80 ? '⚠ Kritisch' : '✗ Unter Ziel'}
        </span>
      </div>
    </div>
  );
}

// ── Heatmap Kalender ──────────────────────────────────────────────────────
function Heatmap({ data, pruefer, farbe }: { data: Record<string,number>; pruefer: string; farbe: string }) {
  const days = Object.entries(data).sort(([a],[b]) => a.localeCompare(b));
  const max  = Math.max(...Object.values(data), 1);
  const wochentag = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const fmtTag = (d: string) => { const dt = new Date(d); return `${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')} (${wochentag[dt.getDay()]})`; };

  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{pruefer} — Tages-Aktivität</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {days.map(([d, count]) => {
          const intensity = count / max;
          return (
            <div key={d} title={`${fmtTag(d)}: ${count} Messungen`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: intensity > 0 ? farbe : '#e2e8f0', opacity: 0.2 + intensity * 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: intensity > 0.4 ? '#fff' : '#64748b' }}>{count}</span>
              </div>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{new Date(d).getDate()}.{(new Date(d).getMonth()+1).toString().padStart(2,'0')}.</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Radial/Jahres-Chart ───────────────────────────────────────────────────
function RadialChart({ data }: { data: { monat: string; pruefer: Record<string,number> }[] }) {
  const allePruefer = [...new Set(data.flatMap(d => Object.keys(d.pruefer)))];
  const maxVal      = Math.max(...data.flatMap(d => Object.values(d.pruefer)), 1);

  const CX = 160; const CY = 160; const R_max = 120; const R_min = 30;
  const toRad = (d: number) => d * Math.PI / 180;
  const months = data.length;
  const sliceAngle = 360 / months;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width="320" height="320" viewBox="0 0 320 320">
        {/* Konzentische Ringe */}
        {[25,50,75,100].map(pct => {
          const r = R_min + (R_max - R_min) * pct / 100;
          return <circle key={pct} cx={CX} cy={CY} r={r} fill="none" stroke="#f1f5f9" strokeWidth=".5"/>;
        })}
        {/* Radialen Linien */}
        {data.map((_, i) => {
          const a = toRad(i * sliceAngle - 90);
          return <line key={i} x1={CX} y1={CY} x2={CX + R_max * Math.cos(a)} y2={CY + R_max * Math.sin(a)} stroke="#f1f5f9" strokeWidth=".5"/>;
        })}
        {/* Daten pro Prüfer */}
        {allePruefer.map((p, pi) => {
          const points = data.map((d, i) => {
            const val = d.pruefer[p] ?? 0;
            const r = R_min + (R_max - R_min) * (val / maxVal);
            const a = toRad(i * sliceAngle - 90);
            return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
          });
          const pathD = points.map((pt, i) => `${i===0?'M':'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ') + ' Z';
          return (
            <g key={p}>
              <path d={pathD} fill={COLORS[pi] + '25'} stroke={COLORS[pi]} strokeWidth="1.5"/>
              {points.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r="3" fill={COLORS[pi]}/>)}
            </g>
          );
        })}
        {/* Monatsbeschriftungen */}
        {data.map((d, i) => {
          const a = toRad(i * sliceAngle - 90);
          const x = CX + (R_max + 16) * Math.cos(a);
          const y = CY + (R_max + 16) * Math.sin(a);
          return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#64748b">{fmtMonat(d.monat).slice(0,3)}</text>;
        })}
      </svg>
      {/* Legende */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allePruefer.map((p, i) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{p}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
          Außen = mehr Messungen<br/>Innen = weniger Messungen
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Seite ───────────────────────────────────────────────────────────
export default function DGUVMessAuswertung() {
  const [ansicht, setAnsicht] = useState<'monat'|'jahr'>('monat');
  const [selectedMonat, setSelectedMonat] = useState('');

  const { data: pruefer = [] } = useQuery({
    queryKey: ['dguv-pruefer'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer').select('*').eq('aktiv', true).order('name'); return data ?? []; }
  });

  const { data: alleMonate = [] } = useQuery({
    queryKey: ['dguv-monate'],
    queryFn: async () => {
      const { data } = await supabase.from('dguv_messungen').select('import_monat').order('import_monat', { ascending: false });
      return [...new Set((data ?? []).map((r: any) => r.import_monat))];
    }
  });

  // Aktuellen Monat vorauswählen
  const aktuellerMonat = useMemo(() => {
    if (selectedMonat) return selectedMonat;
    return (alleMonate as string[])[0] ?? '';
  }, [selectedMonat, alleMonate]);

  const { data: monatsData } = useQuery({
    queryKey: ['dguv-auswertung-monat', aktuellerMonat],
    enabled: !!aktuellerMonat,
    queryFn: async () => {
      const { data } = await supabase.from('dguv_messungen').select('pruefer_name, pruef_datum, ergebnis').eq('import_monat', aktuellerMonat);
      return data ?? [];
    }
  });

  const { data: jahresData } = useQuery({
    queryKey: ['dguv-auswertung-jahr'],
    queryFn: async () => {
      const { data } = await supabase.from('dguv_messungen').select('pruefer_name, pruef_datum, import_monat').order('pruef_datum');
      return data ?? [];
    }
  });

  // Monatsdaten aufbereiten
  const monatStats = useMemo(() => {
    if (!monatsData || !pruefer.length) return [];
    const p = pruefer as any[];
    const soll = p[0]?.soll_monat ?? 0;

    const byPruefer: Record<string, { ist: number; bestanden: number; tage: Record<string,number> }> = {};
    (monatsData as any[]).forEach(r => {
      if (!byPruefer[r.pruefer_name]) byPruefer[r.pruefer_name] = { ist: 0, bestanden: 0, tage: {} };
      byPruefer[r.pruefer_name].ist++;
      if (r.ergebnis?.toLowerCase().includes('bestanden')) byPruefer[r.pruefer_name].bestanden++;
      byPruefer[r.pruefer_name].tage[r.pruef_datum] = (byPruefer[r.pruefer_name].tage[r.pruef_datum] ?? 0) + 1;
    });

    return Object.entries(byPruefer).map(([name, d], i) => {
      const matched = p.find((pr: any) => pr.csv_name === name || pr.name === name);
      return { name: matched?.name ?? name, kuerzel: matched?.kuerzel ?? name.slice(0,2), ist: d.ist, soll, bestanden: d.bestanden, tage: d.tage, farbe: COLORS[i % COLORS.length], score: soll > 0 ? Math.round(d.ist / soll * 100) : 0 };
    }).sort((a,b) => b.ist - a.ist);
  }, [monatsData, pruefer]);

  // Jahresdaten aufbereiten
  const jahresStats = useMemo(() => {
    if (!jahresData) return [];
    const byMonat: Record<string, Record<string,number>> = {};
    (jahresData as any[]).forEach(r => {
      if (!byMonat[r.import_monat]) byMonat[r.import_monat] = {};
      const p = pruefer as any[];
      const matched = p.find((pr: any) => pr.csv_name === r.pruefer_name || pr.name === r.pruefer_name);
      const displayName = matched?.name ?? r.pruefer_name;
      byMonat[r.import_monat][displayName] = (byMonat[r.import_monat][displayName] ?? 0) + 1;
    });
    return Object.entries(byMonat).sort(([a],[b]) => a.localeCompare(b)).map(([monat, prData]) => ({ monat, pruefer: prData }));
  }, [jahresData, pruefer]);

  const gesamtIst  = monatStats.reduce((s, p) => s + p.ist, 0);
  const gesamtSoll = monatStats.reduce((s, p) => s + p.soll, 0);
  const avgScore   = monatStats.length ? Math.round(monatStats.reduce((s,p) => s + p.score, 0) / monatStats.length) : 0;
  const topPruefer = [...monatStats].sort((a,b) => b.score - a.score)[0];

  const monate = alleMonate as string[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 32, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Messungen <span style={{ color: '#f59e0b' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Produktivität · Soll/Ist Vergleich · Jahresrückblick</p>
        </div>
        {/* Ansicht Toggle */}
        <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
          {([['monat','Monatsansicht'],['jahr','Jahresrückblick']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setAnsicht(k)}
              style={{ padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: ansicht===k ? '#fff' : 'transparent', color: ansicht===k ? '#0f172a' : '#94a3b8', boxShadow: ansicht===k ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {monate.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '64px', textAlign: 'center', color: '#94a3b8' }}>
          <BarChart2 size={48} style={{ marginBottom: 16, opacity: .2 }} />
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Noch keine Daten importiert</p>
          <p style={{ fontSize: 13, margin: 0 }}>Lade unter "Import" eine CSV-Datei hoch</p>
        </div>
      )}

      {/* ── MONATSANSICHT ──────────────────────────────────────── */}
      {ansicht === 'monat' && monate.length > 0 && (
        <>
          {/* Monat Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => { const i = monate.indexOf(aktuellerMonat); if (i < monate.length-1) setSelectedMonat(monate[i+1]); }}
              disabled={monate.indexOf(aktuellerMonat) >= monate.length-1}
              style={{ padding: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', display: 'flex', opacity: monate.indexOf(aktuellerMonat) >= monate.length-1 ? .4 : 1 }}>
              <ChevronLeft size={16} style={{ color: '#374151' }} />
            </button>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 20px', display: 'flex', gap: 8 }}>
              {monate.map(m => (
                <button key={m} onClick={() => setSelectedMonat(m)}
                  style={{ padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: m===aktuellerMonat ? 700 : 400, cursor: 'pointer', background: m===aktuellerMonat ? '#f59e0b' : 'transparent', color: m===aktuellerMonat ? '#fff' : '#64748b', transition: 'all .15s' }}>
                  {fmtMonat(m)}
                </button>
              ))}
            </div>
            <button onClick={() => { const i = monate.indexOf(aktuellerMonat); if (i > 0) setSelectedMonat(monate[i-1]); }}
              disabled={monate.indexOf(aktuellerMonat) <= 0}
              style={{ padding: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', display: 'flex', opacity: monate.indexOf(aktuellerMonat) <= 0 ? .4 : 1 }}>
              <ChevronRight size={16} style={{ color: '#374151' }} />
            </button>
          </div>

          {/* KPI Karten */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {[
              { label: 'Gesamt Messungen', value: gesamtIst.toLocaleString('de-DE'), sub: `Soll: ${gesamtSoll.toLocaleString('de-DE')}`, icon: BarChart2, color: '#f59e0b' },
              { label: 'Ø Produktivität', value: avgScore + '%', sub: avgScore >= 100 ? 'Ziel erreicht' : 'Unter Ziel', icon: TrendingUp, color: scoreColor(avgScore) },
              { label: 'Top Prüfer', value: topPruefer?.name ?? '–', sub: topPruefer ? topPruefer.ist + ' Messungen' : '', icon: Award, color: '#2563eb' },
              { label: 'Aktive Tage', value: monatStats.reduce((s,p) => s + Object.keys(p.tage).length, 0) + '', sub: 'Prüftage gesamt', icon: Calendar, color: '#10b981' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: '16px 16px 0 0' }} />
                <k.icon size={17} style={{ color: k.color, marginBottom: 10 }} />
                <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-.02em' }}>{k.value}</p>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 2px', fontWeight: 600 }}>{k.label}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Gauge Charts */}
          {monatStats.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Soll / Ist — {fmtMonat(aktuellerMonat)}</h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>Tacho zeigt Zielerreichung · grün = Ziel erreicht · gelb = kritisch · rot = unter Ziel</p>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
                {monatStats.map(p => (
                  <GaugeChart key={p.name} ist={p.ist} soll={p.soll} name={p.name} farbe={p.farbe} />
                ))}
              </div>
            </div>
          )}

          {/* Produktivitäts-Details */}
          {monatStats.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Produktivitäts-Details</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Aufschlüsselung pro Prüfer · Bestanden-Quote · Aktivste Tage</p>
              </div>
              {monatStats.map((p, idx) => {
                const bestandenPct = p.ist > 0 ? Math.round(p.bestanden / p.ist * 100) : 0;
                const aktivTage = Object.keys(p.tage).length;
                const avgPerTag = aktivTage > 0 ? Math.round(p.ist / aktivTage) : 0;
                const topTag = Object.entries(p.tage).sort(([,a],[,b]) => b-a)[0];
                return (
                  <div key={p.name} style={{ padding: '18px 20px', borderBottom: idx < monatStats.length-1 ? '1px solid #f8fafc' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: p.farbe + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: p.farbe }}>{p.kuerzel}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{p.name}</span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: scoreColor(p.score) }}>{p.score}%</span>
                        </div>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(p.score, 100)}%`, background: `linear-gradient(90deg,${p.farbe},${scoreColor(p.score)})`, borderRadius: 99, transition: 'width .6s ease' }} />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                      {[
                        { label: 'Ist', value: p.ist.toLocaleString('de-DE'), sub: `Soll: ${p.soll.toLocaleString('de-DE')}`, color: scoreColor(p.score) },
                        { label: 'Bestanden', value: bestandenPct + '%', sub: `${p.bestanden.toLocaleString('de-DE')} von ${p.ist.toLocaleString('de-DE')}`, color: '#10b981' },
                        { label: 'Aktive Tage', value: aktivTage + '', sub: `Ø ${avgPerTag}/Tag`, color: '#2563eb' },
                        { label: 'Bester Tag', value: topTag ? topTag[1] + '' : '–', sub: topTag ? new Date(topTag[0]).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}) : '', color: '#8b5cf6' },
                      ].map(s => (
                        <div key={s.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                          <p style={{ fontSize: 16, fontWeight: 800, color: s.color, margin: '0 0 2px' }}>{s.value}</p>
                          <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</p>
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{s.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Heatmap */}
                    <div style={{ marginTop: 12 }}>
                      <Heatmap data={p.tage} pruefer={p.name} farbe={p.farbe} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── JAHRESRÜCKBLICK ────────────────────────────────────── */}
      {ansicht === 'jahr' && (
        <>
          {jahresStats.length < 2 ? (
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              <Calendar size={36} style={{ marginBottom: 12, opacity: .2 }} />
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Mindestens 2 Monate für den Jahresrückblick nötig</p>
              <p style={{ fontSize: 13, margin: 0 }}>Bisher {jahresStats.length} Monat importiert</p>
            </div>
          ) : (
            <>
              {/* Radial Chart */}
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Jahres-Radialchart</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>Jede Achse = ein Monat · Je weiter außen, desto mehr Messungen</p>
                <RadialChart data={jahresStats} />
              </div>

              {/* Monatsvergleich Balken */}
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Monatsvergleich</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px' }}>Messungen pro Monat nach Prüfer · gestapelt</p>
                {(() => {
                  const allePruefer = [...new Set(jahresStats.flatMap(d => Object.keys(d.pruefer)))];
                  const maxVal = Math.max(...jahresStats.map(d => Object.values(d.pruefer).reduce((s,v) => s+v, 0)), 1);
                  const soll = (pruefer as any[])[0]?.soll_monat ?? 0;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {jahresStats.map(d => {
                        const total = Object.values(d.pruefer).reduce((s,v) => s+v, 0);
                        const pct   = soll > 0 ? Math.round(total / ((pruefer as any[]).filter(p=>p.aktiv).length * soll) * 100) : 0;
                        return (
                          <div key={d.monat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 52, fontSize: 12, fontWeight: 600, color: '#64748b', flexShrink: 0, textAlign: 'right' }}>{fmtMonat(d.monat)}</div>
                            <div style={{ flex: 1, height: 32, background: '#f8fafc', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                              <div style={{ display: 'flex', height: '100%' }}>
                                {allePruefer.map((p, pi) => {
                                  const val  = d.pruefer[p] ?? 0;
                                  const w    = (val / maxVal) * 100;
                                  return w > 0 ? (
                                    <div key={p} title={`${p}: ${val}`}
                                      style={{ width: `${w}%`, background: COLORS[pi % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {w > 8 && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{val}</span>}
                                    </div>
                                  ) : null;
                                })}
                              </div>
                              {/* Soll-Linie */}
                              {soll > 0 && (
                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min((soll * (pruefer as any[]).filter(p=>p.aktiv).length / maxVal) * 100, 100)}%`, width: 2, background: '#0f172a', opacity: .4 }} />
                              )}
                            </div>
                            <div style={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(pct) }}>{total.toLocaleString('de-DE')}</span>
                              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 3 }}>Stk</span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Legende */}
                      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                        {allePruefer.map((p, pi) => (
                          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[pi % COLORS.length] }}/>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{p}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 2, height: 14, background: '#0f172a', opacity: .4 }}/>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Soll-Linie</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Jahres-Zusammenfassung Tabelle */}
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Jahres-Zusammenfassung</h3>
                </div>
                {(() => {
                  const allePruefer = [...new Set(jahresStats.flatMap(d => Object.keys(d.pruefer)))];
                  const soll = (pruefer as any[])[0]?.soll_monat ?? 0;
                  return (
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Prüfer</th>
                          {jahresStats.map(d => <th key={d.monat} style={{ padding: '10px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>{fmtMonat(d.monat).slice(0,3)}</th>)}
                          <th style={{ padding: '10px 16px', textAlign: 'right', color: '#94a3b8', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Gesamt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allePruefer.map((p, pi) => {
                          const gesamt = jahresStats.reduce((s, d) => s + (d.pruefer[p] ?? 0), 0);
                          const avgPct = soll > 0 ? Math.round((gesamt / (jahresStats.length * soll)) * 100) : 0;
                          return (
                            <tr key={p} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[pi % COLORS.length], flexShrink: 0 }}/>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{p}</span>
                                </div>
                              </td>
                              {jahresStats.map(d => {
                                const val = d.pruefer[p] ?? 0;
                                const mp  = soll > 0 ? Math.round(val/soll*100) : 0;
                                return (
                                  <td key={d.monat} style={{ padding: '12px 10px', textAlign: 'center' }}>
                                    <span style={{ fontWeight: 700, color: val > 0 ? scoreColor(mp) : '#e2e8f0' }}>{val > 0 ? val.toLocaleString('de-DE') : '–'}</span>
                                  </td>
                                );
                              })}
                              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                <span style={{ fontSize: 15, fontWeight: 900, color: scoreColor(avgPct) }}>{gesamt.toLocaleString('de-DE')}</span>
                                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>({avgPct}%)</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
