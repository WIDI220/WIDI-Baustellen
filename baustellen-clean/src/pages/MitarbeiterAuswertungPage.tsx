import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { Users, Clock, Euro, TrendingUp, ChevronLeft, ChevronRight, Award, Target, Zap, BarChart2, Sun, Stethoscope, Calendar, Download, FileText, FileDown } from 'lucide-react';
import { printAsPDF, widiHeader, widiFooter } from '@/lib/pdfExport';

const STUNDENSATZ = 38.08;
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TABS = ['Übersicht', 'Einzelperson', 'Monatsvergleich', 'Monatsabschluss'] as const;
type Tab = typeof TABS[number];

function fmt(n: number) { return n.toFixed(1).replace('.', ','); }
function fmtEur(n: number) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n); }
function monatStr(year: number, month: number) { return `${year}-${String(month).padStart(2, '0')}`; }

const FARBEN = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, marginBottom: 2 }}>
          <span style={{ color: p.color || p.fill, fontWeight: 500 }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>{typeof p.value === 'number' ? `${fmt(p.value)}h` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function MitarbeiterAuswertungPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<Tab>('Übersicht');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedMA, setSelectedMA] = useState<string | null>(null);
  const [kalYear, setKalYear] = useState(now.getFullYear());
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);

  const von = `${monatStr(year, month)}-01`;
  const bis = `${monatStr(year, month)}-31`;
  const monatLabel = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel,stundensatz,gewerk').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: ticketStunden = [] } = useQuery({
    queryKey: ['ausw-tickets', year, month],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('employee_id,stunden,leistungsdatum').gte('leistungsdatum', von).lte('leistungsdatum', bis); return data ?? []; },
  });

  const { data: bauStunden = [] } = useQuery({
    queryKey: ['ausw-bau', year, month],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum').gte('datum', von).lte('datum', bis); return data ?? []; },
  });

  // 6 Monate für Verlauf
  const { data: ticketAll = [] } = useQuery({
    queryKey: ['ausw-tickets-all'],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('employee_id,stunden,leistungsdatum'); return data ?? []; },
  });
  const { data: bauAll = [] } = useQuery({
    queryKey: ['ausw-bau-all'],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum'); return data ?? []; },
  });

  const { data: abwesenheiten = [], refetch: refetchAbw } = useQuery({
    queryKey: ['abwesenheiten', selectedMA ?? 'none', kalYear],
    queryFn: async () => {
      if (!selectedMA) return [];
      const { data } = await supabase
        .from('mitarbeiter_abwesenheiten')
        .select('*')
        .eq('employee_id', selectedMA)
        .gte('datum', `${kalYear}-01-01`)
        .lte('datum', `${kalYear}-12-31`);
      return data ?? [];
    },
    enabled: !!selectedMA,
  });

  async function toggleAbwesenheit(empId: string, datum: string, typ: 'urlaub' | 'krank') {
    const existing = (abwesenheiten as any[]).find((a: any) => a.datum === datum);
    setPendingToggle(datum);
    if (existing) {
      if (existing.typ === typ) {
        await supabase.from('mitarbeiter_abwesenheiten').delete().eq('id', existing.id);
      } else {
        await supabase.from('mitarbeiter_abwesenheiten').update({ typ }).eq('id', existing.id);
      }
    } else {
      await supabase.from('mitarbeiter_abwesenheiten').insert({ employee_id: empId, datum, typ });
    }
    setPendingToggle(null);
    refetchAbw();
  }

  const { data: abwesenheitenMonat = [] } = useQuery({
    queryKey: ['abwesenheiten-monat', year, month],
    queryFn: async () => {
      const von2 = `${year}-${String(month).padStart(2,'0')}-01`;
      const bis2 = `${year}-${String(month).padStart(2,'0')}-31`;
      const { data } = await supabase
        .from('mitarbeiter_abwesenheiten')
        .select('*, employees(name)')
        .gte('datum', von2)
        .lte('datum', bis2);
      return data ?? [];
    },
  });

  const { data: begehungenMonat = [] } = useQuery({
    queryKey: ['begehungen-monat', year, month],
    queryFn: async () => {
      const kw1 = `${year}-W01`; const kw53 = `${year}-W53`;
      const { data } = await supabase
        .from('begehungen')
        .select('*')
        .gte('kw', `${year}-W01`)
        .lte('kw', `${year}-W53`);
      // Filter by month approximation via datum_von
      const von2 = `${year}-${String(month).padStart(2,'0')}-01`;
      const bis2 = `${year}-${String(month).padStart(2,'0')}-31`;
      return (data ?? []).filter((b: any) => b.datum_von >= von2 && b.datum_von <= bis2);
    },
  });

  function exportMonatsabschlussCSV() {
    const rows = maStats.map(e => {
      const urlaubTage = (abwesenheitenMonat as any[]).filter((a:any) => {
        const emp = employees as any[];
        const em = emp.find((x:any) => x.id === e.id);
        return a.employee_id === e.id && a.typ === 'urlaub';
      }).length;
      const krankTage = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ === 'krank').length;
      return [e.name, e.tH.toFixed(1), e.bH.toFixed(1), e.gesamt.toFixed(1), e.kosten.toFixed(2), urlaubTage, krankTage].join(';');
    });
    const header = 'Mitarbeiter;Ticket-Std;Baustellen-Std;Gesamt-Std;Kosten (€);Urlaub-Tage;Krank-Tage';
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Monatsabschluss_${monatLabel.replace(' ','_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMonatsabschlussePDF() {
    const urlaubGesamt = (abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='urlaub').length;
    const krankGesamt  = (abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='krank').length;
    const rows = maStats.map(e => {
      const uT = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='urlaub').length;
      const kT = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='krank').length;
      return `<tr><td><strong>${e.name}</strong></td><td style="text-align:right;color:#60a5fa">${e.tH.toFixed(1)}h</td><td style="text-align:right;color:#34d399">${e.bH.toFixed(1)}h</td><td style="text-align:right;font-weight:700">${e.gesamt.toFixed(1)}h</td><td style="text-align:right">${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(e.kosten)}</td><td style="text-align:right;color:#34d399">${uT>0?uT+'T':'—'}</td><td style="text-align:right;color:#f87171">${kT>0?kT+'T':'—'}</td></tr>`;
    }).join('');
    const gH = maStats.reduce((s,e)=>s+e.gesamt,0);
    const gK = maStats.reduce((s,e)=>s+e.kosten,0);
    const fmt = (n:number) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
    const html = widiHeader('Monatsabschluss', monatLabel) + `
      <div class="kpi-grid kpi-grid-4" style="margin-bottom:20px">
        <div class="kpi-card accent-purple"><div class="kpi-val">${gH.toFixed(1)}h</div><div class="kpi-lbl">Gesamtstunden</div></div>
        <div class="kpi-card accent-blue"><div class="kpi-val">${maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h</div><div class="kpi-lbl">Ticket-Std.</div></div>
        <div class="kpi-card accent-green"><div class="kpi-val">${maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h</div><div class="kpi-lbl">Baustellen-Std.</div></div>
        <div class="kpi-card accent-amber"><div class="kpi-val">${fmt(gK)}</div><div class="kpi-lbl">Personalkosten</div></div>
      </div>
      <div class="section"><div class="section-header">Mitarbeiter · ${monatLabel}</div>
        <table><thead><tr><th>Mitarbeiter</th><th style="text-align:right">Tickets</th><th style="text-align:right">Baustellen</th><th style="text-align:right">Gesamt</th><th style="text-align:right">Kosten</th><th style="text-align:right">Urlaub</th><th style="text-align:right">Krank</th></tr></thead>
        <tbody>${rows}<tr class="total"><td>Gesamt</td><td style="text-align:right">${maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h</td><td style="text-align:right">${maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h</td><td style="text-align:right">${gH.toFixed(1)}h</td><td style="text-align:right">${fmt(gK)}</td><td style="text-align:right">${urlaubGesamt}T</td><td style="text-align:right">${krankGesamt}T</td></tr></tbody></table>
      </div>` + widiFooter();
    printAsPDF(html, `WIDI Monatsabschluss ${monatLabel}`);
  }

  const emps = employees as any[];
  const tw = ticketStunden as any[];
  const bw = bauStunden as any[];

  // MA-Stats für aktuellen Monat
  const maStats = useMemo(() => emps.map((e, i) => {
    const tH = tw.filter(w => w.employee_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const bH = bw.filter(w => w.mitarbeiter_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    const gesamt = tH + bH;
    const satz = Number(e.stundensatz ?? STUNDENSATZ);
    const kosten = gesamt * satz;
    return { ...e, tH, bH, gesamt, kosten, satz, farbe: FARBEN[i % FARBEN.length] };
  }).sort((a, b) => b.gesamt - a.gesamt), [emps, tw, bw]);

  const totalH = maStats.reduce((s, e) => s + e.gesamt, 0);
  const totalKosten = maStats.reduce((s, e) => s + e.kosten, 0);
  const topMA = maStats[0];
  const aktivMA = maStats.filter(e => e.gesamt > 0).length;

  // 6-Monats-Verlauf
  const verlauf6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - (5 - i), 1);
      const y2 = d.getFullYear(); const m2 = d.getMonth() + 1;
      const v = `${monatStr(y2, m2)}-01`; const b = `${monatStr(y2, m2)}-31`;
      const tH2 = (ticketAll as any[]).filter(w => w.leistungsdatum >= v && w.leistungsdatum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const bH2 = (bauAll as any[]).filter(w => w.datum >= v && w.datum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      return { monat: MONATE[m2 - 1], Tickets: Math.round(tH2 * 10) / 10, Baustellen: Math.round(bH2 * 10) / 10, Gesamt: Math.round((tH2 + bH2) * 10) / 10 };
    });
  }, [ticketAll, bauAll, year, month]);

  // Radar-Daten für ausgewählten MA
  const selectedEmp = maStats.find(e => e.id === selectedMA) ?? maStats[0];

  const cardStyle = (accent: string) => ({
    background: '#fff', borderRadius: 16, padding: '20px 22px',
    border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)',
    borderLeft: `4px solid ${accent}`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ma-kpi { animation:fadeUp 0.4s ease forwards; opacity:0; }
        .ma-kpi:nth-child(1){animation-delay:0.05s}
        .ma-kpi:nth-child(2){animation-delay:0.1s}
        .ma-kpi:nth-child(3){animation-delay:0.15s}
        .ma-kpi:nth-child(4){animation-delay:0.2s}
        .ma-row:hover { background:#f8fafc !important; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:'0 0 4px', letterSpacing:'-.03em' }}>
            Mitarbeiter <span style={{ color:'#8b5cf6' }}>Auswertung</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Kombinierte Auswertung Tickets + Baustellen</p>
        </div>
        {/* Monatsnavigation */}
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'8px 12px' }}>
          <button onClick={prevMonth} style={{ padding:'5px 9px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', display:'flex', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';}}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a', minWidth:150, textAlign:'center' }}>{monatLabel}</span>
          <button onClick={nextMonth} style={{ padding:'5px 9px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', display:'flex', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#f8fafc';}}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:3, background:'#f1f5f9', borderRadius:14, padding:4, width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding:'8px 22px', borderRadius:11, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all .15s',
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#0f172a' : '#94a3b8',
            boxShadow: activeTab === t ? '0 2px 8px rgba(0,0,0,.07)' : 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══════════════════ TAB: ÜBERSICHT ═══════════════════ */}
      {activeTab === 'Übersicht' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {[
              { label:'Aktive Mitarbeiter', value:aktivMA, sub:`von ${emps.length} gesamt`, icon:Users, color:'#8b5cf6', border:'#ddd6fe' },
              { label:'Stunden gesamt', value:`${fmt(totalH)}h`, sub:monatLabel, icon:Clock, color:'#2563eb', border:'#bfdbfe' },
              { label:'Personalkosten', value:fmtEur(totalKosten), sub:'inkl. alle MA', icon:Euro, color:'#10b981', border:'#bbf7d0' },
              { label:'Top Performer', value:topMA?.kuerzel??'–', sub:topMA?`${fmt(topMA.gesamt)}h`:'', icon:Award, color:'#f59e0b', border:'#fde68a' },
            ].map(k => (
              <div key={k.label} className="ma-kpi" style={{ background:'#fff', borderRadius:18, padding:'20px', border:`1px solid ${k.border}`, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, borderRadius:'18px 18px 0 0' }} />
                <div style={{ width:38, height:38, background:`${k.color}15`, border:`1px solid ${k.color}25`, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
                  <k.icon size={18} style={{ color:k.color }} />
                </div>
                <p style={{ fontSize:26, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.04em' }}>{k.value}</p>
                <p style={{ fontSize:12, fontWeight:600, color:'#64748b', margin:'0 0 3px' }}>{k.label}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Stundenbalken pro MA */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Stunden pro Mitarbeiter</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Tickets (blau) · Baustellen (grün) · {monatLabel}</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={maStats.filter(e => e.gesamt > 0)} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="kuerzel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tH" name="Tickets" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                <Bar dataKey="bH" name="Baustellen" fill="#10b981" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* MA-Tabelle */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Detailtabelle</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    {['Mitarbeiter', 'Gewerk', 'Tickets', 'Baustellen', 'Gesamt', 'Stundensatz', 'Kosten', 'Anteil'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Mitarbeiter' ? 'left' : 'right', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maStats.map((e, i) => (
                    <tr key={e.id} onClick={() => { setSelectedMA(e.id); setActiveTab('Einzelperson'); }}
                      className="ma-row" style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', transition:'background .1s' }}
                    >
                      <td style={{ padding: '12px 12px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: e.farbe + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: e.farbe }}>{e.kuerzel?.slice(0, 2)}</div>
                          {e.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>{e.gewerk ?? '–'}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{fmt(e.tH)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(e.bH)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(e.gesamt)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>{e.satz.toFixed(2)}€</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmtEur(e.kosten)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                            <div style={{ height: '100%', width: `${totalH > 0 ? Math.round(e.gesamt / totalH * 100) : 0}%`, background: e.farbe, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#64748b', minWidth: 30 }}>{totalH > 0 ? Math.round(e.gesamt / totalH * 100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafc' }}>
                    <td colSpan={2} style={{ padding: '12px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Gesamt</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>{fmt(maStats.reduce((s, e) => s + e.tH, 0))}h</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{fmt(maStats.reduce((s, e) => s + e.bH, 0))}h</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{fmt(totalH)}h</td>
                    <td />
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{fmtEur(totalKosten)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB: EINZELPERSON ═══════════════════ */}
      {activeTab === 'Einzelperson' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* MA Auswahl */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {maStats.map(e => (
              <button key={e.id} onClick={() => setSelectedMA(e.id)} style={{
                padding: '8px 16px', borderRadius: 12, border: '2px solid',
                borderColor: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#e2e8f0',
                background: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe + '15' : '#fff',
                color: selectedMA === e.id || (!selectedMA && e === maStats[0]) ? e.farbe : '#64748b',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              }}>{e.name}</button>
            ))}
          </div>

          {selectedEmp && (() => {
            // Monats-Verlauf für diese Person
            const personVerlauf = Array.from({ length: 6 }, (_, i) => {
              const d = new Date(year, month - 1 - (5 - i), 1);
              const y2 = d.getFullYear(); const m2 = d.getMonth() + 1;
              const v = `${monatStr(y2, m2)}-01`; const b = `${monatStr(y2, m2)}-31`;
              const tH2 = (ticketAll as any[]).filter(w => w.employee_id === selectedEmp.id && w.leistungsdatum >= v && w.leistungsdatum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
              const bH2 = (bauAll as any[]).filter(w => w.mitarbeiter_id === selectedEmp.id && w.datum >= v && w.datum <= b).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
              return { monat: MONATE[m2 - 1], Tickets: Math.round(tH2 * 10) / 10, Baustellen: Math.round(bH2 * 10) / 10 };
            });

            const avgH = personVerlauf.reduce((s, m) => s + m.Tickets + m.Baustellen, 0) / 6;
            const maxH = Math.max(...personVerlauf.map(m => m.Tickets + m.Baustellen));

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Person KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                  {[
                    { label: 'Tickets diesen Monat', value: `${fmt(selectedEmp.tH)}h`, color: '#3b82f6' },
                    { label: 'Baustellen diesen Monat', value: `${fmt(selectedEmp.bH)}h`, color: '#10b981' },
                    { label: 'Gesamt diesen Monat', value: `${fmt(selectedEmp.gesamt)}h`, color: '#8b5cf6' },
                    { label: 'Personalkosten', value: fmtEur(selectedEmp.kosten), color: '#f59e0b' },
                  ].map(k => (
                    <div key={k.label} style={cardStyle(k.color)}>
                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>{k.label}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Insights */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>6-Monats-Schnitt</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{fmt(avgH)}h</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Ø pro Monat</p>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Zap size={16} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Spitzenwert</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{fmt(maxH)}h</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Bestes Monat (6 Mon.)</p>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Target size={16} style={{ color: '#10b981' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Anteil Tickets</span>
                    </div>
                    <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                      {selectedEmp.gesamt > 0 ? Math.round(selectedEmp.tH / selectedEmp.gesamt * 100) : 0}%
                    </p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>vs. Baustellen</p>
                  </div>
                </div>

                {/* Verlauf Chart */}
                <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>6-Monats-Verlauf – {selectedEmp.name}</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Stunden pro Monat aufgeschlüsselt</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={personVerlauf} barGap={4} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Tickets" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                      <Bar dataKey="Baustellen" fill="#10b981" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── KALENDER ── */}
                <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Calendar size={18} style={{ color: '#8b5cf6' }} />
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Urlaub & Krankheitstage {kalYear}</p>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                          Klick auf Tag zum Erfassen · Nochmal klicken zum Ändern · Doppelklick zum Löschen
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        {[['#10b981','Urlaub'],['#ef4444','Krank']].map(([c,l]) => (
                          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                            <span style={{ color: '#64748b' }}>{l}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setKalYear(y => y - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 36, textAlign: 'center' }}>{kalYear}</span>
                        <button onClick={() => setKalYear(y => y + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Urlaubstage', value: (abwesenheiten as any[]).filter((a:any) => a.typ==='urlaub').length, color: '#10b981', icon: Sun },
                      { label: 'Krankheitstage', value: (abwesenheiten as any[]).filter((a:any) => a.typ==='krank').length, color: '#ef4444', icon: Stethoscope },
                      { label: 'Abwesenheitstage', value: (abwesenheiten as any[]).length, color: '#8b5cf6', icon: Calendar },
                    ].map((s,i) => (
                      <div key={i} style={{ padding: '14px 20px', borderRight: i<2?'1px solid #f1f5f9':'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <s.icon size={16} style={{ color: s.color }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: 0, letterSpacing: '-.03em' }}>{s.value}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Monatskalender Grid */}
                  <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                    {Array.from({ length: 12 }, (_, moIdx) => {
                      const moNr = moIdx + 1;
                      const ersterTag = new Date(kalYear, moIdx, 1);
                      const letzterTag = new Date(kalYear, moIdx + 1, 0).getDate();
                      let startWt = ersterTag.getDay();
                      if (startWt === 0) startWt = 7;
                      const abwMap: Record<string, string> = {};
                      (abwesenheiten as any[]).forEach((a: any) => { abwMap[a.datum] = a.typ; });
                      const WOCHENTAGE = ['Mo','Di','Mi','Do','Fr','Sa','So'];
                      return (
                        <div key={moIdx}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-.01em' }}>
                            {new Date(kalYear, moIdx, 1).toLocaleString('de-DE', { month: 'long' })}
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 3 }}>
                            {WOCHENTAGE.map(wt => (
                              <div key={wt} style={{ fontSize: 7, color: '#cbd5e1', textAlign: 'center', fontWeight: 600, padding: '1px 0' }}>{wt}</div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                            {Array.from({ length: startWt - 1 }, (_, k) => <div key={`e${k}`} />)}
                            {Array.from({ length: letzterTag }, (_, d) => {
                              const tag = d + 1;
                              const datumStr = `${kalYear}-${String(moNr).padStart(2,'0')}-${String(tag).padStart(2,'0')}`;
                              const typ = abwMap[datumStr];
                              const isWe = new Date(kalYear, moIdx, tag).getDay() === 0 || new Date(kalYear, moIdx, tag).getDay() === 6;
                              const isToday = datumStr === new Date().toISOString().slice(0,10);
                              const isPending = pendingToggle === datumStr;
                              return (
                                <div key={tag}
                                  title={typ === 'urlaub' ? 'Urlaub · Klick = Krank · Doppelklick = Löschen' : typ === 'krank' ? 'Krank · Klick = Urlaub · Doppelklick = Löschen' : 'Klick = Urlaub · Shift+Klick = Krank'}
                                  onClick={(ev) => {
                                    if (isWe || isPending) return;
                                    const nextTyp: 'urlaub'|'krank' = ev.shiftKey ? 'krank' : typ === 'urlaub' ? 'krank' : 'urlaub';
                                    toggleAbwesenheit(selectedEmp.id, datumStr, nextTyp);
                                  }}
                                  onDoubleClick={() => {
                                    if (!typ || isPending) return;
                                    supabase.from('mitarbeiter_abwesenheiten').delete().eq('employee_id', selectedEmp.id).eq('datum', datumStr).then(() => refetchAbw());
                                  }}
                                  style={{
                                    aspectRatio: '1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 8, fontWeight: typ || isToday ? 700 : 400,
                                    cursor: isWe ? 'default' : 'pointer',
                                    background: isPending ? '#f1f5f9' : typ === 'urlaub' ? '#dcfce7' : typ === 'krank' ? '#fee2e2' : isToday ? '#eff6ff' : isWe ? 'transparent' : '#f8fafc',
                                    color: isPending ? '#cbd5e1' : typ === 'urlaub' ? '#15803d' : typ === 'krank' ? '#dc2626' : isToday ? '#2563eb' : isWe ? '#e2e8f0' : '#64748b',
                                    border: isToday && !typ ? '1px solid #bfdbfe' : 'none',
                                    transition: 'all .1s ease',
                                    userSelect: 'none',
                                  }}>
                                  {tag}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ TAB: MONATSABSCHLUSS ═══════════════════ */}
      {activeTab === 'Monatsabschluss' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header mit Monat-Nav + Export */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={prevMonth} style={{ width:34, height:34, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronLeft size={15}/></button>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:18, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>{monatLabel}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:'1px 0 0' }}>Monatsabschluss</p>
              </div>
              <button onClick={nextMonth} style={{ width:34, height:34, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b' }}><ChevronRight size={15}/></button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={exportMonatsabschlussePDF}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(37,99,235,.3)' }}>
                <FileDown size={14}/> PDF
              </button>
              <button onClick={exportMonatsabschlussCSV}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'linear-gradient(135deg,#8b5cf6,#7c3aed)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(139,92,246,.3)' }}>
                <Download size={14}/> CSV
              </button>
            </div>
          </div>

          {/* Gesamt-KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {[
              { label:'Gesamtstunden', value:`${maStats.reduce((s,e)=>s+e.gesamt,0).toFixed(1)}h`, color:'#8b5cf6', border:'#ddd6fe' },
              { label:'Ticket-Stunden', value:`${maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h`, color:'#3b82f6', border:'#bfdbfe' },
              { label:'Baustellen-Std.', value:`${maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h`, color:'#10b981', border:'#bbf7d0' },
              { label:'Personalkosten', value:new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(maStats.reduce((s,e)=>s+e.kosten,0)), color:'#f59e0b', border:'#fde68a' },
            ].map((k,i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, border:`1px solid ${k.border}`, padding:'14px 18px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color }} />
                <p style={{ fontSize:22, fontWeight:900, color:k.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{k.value}</p>
                <p style={{ fontSize:11, color:'#64748b', margin:0 }}>{k.label}</p>
              </div>
            ))}
          </div>

          {/* Mitarbeiter-Tabelle */}
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:8 }}>
              <FileText size={16} style={{ color:'#8b5cf6' }} />
              <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Mitarbeiter-Übersicht · {monatLabel}</p>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                  {['Mitarbeiter','Ticket-Std.','Baustellen-Std.','Gesamt','Kosten','Urlaub','Krank'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign: h==='Mitarbeiter'?'left':'right', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maStats.map((e, i) => {
                  const urlaubTage = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='urlaub').length;
                  const krankTage  = (abwesenheitenMonat as any[]).filter((a:any) => a.employee_id === e.id && a.typ==='krank').length;
                  return (
                    <tr key={e.id} style={{ borderBottom:'1px solid #f8fafc' }}
                      onMouseEnter={ev=>(ev.currentTarget as HTMLElement).style.background='#f8fafc'}
                      onMouseLeave={ev=>(ev.currentTarget as HTMLElement).style.background='transparent'}>
                      <td style={{ padding:'13px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:10, background:`${e.farbe}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:12, fontWeight:800, color:e.farbe }}>{e.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}</span>
                          </div>
                          <span style={{ fontWeight:600, color:'#0f172a' }}>{e.name}</span>
                        </div>
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#3b82f6', fontWeight:600 }}>{e.tH.toFixed(1)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right', color:'#10b981', fontWeight:600 }}>{e.bH.toFixed(1)}h</td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        <span style={{ fontWeight:800, color:e.farbe, fontSize:14 }}>{e.gesamt.toFixed(1)}h</span>
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#0f172a' }}>
                        {new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(e.kosten)}
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        {urlaubTage > 0
                          ? <span style={{ background:'#f0fdf4', color:'#15803d', fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{urlaubTage}T</span>
                          : <span style={{ color:'#e2e8f0' }}>—</span>}
                      </td>
                      <td style={{ padding:'13px 16px', textAlign:'right' }}>
                        {krankTage > 0
                          ? <span style={{ background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:6 }}>{krankTage}T</span>
                          : <span style={{ color:'#e2e8f0' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
                {/* Summenzeile */}
                <tr style={{ background:'#f8fafc', borderTop:'2px solid #f1f5f9' }}>
                  <td style={{ padding:'13px 16px', fontWeight:800, color:'#0f172a' }}>Gesamt</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#3b82f6' }}>{maStats.reduce((s,e)=>s+e.tH,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, color:'#10b981' }}>{maStats.reduce((s,e)=>s+e.bH,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:900, color:'#0f172a', fontSize:15 }}>{maStats.reduce((s,e)=>s+e.gesamt,0).toFixed(1)}h</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:900, color:'#0f172a', fontSize:15 }}>
                    {new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(maStats.reduce((s,e)=>s+e.kosten,0))}
                  </td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#15803d' }}>
                    {(abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='urlaub').length}T
                  </td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:700, color:'#dc2626' }}>
                    {(abwesenheitenMonat as any[]).filter((a:any)=>a.typ==='krank').length}T
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Stunden-Chart */}
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:24 }}>
            <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Stunden-Vergleich · {monatLabel}</p>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 20px' }}>Tickets vs. Baustellen pro Mitarbeiter</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={maStats.map(e=>({ name:e.kuerzel||e.name.split(' ')[0], Tickets:Math.round(e.tH*10)/10, Baustellen:Math.round(e.bH*10)/10 }))} barGap={4} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} unit="h"/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="Tickets" fill="#3b82f6" radius={[5,5,0,0]}/>
                <Bar dataKey="Baustellen" fill="#10b981" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}

      {/* ═══════════════════ TAB: MONATSVERGLEICH ═══════════════════ */}
      {activeTab === 'Monatsvergleich' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Gesamt-Verlauf */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Gesamtstunden – 6-Monats-Verlauf</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Tickets + Baustellen kombiniert</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={verlauf6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Tickets" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} />
                <Line type="monotone" dataKey="Baustellen" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                <Line type="monotone" dataKey="Gesamt" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4, fill: '#8b5cf6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gestapelter Vergleich pro Monat */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Mitarbeiter-Vergleich nach Monat</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Gestapelt pro Person</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={verlauf6} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Tickets" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Baustellen" stackId="a" fill="#10b981" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monats-Tabelle */}
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Monatstabelle</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  {['Monat', 'Tickets', 'Baustellen', 'Gesamt', 'Δ Vormonat'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Monat' ? 'left' : 'right', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {verlauf6.map((m, i) => {
                  const prev = i > 0 ? verlauf6[i - 1].Gesamt : null;
                  const delta = prev !== null ? m.Gesamt - prev : null;
                  return (
                    <tr key={m.monat} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{m.monat}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{fmt(m.Tickets)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(m.Baustellen)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(m.Gesamt)}h</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {delta !== null && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? '#10b981' : '#ef4444' }}>
                            {delta >= 0 ? '+' : ''}{fmt(delta)}h
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
