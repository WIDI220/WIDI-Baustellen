import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Upload, Pencil, UserPlus, X, Download, Save, Users, FileText, ClipboardList, Calculator, BarChart3, Clock,
  CheckCircle2, Circle, AlertTriangle, Trash2, Plus, Database,
} from 'lucide-react';
import { db, isDemo } from '@/lib/md-db';
import { getLocalSession } from '@/pages/AuthPage';
import { pdfToLines, parseSammelrechnung, leistungsmonat, SrErgebnis } from '@/lib/sammelrechnung-parser';
import {
  ZIEL_KST, KST_NAME, RX_ANR, monatGrenzen, vormonat, shiftMonat, eur, zahl, parseZahl, deDatumZuIso,
  fetchAll, nameKey, leseExcel, findeSpalten, downloadExcel, logUpload, satzFuer, maAusPdfZeilen, agAusPdfZeilen,
} from '@/lib/monatsdaten';
import { matchEmployee, istDenkerListe, parseDenker, spDataLesen, pruefe, ZUSCHLAG_LABEL, sollModell, pauseRegel, hhmm } from '@/lib/zeiterfassung';
import type { SpSeite, AbgleichZeile } from '@/lib/zeiterfassung';

const ACCENT = '#0d9488';
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', position: 'sticky', top: 0 };
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const inp: React.CSSProperties = { width: 90, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 13, textAlign: 'right' };
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: bg, color: fg, border: bg === '#fff' ? '1px solid #cbd5e1' : 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' });

type Tab = 'ma' | 'stunden' | 'sr' | 'ag' | 'saetze' | 'auswertung';

