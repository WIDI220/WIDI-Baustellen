import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Trash2, RefreshCw, ChevronLeft, ChevronRight, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

const MONAT_NAMEN = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ── Hilfsfunktionen ────────────────────────────────────────────────
function parseDatum(v: any): string | null {
  if (!v) return null;
  // Excel-Datum (Zahl)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  // String: dd.mm.yyyy
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function normName(name: string, aliase: Record<string,string>): string {
  const trimmed = name?.trim() ?? '';
  return aliase[trimmed.toLowerCase()] ?? trimmed;
}

interface ParsedRow {
  pruefer: string;
  datum: string;
  monat: string;
  ergebnis: string;
  kunde: string;
}

async function parseFile(file: File, aliase: Record<string,string>): Promise<{
  rows: ParsedRow[];
  dateiname: string;
  unbekannteNamen: string[];
}> {
  const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

  let rawRows: Record<string,any>[] = [];

  if (isXlsx) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    // Richtiges Sheet finden: das mit "LETZTER PRÜFER" Spalte und meisten Zeilen
    let bestSheet = '';
    let bestCount = 0;
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<Record<string,any>>(ws, { defval: '' });
      const hasCol = data.length > 0 && Object.keys(data[0]).some(k => k.includes('PRÜFER') || k.includes('PRUFER'));
      if (hasCol && data.length > bestCount) { bestSheet = sn; bestCount = data.length; }
    }
    if (!bestSheet) throw new Error('Kein passendes Sheet gefunden (Spalte "LETZTER PRÜFER" fehlt)');
    rawRows = XLSX.utils.sheet_to_json<Record<string,any>>(wb.Sheets[bestSheet], { defval: '' });
  } else {
    // CSV
    const text = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target?.result as string ?? '');
      r.onerror = rej;
      r.readAsText(file, 'ISO-8859-1');
    });
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Datei leer');
    const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,''));
    rawRows = lines.slice(1).map(line => {
      const vals = line.split(';').map(v => v.trim().replace(/^"|"$/g,''));
      const row: Record<string,any> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
      return row;
    });
  }

  // Spaltennamen normalisieren
  const norm = (s: string) => s.toLowerCase().replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
  const findKey = (row: Record<string,any>, keywords: string[]) =>
    Object.keys(row).find(k => keywords.some(kw => norm(k).includes(kw))) ?? '';

  const rows: ParsedRow[] = [];
  const unbekSet = new Set<string>();

  for (const row of rawRows) {
    const prueferKey  = findKey(row, ['letzterpruefer','letzterprfer','pruefer','prfer']);
    const datumKey    = findKey(row, ['letztepruefung','letzteprf','letzteprufung','pruefung','datum']);
    const ergebnisKey = findKey(row, ['ergebnis']);
    const kundeKey    = findKey(row, ['kundenbezeichnung','kunde','kunden']);

    const prueferRaw = String(row[prueferKey] ?? '').trim();
    const datumRaw   = row[datumKey];
    const ergebnis   = String(row[ergebnisKey] ?? '').trim().toLowerCase();
    const kunde      = String(row[kundeKey] ?? '').trim();

    if (!prueferRaw || !datumRaw) continue;
    const datum = parseDatum(datumRaw);
    if (!datum) continue;

    const pruefer = normName(prueferRaw, aliase);
    if (prueferRaw.toLowerCase() !== pruefer.toLowerCase()) {
      // Name wurde durch Alias ersetzt – ok
    } else if (!aliase[prueferRaw.toLowerCase()] && prueferRaw.includes('.')) {
      // Kurzform – als unbekannt markieren
      unbekSet.add(prueferRaw);
    }

    rows.push({
      pruefer,
      datum,
      monat: datum.slice(0, 7),
      ergebnis: ergebnis.includes('bestanden') && !ergebnis.includes('nicht') ? 'bestanden' : ergebnis.includes('nicht') ? 'nicht_bestanden' : 'bestanden',
      kunde,
    });
  }

  return { rows, dateiname: file.name, unbekannteNamen: Array.from(unbekSet) };
}

