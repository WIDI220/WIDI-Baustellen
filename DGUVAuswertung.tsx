import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const PRUEFER_FARBEN: Record<string, string> = {
  'M. Münch': '#3b82f6',
  'T. van der Werf': '#10b981',
  'R. Kaminski': '#f59e0b',
  'N. Willing': '#8b5cf6',
  'Kaminski': '#f59e0b',
  'Rene Kaminski': '#f59e0b',
  'S. Giesmann': '#ef4444',
  'E. Koska': '#06b6d4',
  'J.-N. Willing': '#ec4899',
  'M. Kubista': '#84cc16',
};

const MONAT_NAMEN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function normPruefer(name: string): string {
  if (!name) return 'Unbekannt';
  const n = name.trim();
  if (n === 'Kaminski' || n === 'Rene Kaminski') return 'R. Kaminski';
  return n;
}

export default function DGUVAuswertung() {
  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['dguv-auswertung'],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('dguv_geraete')
          .select('letzte_pruefung, letzter_pruefer')
          .not('letzte_pruefung', 'is', null)
          .not('letzter_pruefer', 'is', null)
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Monatliche Auswertung pro Prüfer
  const monatsDaten = (() => {
    const m: Record<string, Record<string, number>> = {};
    raw.forEach((r: any) => {
      const key = r.letzte_pruefung?.slice(0, 7);
      if (!key) return;
      const pruefer = normPruefer(r.letzter_pruefer);
      if (!m[key]) m[key] = {};
      m[key][pruefer] = (m[key][pruefer] || 0) + 1;
    });
    return Object.entries(m)
      .filter(([key]) => key >= '2024-01')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, pruefer]) => ({
        key,
        label: `${MONAT_NAMEN[parseInt(key.split('-')[1]) - 1]} ${key.split('-')[0].slice(2)}`,
        gesamt: Object.values(pruefer).reduce((s, v) => s + v, 0),
        ...pruefer,
      }));
  })();

  // Prüfer ermitteln
  const allePruefer = [...new Set(raw.map((r: any) => normPruefer(r.letzter_pruefer)))].filter(Boolean).sort();

  // Prüfer-Gesamtleistung
  const prueferGesamt = allePruefer.map(p => ({
    name: p,
    gesamt: raw.filter((r: any) => normPruefer(r.letzter_pruefer) === p).length,
  })).sort((a, b) => b.gesamt - a.gesamt);

  const gesamtMessungen = raw.length;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.08)', minWidth: 180 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{label} — {total.toLocaleString('de-DE')} Geräte</p>
        {payload.map((p: any) => (
          <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: p.fill }} />
              <span style={{ color: '#64748b' }}>{p.name}</span>
            </div>
            <span style={{ fontWeight: 700, color: p.fill }}>{p.value?.toLocaleString('de-DE')}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #f59e0b', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .au-card { animation: fadeUp 0.4s ease forwards; opacity: 0; }
      `}</style>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-.04em' }}>
          DGUV <span style={{ color: '#8b5cf6' }}>Auswertung</span>
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '3px 0 0' }}>
          {gesamtMessungen.toLocaleString('de-DE')} Prüfungen · {monatsDaten.length} Monate · {allePruefer.length} Prüfer
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {prueferGesamt.slice(0, 4).map((p, i) => (
          <div key={p.name} className="au-card" style={{ animationDelay: `${i * 0.06}s`, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: PRUEFER_FARBEN[p.name] ?? '#94a3b8' }} />
            <div style={{ width: 36, height: 36, borderRadius: 11, background: `${PRUEFER_FARBEN[p.name] ?? '#94a3b8'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: PRUEFER_FARBEN[p.name] ?? '#94a3b8' }}>
                {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, color: PRUEFER_FARBEN[p.name] ?? '#0f172a', margin: '0 0 2px', letterSpacing: '-.04em' }}>
              {p.gesamt.toLocaleString('de-DE')}
            </p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{Math.round((p.gesamt / gesamtMessungen) * 100)}% aller Prüfungen</p>
          </div>
        ))}
      </div>

      {/* Hauptchart: Monatliche Auswertung */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: '24px' }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 3px', letterSpacing: '-.02em' }}>Monatliche Prüfleistung</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Aufgeteilt nach Prüfer · aus Gesamtliste</p>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={monatsDaten} barCategoryGap="20%" margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
            {allePruefer.map(p => (
              <Bar key={p} dataKey={p} stackId="a" fill={PRUEFER_FARBEN[p] ?? '#94a3b8'} radius={allePruefer.indexOf(p) === allePruefer.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Prüfer-Verteilung */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Rangliste */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 16px', letterSpacing: '-.02em' }}>Prüfer-Rangliste</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {prueferGesamt.map((p, i) => {
              const farbe = PRUEFER_FARBEN[p.name] ?? '#94a3b8';
              const pct = (p.gesamt / gesamtMessungen) * 100;
              return (
                <div key={p.name} className="au-card" style={{ animationDelay: `${i * 0.05}s`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', width: 20, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: farbe }}>{p.gesamt.toLocaleString('de-DE')}</span>
                    </div>
                    <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: farbe, borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', width: 36, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Letzter Monat Detail */}
        {monatsDaten.length > 0 && (() => {
          const letzter = monatsDaten[monatsDaten.length - 1];
          const { key, label, gesamt, ...pruefer } = letzter;
          return (
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1f5f9', padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>Letzter Monat: {label}</p>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{(gesamt as number).toLocaleString('de-DE')} Prüfungen gesamt</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(pruefer as Record<string, number>).sort(([,a],[,b]) => b - a).map(([name, cnt]) => {
                  const farbe = PRUEFER_FARBEN[name] ?? '#94a3b8';
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: farbe, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: farbe }}>{cnt.toLocaleString('de-DE')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
