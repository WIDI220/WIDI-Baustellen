import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, CheckCircle2, ArrowRight, Zap } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const STATUS_CFG: Record<string,{label:string;color:string;bg:string;text:string}> = {
  offen:          { label:'Offen',          color:'#94a3b8', bg:'#f1f5f9', text:'#475569' },
  in_bearbeitung: { label:'In Bearbeitung', color:'#3b82f6', bg:'#dbeafe', text:'#1d4ed8' },
  pausiert:       { label:'Pausiert',       color:'#f59e0b', bg:'#fef3c7', text:'#b45309' },
  abgeschlossen:  { label:'Abgeschlossen',  color:'#10b981', bg:'#d1fae5', text:'#065f46' },
  abgerechnet:    { label:'Abgerechnet',    color:'#8b5cf6', bg:'#ede9fe', text:'#5b21b6' },
};

const COST_COLORS = { personal: '#3b82f6', material: '#10b981', nachtraege: '#f59e0b' };

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
      <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 2 }}>
          <span style={{ color: p.fill, fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmtEur(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: baustellen = [] } = useQuery({ queryKey: ['bs-dashboard'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-dash'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*,employees(stundensatz,name,kuerzel)'); return data ?? []; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-dash'],    queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-dash'],   queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*'); return data ?? []; } });
  const { data: eskalationen = [] }= useQuery({ queryKey: ['bs-esk-dash'],  queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*').eq('gelesen', false); return data ?? []; } });

  const bs = baustellen as any[];
  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];
  const esk = eskalationen as any[];

  const aktive = bs.filter(b => b.status !== 'abgerechnet');
  const bsK = bs.map(b => ({ ...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0)) }));

  // KPIs
  const totalBudget    = bsK.reduce((s, b) => s + b.effektivBudget, 0);
  const totalKosten    = bsK.reduce((s, b) => s + b.gesamtkosten, 0);
  const totalStunden   = sw.reduce((s, w) => s + Number(w.stunden ?? 0), 0);
  const overBudgetCnt  = bsK.filter(b => b.overBudget).length;

  // Status-Verteilung
  const statusData = Object.entries(STATUS_CFG).map(([key, cfg]) => ({
    name: cfg.label,
    value: bs.filter(b => b.status === key).length,
    color: cfg.color,
  })).filter(d => d.value > 0);

  // Budget vs Kosten pro Baustelle (alle)
  const budgetKostenData = bsK.map(b => ({
    name: b.name?.length > 18 ? b.name.slice(0, 16) + '…' : b.name,
    Budget: Math.round(b.effektivBudget),
    Kosten: Math.round(b.gesamtkosten),
  }));

  // Kostenaufschlüsselung pro Baustelle
  const kostenAufschlData = bsK.map(b => ({
    name: b.name?.length > 18 ? b.name.slice(0, 16) + '…' : b.name,
    Personal: Math.round(b.personalkosten),
    Material: Math.round(b.materialkosten),
    Nachträge: Math.round(b.nachtragGenehmigt),
  }));

  const kpis = [
    { label: 'Aktive Baustellen', value: aktive.length, icon: HardHat,      color: '#3b82f6', bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)' },
    { label: 'Gesamtbudget',      value: fmtEur(totalBudget),  icon: Euro,  color: '#10b981', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' },
    { label: 'Gesamtkosten',      value: fmtEur(totalKosten),  icon: TrendingUp, color: totalKosten > totalBudget ? '#ef4444' : '#f59e0b', bg: totalKosten > totalBudget ? 'linear-gradient(135deg,#fef2f2,#fee2e2)' : 'linear-gradient(135deg,#fffbeb,#fef3c7)' },
    { label: 'Gebuchte Stunden',  value: `${totalStunden.toFixed(1)}h`, icon: Clock, color: '#8b5cf6', bg: 'linear-gradient(135deg,#faf5ff,#ede9fe)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Baustellen <span style={{ color: '#3b82f6' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0', fontWeight: 500 }}>
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {esk.length > 0 && (
          <div onClick={() => navigate('/baustellen/eskalationen')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 12, cursor: 'pointer' }}>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{esk.length} offene Eskalation{esk.length !== 1 ? 'en' : ''}</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 16, padding: '18px 20px', border: '1px solid rgba(0,0,0,.05)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: k.color, opacity: .08 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>{k.label}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>{k.value}</p>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <k.icon size={18} style={{ color: '#fff' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Warnung over budget */}
      {overBudgetCnt > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 14, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{overBudgetCnt} Baustelle{overBudgetCnt !== 1 ? 'n' : ''} über Budget</span>
        </div>
      )}

      {/* Charts Row 1: Budget vs Kosten + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

        {/* Budget vs Kosten */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Budget vs. Kosten</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Pro Baustelle im Überblick</p>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['Budget','#e2e8f0'],['Kosten','#3b82f6']].map(([l,c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c as string }} />
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {budgetKostenData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13 }}>Noch keine Baustellen angelegt</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={budgetKostenData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Budget" fill="#e2e8f0" radius={[6,6,0,0]} />
                <Bar dataKey="Kosten" radius={[6,6,0,0]}>
                  {budgetKostenData.map((entry, i) => (
                    <Cell key={i} fill={entry.Kosten > entry.Budget ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Pie */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Status-Verteilung</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 16px' }}>{bs.length} Baustellen gesamt</p>
          {statusData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13 }}>Keine Daten</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Baustellen']} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {statusData.map(d => (
                  <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      <span style={{ fontSize: 12, color: '#475569' }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kostenaufschlüsselung Chart */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Kostenaufschlüsselung</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Personal · Material · Nachträge</p>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {Object.entries(COST_COLORS).map(([k, c]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'capitalize' }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
        {kostenAufschlData.length === 0 ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13 }}>Noch keine Kosten erfasst</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={kostenAufschlData} barGap={3} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Personal"  fill={COST_COLORS.personal}   radius={[5,5,0,0]} />
              <Bar dataKey="Material"  fill={COST_COLORS.material}   radius={[5,5,0,0]} />
              <Bar dataKey="Nachträge" fill={COST_COLORS.nachtraege} radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Baustellenliste */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Alle Baustellen</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{bs.length} Baustellen · sortiert nach Erstellung</p>
          </div>
          <button onClick={() => navigate('/baustellen/liste')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
            Alle anzeigen <ArrowRight size={13} />
          </button>
        </div>

        {bsK.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#cbd5e1', fontSize: 14 }}>Noch keine Baustellen angelegt</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bsK.slice(0, 10).map((b: any) => {
            const cfg = STATUS_CFG[b.status] ?? STATUS_CFG.offen;
            const pct = Math.min(b.pct, 100);
            const barColor = b.overBudget ? '#ef4444' : pct > 75 ? '#f59e0b' : '#3b82f6';
            return (
              <div key={b.id} onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 140px 180px 100px 36px', gap: 16, alignItems: 'center', padding: '14px 16px', borderRadius: 14, border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = '#f1f5f9'; }}
              >
                {/* Name */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.a_nummer ? `A-${b.a_nummer}` : ''}{b.adresse ? ` · ${b.adresse}` : ''}</div>
                </div>

                {/* Status */}
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.text }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Budget Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtEur(b.gesamtkosten)} / {fmtEur(b.effektivBudget)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: barColor }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width .4s' }} />
                  </div>
                </div>

                {/* Kosten */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: b.overBudget ? '#ef4444' : '#0f172a' }}>{fmtEur(b.gesamtkosten)}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Gesamtkosten</div>
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
