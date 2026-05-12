import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLocalSession } from '@/pages/AuthPage';
import { useMonth } from '@/contexts/MonthContext';
import { parseExcelFile, markiereDbDuplikate, ParsedTicketRow, PruefStatus } from '@/lib/excel-parser';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle,
  Info, ChevronDown, ChevronUp, History, Eye, EyeOff, Filter
} from 'lucide-react';

type Filter = 'alle' | 'ok' | 'warnung' | 'fehler' | 'duplikat_datei' | 'duplikat_db' | 'ausgeschlossen';

const STATUS_CONFIG: Record<PruefStatus | 'ausgeschlossen', { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  ok:            { label: 'OK',              bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', icon: <CheckCircle size={13} color="#15803d" /> },
  warnung:       { label: 'Warnung',         bg: '#fffbeb', text: '#b45309', border: '#fde68a', icon: <AlertTriangle size={13} color="#f59e0b" /> },
  fehler:        { label: 'Fehler',          bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', icon: <XCircle size={13} color="#ef4444" /> },
  duplikat_datei:{ label: 'Duplikat Datei', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', icon: <XCircle size={13} color="#f97316" /> },
  duplikat_db:   { label: 'Duplikat DB',    bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe', icon: <XCircle size={13} color="#7c3aed" /> },
  ausgeschlossen:{ label: 'Ausgeschlossen', bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0', icon: <EyeOff size={13} color="#94a3b8" /> },
};

interface ZeileState extends ParsedTicketRow {
  ausgeschlossen: boolean;
}

export default function ExcelImportPage() {
  const user = getLocalSession();
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [zeilen, setZeilen] = useState<ZeileState[]>([]);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [parserFehler, setParserFehler] = useState<string[]>([]);
  const [geprueft, setGeprueft] = useState(false);
  const [warnBestaetigt, setWarnBestaetigt] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Filter>('alle');
  const [showHistorie, setShowHistorie] = useState(false);
  const [detailZeile, setDetailZeile] = useState<number | null>(null);

  const { data: importHistorie = [], refetch: refetchHistorie } = useQuery({
    queryKey: ['import-runs-historie'],
    queryFn: async () => {
      const { data } = await supabase.from('import_runs')
        .select('*').order('created_at', { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  // ── Datei einlesen ──────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null); setZeilen([]); setGeprueft(false); setWarnBestaetigt(false);
    setFilterStatus('alle'); setDetailZeile(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelFile(buffer, activeMonth);
      setParserFehler(result.parserFehler);

      if (result.parserFehler.length && !result.rows.length) {
        toast.error('Datei konnte nicht gelesen werden');
        return;
      }

      // DB-Abgleich
      const { data: existing } = await supabase.from('tickets').select('a_nummer');
      const existingSet = new Set((existing ?? []).map((t: any) => t.a_nummer));
      const marked = markiereDbDuplikate(result.rows, existingSet);

      const z: ZeileState[] = marked.map(row => ({
        ...row,
        // Fehler und Duplikate automatisch ausschließen
        ausgeschlossen: row.pruefStatus === 'fehler' || row.pruefStatus === 'duplikat_datei' || row.pruefStatus === 'duplikat_db',
      }));

      setZeilen(z);

      const ok = z.filter(r => !r.ausgeschlossen && r.pruefStatus === 'ok').length;
      const warn = z.filter(r => !r.ausgeschlossen && r.pruefStatus === 'warnung').length;
      const aus = z.filter(r => r.ausgeschlossen).length;
      toast.success(`${ok} OK · ${warn} Warnungen · ${aus} ausgeschlossen`);
    } catch (err: any) {
      toast.error(`Fehler beim Lesen: ${err.message}`);
    }
  };

  const toggleAusschluss = (idx: number) =>
    setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, ausgeschlossen: !z.ausgeschlossen } : z));

  const alleAusschliessen = (status: PruefStatus) =>
    setZeilen(prev => prev.map(z => z.pruefStatus === status ? { ...z, ausgeschlossen: true } : z));

  const alleEinschliessen = (status: PruefStatus) =>
    setZeilen(prev => prev.map(z => z.pruefStatus === status ? { ...z, ausgeschlossen: false } : z));

  // ── Import durchführen ──────────────────────────────────────────────────────
  const doImport = async () => {
    if (!user) return;
    const zuImportieren = zeilen.filter(z => !z.ausgeschlossen);
    if (!zuImportieren.length) { toast.error('Keine Tickets zum Importieren'); return; }
    setImporting(true);

    const report: {
      inserted: ZeileState[];
      updated: ZeileState[];
      fehler: Array<{ zeile: ZeileState; grund: string }>;
    } = { inserted: [], updated: [], fehler: [] };

    try {
      const { data: importRun } = await supabase.from('import_runs').insert({
        typ: 'excel', filename: fileName,
        rows_total: zuImportieren.length, created_by: user?.email,
      }).select().single();

      for (const row of zuImportieren) {
        try {
          const d = row.eingangsdatum;
          const eingangsdatum = d
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            : null;

          const gewerk = row.gewerk === 'Unbekannt' ? 'Hochbau' : row.gewerk;
          const { data: ex } = await supabase.from('tickets').select('id,eingangsdatum').eq('a_nummer', row.a_nummer).maybeSingle();

          if (ex) {
            if (eingangsdatum && !ex.eingangsdatum) {
              await supabase.from('tickets').update({ eingangsdatum }).eq('id', ex.id);
              report.updated.push(row);
            }
          } else {
            const { error } = await supabase.from('tickets').insert({
              a_nummer: row.a_nummer, gewerk, status: 'in_bearbeitung', eingangsdatum,
              melder: row.melder || null, raumnr: row.raumnr || null, auftragstext: row.auftragstext || null,
            });
            if (error) report.fehler.push({ zeile: row, grund: error.message });
            else report.inserted.push(row);
          }
        } catch (e: any) {
          report.fehler.push({ zeile: row, grund: e.message });
        }
      }

      if (importRun) {
        await supabase.from('import_runs').update({
          rows_inserted: report.inserted.length,
          rows_updated: report.updated.length,
          rows_skipped: report.fehler.length,
        }).eq('id', importRun.id);
      }

      await logActivity(user?.email, user.email ?? '',
        `Import: ${report.inserted.length} neu, ${report.updated.length} akt., ${report.fehler.length} Fehler — ${fileName}`);

      refetchHistorie();
      setReport(report);
      setGeprueft(true);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(`Import abgeschlossen: ${report.inserted.length} neu`);
    } catch (err: any) {
      toast.error(`Import-Fehler: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setZeilen([]); setFileName(''); setParserFehler([]); setReport(null);
    setGeprueft(false); setWarnBestaetigt(false); setFilterStatus('alle'); setDetailZeile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Statistiken ─────────────────────────────────────────────────────────────
  const stats = {
    gesamt:          zeilen.length,
    ok:              zeilen.filter(z => z.pruefStatus === 'ok' && !z.ausgeschlossen).length,
    warnung:         zeilen.filter(z => z.pruefStatus === 'warnung' && !z.ausgeschlossen).length,
    fehler:          zeilen.filter(z => z.pruefStatus === 'fehler').length,
    duplikat_datei:  zeilen.filter(z => z.pruefStatus === 'duplikat_datei').length,
    duplikat_db:     zeilen.filter(z => z.pruefStatus === 'duplikat_db').length,
    ausgeschlossen:  zeilen.filter(z => z.ausgeschlossen).length,
    bereit:          zeilen.filter(z => !z.ausgeschlossen).length,
  };

  const gefilterteZeilen = zeilen.filter(z => {
    if (filterStatus === 'alle') return true;
    if (filterStatus === 'ausgeschlossen') return z.ausgeschlossen;
    return z.pruefStatus === filterStatus && !z.ausgeschlossen;
  });

  const hatWarnungen = zeilen.some(z => z.pruefStatus === 'warnung' && !z.ausgeschlossen);
  const kannImportieren = stats.bereit > 0 && (!hatWarnungen || warnBestaetigt) && canEdit('excel_import');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
          Ticket-Import <span style={{ color: '#10b981' }}>CSV / Excel</span>
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
          Jede Zeile wird einzeln geprüft — Fehler, Duplikate und Warnungen werden vor dem Import angezeigt
        </p>
      </div>

      {/* Upload */}
      {!zeilen.length && !geprueft && (
        <div onClick={() => fileInputRef.current?.click()}
          style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: '48px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', marginBottom: 24, transition: 'border-color .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#10b981'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
          <FileSpreadsheet size={36} style={{ color: '#10b981', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>CSV oder Excel hochladen</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Erwartete Spalten: auftrags_id · datum · werkstatt · melder · raumnr · auftragstext
          </p>
        </div>
      )}

      {/* Parser-Fehler */}
      {parserFehler.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 13, marginBottom: 6 }}>
            ❌ Datei-Fehler — Import nicht möglich
          </div>
          {parserFehler.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>• {f}</div>)}
        </div>
      )}

      {/* Prüf-Übersicht */}
      {zeilen.length > 0 && !geprueft && (
        <>
          {/* Statistik-Karten */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Gesamt',        value: stats.gesamt,         color: '#0f172a', bg: '#f8fafc',  border: '#e2e8f0' },
              { label: 'Bereit',        value: stats.bereit,         color: '#0f172a', bg: '#f0fdf4',  border: '#bbf7d0' },
              { label: 'OK',            value: stats.ok,             color: '#15803d', bg: '#f0fdf4',  border: '#bbf7d0' },
              { label: 'Warnungen',     value: stats.warnung,        color: '#b45309', bg: '#fffbeb',  border: '#fde68a' },
              { label: 'Fehler',        value: stats.fehler,         color: '#b91c1c', bg: '#fef2f2',  border: '#fecaca' },
              { label: 'Dupl. Datei',   value: stats.duplikat_datei, color: '#c2410c', bg: '#fff7ed',  border: '#fed7aa' },
              { label: 'Dupl. DB',      value: stats.duplikat_db,    color: '#7c3aed', bg: '#faf5ff',  border: '#ddd6fe' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Erklärung */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10 }}>
            <Info size={14} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: '#1d4ed8', lineHeight: 1.6 }}>
              <strong>Zeile anklicken</strong> = vom Import aus- oder einschließen &nbsp;·&nbsp;
              Fehler & Duplikate sind automatisch ausgeschlossen &nbsp;·&nbsp;
              <strong>Warnungen</strong> sind eingeschlossen, müssen aber bestätigt werden
            </div>
          </div>

          {/* Filter-Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {([
              ['alle', `Alle (${stats.gesamt})`],
              ['ok', `OK (${stats.ok})`],
              ['warnung', `Warnungen (${stats.warnung})`],
              ['fehler', `Fehler (${stats.fehler})`],
              ['duplikat_datei', `Dupl. Datei (${stats.duplikat_datei})`],
              ['duplikat_db', `Dupl. DB (${stats.duplikat_db})`],
              ['ausgeschlossen', `Ausgeschlossen (${stats.ausgeschlossen})`],
            ] as [Filter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setFilterStatus(val)}
                style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                  background: filterStatus === val ? '#0f172a' : '#f8fafc',
                  color: filterStatus === val ? '#fff' : '#64748b',
                  borderColor: filterStatus === val ? '#0f172a' : '#e2e8f0',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Tabelle */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                    {['Zeile', 'Status', 'A-Nummer', 'Datum', 'Gewerk', 'Melder', 'Raum', 'Auftragstext', 'Hinweis', ''].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gefilterteZeilen.map((z, i) => {
                    const globalIdx = zeilen.indexOf(z);
                    const cfg = STATUS_CONFIG[z.ausgeschlossen ? 'ausgeschlossen' : z.pruefStatus];
                    const isDetail = detailZeile === globalIdx;
                    return (
                      <>
                        <tr key={i}
                          style={{ borderBottom: '1px solid #f8fafc', background: z.ausgeschlossen ? '#f8fafc' : 'transparent', opacity: z.ausgeschlossen ? 0.55 : 1, cursor: 'pointer' }}
                          onClick={() => toggleAusschluss(globalIdx)}>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{z.zeilennr}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                              {cfg.icon}{cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{z.a_nummer || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{z.eingangsdatum?.toLocaleDateString('de-DE') ?? '–'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {z.gewerk !== 'Unbekannt' ? (
                              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: z.gewerk === 'Elektro' ? '#eff6ff' : '#f0fdf4', color: z.gewerk === 'Elektro' ? '#1d4ed8' : '#15803d' }}>
                                {z.gewerk}
                              </span>
                            ) : <span style={{ color: '#ef4444', fontSize: 11 }}>–</span>}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.melder}>{z.melder || '–'}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{z.raumnr || '–'}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.auftragstext}>{z.auftragstext || '–'}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: cfg.text, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={z.hinweis}>{z.hinweis || ''}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <button onClick={e => { e.stopPropagation(); setDetailZeile(isDetail ? null : globalIdx); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                              {isDetail ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </td>
                        </tr>
                        {isDetail && (
                          <tr key={`detail-${i}`}>
                            <td colSpan={10} style={{ background: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #f1f5f9' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
                                {[
                                  ['A-Nummer', z.a_nummer],
                                  ['Datum', z.eingangsdatum?.toLocaleDateString('de-DE') ?? '–'],
                                  ['Gewerk', z.gewerk],
                                  ['Melder', z.melder || '–'],
                                  ['Raum', z.raumnr || '–'],
                                  ['Status', cfg.label],
                                ].map(([k, v]) => (
                                  <div key={k}>
                                    <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' }}>{k}</span>
                                    <div style={{ color: '#0f172a', marginTop: 2 }}>{v}</div>
                                  </div>
                                ))}
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' }}>Auftragstext</span>
                                  <div style={{ color: '#0f172a', marginTop: 2, lineHeight: 1.5 }}>{z.auftragstext || '–'}</div>
                                </div>
                                {z.hinweis && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' }}>Hinweis</span>
                                    <div style={{ color: cfg.text, marginTop: 2, fontWeight: 600 }}>{z.hinweis}</div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warnungs-Bestätigung */}
          {hatWarnungen && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>
                    {stats.warnung} Ticket{stats.warnung !== 1 ? 's' : ''} mit Warnungen:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
                    {zeilen.filter(z => z.pruefStatus === 'warnung' && !z.ausgeschlossen).map((z, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#92400e' }}>
                        • <strong>{z.a_nummer}</strong>: {z.hinweis}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="warnCheck" checked={warnBestaetigt} onChange={e => setWarnBestaetigt(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    <label htmlFor="warnCheck" style={{ fontSize: 13, color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                      Ich habe alle Warnungen geprüft und bestätige den Import
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import-Button */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={doImport} disabled={importing || !kannImportieren}
              style={{ padding: '13px 28px', background: kannImportieren && !importing ? 'linear-gradient(135deg,#10b981,#059669)' : '#e2e8f0', color: kannImportieren && !importing ? '#fff' : '#94a3b8', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: importing || !kannImportieren ? 'not-allowed' : 'pointer', boxShadow: kannImportieren ? '0 4px 14px rgba(16,185,129,.25)' : 'none' }}>
              {importing ? '⏳ Importiere...' : `✓ ${stats.bereit} Ticket${stats.bereit !== 1 ? 's' : ''} importieren`}
            </button>
            <button onClick={reset}
              style={{ padding: '13px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
              Abbrechen
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
              {stats.ausgeschlossen > 0 && `${stats.ausgeschlossen} ausgeschlossen`}
            </span>
          </div>
        </>
      )}

      {/* Ergebnis-Report */}
      {report && geprueft && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <CheckCircle size={22} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>Import abgeschlossen — {fileName}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Neu importiert', value: report.inserted.length, color: '#10b981' },
              { label: 'Aktualisiert',   value: report.updated.length,  color: '#6366f1' },
              { label: 'Fehler',         value: report.fehler.length,   color: report.fehler.length > 0 ? '#ef4444' : '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #d1fae5' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Fehler-Detail */}
          {report.fehler.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 13, marginBottom: 6 }}>Fehlgeschlagene Einträge:</div>
              {report.fehler.map((f: any, i: number) => (
                <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>
                  • <strong>{f.zeile.a_nummer}</strong> (Zeile {f.zeile.zeilennr}): {f.grund}
                </div>
              ))}
            </div>
          )}

          <button onClick={reset}
            style={{ padding: '11px 22px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Neuen Import starten
          </button>
        </div>
      )}

      {/* Import-Historie */}
      <div style={{ marginTop: 32, border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        <div onClick={() => setShowHistorie(!showHistorie)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#f8fafc', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={15} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Import-Historie</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>({(importHistorie as any[]).length} Einträge)</span>
          </div>
          {showHistorie ? <ChevronUp size={15} style={{ color: '#94a3b8' }} /> : <ChevronDown size={15} style={{ color: '#94a3b8' }} />}
        </div>
        {showHistorie && (
          <div style={{ overflowX: 'auto' }}>
            {(importHistorie as any[]).length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Noch keine Importe</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Datum', 'Datei', 'Neu', 'Aktualisiert', 'Fehler', 'Gesamt', 'Benutzer'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(importHistorie as any[]).map((run: any) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(run.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 500 }}>{run.filename ?? '–'}</td>
                      <td style={{ padding: '10px 16px', color: '#10b981', fontWeight: 700 }}>{run.rows_inserted ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#6366f1', fontWeight: 700 }}>{run.rows_updated ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: (run.rows_skipped ?? 0) > 0 ? '#ef4444' : '#94a3b8', fontWeight: 700 }}>{run.rows_skipped ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 700 }}>{run.rows_total ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>{run.created_by?.split('@')[0] ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