export default function MonatsdatenPage() {
  const navigate = useNavigate();
  const [monat, setMonat] = useState<string>(vormonat());
  const [tab, setTab] = useState<Tab>('ma');
  const { von, bis, label } = monatGrenzen(monat);

  // ── Daten ───────────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ['md-employees'],
    queryFn: async () => (await db().from('employees').select('id,name,kuerzel,gewerk,team,aktiv,ohne_systembuchung,soll_mo_do,soll_fr').order('name')).data ?? [],
  });
  const { data: maMonat = [] } = useQuery({
    queryKey: ['md-ma', monat],
    queryFn: async () => (await db().from('md_ma_monat').select('*').eq('monat', monat)).data ?? [],
  });
  const { data: sysStunden = {} as Record<string, { ticket: number; baustelle: number; intern: number }> } = useQuery({
    queryKey: ['md-sysstd', monat],
    queryFn: async () => {
      const [tw, bs, ins] = await Promise.all([
        fetchAll<any>((f, t) => db().from('ticket_worklogs').select('employee_id,stunden').gte('leistungsdatum', von).lte('leistungsdatum', bis).range(f, t)),
        fetchAll<any>((f, t) => db().from('bs_stundeneintraege').select('mitarbeiter_id,stunden').gte('datum', von).lte('datum', bis).range(f, t)),
        fetchAll<any>((f, t) => db().from('interne_stunden').select('employee_id,stunden').gte('datum', von).lte('datum', bis).range(f, t)),
      ]);
      const m: Record<string, { ticket: number; baustelle: number; intern: number }> = {};
      const add = (id: string | null, k: 'ticket' | 'baustelle' | 'intern', h: number) => {
        if (!id) return; m[id] = m[id] || { ticket: 0, baustelle: 0, intern: 0 }; m[id][k] += Number(h || 0);
      };
      tw.forEach(r => add(r.employee_id, 'ticket', r.stunden));
      bs.forEach(r => add(r.mitarbeiter_id, 'baustelle', r.stunden));
      ins.forEach(r => add(r.employee_id, 'intern', r.stunden));
      return m;
    },
  });
  const { data: srBelege = [] } = useQuery({
    queryKey: ['md-sr-belege', monat],
    queryFn: async () => (await db().from('md_sr_belege').select('*').eq('monat', monat).order('beleg')).data ?? [],
  });
  const { data: srPos = [] } = useQuery({
    queryKey: ['md-sr-pos', monat],
    queryFn: async () => fetchAll<any>((f, t) => db().from('md_sr_positionen').select('beleg,kst,menge,einheit,leistung,gp,a_nummer').eq('monat', monat).range(f, t)),
  });
  const { data: saetze = [] } = useQuery({
    queryKey: ['md-saetze'],
    queryFn: async () => (await db().from('md_saetze').select('*').order('gueltig_ab', { ascending: false })).data ?? [],
  });
  const { data: teamkosten = [] } = useQuery({
    queryKey: ['md-teamkosten', monat],
    queryFn: async () => (await db().from('md_teamkosten').select('*').eq('monat', monat).order('team')).data ?? [],
  });
  const { data: mengen = [] } = useQuery({
    queryKey: ['md-mengen', monat],
    queryFn: async () => (await db().from('md_leistungsmengen').select('*').eq('monat', monat).order('leistung')).data ?? [],
  });
  const { data: agStaende = [] } = useQuery({
    queryKey: ['md-ag-staende'],
    queryFn: async () => {
      const rows = await fetchAll<any>((f, t) => db().from('md_ag_status').select('stand').range(f, t));
      const c = new Map<string, number>(); rows.forEach(r => c.set(r.stand, (c.get(r.stand) || 0) + 1));
      return [...c.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([stand, n]) => ({ stand, n }));
    },
  });
  const { data: dguv = [] } = useQuery({
    queryKey: ['md-dguv', monat],
    queryFn: async () => (await db().from('dguv_mess_importe').select('monat,kunde,gesamt').eq('monat', monat)).data ?? [],
  });
  const { data: uploads = [] } = useQuery({
    queryKey: ['md-uploads', monat],
    queryFn: async () => (await db().from('md_uploads').select('*').or(`monat.eq.${monat},monat.is.null`).order('created_at', { ascending: false }).limit(20)).data ?? [],
  });

  const { data: spMonat = [] } = useQuery({
    queryKey: ['md-sp', monat],
    queryFn: async () => (await db().from('md_spdata_monat').select('*').eq('monat', monat)).data ?? [],
  });

  const aktive = (employees as any[]).filter(e => e.aktiv);
  const denkerN = (maMonat as any[]).filter(r => r.plusstunden != null).length;
  const maErfasst = (maMonat as any[]).length;
  const agImMonat = (agStaende as any[]).some(s => String(s.stand).startsWith(monat) || String(s.stand).startsWith(shiftMonat(monat, 1)));
  const saetzeOk = satzFuer(saetze as any[], 'verrechnung', null, monat) != null && satzFuer(saetze as any[], 'kosten', null, monat) != null;

  const checks = [
    { key: 'ma' as Tab, titel: 'MA-Daten', sub: 'Überstunden, Sonntagszulagen (Excel/PDF)', art: 'händisch · monatlich anfragen', ok: maErfasst > 0, info: `${maErfasst} / ${aktive.length} MA`, icon: Users },
    { key: 'stunden' as Tab, titel: 'Stundenabgleich', sub: 'SP Data · Plus/Minus-Liste · System', art: 'Upload · Abgleich automatisch', ok: (spMonat as any[]).length > 0 && denkerN > 0, info: `SP ${(spMonat as any[]).length} · Liste ${denkerN} MA`, icon: Clock },
    { key: 'sr' as Tab, titel: 'Sammelrechnung', sub: 'PDF hochladen', art: 'wird automatisch ausgelesen', ok: (srBelege as any[]).length > 0, info: `${(srBelege as any[]).length} Belege`, icon: FileText },
    { key: 'ag' as Tab, titel: 'AG-Liste', sub: 'offene Aufträge Klinik (Excel/PDF)', art: 'händisch · Spalten automatisch', ok: agImMonat, info: (agStaende as any[])[0] ? `Stand ${fmtD((agStaende as any[])[0].stand)}` : 'noch keine', icon: ClipboardList },
    { key: 'saetze' as Tab, titel: 'Sätze & Teamkosten', sub: 'Verrechnungs-/Kostensatz, Fahrzeug …', art: 'händisch · bei Änderung', ok: saetzeOk, info: `${(teamkosten as any[]).length} Kostenposten`, icon: Calculator },
    { key: 'auswertung' as Tab, titel: 'Auswertung', sub: 'Stunden, Erlös, Mengen, offen', art: 'automatisch aus dem System', ok: true, info: 'immer aktuell', icon: BarChart3 },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Kopf */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => (isDemo() ? window.location.reload() : navigate('/'))} style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>← Startseite</button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${ACCENT}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Database size={18} color={ACCENT} /></div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#0f172a' }}>Monatsdaten{isDemo() ? ' · Test' : ''}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Händische Uploads & automatische Auswertung je Monat</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMonat(shiftMonat(monat, -1))} style={btn('#fff', '#334155')}><ChevronLeft size={15} /></button>
          <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{label}</span>
          <button onClick={() => setMonat(shiftMonat(monat, 1))} style={btn('#fff', '#334155')}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1500, margin: '0 auto' }}>
        {isDemo() && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, fontSize: 13, color: '#92400e' }}>
            <b>Test-Modus ohne Anmeldung:</b> erfundene Beispiel-Mitarbeiter und -Stunden, nichts wird gespeichert (beim Neuladen ist alles wieder leer).
            Zum Ausprobieren z. B. Monat Oktober 2026 wählen und die Sammelrechnung-PDF oder eine AG-Liste hochladen.
          </div>
        )}
        {/* Checkliste */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 20 }}>
          {checks.map(c => (
            <div key={c.key} onClick={() => setTab(c.key)}
              style={{ ...card, padding: 16, cursor: 'pointer', borderColor: tab === c.key ? ACCENT : '#e2e8f0', boxShadow: tab === c.key ? `0 0 0 2px ${ACCENT}33` : card.boxShadow }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <c.icon size={18} color={ACCENT} />
                {c.ok ? <CheckCircle2 size={18} color="#16a34a" /> : <Circle size={18} color="#f59e0b" />}
              </div>
              <p style={{ margin: '10px 0 2px', fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{c.titel}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{c.sub}</p>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: c.ok ? '#16a34a' : '#b45309', fontWeight: 600 }}>{c.info}</p>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.art}</p>
            </div>
          ))}
        </div>

        {tab === 'ma' && <MaTab monat={monat} label={label} employees={aktive} maMonat={maMonat as any[]} sys={sysStunden as any} />}
        {tab === 'stunden' && <StundenTab monat={monat} label={label} setMonat={setMonat} employees={employees as any[]} maMonat={maMonat as any[]} spMonat={spMonat as any[]} />}
        {tab === 'sr' && <SrTab monat={monat} label={label} belege={srBelege as any[]} pos={srPos as any[]} />}
        {tab === 'ag' && <AgTab staende={agStaende as any[]} />}
        {tab === 'saetze' && <SaetzeTab monat={monat} label={label} saetze={saetze as any[]} teamkosten={teamkosten as any[]} employees={employees as any[]} />}
        {tab === 'auswertung' && <AuswertungTab monat={monat} label={label} employees={aktive} maMonat={maMonat as any[]} sys={sysStunden as any}
          srPos={srPos as any[]} saetze={saetze as any[]} teamkosten={teamkosten as any[]} mengen={mengen as any[]} dguv={dguv as any[]} spMonat={spMonat as any[]} />}

        {/* Upload-Protokoll */}
        {(uploads as any[]).length > 0 && (
          <div style={{ ...card, marginTop: 20 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 13, color: '#334155' }}>Letzte Uploads</p>
            {(uploads as any[]).slice(0, 8).map(u => (
              <p key={u.id} style={{ margin: '3px 0', fontSize: 12, color: '#64748b' }}>
                {new Date(u.created_at).toLocaleString('de-DE')} · <b>{u.art}</b> · {u.dateiname} · {u.zeilen} Zeilen · {u.user_email}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtD(iso: string | null) {
  if (!iso) return '–';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// ════════════════════════════════════════════════════════════════════════
// MA-Daten (händisch, monatlich)
// ════════════════════════════════════════════════════════════════════════
type MaRow = { ueberstunden: string; sonntag_stunden: string; sonntag_zulage_eur: string; bezahlte_stunden: string; bemerkung: string };

function MaTab({ monat, label, employees, maMonat, sys }: { monat: string; label: string; employees: any[]; maMonat: any[]; sys: Record<string, any> }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<Record<string, MaRow>>({});
  const [saving, setSaving] = useState(false);
  const [quelle, setQuelle] = useState('händisch');
  const [pdfInfo, setPdfInfo] = useState<string | null>(null);

  const vorhanden = useMemo(() => {
    const m: Record<string, any> = {};
    maMonat.forEach(r => { m[r.employee_id || nameKey(r.mitarbeiter_name)] = r; });
    return m;
  }, [maMonat]);

  const wert = (e: any, k: keyof MaRow): string => {
    if (edit[e.id]?.[k] !== undefined) return edit[e.id][k];
    const r = vorhanden[e.id] || vorhanden[nameKey(e.name)];
    const v = r?.[k];
    return v == null ? '' : String(v).replace('.', ',');
  };
  const setWert = (id: string, k: keyof MaRow, v: string) => {
    setEdit(prev => {
      const e = employees.find(x => x.id === id);
      const base: MaRow = prev[id] || { ueberstunden: wert(e, 'ueberstunden'), sonntag_stunden: wert(e, 'sonntag_stunden'), sonntag_zulage_eur: wert(e, 'sonntag_zulage_eur'), bezahlte_stunden: wert(e, 'bezahlte_stunden'), bemerkung: wert(e, 'bemerkung') };
      return { ...prev, [id]: { ...base, [k]: v } };
    });
  };

  const speichern = async (rows: { e: any; r: MaRow }[], quelle: string) => {
    if (!rows.length) { toast.info('Keine Änderungen'); return; }
    setSaving(true);
    const email = getLocalSession()?.email;
    const payload = rows.map(({ e, r }) => ({
      monat, employee_id: e.id, mitarbeiter_name: e.name,
      ueberstunden: parseZahl(r.ueberstunden), sonntag_stunden: parseZahl(r.sonntag_stunden),
      sonntag_zulage_eur: parseZahl(r.sonntag_zulage_eur), bezahlte_stunden: parseZahl(r.bezahlte_stunden),
      bemerkung: r.bemerkung || null, quelle, updated_by: email ?? null,
    }));
    const { error } = await db().from('md_ma_monat').upsert(payload, { onConflict: 'monat,mitarbeiter_name' });
    setSaving(false);
    if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    toast.success(`${payload.length} Mitarbeiter für ${label} gespeichert`);
    setEdit({}); setQuelle('händisch'); setPdfInfo(null);
    qc.invalidateQueries({ queryKey: ['md-ma', monat] });
  };

  const vorlage = () => {
    const rows: (string | number | null)[][] = [['Mitarbeiter', 'Kürzel', 'Überstunden (h)', 'Sonntagsstunden (h)', 'Sonntagszulage (€)', 'Bezahlte Stunden (optional)', 'Bemerkung']];
    employees.forEach(e => rows.push([e.name, e.kuerzel || '', null, null, null, null, '']));
    downloadExcel(`MA-Daten_${monat}.xlsx`, `MA-Daten ${monat}`, rows);
  };

  const upload = async (file: File) => {
    if (/\.pdf$/i.test(file.name)) return uploadPdf(file);
    try {
      const rows = await leseExcel(file);
      if (istDenkerListe(rows)) { await importDenker(rows, file.name, monat, employees, () => qc.invalidateQueries({ queryKey: ['md-ma'] })); return; }
      const sp = findeSpalten(rows, {
        name: /mitarbeiter|^name|personal/i, kuerzel: /k(ü|ue)rzel|pers\.?-?nr|personalnummer/i,
        ueber: /(ü|ue)berstund/i, sonntagH: /sonntag.*(std|stund|\(h\))/i, sonntagE: /sonntag.*(zulage|€|eur|betrag)|zulage/i,
        bezahlt: /bezahlt|ist-?stunden|anwesenheit/i, bem: /bemerk|kommentar/i,
      }, 'name');
      if (!sp) { toast.error('Keine Spalte „Mitarbeiter“ gefunden – bitte die Vorlage verwenden'); return; }
      const { header, spalten } = sp;
      if (['ueber', 'sonntagH', 'sonntagE', 'bezahlt'].every(k => spalten[k] === undefined)) {
        toast.error('In der Excel wurden keine Spalten mit Werten erkannt (Überstunden, Sonntag, bezahlte Stunden bzw. Plus/Minus). Nichts gespeichert – bitte Spaltenüberschriften prüfen oder die Vorlage verwenden.');
        return;
      }
      const out: { e: any; r: MaRow }[] = []; const unbekannt: string[] = [];
      for (const row of rows.slice(header + 1)) {
        const name = String(row[spalten.name] ?? '').trim();
        if (!name) continue;
        const kz = spalten.kuerzel !== undefined ? String(row[spalten.kuerzel] ?? '').trim().toLowerCase() : '';
        const e = employees.find(x => (kz && String(x.kuerzel || '').toLowerCase() === kz) || nameKey(x.name) === nameKey(name));
        if (!e) { unbekannt.push(name); continue; }
        const g = (k: string) => (spalten[k] !== undefined && row[spalten[k]] != null ? String(row[spalten[k]]) : '');
        out.push({ e, r: { ueberstunden: g('ueber'), sonntag_stunden: g('sonntagH'), sonntag_zulage_eur: g('sonntagE'), bezahlte_stunden: g('bezahlt'), bemerkung: g('bem') } });
      }
      await speichern(out, `Excel: ${file.name}`);
      await logUpload(monat, 'MA-Daten', file.name, out.length, getLocalSession()?.email);
      if (unbekannt.length) toast.warning(`Nicht zugeordnet: ${unbekannt.slice(0, 6).join(', ')}${unbekannt.length > 6 ? ' …' : ''}`);
    } catch (err: any) {
      toast.error('Excel konnte nicht gelesen werden: ' + (err?.message || err));
    }
  };

  // PDF (z. B. Lohnauswertung): Werte werden nur vorgeschlagen – prüfen, dann „Speichern“
  const uploadPdf = async (file: File) => {
    try {
      const lines = await pdfToLines(await file.arrayBuffer());
      const { treffer, reihenfolge } = maAusPdfZeilen(lines, employees);
      if (!treffer.length) { toast.error('In der PDF wurden keine Mitarbeiter mit Zahlen gefunden – bitte Werte händisch eintragen oder die Excel-Vorlage nutzen'); return; }
      const fmt = (v: number | undefined) => (v == null ? '' : String(v).replace('.', ','));
      setEdit(prev => {
        const n = { ...prev };
        for (const t of treffer) {
          const e = employees.find(x => x.id === t.employee_id);
          n[t.employee_id] = {
            ueberstunden: t.werte.ueberstunden != null ? fmt(t.werte.ueberstunden) : wert(e, 'ueberstunden'),
            sonntag_stunden: t.werte.sonntag_stunden != null ? fmt(t.werte.sonntag_stunden) : wert(e, 'sonntag_stunden'),
            sonntag_zulage_eur: t.werte.sonntag_zulage_eur != null ? fmt(t.werte.sonntag_zulage_eur) : wert(e, 'sonntag_zulage_eur'),
            bezahlte_stunden: t.werte.bezahlte_stunden != null ? fmt(t.werte.bezahlte_stunden) : wert(e, 'bezahlte_stunden'),
            bemerkung: wert(e, 'bemerkung'),
          };
        }
        return n;
      });
      const namen: Record<string, string> = { ueberstunden: 'Überstunden', sonntag_stunden: 'Sonntagsstunden', sonntag_zulage_eur: 'Sonntagszulage €', bezahlte_stunden: 'bezahlte Std.' };
      setQuelle(`PDF: ${file.name}`);
      setPdfInfo(`${file.name}: ${treffer.length} von ${employees.length} Mitarbeitern erkannt · Spaltenreihenfolge ${reihenfolge.map(k => namen[k]).join(' → ')}. Werte sind grün markiert – bitte prüfen und dann „Speichern“.`);
      await logUpload(monat, 'MA-Daten (PDF)', file.name, treffer.length, getLocalSession()?.email);
    } catch (err: any) {
      toast.error('PDF konnte nicht gelesen werden: ' + (err?.message || err));
    }
  };

  const sum = (k: keyof MaRow) => employees.reduce((s, e) => s + (parseZahl(wert(e, k)) || 0), 0);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>MA-Daten {label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Monatlich bei Personal/Lohn anfragen: Überstunden und Sonntagszulagen je Mitarbeiter – als Excel (Vorlage) oder PDF der Lohnauswertung. Die Systemstunden kommen automatisch dazu.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('#fff', '#334155')} onClick={vorlage}><Download size={14} /> Vorlage (Excel)</button>
          <button style={btn('#fff', '#334155')} onClick={() => fileRef.current?.click()}><Upload size={14} /> Excel / PDF hochladen</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button style={btn(ACCENT)} disabled={saving} onClick={() => speichern(Object.entries(edit).map(([id, r]) => ({ e: employees.find(x => x.id === id), r })).filter(x => x.e), quelle)}>
            <Save size={14} /> {saving ? 'Speichere …' : `Speichern${Object.keys(edit).length ? ` (${Object.keys(edit).length})` : ''}`}
          </button>
        </div>
      </div>
      {pdfInfo && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0fdfa', border: `1px solid ${ACCENT}55`, borderRadius: 10, fontSize: 13, color: '#134e4a', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{pdfInfo}</span>
          <button style={{ ...btn('#fff', '#334155'), padding: '4px 10px' }} onClick={() => { setEdit({}); setPdfInfo(null); setQuelle('händisch'); }}>Verwerfen</button>
        </div>
      )}
      <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Mitarbeiter</th><th style={th}>Team</th>
            <th style={{ ...th, textAlign: 'right' }}>Std. System</th>
            <th style={{ ...th, textAlign: 'right' }}>Überstunden (h)</th>
            <th style={{ ...th, textAlign: 'right' }}>Sonntag (h)</th>
            <th style={{ ...th, textAlign: 'right' }}>Sonntagszulage (€)</th>
            <th style={{ ...th, textAlign: 'right' }}>Bezahlte Std. (opt.)</th>
            <th style={th}>Bemerkung</th>
          </tr></thead>
          <tbody>
            {employees.map(e => {
              const s = sys[e.id]; const sysH = s ? s.ticket + s.baustelle + s.intern : 0;
              const da = !!(vorhanden[e.id] || vorhanden[nameKey(e.name)]);
              return (
                <tr key={e.id} style={{ background: edit[e.id] ? '#f0fdfa' : undefined }}>
                  <td style={td}>{da ? <CheckCircle2 size={12} color="#16a34a" style={{ marginRight: 6, verticalAlign: -1 }} /> : <Circle size={12} color="#cbd5e1" style={{ marginRight: 6, verticalAlign: -1 }} />}{e.name}</td>
                  <td style={{ ...td, color: '#64748b' }}>{e.team || e.gewerk || '–'}</td>
                  <td style={tdR} title={s ? `Tickets ${zahl(s.ticket)} h · Baustellen ${zahl(s.baustelle)} h · intern ${zahl(s.intern)} h` : ''}>{zahl(sysH)}</td>
                  {(['ueberstunden', 'sonntag_stunden', 'sonntag_zulage_eur', 'bezahlte_stunden'] as (keyof MaRow)[]).map(k => (
                    <td key={k} style={tdR}><input style={inp} value={wert(e, k)} onChange={ev => setWert(e.id, k, ev.target.value)} inputMode="decimal" /></td>
                  ))}
                  <td style={td}><input style={{ ...inp, width: 180, textAlign: 'left' }} value={wert(e, 'bemerkung')} onChange={ev => setWert(e.id, 'bemerkung', ev.target.value)} /></td>
                </tr>
              );
            })}
            <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
              <td style={td}>Summe</td><td style={td} />
              <td style={tdR}>{zahl(employees.reduce((s, e) => s + (sys[e.id] ? sys[e.id].ticket + sys[e.id].baustelle + sys[e.id].intern : 0), 0))}</td>
              <td style={tdR}>{zahl(sum('ueberstunden'))}</td><td style={tdR}>{zahl(sum('sonntag_stunden'))}</td>
              <td style={tdR}>{eur(sum('sonntag_zulage_eur'))}</td><td style={tdR}>{zahl(sum('bezahlte_stunden'))}</td><td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Sammelrechnung (PDF → automatisch)
// ════════════════════════════════════════════════════════════════════════
function SrTab({ monat, label, belege, pos }: { monat: string; label: string; belege: any[]; pos: any[] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<{ datei: string; monat: string; r: SrErgebnis } | null>(null);

  const lesen = async (file: File) => {
    try {
      setLaeuft('PDF wird gelesen …');
      const lines = await pdfToLines(await file.arrayBuffer(), (p, n) => setLaeuft(`Seite ${p} von ${n} …`));
      const r = parseSammelrechnung(lines);
      const lm = leistungsmonat(r.positionen) || monat;
      setVorschau({ datei: file.name, monat: lm, r });
      if (lm !== monat) toast.info(`Leistungsmonat laut PDF: ${lm} – wird diesem Monat zugeordnet`);
    } catch (err: any) {
      toast.error('PDF konnte nicht gelesen werden: ' + (err?.message || err));
    } finally { setLaeuft(null); }
  };

  const uebernehmen = async () => {
    if (!vorschau) return;
    const { r, datei } = vorschau; const m = vorschau.monat;
    setLaeuft('Speichere …');
    try {
      const nummern = r.belege.map(b => b.beleg);
      // vorhandene Belege dieser Datei ersetzen (Positionen werden per Cascade gelöscht)
      for (let i = 0; i < nummern.length; i += 200) {
        const { error } = await db().from('md_sr_belege').delete().in('beleg', nummern.slice(i, i + 200));
        if (error) throw error;
      }
      const belegRows = r.belege.map(b => ({
        beleg: b.beleg, monat: m, typ: b.typ, kunde: b.kunde, kdnr: b.kdnr, belegdatum: deDatumZuIso(b.belegdatum), faellig: deDatumZuIso(b.faellig),
        bezug: b.bezug || null, kopf: b.kopf || null, a_nummer: b.a_nummer, netto: b.netto, steuer: b.steuer, brutto: b.brutto, quelle_datei: datei,
      }));
      for (let i = 0; i < belegRows.length; i += 200) {
        const { error } = await db().from('md_sr_belege').insert(belegRows.slice(i, i + 200));
        if (error) throw error;
      }
      const posRows = r.positionen.map(p => ({
        beleg: p.beleg, monat: m, kst: p.kst, abteilung: p.abteilung, leistungsdatum: deDatumZuIso(p.leistungsdatum), menge: p.menge, einheit: p.einheit,
        leistung: p.leistung, text: p.text, ep: p.ep, gp: p.gp, a_nummer: p.a_nummer,
      }));
      for (let i = 0; i < posRows.length; i += 300) {
        const { error } = await db().from('md_sr_positionen').insert(posRows.slice(i, i + 300));
        if (error) throw error;
      }
      await logUpload(m, 'Sammelrechnung', datei, posRows.length, getLocalSession()?.email);
      toast.success(`${belegRows.length} Belege und ${posRows.length} Positionen übernommen`);
      setVorschau(null);
      qc.invalidateQueries({ queryKey: ['md-sr-belege'] }); qc.invalidateQueries({ queryKey: ['md-sr-pos'] }); qc.invalidateQueries({ queryKey: ['md-uploads'] });
    } catch (err: any) {
      toast.error('Speichern fehlgeschlagen: ' + (err?.message || err));
    } finally { setLaeuft(null); }
  };

  const kstSummen = (ps: { kst: string | null; gp: number }[]) => {
    const m: Record<string, number> = {}; ps.forEach(p => { if (p.kst && ZIEL_KST.includes(p.kst)) m[p.kst] = (m[p.kst] || 0) + Number(p.gp || 0); }); return m;
  };
  const gespeichert = kstSummen(pos);
  const vs = vorschau ? kstSummen(vorschau.r.positionen) : {};

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Sammelrechnung {label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>PDF „sammelrechnung_JJJJ_MM.pdf“ hochladen – Belege und Positionen werden automatisch ausgelesen. Gutschriften/Stornos werden negativ gerechnet.</p>
          </div>
          <button style={btn(ACCENT)} disabled={!!laeuft} onClick={() => fileRef.current?.click()}><Upload size={14} /> {laeuft || 'PDF hochladen'}</button>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) lesen(f); e.target.value = ''; }} />
        </div>

        {vorschau && (
          <div style={{ marginTop: 16, padding: 16, background: '#f0fdfa', border: `1px solid ${ACCENT}55`, borderRadius: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Vorschau: {vorschau.datei} · Leistungsmonat {vorschau.monat}</p>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: '#334155' }}>
              {vorschau.r.belege.length} Belege · {vorschau.r.positionen.length} Positionen ·
              {vorschau.r.pruefung.belegeMitAbweichung === 0
                ? <span style={{ color: '#16a34a', fontWeight: 600 }}> Positionen = Belegsummen ✓</span>
                : <span style={{ color: '#b45309', fontWeight: 600 }}> {vorschau.r.pruefung.belegeMitAbweichung} Belege mit Abweichung Positionen/Netto (andere Kunden/Layouts) – bitte stichprobenartig prüfen</span>}
            </p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
              {ZIEL_KST.map(k => <span key={k} style={{ fontSize: 13 }}><b>{k}</b> {KST_NAME[k]}: {eur(vs[k] || 0)}</span>)}
              <span style={{ fontSize: 13, fontWeight: 700 }}>Summe: {eur(Object.values(vs).reduce((a, b) => a + b, 0))}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn(ACCENT)} disabled={!!laeuft} onClick={uebernehmen}><Save size={14} /> Übernehmen (ersetzt gleiche Belege)</button>
              <button style={btn('#fff', '#334155')} onClick={() => setVorschau(null)}>Verwerfen</button>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Gespeichert für {label}: {belege.length} Belege</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
          {ZIEL_KST.map(k => <span key={k} style={{ fontSize: 13 }}><b>{k}</b> {KST_NAME[k]}: {eur(gespeichert[k] || 0)}</span>)}
          <span style={{ fontSize: 13, fontWeight: 700 }}>Summe KST 244800–244803: {eur(Object.values(gespeichert).reduce((a, b) => a + b, 0))}</span>
        </div>
        {belege.length > 0 && (
          <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Beleg</th><th style={th}>Art</th><th style={th}>Datum</th><th style={th}>Kunde</th><th style={th}>A-Nr.</th><th style={th}>Kopf</th><th style={{ ...th, textAlign: 'right' }}>Netto</th></tr></thead>
              <tbody>
                {belege.map(b => (
                  <tr key={b.beleg}>
                    <td style={td}>{b.beleg}</td><td style={td}>{b.typ}</td><td style={td}>{fmtD(b.belegdatum)}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.kunde}</td>
                    <td style={td}>{b.a_nummer || '–'}</td>
                    <td style={{ ...td, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }} title={b.kopf}>{b.kopf}</td>
                    <td style={tdR}>{eur(b.netto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// AG-Liste (Excel der Klinik)
// ════════════════════════════════════════════════════════════════════════
function AgTab({ staende }: { staende: any[] }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const heute = new Date().toISOString().slice(0, 10);
  const [stand, setStand] = useState(heute);
  const [vorschau, setVorschau] = useState<{ datei: string; rows: any[]; spalten: string[] } | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  const { data: liste = [] } = useQuery({
    queryKey: ['md-ag-liste', gewaehlt || staende[0]?.stand],
    enabled: !!(gewaehlt || staende[0]?.stand),
    queryFn: async () => fetchAll<any>((f, t) => db().from('md_ag_status').select('*').eq('stand', gewaehlt || staende[0]?.stand).order('a_nummer').range(f, t)),
  });

  const lesen = async (file: File) => {
    if (/\.pdf$/i.test(file.name)) {
      try {
        const out = agAusPdfZeilen(await pdfToLines(await file.arrayBuffer()));
        if (!out.length) { toast.error('In der PDF wurden keine A-Nummern gefunden'); return; }
        setVorschau({ datei: file.name, rows: out, spalten: ['aus PDF: A-Nr., Status, Beträge (1. = Auftragssumme, 2. = verbucht), Beschreibung – bitte stichprobenartig prüfen'] });
      } catch (err: any) { toast.error('PDF konnte nicht gelesen werden: ' + (err?.message || err)); }
      return;
    }
    try {
      const rows = await leseExcel(file);
      const sp = findeSpalten(rows, {
        anr: /^a-?nr|auftragsn|^ticket|^auftrag$|a-nummer/i, beschr: /beschreib|bezeichnung|^text|auftrag \//i, status: /status/i,
        summe: /auftragssumme|summe max|auftragswert|max\.?/i, verbucht: /verbucht|^ist/i, kommentar: /kommentar|bemerkung|anmerkung/i,
      }, 'anr');
      if (!sp) { toast.error('Keine Spalte mit A-Nummern gefunden'); return; }
      const { header, spalten } = sp;
      const out: any[] = []; const seen = new Set<string>();
      for (const row of rows.slice(header + 1)) {
        const m = RX_ANR.exec(String(row[spalten.anr] ?? '').toUpperCase().replace(/\s/g, ''));
        if (!m || seen.has(m[0])) continue; seen.add(m[0]);
        const g = (k: string) => (spalten[k] !== undefined ? row[spalten[k]] : null);
        out.push({
          a_nummer: m[0], beschreibung: g('beschr') ? String(g('beschr')).slice(0, 300) : null, status_ag: g('status') ? String(g('status')) : null,
          auftragssumme: parseZahl(g('summe')), verbucht: parseZahl(g('verbucht')), kommentar: g('kommentar') ? String(g('kommentar')) : null,
        });
      }
      setVorschau({ datei: file.name, rows: out, spalten: Object.keys(spalten) });
    } catch (err: any) { toast.error('Excel konnte nicht gelesen werden: ' + (err?.message || err)); }
  };

  const speichern = async () => {
    if (!vorschau) return;
    const payload = vorschau.rows.map(r => ({ ...r, stand, quelle_datei: vorschau.datei }));
    for (let i = 0; i < payload.length; i += 300) {
      const { error } = await db().from('md_ag_status').upsert(payload.slice(i, i + 300), { onConflict: 'stand,a_nummer' });
      if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    }
    await logUpload(stand.slice(0, 7), 'AG-Liste', vorschau.datei, payload.length, getLocalSession()?.email);
    toast.success(`${payload.length} Aufträge (Stand ${fmtD(stand)}) gespeichert`);
    setVorschau(null); setGewaehlt(stand);
    qc.invalidateQueries({ queryKey: ['md-ag-staende'] }); qc.invalidateQueries({ queryKey: ['md-ag-liste'] }); qc.invalidateQueries({ queryKey: ['md-uploads'] });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>AG-Liste (offene Aufträge der Klinik)</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Excel oder PDF von Fr. Tielke hochladen – A-Nr., Status, Auftragssumme, verbucht und Kommentar werden automatisch erkannt. Jeder Stand bleibt erhalten.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>Stand</label>
            <input type="date" value={stand} onChange={e => setStand(e.target.value)} style={{ ...inp, width: 150, textAlign: 'left' }} />
            <button style={btn(ACCENT)} onClick={() => fileRef.current?.click()}><Upload size={14} /> Excel / PDF hochladen</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) lesen(f); e.target.value = ''; }} />
          </div>
        </div>
        {vorschau && (
          <div style={{ marginTop: 16, padding: 16, background: '#f0fdfa', border: `1px solid ${ACCENT}55`, borderRadius: 12 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{vorschau.datei}: {vorschau.rows.length} Aufträge erkannt</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>Erkannte Spalten: {vorschau.spalten.join(', ')}</p>
            <div style={{ maxHeight: 260, overflow: 'auto', marginBottom: 10, background: '#fff', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>A-Nr.</th><th style={th}>Beschreibung</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Auftragssumme</th><th style={{ ...th, textAlign: 'right' }}>Verbucht</th></tr></thead>
                <tbody>{vorschau.rows.slice(0, 15).map(r => (
                  <tr key={r.a_nummer}><td style={td}>{r.a_nummer}</td><td style={{ ...td, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.beschreibung || '–'}</td>
                    <td style={td}>{r.status_ag || '–'}</td><td style={tdR}>{eur(r.auftragssumme)}</td><td style={tdR}>{eur(r.verbucht)}</td></tr>
                ))}</tbody>
              </table>
              {vorschau.rows.length > 15 && <p style={{ margin: '6px 10px', fontSize: 11, color: '#94a3b8' }}>… und {vorschau.rows.length - 15} weitere</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn(ACCENT)} onClick={speichern}><Save size={14} /> Als Stand {fmtD(stand)} speichern</button>
              <button style={btn('#fff', '#334155')} onClick={() => setVorschau(null)}>Verwerfen</button>
            </div>
          </div>
        )}
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Gespeicherte Stände:</p>
          {staende.length === 0 && <span style={{ fontSize: 13, color: '#94a3b8' }}>noch keine</span>}
          {staende.map(s => (
            <button key={s.stand} onClick={() => setGewaehlt(s.stand)}
              style={{ ...btn((gewaehlt || staende[0]?.stand) === s.stand ? ACCENT : '#fff', (gewaehlt || staende[0]?.stand) === s.stand ? '#fff' : '#334155'), padding: '5px 10px', fontSize: 12 }}>
              {fmtD(s.stand)} ({s.n})
            </button>
          ))}
        </div>
        {(liste as any[]).length > 0 && (
          <div style={{ maxHeight: 460, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>A-Nr.</th><th style={th}>Beschreibung</th><th style={th}>Status AG</th><th style={{ ...th, textAlign: 'right' }}>Auftragssumme</th><th style={{ ...th, textAlign: 'right' }}>Verbucht</th><th style={th}>Kommentar</th></tr></thead>
              <tbody>
                {(liste as any[]).map(r => (
                  <tr key={r.id}>
                    <td style={td}>{r.a_nummer}</td>
                    <td style={{ ...td, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.beschreibung}>{r.beschreibung || '–'}</td>
                    <td style={td}>{r.status_ag || '–'}</td><td style={tdR}>{eur(r.auftragssumme)}</td><td style={tdR}>{eur(r.verbucht)}</td>
                    <td style={{ ...td, color: '#64748b' }}>{r.kommentar || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Sätze, Teamkosten, Team-Zuordnung
// ════════════════════════════════════════════════════════════════════════
const KOSTENARTEN = ['Fahrzeug', 'Werkzeug', 'Overhead / Verwaltung', 'Sonstiges'];

function SaetzeTab({ monat, label, saetze, teamkosten, employees }: { monat: string; label: string; saetze: any[]; teamkosten: any[]; employees: any[] }) {
  const qc = useQueryClient();
  const teams = useMemo(() => {
    const s = new Set<string>(['alle']); employees.forEach(e => { if (e.team) s.add(e.team); }); return [...s];
  }, [employees]);
  const [neuSatz, setNeuSatz] = useState({ gueltig_ab: `${monat}-01`, art: 'verrechnung', team: 'alle', satz: '', bemerkung: '' });
  const [neuKosten, setNeuKosten] = useState({ team: 'alle', kostenart: KOSTENARTEN[0], betrag: '', bemerkung: '' });

  const addSatz = async () => {
    const satz = parseZahl(neuSatz.satz);
    if (satz == null) { toast.error('Bitte einen Satz eingeben'); return; }
    const { error } = await db().from('md_saetze').insert({ ...neuSatz, satz, bemerkung: neuSatz.bemerkung || null });
    if (error) { toast.error(error.message); return; }
    toast.success('Satz gespeichert'); setNeuSatz({ ...neuSatz, satz: '', bemerkung: '' });
    qc.invalidateQueries({ queryKey: ['md-saetze'] });
  };
  const addKosten = async () => {
    const betrag = parseZahl(neuKosten.betrag);
    if (betrag == null) { toast.error('Bitte einen Betrag eingeben'); return; }
    const { error } = await db().from('md_teamkosten').insert({ ...neuKosten, monat, betrag, bemerkung: neuKosten.bemerkung || null });
    if (error) { toast.error(error.message); return; }
    toast.success('Kostenposten gespeichert'); setNeuKosten({ ...neuKosten, betrag: '', bemerkung: '' });
    qc.invalidateQueries({ queryKey: ['md-teamkosten', monat] });
  };
  const loeschen = async (tabelle: 'md_saetze' | 'md_teamkosten', id: string) => {
    const { error } = await db().from(tabelle).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: [tabelle === 'md_saetze' ? 'md-saetze' : 'md-teamkosten'] });
  };
  const setTeam = async (id: string, team: string) => {
    const { error } = await db().from('employees').update({ team: team || null }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['md-employees'] });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(460px,1fr))', gap: 16 }}>
      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16 }}>Stundensätze</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Verrechnungssatz = was wir der Klinik je Stunde berechnen (z. B. 38,94 €). Kostensatz = was uns eine Stunde kostet (Lohn + Nebenkosten). Gilt ab Datum, je Team oder für alle.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <input type="date" value={neuSatz.gueltig_ab} onChange={e => setNeuSatz({ ...neuSatz, gueltig_ab: e.target.value })} style={{ ...inp, width: 140, textAlign: 'left' }} />
          <select value={neuSatz.art} onChange={e => setNeuSatz({ ...neuSatz, art: e.target.value })} style={{ ...inp, width: 130, textAlign: 'left' }}>
            <option value="verrechnung">Verrechnung</option><option value="kosten">Kosten</option>
          </select>
          <input list="md-teams" value={neuSatz.team} onChange={e => setNeuSatz({ ...neuSatz, team: e.target.value })} style={{ ...inp, width: 120, textAlign: 'left' }} placeholder="Team" />
          <input value={neuSatz.satz} onChange={e => setNeuSatz({ ...neuSatz, satz: e.target.value })} style={inp} placeholder="€/h" inputMode="decimal" />
          <button style={btn(ACCENT)} onClick={addSatz}><Plus size={14} /> Hinzufügen</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Gültig ab</th><th style={th}>Art</th><th style={th}>Team</th><th style={{ ...th, textAlign: 'right' }}>€/h</th><th style={th} /></tr></thead>
          <tbody>
            {saetze.map(s => (
              <tr key={s.id}><td style={td}>{fmtD(s.gueltig_ab)}</td><td style={td}>{s.art === 'verrechnung' ? 'Verrechnung' : 'Kosten'}</td><td style={td}>{s.team}</td><td style={tdR}>{eur(s.satz)}</td>
                <td style={td}><button onClick={() => loeschen('md_saetze', s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button></td></tr>
            ))}
            {!saetze.length && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={5}>Noch keine Sätze hinterlegt</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16 }}>Teamkosten {label}</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Monatliche Kosten, die nicht an Stunden hängen: Fahrzeug, Werkzeug, Overhead.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <input list="md-teams" value={neuKosten.team} onChange={e => setNeuKosten({ ...neuKosten, team: e.target.value })} style={{ ...inp, width: 120, textAlign: 'left' }} placeholder="Team" />
          <select value={neuKosten.kostenart} onChange={e => setNeuKosten({ ...neuKosten, kostenart: e.target.value })} style={{ ...inp, width: 170, textAlign: 'left' }}>
            {KOSTENARTEN.map(k => <option key={k}>{k}</option>)}
          </select>
          <input value={neuKosten.betrag} onChange={e => setNeuKosten({ ...neuKosten, betrag: e.target.value })} style={inp} placeholder="€" inputMode="decimal" />
          <input value={neuKosten.bemerkung} onChange={e => setNeuKosten({ ...neuKosten, bemerkung: e.target.value })} style={{ ...inp, width: 140, textAlign: 'left' }} placeholder="Bemerkung" />
          <button style={btn(ACCENT)} onClick={addKosten}><Plus size={14} /> Hinzufügen</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Team</th><th style={th}>Kostenart</th><th style={th}>Bemerkung</th><th style={{ ...th, textAlign: 'right' }}>Betrag</th><th style={th} /></tr></thead>
          <tbody>
            {teamkosten.map(k => (
              <tr key={k.id}><td style={td}>{k.team}</td><td style={td}>{k.kostenart}</td><td style={{ ...td, color: '#64748b' }}>{k.bemerkung || ''}</td><td style={tdR}>{eur(k.betrag)}</td>
                <td style={td}><button onClick={() => loeschen('md_teamkosten', k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button></td></tr>
            ))}
            {!teamkosten.length && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={5}>Keine Kostenposten für {label}</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, gridColumn: '1 / -1' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16 }}>Team-Zuordnung</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Für die Auswertung je Team (z. B. Hausmeister, HM Elektro, Elektro, Hochbau, Nachrichtentechnik). Änderung wird sofort gespeichert.</p>
        <datalist id="md-teams">{['Hausmeister', 'HM Elektro', 'Elektro', 'Hochbau', 'Nachrichtentechnik', ...teams].filter((v, i, a) => a.indexOf(v) === i).map(t => <option key={t} value={t} />)}</datalist>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
          {employees.filter(e => e.aktiv).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: 8 }}>
              <span style={{ fontSize: 13 }}>{e.name}</span>
              <input list="md-teams" defaultValue={e.team || ''} placeholder={e.gewerk || 'Team'} onBlur={ev => { if ((ev.target.value || '') !== (e.team || '')) setTeam(e.id, ev.target.value.trim()); }}
                style={{ ...inp, width: 130, textAlign: 'left' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Auswertung (automatisch)
// ════════════════════════════════════════════════════════════════════════
function AuswertungTab({ monat, label, employees, maMonat, sys, srPos, saetze, teamkosten, mengen, dguv, spMonat }: {
  monat: string; label: string; employees: any[]; maMonat: any[]; sys: Record<string, any>; srPos: any[]; saetze: any[]; teamkosten: any[]; mengen: any[]; dguv: any[]; spMonat: any[];
}) {
  const qc = useQueryClient();
  const { von, bis } = monatGrenzen(monat);
  const [neu, setNeu] = useState({ leistung: '', menge: '', einheit: 'Stk.', kst: '', bemerkung: '' });

  // Baustellen mit Stunden im Monat, deren A-Nr. in keiner gespeicherten Sammelrechnung vorkommt
  const { data: offen = [] } = useQuery({
    queryKey: ['md-offen', monat],
    queryFn: async () => {
      const [std, belegA, posA] = await Promise.all([
        fetchAll<any>((f, t) => db().from('bs_stundeneintraege').select('stunden,baustelle_id,baustellen(name,a_nummer,status)').gte('datum', von).lte('datum', bis).range(f, t)),
        fetchAll<any>((f, t) => db().from('md_sr_belege').select('a_nummer').not('a_nummer', 'is', null).range(f, t)),
        fetchAll<any>((f, t) => db().from('md_sr_positionen').select('a_nummer').not('a_nummer', 'is', null).range(f, t)),
      ]);
      const abgerechnet = new Set<string>([...belegA, ...posA].map(r => r.a_nummer));
      const m = new Map<string, { anr: string | null; name: string; status: string; h: number }>();
      std.forEach(r => {
        const b = r.baustellen || {}; const anr = b.a_nummer || (RX_ANR.exec(b.name || '') || [null])[0];
        const k = r.baustelle_id; const cur = m.get(k) || { anr, name: b.name || '–', status: b.status || '', h: 0 };
        cur.h += Number(r.stunden || 0); m.set(k, cur);
      });
      return [...m.values()].filter(x => !x.anr || !abgerechnet.has(x.anr)).sort((a, b) => b.h - a.h);
    },
  });

  const maBy = useMemo(() => { const m: Record<string, any> = {}; maMonat.forEach(r => { if (r.employee_id) m[r.employee_id] = r; }); return m; }, [maMonat]);
  const vSatz = satzFuer(saetze, 'verrechnung', null, monat);

  // je Team
  const teams = useMemo(() => {
    const t: Record<string, { ma: number; sysH: number; bezahlt: number; bezahltN: number; ueber: number; sonntagEur: number; kosten: number; kostenOk: boolean }> = {};
    employees.forEach(e => {
      const team = e.team || e.gewerk || 'ohne Team';
      const s = sys[e.id]; const sysH = s ? s.ticket + s.baustelle + s.intern : 0;
      const r0 = maBy[e.id]; const sp = spMonat.find(x => x.employee_id === e.id);
      const r = r0?.bezahlte_stunden == null && sp?.ist != null ? { ...(r0 || {}), bezahlte_stunden: Number(sp.ist) - Number(sp.krank || 0) - Number(sp.urlaub || 0) } : r0;
      const cur = t[team] || { ma: 0, sysH: 0, bezahlt: 0, bezahltN: 0, ueber: 0, sonntagEur: 0, kosten: 0, kostenOk: true };
      cur.ma++; cur.sysH += sysH;
      if (r?.bezahlte_stunden != null) { cur.bezahlt += Number(r.bezahlte_stunden); cur.bezahltN++; }
      cur.ueber += Number(r?.ueberstunden || 0); cur.sonntagEur += Number(r?.sonntag_zulage_eur || 0);
      const kSatz = satzFuer(saetze, 'kosten', e.team || null, monat);
      const basisH = r?.bezahlte_stunden != null ? Number(r.bezahlte_stunden) : sysH + Number(r?.ueberstunden || 0);
      if (kSatz == null) cur.kostenOk = false; else cur.kosten += kSatz * basisH;
      t[team] = cur;
    });
    teamkosten.forEach(k => { const team = k.team === 'alle' ? 'alle Teams' : k.team; const cur = t[team] || { ma: 0, sysH: 0, bezahlt: 0, bezahltN: 0, ueber: 0, sonntagEur: 0, kosten: 0, kostenOk: true }; cur.kosten += Number(k.betrag); t[team] = cur; });
    Object.values(t).forEach(v => { v.kosten += v.sonntagEur; });
    return Object.entries(t).sort((a, b) => b[1].sysH - a[1].sysH);
  }, [employees, sys, maBy, saetze, teamkosten, monat, spMonat]);

  const erloesZiel = srPos.filter(p => ZIEL_KST.includes(p.kst)).reduce((s, p) => s + Number(p.gp || 0), 0);
  const kostenGesamt = teams.reduce((s, [, v]) => s + v.kosten, 0);
  const kostenVollst = teams.every(([, v]) => v.kostenOk);
  const sysGesamt = teams.reduce((s, [, v]) => s + v.sysH, 0);

  // Leistungsmengen automatisch aus der Sammelrechnung
  const autoMengen = useMemo(() => {
    const re = /(Hygiene|Prüfung elektrischer|Sicherheitsbeleuchtung|SiBe|Osmose|Bereitschaft|Transport|Containerrunde)/i;
    const m = new Map<string, { leistung: string; einheit: string; menge: number; gp: number; kst: string }>();
    srPos.filter(p => ZIEL_KST.includes(p.kst) && re.test(p.leistung || '')).forEach(p => {
      const k = `${p.leistung}|${p.einheit}`; const cur = m.get(k) || { leistung: p.leistung, einheit: p.einheit, menge: 0, gp: 0, kst: p.kst };
      cur.menge += Number(p.menge || 0); cur.gp += Number(p.gp || 0); m.set(k, cur);
    });
    return [...m.values()].sort((a, b) => b.gp - a.gp);
  }, [srPos]);
  const dguvImport = dguv.reduce((s, d) => s + Number(d.gesamt || 0), 0);

  const addMenge = async () => {
    const menge = parseZahl(neu.menge);
    if (!neu.leistung || menge == null) { toast.error('Leistung und Menge eingeben'); return; }
    const { error } = await db().from('md_leistungsmengen').insert({ monat, leistung: neu.leistung, menge, einheit: neu.einheit || null, kst: neu.kst || null, bemerkung: neu.bemerkung || null });
    if (error) { toast.error(error.message); return; }
    setNeu({ leistung: '', menge: '', einheit: 'Stk.', kst: '', bemerkung: '' });
    qc.invalidateQueries({ queryKey: ['md-mengen', monat] });
  };
  const delMenge = async (id: string) => { await db().from('md_leistungsmengen').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['md-mengen', monat] }); };

  const kpi = (t: string, v: string, sub: string, warn = false) => (
    <div style={{ ...card, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{t}</p>
      <p style={{ margin: '6px 0 2px', fontSize: 24, fontWeight: 800, color: warn ? '#b45309' : '#0f172a' }}>{v}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{sub}</p>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {kpi('Stunden im System', `${zahl(sysGesamt, 1)} h`, 'Tickets + Baustellen + intern')}
        {kpi('Erlös Sammelrechnung', erloesZiel ? eur(erloesZiel) : '–', 'KST 244800–244803, netto', !erloesZiel)}
        {kpi('Kosten (geschätzt)', kostenGesamt ? eur(kostenGesamt) : '–', kostenVollst ? 'Kostensatz × Stunden + Zulagen + Teamkosten' : 'Kostensatz fehlt teilweise', !kostenVollst)}
        {kpi('Deckungsbeitrag', erloesZiel && kostenGesamt ? eur(erloesZiel - kostenGesamt) : '–', erloesZiel && kostenGesamt ? `${zahl(((erloesZiel - kostenGesamt) / erloesZiel) * 100, 1)} % vom Erlös` : 'braucht Sammelrechnung + Sätze', !(erloesZiel && kostenGesamt))}
        {kpi('Verrechnungssatz', vSatz != null ? `${eur(vSatz)}/h` : '–', vSatz != null ? 'gültig für diesen Monat' : 'unter „Sätze & Teamkosten“ eintragen', vSatz == null)}
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 16 }}>Je Team · {label}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Team</th><th style={{ ...th, textAlign: 'right' }}>MA</th><th style={{ ...th, textAlign: 'right' }}>Std. System</th>
            <th style={{ ...th, textAlign: 'right' }}>Bezahlte Std.</th><th style={{ ...th, textAlign: 'right' }}>Auslastung</th>
            <th style={{ ...th, textAlign: 'right' }}>Überstunden</th><th style={{ ...th, textAlign: 'right' }}>Sonntagszulage</th><th style={{ ...th, textAlign: 'right' }}>Kosten</th>
          </tr></thead>
          <tbody>
            {teams.map(([team, v]) => (
              <tr key={team}>
                <td style={td}>{team}</td><td style={tdR}>{v.ma || '–'}</td><td style={tdR}>{zahl(v.sysH, 1)}</td>
                <td style={tdR}>{v.bezahltN ? zahl(v.bezahlt, 1) : '–'}</td>
                <td style={tdR}>{v.bezahltN && v.bezahlt > 0 ? `${zahl((v.sysH / v.bezahlt) * 100, 0)} %` : '–'}</td>
                <td style={tdR}>{v.ueber ? zahl(v.ueber, 1) : '–'}</td><td style={tdR}>{v.sonntagEur ? eur(v.sonntagEur) : '–'}</td>
                <td style={tdR}>{v.kosten ? eur(v.kosten) : '–'}{!v.kostenOk && v.ma ? <AlertTriangle size={12} color="#f59e0b" style={{ marginLeft: 4, verticalAlign: -1 }} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>Auslastung = Systemstunden ÷ bezahlte bzw. anwesende Stunden (aus MA-Daten oder SP Data: Ist − Krank − Urlaub). Kosten = Kostensatz × bezahlte Stunden (ersatzweise Systemstunden + Überstunden) + Sonntagszulagen + Teamkosten.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(460px,1fr))', gap: 16 }}>
        <div style={card}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16 }}>Leistungsmengen</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Automatisch aus der Sammelrechnung und dem DGUV-Import; Weiteres händisch ergänzen.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead><tr><th style={th}>Leistung</th><th style={th}>Quelle</th><th style={{ ...th, textAlign: 'right' }}>Menge</th><th style={{ ...th, textAlign: 'right' }}>Betrag</th><th style={th} /></tr></thead>
            <tbody>
              {dguvImport > 0 && <tr><td style={td}>DGUV geprüfte Geräte</td><td style={{ ...td, color: '#64748b' }}>DGUV-Import</td><td style={tdR}>{zahl(dguvImport, 0)} Stk.</td><td style={tdR}>–</td><td style={td} /></tr>}
              {autoMengen.map(m => (
                <tr key={m.leistung + m.einheit}><td style={td}>{m.leistung}</td><td style={{ ...td, color: '#64748b' }}>Sammelrechnung</td><td style={tdR}>{zahl(m.menge)} {m.einheit}</td><td style={tdR}>{eur(m.gp)}</td><td style={td} /></tr>
              ))}
              {mengen.map(m => (
                <tr key={m.id}><td style={td}>{m.leistung}</td><td style={{ ...td, color: '#64748b' }}>händisch{m.bemerkung ? ` · ${m.bemerkung}` : ''}</td><td style={tdR}>{zahl(m.menge)} {m.einheit || ''}</td><td style={tdR}>–</td>
                  <td style={td}><button onClick={() => delMenge(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button></td></tr>
              ))}
              {!dguvImport && !autoMengen.length && !mengen.length && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={5}>Noch keine Mengen – Sammelrechnung hochladen oder händisch eintragen</td></tr>}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={neu.leistung} onChange={e => setNeu({ ...neu, leistung: e.target.value })} style={{ ...inp, width: 190, textAlign: 'left' }} placeholder="Leistung (z. B. Osmose-Begehung)" />
            <input value={neu.menge} onChange={e => setNeu({ ...neu, menge: e.target.value })} style={inp} placeholder="Menge" inputMode="decimal" />
            <input value={neu.einheit} onChange={e => setNeu({ ...neu, einheit: e.target.value })} style={{ ...inp, width: 70, textAlign: 'left' }} placeholder="Einheit" />
            <input value={neu.bemerkung} onChange={e => setNeu({ ...neu, bemerkung: e.target.value })} style={{ ...inp, width: 130, textAlign: 'left' }} placeholder="Bemerkung" />
            <button style={btn(ACCENT)} onClick={addMenge}><Plus size={14} /> Hinzufügen</button>
          </div>
        </div>

        <div style={card}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 16 }}>Geleistet, aber in keiner Sammelrechnung</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Baustellen mit Stunden in {label}, deren A-Nr. in keiner hochgeladenen Sammelrechnung vorkommt{vSatz != null ? ` (Wert = Stunden × ${eur(vSatz)})` : ''}.</p>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>A-Nr.</th><th style={th}>Baustelle</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Std.</th><th style={{ ...th, textAlign: 'right' }}>Wert</th></tr></thead>
              <tbody>
                {(offen as any[]).map((o, i) => (
                  <tr key={i}><td style={td}>{o.anr || <span style={{ color: '#b45309' }}>ohne Nr.</span>}</td>
                    <td style={{ ...td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.name}>{o.name}</td>
                    <td style={{ ...td, color: '#64748b' }}>{o.status}</td><td style={tdR}>{zahl(o.h)}</td><td style={tdR}>{vSatz != null ? eur(o.h * vSatz) : '–'}</td></tr>
                ))}
                {!(offen as any[]).length && <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={5}>Nichts offen – oder noch keine Sammelrechnung hochgeladen</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Plus/Minus-Liste Fr. Denker (Excel) → md_ma_monat
// ════════════════════════════════════════════════════════════════════════
async function importDenker(rows: unknown[][], datei: string, monatAuswahl: string, employees: any[], fertig: () => void, setMonat?: (m: string) => void) {
  const { monat: mListe, zeilen } = parseDenker(rows);
  if (!zeilen.length) { toast.error('In der Liste wurden keine Mitarbeiterzeilen gefunden'); return; }
  const monat = mListe || monatAuswahl;
  if (mListe && mListe !== monatAuswahl) toast.info(`Liste gilt für ${monatGrenzen(mListe).label} – dort gespeichert`);
  const email = getLocalSession()?.email ?? null;
  const unbekannt: string[] = [];
  const payload = zeilen.map(z => {
    const { e } = matchEmployee(z.name, employees);
    if (!e) unbekannt.push(z.name);
    return {
      monat, employee_id: e?.id ?? null, mitarbeiter_name: e?.name ?? z.name,
      plusstunden: z.plus, minusstunden: z.minus, auszahlung_std: z.auszahlung, zuschlaege: Object.keys(z.zuschlaege).length ? z.zuschlaege : null,
      ueberstunden: z.auszahlung, sonntag_stunden: z.zuschlaege.so_std ?? null,
      quelle: `Plus/Minus-Liste: ${datei}`, updated_by: email,
    };
  });
  const { error } = await db().from('md_ma_monat').upsert(payload, { onConflict: 'monat,mitarbeiter_name' });
  if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
  await logUpload(monat, 'Plus/Minus-Liste', datei, payload.length, email ?? undefined);
  toast.success(`${payload.length} Mitarbeiter aus der Plus/Minus-Liste für ${monatGrenzen(monat).label} übernommen`);
  if (unbekannt.length) toast.warning(`Nicht im System angelegt: ${unbekannt.join(', ')} – trotzdem gespeichert`);
  if (setMonat && monat !== monatAuswahl) setMonat(monat);
  fertig();
}

// ════════════════════════════════════════════════════════════════════════
// Stundenabgleich: SP Data · Plus/Minus-Liste · WIDI-System
// ════════════════════════════════════════════════════════════════════════
type SpVorschlag = { datei: string; seite: SpSeite; employee_id: string | null; monat: string };

function StundenTab({ monat, label, setMonat, employees, maMonat, spMonat }: {
  monat: string; label: string; setMonat: (m: string) => void; employees: any[]; maMonat: any[]; spMonat: any[];
}) {
  const qc = useQueryClient();
  const spRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<SpVorschlag[]>([]);
  const [nurAuffaellig, setNurAuffaellig] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const [anlegen, setAnlegen] = useState<{ name: string; kuerzel: string; gewerk: string; team: string; ohne: boolean } | null>(null);
  const { von, bis } = monatGrenzen(monat);

  // Nachträglich angelegte Mitarbeiter: offene Einträge (ohne Zuordnung) automatisch verknüpfen
  useEffect(() => {
    const offen = [
      ...maMonat.filter(r => !r.employee_id).map(r => ({ t: 'md_ma_monat', r })),
      ...spMonat.filter(r => !r.employee_id).map(r => ({ t: 'md_spdata_monat', r })),
    ];
    if (!offen.length || !employees.length) return;
    (async () => {
      let n = 0;
      for (const { t, r } of offen) {
        const { e } = matchEmployee(r.name_sp || r.mitarbeiter_name, employees);
        if (!e) continue;
        const { error } = await db().from(t).update({ employee_id: e.id }).eq('id', r.id);
        if (!error) n++;
      }
      if (n) { toast.success(`${n} Einträge neu angelegten Mitarbeitern zugeordnet`); qc.invalidateQueries({ queryKey: ['md-ma'] }); qc.invalidateQueries({ queryKey: ['md-sp'] }); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length, maMonat.length, spMonat.length]);

  const zuordnen = async (z: AbgleichZeile, employeeId: string) => {
    const e = employees.find(x => x.id === employeeId); if (!e) return;
    if (z.denker?.id) await db().from('md_ma_monat').update({ employee_id: e.id }).eq('id', z.denker.id);
    if (z.sp?.id) await db().from('md_spdata_monat').update({ employee_id: e.id }).eq('id', z.sp.id);
    toast.success(`${z.name} → ${e.name} zugeordnet`);
    qc.invalidateQueries({ queryKey: ['md-ma'] }); qc.invalidateQueries({ queryKey: ['md-sp'] });
  };

  const mitarbeiterAnlegen = async () => {
    if (!anlegen?.name.trim()) { toast.error('Bitte einen Namen eingeben'); return; }
    const { error } = await db().from('employees').insert({
      name: anlegen.name.trim(), kuerzel: anlegen.kuerzel.trim() || null, gewerk: anlegen.gewerk, team: anlegen.team.trim() || null,
      aktiv: true, ohne_systembuchung: anlegen.ohne,
    });
    if (error) { toast.error('Anlegen fehlgeschlagen: ' + error.message); return; }
    toast.success(`${anlegen.name} angelegt – vorhandene Daten werden zugeordnet`);
    setAnlegen(null);
    qc.invalidateQueries({ queryKey: ['md-employees'] });
  };

  const ohneBuchungSetzen = async (employeeId: string, wert: boolean) => {
    const { error } = await db().from('employees').update({ ohne_systembuchung: wert }).eq('id', employeeId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['md-employees'] });
  };

  // WIDI-Stunden je MA und Tag
  const { data: widi = { sum: {}, tage: {} } as { sum: Record<string, number>; tage: Record<string, Record<string, number>> } } = useQuery({
    queryKey: ['md-widitage', monat],
    queryFn: async () => {
      const [tw, bs, ins] = await Promise.all([
        fetchAll<any>((f, t) => db().from('ticket_worklogs').select('employee_id,stunden,leistungsdatum').gte('leistungsdatum', von).lte('leistungsdatum', bis).range(f, t)),
        fetchAll<any>((f, t) => db().from('bs_stundeneintraege').select('mitarbeiter_id,stunden,datum').gte('datum', von).lte('datum', bis).range(f, t)),
        fetchAll<any>((f, t) => db().from('interne_stunden').select('employee_id,stunden,datum').gte('datum', von).lte('datum', bis).range(f, t)),
      ]);
      const sum: Record<string, number> = {}; const tage: Record<string, Record<string, number>> = {};
      const add = (id: string | null, d: string, h: number) => {
        if (!id) return; sum[id] = (sum[id] || 0) + Number(h || 0);
        tage[id] = tage[id] || {}; tage[id][d] = (tage[id][d] || 0) + Number(h || 0);
      };
      tw.forEach(r => add(r.employee_id, r.leistungsdatum, r.stunden));
      bs.forEach(r => add(r.mitarbeiter_id, r.datum, r.stunden));
      ins.forEach(r => add(r.employee_id, r.datum, r.stunden));
      return { sum, tage };
    },
  });

  const spLesen = async (files: FileList) => {
    const neu: SpVorschlag[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setLaeuft(`Lese ${f.name} (${i + 1}/${files.length}) … das dauert bei Scans etwas`);
      try {
        const seiten = await spDataLesen(f);
        for (const s of seiten) {
          const { e } = matchEmployee(s.name, employees);
          neu.push({ datei: f.name, seite: s, employee_id: e?.id ?? null, monat: s.monat && /^\d{4}-\d{2}$/.test(s.monat) ? s.monat : monat });
        }
        await logUpload(monat, 'SP Data (gelesen)', f.name, seiten.length, getLocalSession()?.email);
      } catch (err: any) {
        toast.error(`${f.name}: ${err?.message || err}`);
      }
    }
    setLaeuft(null);
    if (neu.length) { setVorschlaege(v => [...v, ...neu]); toast.success(`${neu.length} Monatsabrechnung(en) erkannt – bitte prüfen und übernehmen`); }
  };

  const spSpeichern = async () => {
    const email = getLocalSession()?.email ?? null;
    const payload = vorschlaege.map(v => {
      const e = employees.find(x => x.id === v.employee_id);
      const s = v.seite.summe || {};
      return {
        monat: v.monat, employee_id: e?.id ?? null, mitarbeiter_name: e?.name ?? v.seite.name, name_sp: v.seite.name,
        personalnummer: v.seite.personalnummer ?? null, stand: v.seite.stand && /^\d{4}-\d{2}-\d{2}$/.test(v.seite.stand) ? v.seite.stand : null,
        ges: s.ges ?? null, soll: s.soll ?? null, pause: s.pause ?? null, ao: s.ao ?? null, ist: s.ist ?? null,
        krank: s.krank ?? null, urlaub: s.urlaub ?? null, flexi: s.flexi ?? null, ue_std: s.ue_std ?? null,
        tage: v.seite.tage ?? null, quelle_datei: v.datei, updated_by: email,
      };
    });
    const { error } = await db().from('md_spdata_monat').upsert(payload, { onConflict: 'monat,mitarbeiter_name' });
    if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    toast.success(`${payload.length} Monatsabrechnung(en) gespeichert`);
    const andererMonat = payload.find(p => p.monat !== monat)?.monat;
    setVorschlaege([]);
    qc.invalidateQueries({ queryKey: ['md-sp'] });
    if (andererMonat) setMonat(andererMonat);
  };

  const listeLesen = async (file: File) => {
    try { await importDenker(await leseExcel(file), file.name, monat, employees, () => qc.invalidateQueries({ queryKey: ['md-ma'] }), setMonat); }
    catch (err: any) { toast.error('Excel konnte nicht gelesen werden: ' + (err?.message || err)); }
  };

  // Abgleich-Zeilen
  const zeilen: AbgleichZeile[] = useMemo(() => {
    const keys = new Map<string, { employee_id: string | null; name: string }>();
    employees.filter(e => e.aktiv).forEach(e => keys.set(e.id, { employee_id: e.id, name: e.name }));
    spMonat.forEach(s => { const k = s.employee_id || `n:${s.mitarbeiter_name}`; if (!keys.has(k)) keys.set(k, { employee_id: s.employee_id, name: s.mitarbeiter_name }); });
    maMonat.filter(r => r.plusstunden != null).forEach(r => { const k = r.employee_id || `n:${r.mitarbeiter_name}`; if (!keys.has(k)) keys.set(k, { employee_id: r.employee_id, name: r.mitarbeiter_name }); });
    return [...keys.values()].map(k => {
      const sp = spMonat.find(s => (k.employee_id && s.employee_id === k.employee_id) || (!k.employee_id && s.mitarbeiter_name === k.name));
      const denker = maMonat.find(r => r.plusstunden != null && ((k.employee_id && r.employee_id === k.employee_id) || (!k.employee_id && r.mitarbeiter_name === k.name)));
      const widiH = k.employee_id ? (widi.sum[k.employee_id] || 0) : 0;
      const anwesend = sp?.ist != null ? Number(sp.ist) - Number(sp.krank || 0) - Number(sp.urlaub || 0) : null;
      const emp = employees.find(e => e.id === k.employee_id);
      const moDo = Number(emp?.soll_mo_do ?? 8), fr = Number(emp?.soll_fr ?? 7);
      const sm = sollModell(monat, moDo, fr);
      return pruefe({ employee_id: k.employee_id, name: k.name, ohneBuchung: !!emp?.ohne_systembuchung, modell: { brutto: sm.brutto, feiertagH: sm.feiertagH, netto: sm.netto, moDo, fr }, sp, denker, widiH, widiTage: k.employee_id ? (widi.tage[k.employee_id] || {}) : {}, anwesend, quote: anwesend && anwesend > 0 ? widiH / anwesend : null, ampel: 'grau', hinweise: [] });
    }).sort((a, b) => ({ rot: 0, gelb: 1, grau: 2, grün: 3 }[a.ampel] - { rot: 0, gelb: 1, grau: 2, grün: 3 }[b.ampel]) || a.name.localeCompare(b.name));
  }, [employees, spMonat, maMonat, widi, monat]);

  const sollAZ = (z: AbgleichZeile) => {
    const basis = z.sp?.soll != null ? Number(z.sp.soll) : z.modell?.netto ?? null;
    return basis == null ? null : basis - Number(z.sp?.krank || 0) - Number(z.sp?.urlaub || 0);
  };
  const saldo = (z: AbgleichZeile) => (z.sp?.ist != null && z.sp?.soll != null ? Number(z.sp.ist) - Number(z.sp.soll) : null);
  const zeig = nurAuffaellig ? zeilen.filter(z => z.ampel === 'rot' || z.ampel === 'gelb') : zeilen;
  const sum = (f: (z: AbgleichZeile) => number | null | undefined) => zeilen.reduce((s, z) => s + (Number(f(z)) || 0), 0);
  const AMP: Record<string, string> = { rot: '#fee2e2', gelb: '#fef3c7', grün: '#dcfce7', grau: '#f1f5f9' };
  const AMPT: Record<string, string> = { rot: '#b91c1c', gelb: '#b45309', grün: '#15803d', grau: '#64748b' };

  const exportieren = () => {
    const rows: (string | number | null)[][] = [['Ampel', 'Mitarbeiter', 'Modell Mo–Do/Fr', 'Soll Modell', 'Feiertage', 'Soll SP', 'Krank', 'Urlaub', 'Soll-Arbeitszeit', 'Ist SP', 'Ist-Arbeitszeit', 'Saldo Ist−Soll', 'WIDI gebucht', 'Quote %', 'Ü-Std. (SP)', 'Plus (Liste)', 'Flexi (SP)', 'Minus (Liste)', 'Auszahlung', 'Zuschläge', 'Hinweise']];
    zeilen.forEach(z => rows.push([z.ampel, z.name, z.modell ? `${z.modell.moDo}/${z.modell.fr}` : null, z.modell?.netto ?? null, z.modell?.feiertagH || null, z.sp?.soll ?? null, z.sp?.krank ?? null, z.sp?.urlaub ?? null, sollAZ(z), z.sp?.ist ?? null, z.anwesend, saldo(z), Math.round(z.widiH * 100) / 100,
      z.quote != null ? Math.round(z.quote * 1000) / 10 : null, z.sp?.ue_std ?? null, z.denker?.plusstunden ?? null, z.sp?.flexi ?? null, z.denker?.minusstunden ?? null, z.denker?.auszahlung_std ?? null,
      z.denker?.zuschlaege ? Object.entries(z.denker.zuschlaege).map(([k, v]) => `${ZUSCHLAG_LABEL[k] || k}: ${v}`).join('; ') : null, z.hinweise.join(' · ')]));
    downloadExcel(`Stundenabgleich_${monat}.xlsx`, `Abgleich ${monat}`, rows);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>Stundenabgleich {label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b', maxWidth: 760 }}>
              Alle Werte in Zeitminuten (Industriestunden). SP Data (Zeiterfassung Personal) gegen die Plus/Minus-Liste von Fr. Denker und die im WIDI-System gebuchten Stunden. SP-Data-Monatsabrechnungen als PDF hochladen – auch eingescannt, mehrere Mitarbeiter je Datei möglich.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn(ACCENT)} disabled={!!laeuft} onClick={() => spRef.current?.click()}><Upload size={14} /> {laeuft ? 'Lese …' : 'SP Data (PDF)'}</button>
            <input ref={spRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) spLesen(e.target.files); e.target.value = ''; }} />
            <button style={btn('#fff', '#334155')} onClick={() => listeRef.current?.click()}><Upload size={14} /> Plus/Minus-Liste (Excel)</button>
            <input ref={listeRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) listeLesen(f); e.target.value = ''; }} />
            <button style={btn('#fff', '#334155')} onClick={exportieren}><Download size={14} /> Abgleich (Excel)</button>
          </div>
        </div>
        {laeuft && <p style={{ margin: '12px 0 0', fontSize: 13, color: ACCENT, fontWeight: 600 }}>{laeuft}</p>}

        {vorschlaege.length > 0 && (
          <div style={{ marginTop: 16, padding: 16, background: '#f0fdfa', border: `1px solid ${ACCENT}55`, borderRadius: 12 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Erkannte SP-Data-Monatsabrechnungen – Zuordnung prüfen</p>
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead><tr>{['Name (SP Data)', 'Pers.-Nr.', 'Mitarbeiter im System', 'Monat', 'Soll', 'Ist', 'Krank', 'Urlaub', 'Flexi', 'Ü-Std.', 'Tage', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{vorschlaege.map((v, i) => (
                  <tr key={i}>
                    <td style={td}>{v.seite.name}</td><td style={td}>{v.seite.personalnummer || '–'}</td>
                    <td style={td}>
                      <select value={v.employee_id || ''} onChange={e => setVorschlaege(vs => vs.map((x, j) => (j === i ? { ...x, employee_id: e.target.value || null } : x)))}
                        style={{ ...inp, width: 190, textAlign: 'left', borderColor: v.employee_id ? '#cbd5e1' : '#f59e0b' }}>
                        <option value="">– nicht im System –</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.aktiv ? '' : ' (inaktiv)'}</option>)}
                      </select>
                    </td>
                    <td style={td}><input value={v.monat} onChange={e => setVorschlaege(vs => vs.map((x, j) => (j === i ? { ...x, monat: e.target.value } : x)))} style={{ ...inp, width: 80, textAlign: 'left' }} /></td>
                    <td style={tdR}>{zahl(v.seite.summe?.soll)}</td><td style={tdR}>{zahl(v.seite.summe?.ist)}</td><td style={tdR}>{zahl(v.seite.summe?.krank)}</td>
                    <td style={tdR}>{zahl(v.seite.summe?.urlaub)}</td><td style={tdR}>{zahl(v.seite.summe?.flexi)}</td><td style={tdR}>{zahl(v.seite.summe?.ue_std)}</td>
                    <td style={tdR}>{v.seite.tage?.length ?? 0}</td>
                    <td style={td}><button onClick={() => setVorschlaege(vs => vs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={btn(ACCENT)} onClick={spSpeichern}><Save size={14} /> Übernehmen</button>
              <button style={btn('#fff', '#334155')} onClick={() => setVorschlaege([])}>Verwerfen</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {[
          ['SP Data erfasst', `${spMonat.length} MA`, 'Monatsabrechnungen'],
          ['Plus/Minus-Liste', `${maMonat.filter(r => r.plusstunden != null).length} MA`, 'Fr. Denker'],
          ['Anwesend (SP Data)', `${zahl(sum(z => z.anwesend), 1)} h`, 'Ist − Krank − Urlaub'],
          ['Im System gebucht', `${zahl(sum(z => (z.sp ? z.widiH : 0)), 1)} h`, sum(z => z.anwesend) > 0 ? `${zahl((sum(z => (z.sp ? z.widiH : 0)) / sum(z => z.anwesend)) * 100, 0)} % der Anwesenheit` : 'bei MA mit SP Data'],
          ['Auffällig', `${zeilen.filter(z => z.ampel === 'rot').length} rot · ${zeilen.filter(z => z.ampel === 'gelb').length} gelb`, 'siehe Hinweise'],
        ].map(([t, v, s]) => (
          <div key={t} style={{ ...card, padding: 16 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{t}</p>
            <p style={{ margin: '6px 0 2px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{v}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{s}</p>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Abgleich je Mitarbeiter</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button style={{ ...btn('#fff', '#334155'), padding: '5px 10px', fontSize: 12 }} onClick={() => setAnlegen({ name: '', kuerzel: '', gewerk: 'Hochbau', team: '', ohne: true })}><UserPlus size={13} /> Mitarbeiter anlegen</button>
            <label style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={nurAuffaellig} onChange={e => setNurAuffaellig(e.target.checked)} /> nur auffällige
            </label>
          </div>
        </div>
        {anlegen && (
          <div style={{ marginBottom: 12, padding: 14, background: '#f0fdfa', border: `1px solid ${ACCENT}55`, borderRadius: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>Neuer Mitarbeiter:</b>
            <input value={anlegen.name} onChange={e => setAnlegen({ ...anlegen, name: e.target.value })} placeholder="Vorname Nachname" style={{ ...inp, width: 190, textAlign: 'left' }} />
            <input value={anlegen.kuerzel} onChange={e => setAnlegen({ ...anlegen, kuerzel: e.target.value })} placeholder="Kürzel" style={{ ...inp, width: 70, textAlign: 'left' }} />
            <select value={anlegen.gewerk} onChange={e => setAnlegen({ ...anlegen, gewerk: e.target.value })} style={{ ...inp, width: 110, textAlign: 'left' }}><option>Hochbau</option><option>Elektro</option></select>
            <input list="md-teams-st" value={anlegen.team} onChange={e => setAnlegen({ ...anlegen, team: e.target.value })} placeholder="Team (z. B. Hygiene)" style={{ ...inp, width: 160, textAlign: 'left' }} />
            <datalist id="md-teams-st">{['Hygienespülungen', 'Containerrunde', 'Hausmeister', 'HM Elektro', 'Elektro', 'Hochbau'].map(t => <option key={t} value={t} />)}</datalist>
            <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={anlegen.ohne} onChange={e => setAnlegen({ ...anlegen, ohne: e.target.checked })} /> bucht nicht im WIDI-System</label>
            <button style={btn(ACCENT)} onClick={mitarbeiterAnlegen}><Save size={14} /> Anlegen</button>
            <button style={btn('#fff', '#334155')} onClick={() => setAnlegen(null)}><X size={14} /></button>
          </div>
        )}
        <div style={{ maxHeight: 620, overflow: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['', 'Mitarbeiter', 'Soll Modell', 'Feiertage', 'Soll SP', 'Krank', 'Urlaub', 'Soll-Arbeitszeit', 'Ist SP', 'Ist-Arbeitszeit', 'Saldo', 'WIDI gebucht', 'Quote', 'Ü-Std. SP', 'Plus Liste', 'Flexi SP', 'Minus Liste', 'Auszahlung', 'Zuschläge', 'Hinweise'].map((h, i) =>
                <th key={i} style={{ ...th, textAlign: i >= 2 && i <= 17 ? 'right' : 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {zeig.map(z => (<FragmentRow key={(z.employee_id || '') + z.name}>
                <tr>
                  <td style={td}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: AMPT[z.ampel] }} title={z.ampel} /></td>
                  <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <button title="Werte händisch eintragen/ändern" onClick={() => setBearbeiten(b => (b === (z.employee_id || z.name) ? null : (z.employee_id || z.name)))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, marginRight: 4, verticalAlign: -2 }}><Pencil size={13} /></button>
                    {z.name}
                    {!z.employee_id && (
                      <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8, fontWeight: 400 }}>
                        <span style={{ color: '#b45309' }}>nicht im System</span>
                        <button onClick={() => { const p = z.name.split(',').map(x => x.trim()); setAnlegen({ name: p.length === 2 ? `${p[1]} ${p[0]}` : z.name, kuerzel: '', gewerk: 'Hochbau', team: '', ohne: true }); }}
                          style={{ ...btn('#fff', '#334155'), padding: '2px 8px', fontSize: 11 }}><UserPlus size={12} /> anlegen</button>
                        <select defaultValue="" onChange={e => e.target.value && zuordnen(z, e.target.value)} style={{ ...inp, width: 130, padding: '2px 6px', fontSize: 11, textAlign: 'left' }}>
                          <option value="">zuordnen …</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </span>
                    )}
                    {z.ohneBuchung && <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b', fontWeight: 400, border: '1px solid #cbd5e1', borderRadius: 6, padding: '1px 5px' }}>ohne Systembuchung</span>}
                  </td>
                  <td style={tdR} title={z.modell ? `Mo–Do ${zahl(z.modell.moDo)} h · Fr ${zahl(z.modell.fr)} h` : ''}>{zahl(z.modell?.netto)}{z.modell && (z.modell.moDo !== 8 || z.modell.fr !== 7) ? <span style={{ fontSize: 10, color: '#b45309' }}> *</span> : null}</td>
                  <td style={tdR}>{z.modell?.feiertagH ? zahl(z.modell.feiertagH) : ''}</td>
                  <td style={tdR} title={hhmm(z.sp?.soll)}>{zahl(z.sp?.soll)}</td><td style={tdR}>{z.sp?.krank ? zahl(z.sp.krank) : ''}</td>
                  <td style={tdR}>{z.sp?.urlaub ? zahl(z.sp.urlaub) : ''}</td>
                  <td style={{ ...tdR, fontWeight: 600 }} title={hhmm(sollAZ(z))}>{zahl(sollAZ(z))}</td>
                  <td style={tdR} title={hhmm(z.sp?.ist)}>{zahl(z.sp?.ist)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }} title={hhmm(z.anwesend)}>{zahl(z.anwesend)}</td>
                  <td style={{ ...tdR, color: (saldo(z) ?? 0) < 0 ? '#b91c1c' : '#15803d' }} title={hhmm(saldo(z))}>{zahl(saldo(z))}</td>
                  <td style={tdR} title={hhmm(z.widiH)}>{zahl(z.widiH)}</td>
                  <td style={tdR}>{z.quote != null ? `${zahl(z.quote * 100, 0)} %` : '–'}</td>
                  <td style={tdR}>{zahl(z.sp?.ue_std)}</td><td style={tdR}>{zahl(z.denker?.plusstunden)}</td>
                  <td style={tdR}>{zahl(z.sp?.flexi)}</td><td style={tdR}>{zahl(z.denker?.minusstunden)}</td><td style={tdR}>{zahl(z.denker?.auszahlung_std)}</td>
                  <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{z.denker?.zuschlaege ? Object.entries(z.denker.zuschlaege).map(([k, v]) => `${ZUSCHLAG_LABEL[k] || k} ${zahl(Number(v))}`).join(', ') : ''}</td>
                  <td style={{ ...td, fontSize: 12, background: AMP[z.ampel], color: AMPT[z.ampel], minWidth: 260 }}>{z.hinweise.join(' · ') || 'stimmt überein'}</td>
                </tr>
                {bearbeiten === (z.employee_id || z.name) && (
                  <tr><td colSpan={20} style={{ padding: 0, borderBottom: '1px solid #e2e8f0' }}>
                    <WerteEditor z={z} monat={monat} employees={employees} onClose={() => setBearbeiten(null)} onOhneBuchung={ohneBuchungSetzen} />
                  </td></tr>
                )}
              </FragmentRow>))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>
          Alle Stunden in Zeitminuten (Industriestunden: 0,25 = 15 Min., Maus über den Wert zeigt h:min). Soll Modell = Arbeitstage × Mo–Do 8 h / Fr 7 h (je MA anpassbar, * = abweichend) ohne Feiertage NRW; Soll-Arbeitszeit = Soll − Krank − Urlaub; Ist-Arbeitszeit = Ist − Krank − Urlaub. Pausenregel: ab mehr als 6 h 0,5 h, bei mehr als 9 h Arbeitszeit + 0,25 h. Mit ✎ lassen sich Werte händisch eintragen, das Arbeitszeitmodell ändern und die Tage einzeln ansehen. Prüfregeln: Plusstunden der Liste = Ü-Std. aus SP Data · Minusstunden = Flexi aus SP Data · Auszahlung = Plus − Minus · im WIDI-System nicht mehr gebucht als anwesend und mindestens 70 % der Anwesenheit gebucht · keine Buchungen an Krank-/Urlaubstagen.
        </p>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }

// Händische Eingabe/Korrektur je Mitarbeiter: SP-Data-Summen und Plus/Minus-Liste
function WerteEditor({ z, monat, employees, onClose, onOhneBuchung }: {
  z: AbgleichZeile; monat: string; employees: any[]; onClose: () => void; onOhneBuchung: (id: string, wert: boolean) => void;
}) {
  const qc = useQueryClient();
  const f = (v: any) => (v == null ? '' : String(v).replace('.', ','));
  const [sp, setSp] = useState<Record<string, string>>({
    soll: f(z.sp?.soll), ist: f(z.sp?.ist), krank: f(z.sp?.krank), urlaub: f(z.sp?.urlaub), flexi: f(z.sp?.flexi), ue_std: f(z.sp?.ue_std),
  });
  const zu = (z.denker?.zuschlaege || {}) as Record<string, number>;
  const [li, setLi] = useState<Record<string, string>>({
    plus: f(z.denker?.plusstunden), minus: f(z.denker?.minusstunden), aus: f(z.denker?.auszahlung_std),
    ...Object.fromEntries(Object.keys(ZUSCHLAG_LABEL).map(k => [k, f(zu[k])])),
  });
  const emp = employees.find(e => e.id === z.employee_id);
  const name = emp?.name || z.name;
  const [modell, setModell] = useState({ moDo: f(emp?.soll_mo_do ?? 8), fr: f(emp?.soll_fr ?? 7) });
  const [tageOffen, setTageOffen] = useState(false);

  const modellSpeichern = async () => {
    const moDo = parseZahl(modell.moDo), fr = parseZahl(modell.fr);
    if (!z.employee_id || moDo == null || fr == null) { toast.error('Bitte Stunden Mo–Do und Fr eingeben'); return; }
    const { error } = await db().from('employees').update({ soll_mo_do: moDo, soll_fr: fr }).eq('id', z.employee_id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Arbeitszeitmodell ${name}: Mo–Do ${zahl(moDo)} h, Fr ${zahl(fr)} h`);
    qc.invalidateQueries({ queryKey: ['md-employees'] });
  };

  // Tagesübersicht: Arbeitszeitmodell + Feiertage + SP Data + WIDI-Buchungen
  const tage = useMemo(() => {
    const sm = sollModell(monat, Number(emp?.soll_mo_do ?? 8), Number(emp?.soll_fr ?? 7));
    const spT: Record<string, any> = {}; ((z.sp?.tage || []) as any[]).forEach(t => { spT[t.datum] = t; });
    const alle = new Set<string>([...sm.tage.map(t => t.datum), ...Object.keys(spT), ...Object.keys(z.widiTage || {})]);
    const smBy: Record<string, any> = {}; sm.tage.forEach(t => { smBy[t.datum] = t; });
    return [...alle].sort().map(d => {
      const t = spT[d]; const m = smBy[d]; const w = z.widiTage?.[d] || 0;
      const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(d + 'T12:00:00').getDay()];
      const abw = t?.grund || ((t?.krank ?? 0) > 0 ? 'Krank' : (t?.urlaub ?? 0) > 0 ? 'Urlaub' : '') || (m?.feiertag ? m.feiertag : '');
      const pRegel = t?.ges != null ? pauseRegel(t.ges) : null;
      return { d, wt, soll: m?.soll ?? 0, feiertag: m?.feiertag, ges: t?.ges, pause: t?.pause ?? (t?.ges != null && t?.ist != null ? Math.round((t.ges - t.ist) * 100) / 100 : null), pRegel, ist: t?.ist, abw, w };
    });
  }, [monat, emp, z.sp, z.widiTage]);

  const speichern = async () => {
    const email = getLocalSession()?.email ?? null;
    const spVals = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, parseZahl(v)]));
    if (Object.values(spVals).some(v => v != null) || z.sp) {
      const { error } = await db().from('md_spdata_monat').upsert({
        monat, employee_id: z.employee_id, mitarbeiter_name: z.sp?.mitarbeiter_name || name, ...spVals,
        quelle_datei: z.sp?.quelle_datei ? `${z.sp.quelle_datei} (händisch korrigiert)` : 'händisch', updated_by: email,
      }, { onConflict: 'monat,mitarbeiter_name' });
      if (error) { toast.error('SP Data: ' + error.message); return; }
    }
    const plus = parseZahl(li.plus), minus = parseZahl(li.minus);
    let aus = parseZahl(li.aus);
    if (aus == null && (plus != null || minus != null)) aus = Math.round(((plus || 0) - (minus || 0)) * 100) / 100;
    const zus: Record<string, number> = {};
    Object.keys(ZUSCHLAG_LABEL).forEach(k => { const v = parseZahl(li[k]); if (v != null && v !== 0) zus[k] = v; });
    if (plus != null || minus != null || aus != null || Object.keys(zus).length || z.denker) {
      const { error } = await db().from('md_ma_monat').upsert({
        monat, employee_id: z.employee_id, mitarbeiter_name: z.denker?.mitarbeiter_name || name,
        plusstunden: plus, minusstunden: minus, auszahlung_std: aus, zuschlaege: Object.keys(zus).length ? zus : null,
        ueberstunden: aus, sonntag_stunden: zus.so_std ?? null, quelle: 'händisch (Stundenabgleich)', updated_by: email,
      }, { onConflict: 'monat,mitarbeiter_name' });
      if (error) { toast.error('Plus/Minus-Liste: ' + error.message); return; }
    }
    toast.success(`Werte für ${name} gespeichert`);
    qc.invalidateQueries({ queryKey: ['md-ma'] }); qc.invalidateQueries({ queryKey: ['md-sp'] });
    onClose();
  };

  const feld = (label: string, val: string, set: (v: string) => void) => (
    <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#64748b' }}>
      {label}<input value={val} onChange={e => set(e.target.value)} style={{ ...inp, width: 82 }} inputMode="decimal" />
    </label>
  );

  return (
    <div style={{ padding: 14, background: '#f8fafc', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <b style={{ fontSize: 12, width: 130 }}>SP Data (Monatssumme)</b>
        {([['soll', 'Soll'], ['ist', 'Ist-Zeit'], ['krank', 'Krank'], ['urlaub', 'Urlaub'], ['flexi', 'Flexi'], ['ue_std', 'Ü-Std.']] as [string, string][])
          .map(([k, l]) => feld(l, sp[k], v => setSp(o => ({ ...o, [k]: v }))))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <b style={{ fontSize: 12, width: 130 }}>Plus/Minus-Liste</b>
        {feld('Plusstunden', li.plus, v => setLi(o => ({ ...o, plus: v })))}
        {feld('Minusstunden', li.minus, v => setLi(o => ({ ...o, minus: v })))}
        {feld('Auszahlung (leer = Plus − Minus)', li.aus, v => setLi(o => ({ ...o, aus: v })))}
        {Object.entries(ZUSCHLAG_LABEL).map(([k, l]) => feld(l, li[k], v => setLi(o => ({ ...o, [k]: v }))))}
      </div>
      {z.employee_id && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <b style={{ fontSize: 12, width: 130 }}>Arbeitszeitmodell</b>
          {feld('Mo–Do (h/Tag)', modell.moDo, v => setModell(o => ({ ...o, moDo: v })))}
          {feld('Freitag (h)', modell.fr, v => setModell(o => ({ ...o, fr: v })))}
          <button style={{ ...btn('#fff', '#334155'), padding: '6px 10px' }} onClick={modellSpeichern}>Modell speichern</button>
          <button style={{ ...btn('#fff', '#334155'), padding: '6px 10px' }} onClick={() => setTageOffen(o => !o)}>{tageOffen ? 'Tage ausblenden' : 'Tage einzeln ansehen'}</button>
        </div>
      )}
      {tageOffen && (
        <div style={{ maxHeight: 360, overflow: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Datum', 'Soll Modell', 'Feiertag / Abwesenheit', 'Ges. SP', 'Pause SP', 'Pause lt. Regel', 'Ist SP', 'WIDI gebucht', 'Ist − WIDI'].map((h, i) => <th key={h} style={{ ...th, textAlign: i === 0 || i === 2 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>{tage.map(t => {
              const pFehler = t.pause != null && t.pRegel != null && Math.abs(t.pause - t.pRegel) > 0.02 && !t.abw;
              const konflikt = !!t.abw && t.w > 0;
              return (
                <tr key={t.d} style={{ background: t.feiertag ? '#eff6ff' : konflikt ? '#fee2e2' : undefined }}>
                  <td style={td}>{t.wt}, {t.d.slice(8, 10)}.{t.d.slice(5, 7)}.</td>
                  <td style={tdR}>{t.soll ? zahl(t.soll) : ''}</td>
                  <td style={{ ...td, color: t.feiertag ? '#1d4ed8' : '#b45309' }}>{t.abw}</td>
                  <td style={tdR}>{zahl(t.ges)}</td>
                  <td style={{ ...tdR, color: pFehler ? '#b45309' : undefined, fontWeight: pFehler ? 700 : 400 }}>{zahl(t.pause)}</td>
                  <td style={tdR}>{t.pRegel != null ? zahl(t.pRegel) : ''}</td>
                  <td style={tdR}>{zahl(t.ist)}</td>
                  <td style={{ ...tdR, color: konflikt ? '#b91c1c' : undefined }}>{t.w ? zahl(t.w) : ''}</td>
                  <td style={tdR}>{t.ist != null && !t.abw ? zahl(Number(t.ist) - t.w) : ''}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {!(z.sp?.tage || []).length && <p style={{ margin: 8, fontSize: 12, color: '#94a3b8' }}>Keine Tageswerte aus SP Data vorhanden – angezeigt werden Arbeitszeitmodell, Feiertage und WIDI-Buchungen.</p>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btn(ACCENT)} onClick={speichern}><Save size={14} /> Speichern</button>
        <button style={btn('#fff', '#334155')} onClick={onClose}>Abbrechen</button>
        {z.employee_id && (
          <label style={{ fontSize: 12, color: '#334155', display: 'flex', gap: 6, alignItems: 'center', marginLeft: 12 }}>
            <input type="checkbox" checked={!!emp?.ohne_systembuchung} onChange={e => onOhneBuchung(z.employee_id as string, e.target.checked)} />
            bucht nicht im WIDI-System (z. B. Hygienespülungen, Containerrunde) – Stundenvergleich entfällt
          </label>
        )}
        {!z.employee_id && <span style={{ fontSize: 12, color: '#b45309' }}>Tipp: Mitarbeiter anlegen oder zuordnen – die Werte bleiben erhalten und werden übernommen.</span>}
      </div>
    </div>
  );
}
