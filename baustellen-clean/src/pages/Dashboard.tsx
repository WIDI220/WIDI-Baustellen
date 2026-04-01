import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, ArrowRight, Zap, PauseCircle } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  nicht_gestartet: { label: 'Nicht gestartet', color: '#888780', bg: '#F1EFE8', text: '#2C2C2A' },
  offen:           { label: 'Offen',            color: '#64748b', bg: '#f8fafc', text: '#475569' },
  in_bearbeitung:  { label: 'In Bearbeitung',   color: '#2563eb', bg: '#eff6ff', text: '#1d4ed8' },
  pausiert:        { label: 'Pausiert',          color: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
  abgeschlossen:   { label: 'Abgeschlossen',    color: '#10b981', bg: '#f0fdf4', text: '#065f46' },
  abgerechnet:     { label: 'Abgerechnet',       color: '#8b5cf6', bg: '#faf5ff', text: '#5b21b6' },
};

function fmt(n: number): string {
  if (n >= 100000) return (n / 1000).toFixed(0) + 'k €';
  if (n >= 1000)   return (n / 1000).toFixed(1) + 'k €';
  return Math.round(n) + ' €';
}

function BudgetChart({ bsK }: { bsK: any[] }) {
  const [filter, setFilter] = useState<Set<string>>(new Set(['in_bearbeitung', 'pausiert']));

  const FILTER_OPTIONS = [
    { key: 'in_bearbeitung', label: 'In Bearbeitung', color: '#2563eb' },
    { key: 'pausiert',       label: 'Pausiert',        color: '#f59e0b' },
    { key: 'offen',          label: 'Offen',           color: '#64748b' },
  ];

  const data = useMemo(() =>
    bsK.filter(b => filter.has(b.status) && b.effektivBudget > 0),
    [bsK, filter]
  );

  const toggleFilter = (key: string) => {
    setFilter(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size <= 1) return prev; next.delete(key); }
      else next.add(key);
      return next;
    });
  };

  const totalBudget   = data.reduce((s, b) => s + b.effektivBudget, 0);
  const totalPersonal = data.reduce((s, b) => s + b.personalkosten, 0);
  const totalMaterial = data.reduce((s, b) => s + b.materialkosten, 0);
  const totalKosten   = data.reduce((s, b) => s + b.gesamtkosten, 0);
  const avgPct        = totalBudget > 0 ? Math.round(totalKosten / totalBudget * 100) : 0;
  const overList      = data.filter(b => b.gesamtkosten > b.effektivBudget);
  const perHeavy      = data.filter(b => b.effektivBudget > 0 && b.personalkosten / b.effektivBudget > 0.5);
  const noKosten      = data.filter(b => b.gesamtkosten === 0 && b.effektivBudget > 0);
  const MAXPCT        = 130;

  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: '24px 26px', border: '1px solid #f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 3px' }}>Budget · Personal · Material</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Eigene Skala pro Baustelle · Budget-Grenze = 100% · Schraffur = Überschreitung</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map(f => (
            <button key={f.key} onClick={() => toggleFilter(f.key)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, border: filter.has(f.key) ? 'none' : '1px solid #e2e8f0', background: filter.has(f.key) ? f.color : 'transparent', color: filter.has(f.key) ? '#fff' : '#94a3b8', cursor: 'pointer', fontWeight: 500, transition: 'all .15s' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legende */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { color: '#2563eb', label: 'Personal' },
          { color: '#f59e0b', label: 'Material' },
          { color: '#cbd5e1', label: 'Sonstige' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            {l.label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
          <div style={{ width: 3, height: 10, background: '#0f172a', borderRadius: 1 }} />
          = 100% Budget
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
          <div style={{ width: 16, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg,rgba(220,38,38,.25),rgba(220,38,38,.25) 2px,transparent 2px,transparent 5px)' }} />
          Über Budget
        </div>
      </div>

      {/* Achse */}
      <div style={{ display: 'flex', paddingLeft: 200, paddingRight: 150, marginBottom: 6 }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
          {['0%', '25%', '50%', '75%', '100% (Budget)', '125%'].map(l => <span key={l}>{l}</span>)}
        </div>
      </div>

      {/* Zeilen */}
      {data.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#cbd5e1', fontSize: 13 }}>Keine Baustellen für gewählten Filter</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.map((b: any, idx: number) => {
            const total    = b.gesamtkosten;
            const personal = b.personalkosten;
            const material = b.materialkosten;
            const sonstige = Math.max(0, total - personal - material);
            const budget   = b.effektivBudget;
            const pct      = budget > 0 ? Math.round(total / budget * 100) : 0;
            const over     = total > budget;
            const warn     = pct > 80 && !over;
            const pctColor = over ? '#dc2626' : warn ? '#b45309' : '#059669';
            const rowBg    = over ? 'rgba(254,242,242,0.6)' : warn ? 'rgba(255,251,235,0.5)' : 'transparent';
            const budgetLineLeft = Math.round(100 / MAXPCT * 100);
            const barW  = Math.min(pct, MAXPCT) / MAXPCT * 100;
            const pW    = total > 0 ? Math.round(personal / total * 100) : 0;
            const mW    = total > 0 ? Math.round(material / total * 100) : 0;
            const personalOfBudget = budget > 0 ? Math.round(personal / budget * 100) : 0;
            const materialOfBudget = budget > 0 ? Math.round(material / budget * 100) : 0;
            const personalOfTotal  = total > 0  ? Math.round(personal / total  * 100) : 0;
            const materialOfTotal  = total > 0  ? Math.round(material / total  * 100) : 0;
            const st = STATUS_CFG[b.status] ?? STATUS_CFG.offen;

            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'stretch', gap: 0, padding: '10px 0', borderBottom: idx < data.length - 1 ? '1px solid #f8fafc' : 'none', background: rowBg, borderRadius: 6 }}>
                {/* Links */}
                <div style={{ width: 200, flexShrink: 0, paddingRight: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>{b.name}</div>
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: st.bg, color: st.text, fontWeight: 600, display: 'inline-block', alignSelf: 'flex-start' }}>{st.label}</span>
                </div>
                {/* Mitte */}
                <div style={{ flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                  <div style={{ position: 'relative', height: 26 }}>
                    <div style={{ position: 'absolute', inset: 0, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      {over && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${budgetLineLeft}%`, right: 0, background: 'repeating-linear-gradient(45deg,rgba(220,38,38,.18),rgba(220,38,38,.18) 3px,transparent 3px,transparent 7px)' }} />}
                    </div>
                    {barW > 0 && (
                      <div style={{ position: 'absolute', top: 0, left: 0, height: 26, width: `${barW}%`, display: 'flex', borderRadius: 4, overflow: 'hidden', transition: 'width .4s ease' }}>
                        <div style={{ width: `${pW}%`, background: '#2563eb', minWidth: personal > 0 ? 3 : 0 }} />
                        <div style={{ width: `${mW}%`, background: '#f59e0b', minWidth: material > 0 ? 3 : 0 }} />
                        <div style={{ flex: 1, background: '#cbd5e1', minWidth: sonstige > 0 ? 2 : 0 }} />
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${budgetLineLeft}%`, width: 3, background: '#0f172a', borderRadius: 1, zIndex: 2 }}>
                      <div style={{ position: 'absolute', top: 0, left: -4, width: 11, height: 3, background: '#0f172a', borderRadius: 1 }} />
                      <div style={{ position: 'absolute', bottom: 0, left: -4, width: 11, height: 3, background: '#0f172a', borderRadius: 1 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#94a3b8', flexWrap: 'wrap' }}>
                    {personal > 0 && <span style={{ color: '#1d4ed8' }}>Personal {fmt(personal)} · {personalOfBudget}% v.Bdg · {personalOfTotal}% v.Ist</span>}
                    {material > 0 && <span style={{ color: '#b45309' }}>Material {fmt(material)} · {materialOfBudget}% v.Bdg · {materialOfTotal}% v.Ist</span>}
                    <span style={{ marginLeft: 'auto' }}>Budget: {fmt(budget)}</span>
                  </div>
                </div>
                {/* Rechts */}
                <div style={{ width: 150, flexShrink: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: pctColor, lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{fmt(total)} / {fmt(budget)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{personalOfTotal}% Personal · {materialOfTotal}% Material</div>
                  {over  && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#fef2f2', color: '#dc2626', fontWeight: 700, display: 'inline-block', marginTop: 2 }}>+{pct - 100}% über Budget</span>}
                  {warn  && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#fffbeb', color: '#b45309', fontWeight: 600, display: 'inline-block', marginTop: 2 }}>Kritisch</span>}
                  {total === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: '#f8fafc', color: '#94a3b8', display: 'inline-block', marginTop: 2 }}>Keine Kosten</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          {[
            { val: fmt(totalPersonal), label: 'Personal gesamt',    color: '#1d4ed8' },
            { val: fmt(totalMaterial), label: 'Material gesamt',     color: '#b45309' },
            { val: `${fmt(totalKosten)} / ${fmt(totalBudget)}`, label: 'Kosten / Budget', color: '#0f172a' },
            { val: `${avgPct}%`,        label: 'Ø Budgetauslastung', color: avgPct > 80 ? '#dc2626' : avgPct > 60 ? '#b45309' : '#059669' },
          ].map(s => (
            <div key={s.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Insights */}
      {data.length > 0 && (overList.length > 0 || perHeavy.length > 0 || noKosten.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {overList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: '#fef2f2', fontSize: 11, color: '#dc2626' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span><strong>Über Budget:</strong> {overList.map((b: any) => b.name?.split(']')[0] + ']').join(', ')}</span>
            </div>
          )}
          {perHeavy.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: '#eff6ff', fontSize: 11, color: '#1d4ed8' }}>
              <TrendingUp size={13} style={{ flexShrink: 0 }} />
              <span><strong>Personal &gt;50% des Budgets:</strong> {perHeavy.map((b: any) => b.name?.split(']')[0] + ']').join(', ')}</span>
            </div>
          )}
          {noKosten.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
              <span><strong>Noch keine Kosten:</strong> {noKosten.map((b: any) => b.name?.split(']')[0] + ']').join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] }  = useQuery({ queryKey: ['bs-dashboard'],    queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; } });
  const { data: stunden = [] }     = useQuery({ queryKey: ['bs-stunden-dash'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*,employees(stundensatz,name,kuerzel)'); return data ?? []; } });
  const { data: materialien = [] } = useQuery({ queryKey: ['bs-mat-dash'],     queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*'); return data ?? []; } });
  const { data: nachtraege = [] }  = useQuery({ queryKey: ['bs-nach-dash'],    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*'); return data ?? []; } });
  const { data: eskalationen = [] }= useQuery({ queryKey: ['bs-esk-dash'],     queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*').eq('gelesen', false); return data ?? []; } });

  const bs   = baustellen as any[];
  const sw   = stunden as any[];
  const mat  = materialien as any[];
  const nach = nachtraege as any[];
  const esk  = eskalationen as any[];

  const bsK = useMemo(() =>
    bs.map(b => ({ ...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0)) })),
    [bs, sw, mat, nach]
  );

  const nichtGestartet = bs.filter(b => b.status === 'nicht_gestartet');
  const aktive         = bs.filter(b => b.status !== 'abgerechnet' && b.status !== 'nicht_gestartet');
  const totalBudget    = bsK.filter(b => b.status !== 'nicht_gestartet').reduce((s, b) => s + b.effektivBudget, 0);
  const totalKosten    = bsK.filter(b => b.status !== 'nicht_gestartet').reduce((s, b) => s + b.gesamtkosten, 0);
  const totalStunden   = sw.reduce((s, w) => s + Number(w.stunden ?? 0), 0);
  const overBudget     = bsK.filter(b => b.overBudget && b.status !== 'nicht_gestartet').length;
  const budgetPct      = totalBudget > 0 ? Math.round(totalKosten / totalBudget * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 32, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .dash-card { animation:fadeUp 0.4s ease forwards; opacity:0; }
        .dash-card:nth-child(1){animation-delay:.05s} .dash-card:nth-child(2){animation-delay:.1s}
        .dash-card:nth-child(3){animation-delay:.15s} .dash-card:nth-child(4){animation-delay:.2s}
        .bs-row:hover { background:#f8fafc !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Baustellen <span style={{ color: '#2563eb' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {esk.length > 0 && (
          <div onClick={() => navigate('/baustellen/eskalationen')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, cursor: 'pointer' }}>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{esk.length} offene Eskalation{esk.length !== 1 ? 'en' : ''}</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'Aktive Baustellen', value: aktive.length,                sub: `${bs.length} gesamt · ${nichtGestartet.length} nicht gestartet`, icon: HardHat,    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Gesamtbudget',      value: fmtEur(totalBudget),          sub: `${aktive.length} aktive Projekte`,                                 icon: Euro,       color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Gesamtkosten',      value: fmtEur(totalKosten),          sub: `${budgetPct}% des Budgets`,                                        icon: TrendingUp, color: totalKosten > totalBudget ? '#ef4444' : '#f59e0b', bg: totalKosten > totalBudget ? '#fef2f2' : '#fffbeb', border: totalKosten > totalBudget ? '#fecaca' : '#fde68a', trend: totalKosten > totalBudget },
          { label: 'Gebuchte Stunden',  value: `${totalStunden.toFixed(1)}h`, sub: 'Alle Baustellen',                                                icon: Clock,      color: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe' },
        ].map((kpi, i) => (
          <div key={i} className="dash-card" style={{ background: '#fff', border: `1px solid ${kpi.border}`, borderRadius: 18, padding: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kpi.color, borderRadius: '18px 18px 0 0' }} />
            <div style={{ width: 38, height: 38, background: kpi.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <kpi.icon size={18} style={{ color: kpi.color }} />
            </div>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-.04em' }}>{kpi.value}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 4px' }}>{kpi.label}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {'trend' in kpi && kpi.trend && <AlertTriangle size={11} style={{ color: '#ef4444' }} />}
              <p style={{ fontSize: 11, color: ('trend' in kpi && kpi.trend) ? '#ef4444' : '#94a3b8', margin: 0 }}>{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Warnungen */}
      {overBudget > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{overBudget} Baustelle{overBudget !== 1 ? 'n' : ''} über Budget</span>
        </div>
      )}
      {nichtGestartet.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PauseCircle size={16} style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{nichtGestartet.length} Baustelle{nichtGestartet.length !== 1 ? 'n' : ''} noch nicht gestartet</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {nichtGestartet.slice(0, 3).map((b: any) => (
              <span key={b.id} onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                {b.name?.length > 20 ? b.name.slice(0, 18) + '…' : b.name}
              </span>
            ))}
            {nichtGestartet.length > 3 && <span style={{ fontSize: 11, color: '#94a3b8' }}>+{nichtGestartet.length - 3} weitere</span>}
          </div>
        </div>
      )}

      {/* Budget Chart — volle Breite */}
      <BudgetChart bsK={bsK} />

      {/* Baustellenliste */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Aktive Baustellen</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{aktive.length} Projekte · sortiert nach Erstellung</p>
          </div>
          <button onClick={() => navigate('/baustellen/liste')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
            Alle <ArrowRight size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bsK.filter(b => b.status !== 'nicht_gestartet').slice(0, 8).map((b: any) => {
            const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.offen;
            const pct = Math.min(b.pct, 100);
            const barColor = b.overBudget ? '#ef4444' : pct > 75 ? '#f59e0b' : '#2563eb';
            return (
              <div key={b.id} className="bs-row"
                onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 130px 170px 90px 28px', gap: 14, alignItems: 'center', padding: '13px 16px', borderRadius: 14, border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all .15s', background: 'transparent' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.a_nummer ? `A-${b.a_nummer}` : ''}</div>
                </div>
                <div><span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.text }}>{cfg.label}</span></div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtEur(b.gesamtkosten)} / {fmtEur(b.effektivBudget)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: barColor }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width .4s' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: b.overBudget ? '#ef4444' : '#0f172a' }}>{fmtEur(b.gesamtkosten)}</div>
                </div>
                <ArrowRight size={14} style={{ color: '#cbd5e1' }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