// ── Hauptkomponente ────────────────────────────────────────────────
export default function DGUVMessauswertung() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [ansicht, setAnsicht] = useState<'heatmap' | 'liste'>('heatmap');
  const [filterErgebnis, setFilterErgebnis] = useState<'alle' | 'bestanden' | 'nicht_bestanden'>('alle');
  const [newAlias, setNewAlias] = useState({ alias: '', kanonikname: '' });
  const [showAliasForm, setShowAliasForm] = useState(false);

  // Daten laden
  const { data: ergebnisse = [] } = useQuery({
    queryKey: ['dguv-ergebnisse'],
    queryFn: async () => { const { data } = await supabase.from('dguv_mess_ergebnisse').select('*, dguv_mess_importe(dateiname, created_at)').order('monat'); return data ?? []; },
  });
  const { data: importe = [], refetch: refetchImporte } = useQuery({
    queryKey: ['dguv-importe-neu'],
    queryFn: async () => { const { data } = await supabase.from('dguv_mess_importe').select('*').order('created_at', { ascending: false }); return data ?? []; },
  });
  const { data: aliaseRaw = [], refetch: refetchAliase } = useQuery({
    queryKey: ['dguv-aliase'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer_aliase').select('*').order('alias'); return data ?? []; },
  });

  const aliaseMap = useMemo(() => {
    const m: Record<string,string> = {};
    (aliaseRaw as any[]).forEach((a: any) => { m[a.alias.toLowerCase()] = a.kanonikname; });
    return m;
  }, [aliaseRaw]);

  // Gefilterte Daten für das gewählte Jahr
  const jahresDaten = useMemo(() => {
    return (ergebnisse as any[]).filter((e: any) => e.monat?.startsWith(String(year)));
  }, [ergebnisse, year]);

  // Alle Prüfer im Jahr
  const allePreufer = useMemo(() => {
    const set = new Set<string>();
    jahresDaten.forEach((e: any) => set.add(e.pruefer_name));
    return Array.from(set).sort();
  }, [jahresDaten]);

  // Alle Monate im Jahr (01–12)
  const alleMonate = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);

  // Aggregation: pruefer → monat → {gesamt, bestanden, nicht_best}
  const agg = useMemo(() => {
    const m: Record<string, Record<string, { gesamt: number; bestanden: number; nicht_best: number }>> = {};
    jahresDaten.forEach((e: any) => {
      if (!m[e.pruefer_name]) m[e.pruefer_name] = {};
      if (!m[e.pruefer_name][e.monat]) m[e.pruefer_name][e.monat] = { gesamt: 0, bestanden: 0, nicht_best: 0 };
      m[e.pruefer_name][e.monat].gesamt     += e.gesamt     ?? 0;
      m[e.pruefer_name][e.monat].bestanden  += e.bestanden  ?? 0;
      m[e.pruefer_name][e.monat].nicht_best += e.nicht_best ?? 0;
    });
    return m;
  }, [jahresDaten]);

  // Maximalwert für Heatmap-Skalierung
  const maxWert = useMemo(() => {
    let max = 0;
    Object.values(agg).forEach(ma => Object.values(ma).forEach(v => { if (v.gesamt > max) max = v.gesamt; }));
    return max || 1;
  }, [agg]);

  // Jahressummen pro Prüfer
  const jahresSummen = useMemo(() => {
    const s: Record<string, { gesamt: number; bestanden: number; nicht_best: number }> = {};
    allePreufer.forEach(p => {
      s[p] = { gesamt: 0, bestanden: 0, nicht_best: 0 };
      Object.values(agg[p] ?? {}).forEach(v => {
        s[p].gesamt     += v.gesamt;
        s[p].bestanden  += v.bestanden;
        s[p].nicht_best += v.nicht_best;
      });
    });
    return s;
  }, [agg, allePreufer]);

  // Alle Einzel-Messungen für Listen-Ansicht
  const alleEinzel = useMemo(() => {
    return (ergebnisse as any[])
      .filter((e: any) => e.monat?.startsWith(String(year)))
      .filter((e: any) => filterErgebnis === 'alle' ? true : filterErgebnis === 'bestanden' ? e.bestanden > 0 : e.nicht_best > 0)
      .sort((a: any, b: any) => b.monat.localeCompare(a.monat));
  }, [ergebnisse, year, filterErgebnis]);

  // Farbe für Heatmap-Zelle
  function heatColor(val: number): string {
    if (val === 0) return '#f8fafc';
    const pct = val / maxWert;
    if (pct < 0.25) return '#dbeafe';
    if (pct < 0.5)  return '#93c5fd';
    if (pct < 0.75) return '#3b82f6';
    return '#1e3a5f';
  }
  function heatTextColor(val: number): string {
    const pct = val / maxWert;
    return pct > 0.5 ? '#fff' : '#1e3a5f';
  }

  // Import Handler
  async function handleImport(file: File) {
    setUploading(true);
    try {
      const { rows, dateiname, unbekannteNamen } = await parseFile(file, aliaseMap);
      if (rows.length === 0) throw new Error('Keine gültigen Messungen gefunden (Prüfer + Datum fehlen)');

      // Aggregieren nach Prüfer + Monat
      const aggMap: Record<string, { pruefer: string; monat: string; kunde: string; gesamt: number; bestanden: number; nicht_best: number }> = {};
      rows.forEach(r => {
        const key = `${r.pruefer}__${r.monat}`;
        if (!aggMap[key]) aggMap[key] = { pruefer: r.pruefer, monat: r.monat, kunde: r.kunde, gesamt: 0, bestanden: 0, nicht_best: 0 };
        aggMap[key].gesamt++;
        if (r.ergebnis === 'bestanden') aggMap[key].bestanden++;
        else aggMap[key].nicht_best++;
      });

      const monate = [...new Set(rows.map(r => r.monat))];
      const hauptMonat = monate.sort()[Math.floor(monate.length / 2)] ?? rows[0].monat;
      const kunde = rows[0].kunde || '';

      // Import-Header speichern
      const { data: imp, error: impErr } = await supabase.from('dguv_mess_importe').insert({
        dateiname,
        monat: hauptMonat,
        kunde,
        gesamt: rows.length,
        bestanden: rows.filter(r => r.ergebnis === 'bestanden').length,
        nicht_best: rows.filter(r => r.ergebnis === 'nicht_bestanden').length,
      }).select().single();
      if (impErr) throw impErr;

      // Ergebnisse speichern
      const ergebnisRows = Object.values(aggMap).map(v => ({
        import_id: imp.id,
        pruefer_name: v.pruefer,
        monat: v.monat,
        kunde: v.kunde,
        gesamt: v.gesamt,
        bestanden: v.bestanden,
        nicht_best: v.nicht_best,
      }));
      const { error: ergErr } = await supabase.from('dguv_mess_ergebnisse').insert(ergebnisRows);
      if (ergErr) throw ergErr;

      toast.success(`${rows.length} Messungen importiert · ${Object.keys(aggMap).length} Prüfer-Monat-Kombinationen`);
      if (unbekannteNamen.length > 0) {
        toast.info(`Kurzformen erkannt: ${unbekannteNamen.join(', ')} – bitte Aliase hinterlegen`);
      }
      qc.invalidateQueries({ queryKey: ['dguv-ergebnisse'] });
      qc.invalidateQueries({ queryKey: ['dguv-importe-neu'] });
    } catch(e: any) {
      toast.error('Import fehlgeschlagen: ' + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function deleteImport(id: string) {
    if (!confirm('Import und alle zugehörigen Daten löschen?')) return;
    await supabase.from('dguv_mess_importe').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['dguv-ergebnisse'] });
    qc.invalidateQueries({ queryKey: ['dguv-importe-neu'] });
    toast.success('Import gelöscht');
  }

  async function saveAlias() {
    if (!newAlias.alias.trim() || !newAlias.kanonikname.trim()) return;
    const { error } = await supabase.from('dguv_pruefer_aliase').insert({ alias: newAlias.alias.trim(), kanonikname: newAlias.kanonikname.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Alias gespeichert');
    setNewAlias({ alias: '', kanonikname: '' });
    refetchAliase();
  }

  const totalJahr = allePreufer.reduce((s, p) => s + (jahresSummen[p]?.gesamt ?? 0), 0);

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: '#0f172a' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-.03em' }}>DGUV Messauswertung</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>Prüfer · Monate · Messungen</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Jahr-Auswahl */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 10, padding: '4px 8px' }}>
            <button onClick={() => setYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 6px', borderRadius: 6 }}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px 6px', borderRadius: 6 }}><ChevronRight size={14} /></button>
          </div>
          {/* Import-Button */}
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
            {uploading ? 'Wird importiert...' : 'CSV / Excel importieren'}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); }} />
        </div>
      </div>

      {/* ── KPI-Kacheln ── */}
      {allePreufer.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(allePreufer.length + 1, 5)}, 1fr)`, gap: 12, marginBottom: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 18px', borderTop: '3px solid #1e3a5f' }}>
            <p style={{ fontSize: 22, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-.03em' }}>{totalJahr.toLocaleString('de-DE')}</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', margin: 0 }}>Gesamt {year}</p>
          </div>
          {allePreufer.map(p => (
            <div key={p} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 18px', borderTop: '3px solid #f59e0b' }}>
              <p style={{ fontSize: 20, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-.03em' }}>{(jahresSummen[p]?.gesamt ?? 0).toLocaleString('de-DE')}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', margin: '0 0 4px' }}>{p}</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>✓ {jahresSummen[p]?.bestanden ?? 0}</span>
                {(jahresSummen[p]?.nicht_best ?? 0) > 0 && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>✗ {jahresSummen[p]?.nicht_best}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Ansicht-Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['heatmap', 'liste'] as const).map(a => (
          <button key={a} onClick={() => setAnsicht(a)}
            style={{ padding: '7px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: ansicht === a ? '#1e3a5f' : '#f1f5f9', color: ansicht === a ? '#fff' : '#64748b' }}>
            {a === 'heatmap' ? '🟦 Heatmap' : '📋 Liste'}
          </button>
        ))}
      </div>

      {/* ── Heatmap ── */}
      {ansicht === 'heatmap' && (
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
          {allePreufer.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#94a3b8' }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>📊</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>Noch keine Daten für {year}</p>
              <p style={{ fontSize: 13 }}>CSV oder Excel-Datei oben importieren</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>Prüfer</th>
                    {alleMonate.map((m, i) => (
                      <th key={m} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '1px solid #f1f5f9', minWidth: 52 }}>
                        {MONAT_NAMEN[i]}
                      </th>
                    ))}
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#374151', borderBottom: '1px solid #f1f5f9' }}>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {allePreufer.map((p, pi) => (
                    <tr key={p} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', background: pi % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        {p}
                      </td>
                      {alleMonate.map(m => {
                        const v = agg[p]?.[m];
                        const val = v?.gesamt ?? 0;
                        const nb = v?.nicht_best ?? 0;
                        return (
                          <td key={m} style={{ padding: '6px 4px', textAlign: 'center', background: pi % 2 === 0 ? '#fff' : '#fafbfc' }}>
                            {val > 0 ? (
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <div style={{ width: 44, height: 34, borderRadius: 8, background: heatColor(val), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto', cursor: 'default' }}
                                  title={`${val} Messungen · ${v?.bestanden} ✓ · ${nb} ✗`}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: heatTextColor(val), lineHeight: 1 }}>{val}</span>
                                  {nb > 0 && <span style={{ fontSize: 8, color: heatTextColor(val), opacity: 0.85 }}>({nb}✗)</span>}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#e2e8f0', fontSize: 11 }}>–</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a', background: pi % 2 === 0 ? '#fff' : '#fafbfc', fontSize: 14 }}>
                        {jahresSummen[p]?.gesamt ?? 0}
                        {(jahresSummen[p]?.nicht_best ?? 0) > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: '#ef4444', fontWeight: 600 }}>({jahresSummen[p]?.nicht_best}✗)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Summen-Zeile */}
                  <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                    <td style={{ padding: '10px 16px', color: '#374151', fontSize: 12 }}>GESAMT</td>
                    {alleMonate.map(m => {
                      const total = allePreufer.reduce((s, p) => s + (agg[p]?.[m]?.gesamt ?? 0), 0);
                      return (
                        <td key={m} style={{ padding: '10px 4px', textAlign: 'center', color: '#374151', fontSize: 13 }}>
                          {total > 0 ? total : <span style={{ color: '#cbd5e1' }}>–</span>}
                        </td>
                      );
                    })}
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a', fontSize: 15 }}>{totalJahr}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Legende */}
          {allePreufer.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Intensität:</span>
              {[0.1, 0.3, 0.6, 1].map((pct, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: heatColor(Math.round(pct * maxWert)) }} />
                  <span style={{ fontSize: 10, color: '#64748b' }}>{Math.round(pct * maxWert)}</span>
                </div>
              ))}
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>· (X✗) = nicht bestanden</span>
            </div>
          )}
        </div>
      )}

      {/* ── Liste ── */}
      {ansicht === 'liste' && (
        <div>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['alle', 'bestanden', 'nicht_bestanden'] as const).map(f => (
              <button key={f} onClick={() => setFilterErgebnis(f)}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: filterErgebnis === f ? (f === 'bestanden' ? '#10b981' : f === 'nicht_bestanden' ? '#ef4444' : '#1e3a5f') : '#f1f5f9',
                  color: filterErgebnis === f ? '#fff' : '#64748b' }}>
                {f === 'alle' ? 'Alle' : f === 'bestanden' ? '✓ Bestanden' : '✗ Nicht bestanden'}
              </button>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
            {alleEinzel.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Keine Einträge</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Prüfer', 'Monat', 'Kunde', 'Gesamt', 'Bestanden', 'Nicht bestanden'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Prüfer' || h === 'Monat' || h === 'Kunde' ? 'left' : 'right', fontWeight: 700, color: '#374151', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alleEinzel.map((e: any, i: number) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{e.pruefer_name}</td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>
                        {MONAT_NAMEN[parseInt(e.monat?.slice(5, 7)) - 1]} {e.monat?.slice(0, 4)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.kunde || '–'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>{e.gesamt}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <span style={{ color: '#15803d', fontWeight: 700, background: '#f0fdf4', padding: '2px 8px', borderRadius: 99, fontSize: 12 }}>✓ {e.bestanden}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {e.nicht_best > 0
                          ? <span style={{ color: '#dc2626', fontWeight: 700, background: '#fef2f2', padding: '2px 8px', borderRadius: 99, fontSize: 12 }}>✗ {e.nicht_best}</span>
                          : <span style={{ color: '#cbd5e1' }}>–</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Import-Verlauf + Aliase ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 32 }}>

        {/* Import-Verlauf */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Importierte Dateien ({(importe as any[]).length})</span>
          </div>
          {(importe as any[]).length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Noch keine Importe</div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {(importe as any[]).map((imp: any) => (
                <div key={imp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imp.dateiname}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                      {imp.gesamt} Messungen · {new Date(imp.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>✓ {imp.bestanden}</span>
                    {imp.nicht_best > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>✗ {imp.nicht_best}</span>}
                  </div>
                  <button onClick={() => deleteImport(imp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 6 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prüfer-Aliase */}
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Prüfer-Aliase</span>
            </div>
            <button onClick={() => setShowAliasForm(v => !v)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}>
              + Neu
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', padding: '8px 18px 0', margin: 0 }}>
            Kurzformen wie "M. Günes" einem vollständigen Namen zuordnen
          </p>
          {showAliasForm && (
            <div style={{ padding: '10px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Kurzform (z.B. M. Günes)" value={newAlias.alias} onChange={e => setNewAlias(a => ({ ...a, alias: e.target.value }))}
                style={{ flex: 1, minWidth: 120, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
              <input placeholder="Vollname (z.B. Muzaffer Günes)" value={newAlias.kanonikname} onChange={e => setNewAlias(a => ({ ...a, kanonikname: e.target.value }))}
                style={{ flex: 1, minWidth: 140, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
              <button onClick={saveAlias} style={{ padding: '7px 14px', borderRadius: 8, background: '#1e3a5f', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Speichern
              </button>
            </div>
          )}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {(aliaseRaw as any[]).length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Keine Aliase hinterlegt</div>
            ) : (
              (aliaseRaw as any[]).map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{a.alias}</span>
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{a.kanonikname}</span>
                  <button onClick={async () => { await supabase.from('dguv_pruefer_aliase').delete().eq('id', a.id); refetchAliase(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
