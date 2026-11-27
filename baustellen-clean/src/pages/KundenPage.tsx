import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Plus, Save, Trash2, Search, Link2, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ACCENT = '#0369a1';
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' };
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' };
const inpN: React.CSSProperties = { ...inp, width: 86, textAlign: 'right' };
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: bg, color: fg, border: bg === '#fff' ? '1px solid #cbd5e1' : 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' });
const eur = (v: any) => v == null || v === '' ? '–' : Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const pct = (v: any) => v == null || v === '' ? '–' : `${Number(v).toLocaleString('de-DE')} %`;
const num = (v: string) => { const t = String(v ?? '').trim().replace(/\./g, '').replace(',', '.'); if (!t) return null; const n = Number(t); return isFinite(n) ? n : null; };
const deNum = (v: any) => v == null ? '' : String(v).replace('.', ',');

type Tab = 'kunden' | 'zuordnung' | 'ma';

const KOND_FELDER: { k: string; l: string; typ: 'eur' | 'pct' }[] = [
  { k: 'stundensatz', l: 'Stundensatz €/h', typ: 'eur' },
  { k: 'material_aufschlag_pct', l: 'Material-Aufschlag %', typ: 'pct' },
  { k: 'anfahrt_pauschale', l: 'Anfahrt € je Einsatztag', typ: 'eur' },
  { k: 'zuschlag_sonntag_pct', l: 'Sonntag %', typ: 'pct' },
  { k: 'zuschlag_feiertag_pct', l: 'Feiertag %', typ: 'pct' },
  { k: 'zuschlag_nacht_pct', l: 'Nacht %', typ: 'pct' },
  { k: 'zuschlag_notdienst_pct', l: 'Notdienst %', typ: 'pct' },
];

