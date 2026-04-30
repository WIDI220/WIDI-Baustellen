import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLocalSession, clearLocalSession } from '@/pages/AuthPage';
import { useMonth } from '@/contexts/MonthContext';
import { parseExcelFile, ParsedTicketRow } from '@/lib/excel-parser';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, History } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';

type PruefStatus = 'ok' | 'warnung' | 'duplikat';
interface PruefZeile extends ParsedTicketRow {
  pruefStatus: PruefStatus;
  pruefHinweis?: string;
  ausschliessen: boolean;
}

export default function ExcelImportPage() {
  const user = getLocalSession();
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pruefZeilen, setPruefZeilen] = useState<PruefZeile[]>([]);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [geprueft, setGeprueft] = useState(false);
  const [warnBestaetigt, setWarnBestaetigt] = useState(false);
  const [showHistorie, setShowHistorie] = useState(false);

  const { data: importHistorie = [], refetch: refetchHistorie } = useQuery({
    queryKey: ['import-runs-historie'],
    queryFn: async () => {
      const { data } = await supabase.from('import_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null); setPruefZeilen([]); setGeprueft(false); setWarnBestaetigt(false);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelFile(buffer, activeMonth);
      setWarnings(result.warnings);
      const { data: existing } = await supabase.from('tickets').select('a_nummer');
      const existingSet = new Set((existing ?? []).map((t: any) => t.a_nummer));
      const [refYear, refMonth] = activeMonth.split('-').map(Number);
      const zeilen: PruefZeile[] = result.rows.map(row => {
        let pruefStatus: PruefStatus = 'ok';
        const hinweise: string[] = [];
        if (existingSet.has(row.a_nummer)) { pruefStatus = 'duplikat'; hinweise.push('Bereits in DB'); }
        if (row.isDuplicate) { pruefStatus = 'duplikat'; hinweise.push('Doppelt in Datei'); }
        if (row.eingangsdatum) {
          const d = row.eingangsdatum;
          if (d.getFullYear() !== refYear || d.getMonth() + 1 !== refMonth) {
            if (pruefStatus === 'ok') pruefStatus = 'warnung';
            hinweise.push(`Datum ${d.toLocaleDateString('de-DE')} außerhalb ${activeMonth}`);
          }
        }
        if (!row.eingangsdatum) { if (pruefStatus === 'ok') pruefStatus = 'warnung'; hinweise.push('Kein Datum'); }
        return { ...row, pruefStatus, pruefHinweis: hinweise.join(' · '), ausschliessen: row.isDuplicate };
      });
      setPruefZeilen(zeilen);
      const neu = zeilen.filter(z => !z.ausschliessen).length;
      toast.success(`${neu} Tickets bereit · ${zeilen.filter(z => z.pruefStatus === 'warnung' && !z.ausschliessen).length} Warnungen`);
    } catch (err: any) { toast.error(`Parse-Fehler: ${err.message}`); }
  };

  const toggleAusschliessen = (idx: number) =>
    setPruefZeilen(prev => prev.map((z, i) => i === idx ? { ...z, ausschliessen: !z.ausschliessen } : z));

  const doImport = async () => {
    if (!user) return;
    const zuImportieren = pruefZeilen.filter(z => !z.ausschliessen);
    if (!zuImportieren.length) { toast.error('Keine Tickets ausgewählt'); return; }
    setImporting(true);
    let inserted = 0, updated = 0, failed = 0;
    try {
      const { data: importRun } = await supabase.from('import_runs').insert({ typ: 'excel', filename: fileName, rows_total: zuImportieren.length, created_by: user?.email }).select().single();
      for (const row of zuImportieren) {
        try {
          const d = row.eingangsdatum; const eingangsdatum = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : null;
          const { data: ex } = await supabase.from('tickets').select('id,eingangsdatum').eq('a_nummer', row.a_nummer).maybeSingle();
          if (ex) {
            if (eingangsdatum && !ex.eingangsdatum) { await supabase.from('tickets').update({ eingangsdatum }).eq('id', ex.id); updated++; }
          } else {
            const { error } = await supabase.from('tickets').insert({
              a_nummer: row.a_nummer, gewerk: row.gewerk, status: 'in_bearbeitung', eingangsdatum,
              melder: row.melder || null, raumnr: row.raumnr || null, auftragstext: row.auftragstext || null,
            });
            if (error) { failed++; } else inserted++;
          }
        } catch { failed++; }
      }
      if (importRun) await supabase.from('import_runs').update({ rows_inserted: inserted, rows_updated: updated, rows_skipped: failed }).eq('id', importRun.id);
      await logActivity(user?.email, user.email ?? '', `Import: ${inserted} neu, ${updated} akt., ${failed} Fehler — ${fileName}`);
      // import_runs aktualisieren
      if (importRun) {
        await supabase.from('import_runs').update({
          inserted, rows_inserted: inserted, rows_updated: updated, rows_skipped: failed,
        }).eq('id', importRun.id);
      }
      refetchHistorie();
      setReport({ inserted, updated, failed });
      setGeprueft(true);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(`Import: ${inserted} neu eingetragen`);
    } catch (err: any) { toast.error(`Import-Fehler: ${err.message}`); }
    finally { setImporting(false); }
  };

  const reset = () => { setPruefZeilen([]); setFileName(''); setWarnings([]); setReport(null); setGeprueft(false); setWarnBestaetigt(false); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const statusFarbe = (s: PruefStatus) => s === 'ok' ? '#10b981' : s === 'warnung' ? '#f59e0b' : '#ef4444';
  const statusIcon = (s: PruefStatus, aus: boolean) => {
    if (aus) return <XCircle size={14} style={{ color: '#94a3b8' }} />;
    if (s === 'ok') return <CheckCircle size={14} style={{ color: '#10b981' }} />;
    if (s === 'warnung') return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
    return <XCircle size={14} style={{ color: '#ef4444' }} />;
  };
  const zuImp = pruefZeilen.filter(z => !z.ausschliessen);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
        Ticket-Import <span style={{ color: '#10b981' }}>CSV / Excel</span>
      </h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        Neues Format: CSV mit auftrags_id, datum, werkstatt, melder, raumnr, auftragstext — oder altes Excel-Format
      </p>

      {!geprueft && !pruefZeilen.length && (
        <div onClick={() => fileInputRef.current?.click()}
          style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: '40px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', marginBottom: 24 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#10b981'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
          <FileSpreadsheet size={32} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>CSV oder Excel hochladen</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Unterstützt: .csv (Semikolon-getrennt), .xlsx, .xls</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setShowWarnings(!showWarnings)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#b45309' }}>{warnings.length} Parser-Hinweise</span>
            </div>
            {showWarnings ? <ChevronUp size={14} style={{ color: '#b45309' }} /> : <ChevronDown size={14} style={{ color: '#b45309' }} />}
          </div>
          {showWarnings && <div style={{ marginTop: 8 }}>{warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: '#92400e' }}>• {w}</div>)}</div>}
        </div>
      )}

      {pruefZeilen.length > 0 && !geprueft && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Bereit', value: zuImp.length, color: '#0f172a', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'OK', value: zuImp.filter(z => z.pruefStatus === 'ok').length, color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'Warnungen', value: zuImp.filter(z => z.pruefStatus === 'warnung').length, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
              { label: 'Ausgeschlossen', value: pruefZeilen.filter(z => z.ausschliessen).length, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#1d4ed8' }}>Zeile anklicken = vom Import aus- oder einschließen · Rot/Duplikate sind automatisch ausgeschlossen</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['', 'A-Nummer', 'Datum', 'Gewerk', 'Melder', 'Raum', 'Auftragstext', 'Hinweis'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pruefZeilen.map((z, i) => (
                    <tr key={i} onClick={() => toggleAusschliessen(i)}
                      style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: z.ausschliessen ? '#f8fafc' : z.pruefStatus === 'warnung' ? 'rgba(245,158,11,0.04)' : 'transparent', opacity: z.ausschliessen ? 0.5 : 1 }}>
                      <td style={{ padding: '7px 12px' }}>{statusIcon(z.pruefStatus, z.ausschliessen)}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{z.a_nummer}</td>
                      <td style={{ padding: '7px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{z.eingangsdatum?.toLocaleDateString('de-DE') ?? '–'}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: z.gewerk === 'Elektro' ? '#eff6ff' : '#f0fdf4', color: z.gewerk === 'Elektro' ? '#1d4ed8' : '#15803d' }}>{z.gewerk}</span>
                      </td>
                      <td style={{ padding: '7px 12px', color: '#64748b', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.melder || '–'}</td>
                      <td style={{ padding: '7px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{z.raumnr || '–'}</td>
                      <td style={{ padding: '7px 12px', color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.auftragstext}>{z.auftragstext || '–'}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11, color: statusFarbe(z.pruefStatus) }}>{z.pruefHinweis || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Warnungs-Bestätigung */}
          {zuImp.filter(z => z.pruefStatus === 'warnung').length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                  {zuImp.filter(z => z.pruefStatus === 'warnung').length} Tickets mit Warnungen — bitte prüfen:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {zuImp.filter(z => z.pruefStatus === 'warnung').map((z, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#92400e' }}>
                      • {z.a_nummer}: {z.pruefHinweis}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input type='checkbox' id='warnBestaetigt' checked={warnBestaetigt} onChange={e => setWarnBestaetigt(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor='warnBestaetigt' style={{ fontSize: 13, color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                    Ich habe alle Warnungen geprüft und bestätige den Import
                  </label>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={doImport} disabled={importing || !zuImp.length || (zuImp.filter(z => z.pruefStatus === 'warnung').length > 0 && !warnBestaetigt) || !canEdit('excel_import')}
              style={{ padding: '12px 28px', background: importing ? '#94a3b8' : 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: importing ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(16,185,129,.25)' }}>
              {importing ? '⏳ Importiere...' : `✓ ${zuImp.length} Tickets jetzt importieren`}
            </button>
            <button onClick={reset} style={{ padding: '12px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Abbrechen</button>
          </div>
        </>
      )}

      {report && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '20px 24px', marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle size={22} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>Import erfolgreich abgeschlossen</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[{ label: 'Neu eingetragen', value: report.inserted, color: '#10b981' }, { label: 'Aktualisiert', value: report.updated, color: '#6366f1' }, { label: 'Fehler', value: report.failed, color: report.failed > 0 ? '#ef4444' : '#94a3b8' }].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #d1fae5' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={reset} style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Neuen Import starten
          </button>
        </div>
      )}
      {/* ── Import-Historie ── */}
      <div style={{ marginTop: 32, border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        <div
          onClick={() => setShowHistorie(!showHistorie)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}>
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
                    {['Datum', 'Datei', 'Neu', 'Aktualisiert', 'Fehler', 'Gesamt'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
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
                      <td style={{ padding: '10px 16px', color: '#10b981', fontWeight: 700 }}>{run.rows_inserted ?? run.inserted ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#6366f1', fontWeight: 700 }}>{run.rows_updated ?? run.updated ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: (run.rows_skipped ?? run.failed ?? 0) > 0 ? '#ef4444' : '#94a3b8', fontWeight: 700 }}>{run.rows_skipped ?? run.failed ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 700 }}>{run.rows_total ?? 0}</td>
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