export default function KundenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('kunden');
  const [suche, setSuche] = useState('');
  const [auswahl, setAuswahl] = useState<string | null>(null);

  const { data: kunden = [] } = useQuery({ queryKey: ['kunden'], queryFn: async () => { const { data } = await supabase.from('kunden' as any).select('*').order('name'); return (data ?? []) as any[]; } });
  const { data: kond = [] } = useQuery({ queryKey: ['kunden-konditionen'], queryFn: async () => { const { data } = await supabase.from('kunden_konditionen' as any).select('*').order('gueltig_ab', { ascending: false }); return (data ?? []) as any[]; } });
  const { data: ausn = [] } = useQuery({ queryKey: ['kunden-ma-saetze'], queryFn: async () => { const { data } = await supabase.from('kunden_ma_saetze' as any).select('*').order('gueltig_ab', { ascending: false }); return (data ?? []) as any[]; } });
  const { data: baustellen = [] } = useQuery({ queryKey: ['kunden-baustellen'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name,a_nummer,auftraggeber,ansprechpartner,kunde_id,status').order('created_at', { ascending: false }); return (data ?? []) as any[]; } });
  const { data: employees = [] } = useQuery({ queryKey: ['kunden-employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel,gewerk,stundensatz,satz_fest,aktiv').order('name'); return (data ?? []) as any[]; } });

  const neuLaden = () => ['kunden', 'kunden-konditionen', 'kunden-ma-saetze', 'kunden-baustellen', 'kunden-employees', 'baustellen', 'bs-stunden'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const aktuelleKond = (kid: string) => kond.find(k => k.kunde_id === kid && k.gueltig_ab <= new Date().toISOString().slice(0, 10)) ?? kond.find(k => k.kunde_id === kid);
  const bsJeKunde = useMemo(() => { const m: Record<string, number> = {}; baustellen.forEach(b => { if (b.kunde_id) m[b.kunde_id] = (m[b.kunde_id] || 0) + 1; }); return m; }, [baustellen]);
  const liste = kunden.filter(k => !suche || k.name.toLowerCase().includes(suche.toLowerCase()) || (k.kundennummer || '').includes(suche));
  const offen = baustellen.filter(b => !b.kunde_id).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/')} style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>← Startseite</button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${ACCENT}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={18} color={ACCENT} /></div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#0f172a' }}>Kunden & Konditionen</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Verrechnungssatz, Material-Aufschlag, Anfahrt und Zuschläge je Kunde</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {([['kunden', `Kunden (${kunden.length})`, Building2], ['zuordnung', `Baustellen zuordnen${offen ? ` (${offen} offen)` : ''}`, Link2], ['ma', 'Mitarbeiter mit festem Satz', UserCog]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k ? ACCENT : '#fff', tab === k ? '#fff' : '#334155') }}><I size={14} />{l}</button>
          ))}
        </div>

        <div style={{ ...card, marginBottom: 16, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
          <b>So rechnet das System den Stundensatz je Eintrag:</b> 1. Ausnahme für den Mitarbeiter bei diesem Kunden → 2. Stundensatz des Kunden (gilt für alle MA, außer MA mit festem Satz) → 3. eigener Satz des Mitarbeiters.
          Darauf kommen die Zuschläge des Kunden: Feiertag (NRW) bzw. Sonntag automatisch nach Datum, Nacht/Notdienst wenn beim Stundeneintrag markiert.
          Material-Aufschlag und Anfahrt (je Tag mit Stunden auf der Baustelle) erscheinen in der Baustelle unter „Übersicht → Abrechnung nach Kundenkonditionen“.
          Jede Kondition hat ein „gültig ab“ – ältere Stunden behalten den damals gültigen Satz.
        </div>

        {tab === 'kunden' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
            <div style={card}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: '#94a3b8' }} />
                  <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Kunde suchen" style={{ ...inp, paddingLeft: 28 }} />
                </div>
                <button style={btn(ACCENT)} onClick={async () => {
                  const name = window.prompt('Name des neuen Kunden');
                  if (!name?.trim()) return;
                  const { data, error } = await supabase.from('kunden' as any).insert({ name: name.trim() }).select('id').single();
                  if (error) return toast.error(error.message);
                  setAuswahl((data as any).id); neuLaden(); toast.success('Kunde angelegt');
                }}><Plus size={14} />Neu</button>
              </div>
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {liste.map(k => {
                  const kd = aktuelleKond(k.id);
                  return (
                    <div key={k.id} onClick={() => setAuswahl(k.id)}
                      style={{ padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2, background: auswahl === k.id ? `${ACCENT}12` : 'transparent', border: auswahl === k.id ? `1px solid ${ACCENT}55` : '1px solid transparent', opacity: k.aktiv ? 1 : 0.5 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{k.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {kd?.stundensatz != null ? `${eur(kd.stundensatz)}/h` : 'keine eigenen Sätze'}{bsJeKunde[k.id] ? ` · ${bsJeKunde[k.id]} Baustellen` : ''}{k.kundennummer ? ` · Nr. ${k.kundennummer}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {auswahl ? <KundeDetail key={auswahl} kunde={kunden.find(k => k.id === auswahl)} kond={kond.filter(k => k.kunde_id === auswahl)} ausn={ausn.filter(a => a.kunde_id === auswahl)}
              employees={employees} baustellen={baustellen.filter(b => b.kunde_id === auswahl)} neuLaden={neuLaden} onGeloescht={() => setAuswahl(null)} />
              : <div style={{ ...card, color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 60 }}>Kunden links auswählen</div>}
          </div>
        )}

        {tab === 'zuordnung' && <Zuordnung baustellen={baustellen} kunden={kunden} neuLaden={neuLaden} />}
        {tab === 'ma' && <FesterSatz employees={employees} neuLaden={neuLaden} />}
      </div>
    </div>
  );
}

function KundeDetail({ kunde, kond, ausn, employees, baustellen, neuLaden, onGeloescht }: any) {
  const [stamm, setStamm] = useState({ name: kunde?.name || '', kundennummer: kunde?.kundennummer || '', kostenstelle: kunde?.kostenstelle || '', adresse: kunde?.adresse || '', bemerkung: kunde?.bemerkung || '', aktiv: kunde?.aktiv ?? true });
  const leer: any = { gueltig_ab: new Date().toISOString().slice(0, 10), bemerkung: '' };
  KOND_FELDER.forEach(f => { leer[f.k] = ''; });
  const [neu, setNeu] = useState<any>(() => {
    const letzte = kond[0];
    if (!letzte) return leer;
    const v: any = { ...leer };
    KOND_FELDER.forEach(f => { v[f.k] = deNum(letzte[f.k]); });
    return v;
  });
  const [aus, setAus] = useState<any>({ employee_id: '', stundensatz: '', gueltig_ab: '2000-01-01', bemerkung: '' });
  if (!kunde) return null;
  const empName = (id: string) => employees.find((e: any) => e.id === id)?.name || '?';

  const speichernStamm = async () => {
    const { error } = await supabase.from('kunden' as any).update({ ...stamm, name: stamm.name.trim(), kundennummer: stamm.kundennummer || null, kostenstelle: stamm.kostenstelle || null, adresse: stamm.adresse || null, bemerkung: stamm.bemerkung || null }).eq('id', kunde.id);
    if (error) return toast.error(error.message);
    toast.success('Kunde gespeichert'); neuLaden();
  };
  const speichernKond = async () => {
    const row: any = { kunde_id: kunde.id, gueltig_ab: neu.gueltig_ab || '2000-01-01', bemerkung: neu.bemerkung || null };
    KOND_FELDER.forEach(f => { row[f.k] = num(neu[f.k]); });
    const { error } = await supabase.from('kunden_konditionen' as any).upsert(row, { onConflict: 'kunde_id,gueltig_ab' });
    if (error) return toast.error(error.message);
    toast.success('Konditionen gespeichert – Stunden der Baustellen werden neu bewertet'); neuLaden();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 15 }}>Stammdaten</p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 11, color: '#64748b' }}>Name<input style={inp} value={stamm.name} onChange={e => setStamm({ ...stamm, name: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#64748b' }}>Kundennummer<input style={inp} value={stamm.kundennummer} onChange={e => setStamm({ ...stamm, kundennummer: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#64748b' }}>Kostenstelle<input style={inp} value={stamm.kostenstelle} onChange={e => setStamm({ ...stamm, kostenstelle: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#64748b' }}>Adresse<input style={inp} value={stamm.adresse} onChange={e => setStamm({ ...stamm, adresse: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#64748b', gridColumn: 'span 2' }}>Bemerkung<input style={inp} value={stamm.bemerkung} onChange={e => setStamm({ ...stamm, bemerkung: e.target.value })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={stamm.aktiv} onChange={e => setStamm({ ...stamm, aktiv: e.target.checked })} />aktiv</label>
          <div style={{ flex: 1 }} />
          {baustellen.length === 0 && (
            <button style={btn('#fff', '#b91c1c')} onClick={async () => {
              if (!window.confirm(`Kunde „${kunde.name}“ löschen?`)) return;
              const { error } = await supabase.from('kunden' as any).delete().eq('id', kunde.id);
              if (error) return toast.error(error.message);
              onGeloescht(); neuLaden();
            }}><Trash2 size={14} />Löschen</button>
          )}
          <button style={btn(ACCENT)} onClick={speichernStamm}><Save size={14} />Speichern</button>
        </div>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>Konditionen</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Leere Felder = gilt nicht (beim Stundensatz: Satz des Mitarbeiters). Gleiches „gültig ab“ überschreibt, neues Datum legt eine neue Stufe an.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>gültig ab</th>{KOND_FELDER.map(f => <th key={f.k} style={{ ...th, textAlign: 'right' }}>{f.l}</th>)}<th style={th}>Bemerkung</th><th style={th} /></tr></thead>
            <tbody>
              <tr style={{ background: '#f0f9ff' }}>
                <td style={td}><input type="date" style={{ ...inp, width: 140 }} value={neu.gueltig_ab} onChange={e => setNeu({ ...neu, gueltig_ab: e.target.value })} /></td>
                {KOND_FELDER.map(f => <td key={f.k} style={{ ...td, textAlign: 'right' }}><input style={inpN} value={neu[f.k]} placeholder="–" onChange={e => setNeu({ ...neu, [f.k]: e.target.value })} /></td>)}
                <td style={td}><input style={inp} value={neu.bemerkung} onChange={e => setNeu({ ...neu, bemerkung: e.target.value })} /></td>
                <td style={td}><button style={btn(ACCENT)} onClick={speichernKond}><Save size={14} /></button></td>
              </tr>
              {kond.map((k: any) => (
                <tr key={k.id}>
                  <td style={td}>{k.gueltig_ab === '2000-01-01' ? 'immer' : new Date(k.gueltig_ab).toLocaleDateString('de-DE')}</td>
                  {KOND_FELDER.map(f => <td key={f.k} style={{ ...td, textAlign: 'right' }}>{f.typ === 'eur' ? eur(k[f.k]) : pct(k[f.k])}</td>)}
                  <td style={td}>{k.bemerkung || ''}</td>
                  <td style={td}><button style={btn('#fff', '#b91c1c')} onClick={async () => {
                    if (!window.confirm('Diese Kondition löschen?')) return;
                    await supabase.from('kunden_konditionen' as any).delete().eq('id', k.id); neuLaden();
                  }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>Ausnahmen je Mitarbeiter</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Nur nötig, wenn ein MA bei diesem Kunden einen anderen Satz hat. Alle anderen MA laufen über den Kundensatz.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Mitarbeiter</th><th style={{ ...th, textAlign: 'right' }}>Stundensatz</th><th style={th}>gültig ab</th><th style={th}>Bemerkung</th><th style={th} /></tr></thead>
          <tbody>
            <tr style={{ background: '#f0f9ff' }}>
              <td style={td}><select style={inp} value={aus.employee_id} onChange={e => setAus({ ...aus, employee_id: e.target.value })}>
                <option value="">– Mitarbeiter –</option>{employees.filter((e: any) => e.aktiv).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></td>
              <td style={{ ...td, textAlign: 'right' }}><input style={inpN} value={aus.stundensatz} onChange={e => setAus({ ...aus, stundensatz: e.target.value })} /></td>
              <td style={td}><input type="date" style={{ ...inp, width: 140 }} value={aus.gueltig_ab} onChange={e => setAus({ ...aus, gueltig_ab: e.target.value })} /></td>
              <td style={td}><input style={inp} value={aus.bemerkung} onChange={e => setAus({ ...aus, bemerkung: e.target.value })} /></td>
              <td style={td}><button style={btn(ACCENT)} onClick={async () => {
                const s = num(aus.stundensatz);
                if (!aus.employee_id || s == null) return toast.error('Mitarbeiter und Satz angeben');
                const { error } = await supabase.from('kunden_ma_saetze' as any).upsert({ kunde_id: kunde.id, employee_id: aus.employee_id, stundensatz: s, gueltig_ab: aus.gueltig_ab || '2000-01-01', bemerkung: aus.bemerkung || null }, { onConflict: 'kunde_id,employee_id,gueltig_ab' });
                if (error) return toast.error(error.message);
                setAus({ employee_id: '', stundensatz: '', gueltig_ab: '2000-01-01', bemerkung: '' }); neuLaden();
              }}><Plus size={14} /></button></td>
            </tr>
            {ausn.map((a: any) => (
              <tr key={a.id}>
                <td style={td}>{empName(a.employee_id)}</td><td style={{ ...td, textAlign: 'right' }}>{eur(a.stundensatz)}</td>
                <td style={td}>{a.gueltig_ab === '2000-01-01' ? 'immer' : new Date(a.gueltig_ab).toLocaleDateString('de-DE')}</td><td style={td}>{a.bemerkung || ''}</td>
                <td style={td}><button style={btn('#fff', '#b91c1c')} onClick={async () => { await supabase.from('kunden_ma_saetze' as any).delete().eq('id', a.id); neuLaden(); }}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 15 }}>Baustellen dieses Kunden ({baustellen.length})</p>
        <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 13 }}>
          {baustellen.map((b: any) => <div key={b.id} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>{b.a_nummer ? <b>{b.a_nummer} · </b> : null}{b.name}{b.ansprechpartner ? <span style={{ color: '#94a3b8' }}> · {b.ansprechpartner}</span> : null}</div>)}
          {!baustellen.length && <span style={{ color: '#94a3b8' }}>Noch keine – im Reiter „Baustellen zuordnen“ oder in der Baustelle auswählen.</span>}
        </div>
      </div>
    </div>
  );
}

function Zuordnung({ baustellen, kunden, neuLaden }: any) {
  const [nurOffen, setNurOffen] = useState(true);
  const gruppen = useMemo(() => {
    const m = new Map<string, any[]>();
    baustellen.filter((b: any) => !nurOffen || !b.kunde_id).forEach((b: any) => {
      const k = (b.auftraggeber || '').trim() || '(ohne Auftraggeber)';
      m.set(k, [...(m.get(k) || []), b]);
    });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [baustellen, nurOffen]);
  const zuordnen = async (ids: string[], kunde_id: string | null, ansprechpartner?: string | null) => {
    const upd: any = { kunde_id };
    if (ansprechpartner !== undefined) upd.ansprechpartner = ansprechpartner;
    const { error } = await supabase.from('baustellen').update(upd).in('id', ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} Baustelle(n) zugeordnet`); neuLaden();
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, flex: 1 }}>Auftraggeber-Texte der Baustellen einem Kunden zuordnen</p>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={nurOffen} onChange={e => setNurOffen(e.target.checked)} />nur ohne Kunde</label>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Steht im Auftraggeber ein Name einer Person, „als Ansprechpartner übernehmen“ anhaken – der Text wandert dann ins Feld Ansprechpartner.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Auftraggeber (Text)</th><th style={th}>Baustellen</th><th style={th}>Kunde</th><th style={th}>Ansprechpartner</th></tr></thead>
        <tbody>
          {gruppen.map(([txt, bs]) => <ZRow key={txt} txt={txt} bs={bs} kunden={kunden} zuordnen={zuordnen} />)}
          {!gruppen.length && <tr><td style={td} colSpan={4}>Alle Baustellen sind einem Kunden zugeordnet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ZRow({ txt, bs, kunden, zuordnen }: any) {
  const [ap, setAp] = useState(false);
  const gemeinsam = bs.every((b: any) => b.kunde_id === bs[0].kunde_id) ? bs[0].kunde_id || '' : '';
  return (
    <tr>
      <td style={td}><b>{txt}</b></td>
      <td style={{ ...td, fontSize: 12, color: '#475569', maxWidth: 380 }}>{bs.slice(0, 4).map((b: any) => (b.a_nummer ? `${b.a_nummer} ` : '') + b.name).join(' · ')}{bs.length > 4 ? ` · +${bs.length - 4}` : ''}</td>
      <td style={td}><select style={{ ...inp, minWidth: 260 }} value={gemeinsam} onChange={e => zuordnen(bs.map((b: any) => b.id), e.target.value || null, ap && txt !== '(ohne Auftraggeber)' ? txt : undefined)}>
        <option value="">– Kunde wählen –</option>{kunden.filter((k: any) => k.aktiv).map((k: any) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
      <td style={td}><label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={ap} onChange={e => setAp(e.target.checked)} />als Ansprechpartner übernehmen</label></td>
    </tr>
  );
}

function FesterSatz({ employees, neuLaden }: any) {
  return (
    <div style={card}>
      <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>Mitarbeiter mit festem Satz</p>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Bei diesen MA ersetzt der Stundensatz des Kunden den eigenen Satz nicht. Zuschläge des Kunden gelten trotzdem. Den eigenen Satz pflegst du wie bisher bei den Mitarbeitern.</p>
      <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
        <thead><tr><th style={th}>fest</th><th style={th}>Mitarbeiter</th><th style={th}>Gewerk</th><th style={{ ...th, textAlign: 'right' }}>eigener Satz</th></tr></thead>
        <tbody>
          {employees.filter((e: any) => e.aktiv).sort((a: any, b: any) => Number(b.satz_fest) - Number(a.satz_fest) || a.name.localeCompare(b.name)).map((e: any) => (
            <tr key={e.id} style={{ background: e.satz_fest ? '#f0f9ff' : undefined }}>
              <td style={td}><input type="checkbox" checked={!!e.satz_fest} onChange={async ev => {
                const { error } = await supabase.from('employees').update({ satz_fest: ev.target.checked } as any).eq('id', e.id);
                if (error) return toast.error(error.message); neuLaden();
              }} /></td>
              <td style={td}>{e.name}</td><td style={td}>{e.gewerk || ''}</td><td style={{ ...td, textAlign: 'right' }}>{eur(e.stundensatz)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
