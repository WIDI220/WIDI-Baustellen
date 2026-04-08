import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, CheckCircle, AlertTriangle, FileText, Trash2, RefreshCw, Info } from 'lucide-react';

interface ParsedRow {
  pruefer_name: string; pruef_datum: string; geraete_id: string;
  bezeichnung: string; ergebnis: string; abteilung: string;
}
interface PreviewData {
  monat: string; rows: ParsedRow[];
  byPruefer: Record<string, number>;
  unbekannt: string[];
  bekannt: string[];
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return null;
}

function parseCSVMessungen(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim());
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g,'');

  const findCol = (keywords: string[]) => {
    const idx = headers.findIndex(h => keywords.some(k => norm(h).includes(k)));
    return idx;
  };

  // Robuste Spaltensuche
  const idxPruefer   = findCol(['letzterpr','letzterprfer','prfer','pruefer']);
  const idxDatum     = findCol(['letzteprf','letztepru','letzteprfung','prfung','datum']);
  const idxId        = (() => { const i = findCol(['id']); return i === 0 ? 0 : i; })();
  const idxBez       = findCol(['bezeichnung']);
  const idxErgebnis  = findCol(['ergebnis']);
  const idxAbteilung = findCol(['abteilung']);

  const result: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(v => v.trim());
    if (cols.length < 3) continue;

    const pruefer = idxPruefer >= 0 ? (cols[idxPruefer] ?? '').trim() : '';
    const datRaw  = idxDatum   >= 0 ? (cols[idxDatum]   ?? '').trim() : '';
    const datum   = parseDate(datRaw);

    // Nur Zeilen mit Prüfer UND gültigem Datum
    if (!pruefer || !datum) continue;

    result.push({
      pruefer_name: pruefer,
      pruef_datum:  datum,
      geraete_id:   idxId       >= 0 ? (cols[idxId]       ?? '').trim() : '',
      bezeichnung:  idxBez      >= 0 ? (cols[idxBez]      ?? '').trim() : '',
      ergebnis:     idxErgebnis >= 0 ? (cols[idxErgebnis]  ?? '').trim() : '',
      abteilung:    idxAbteilung>= 0 ? (cols[idxAbteilung] ?? '').trim() : '',
    });
  }
  return result;
}

export default function DGUVImport() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: pruefer = [] } = useQuery({
    queryKey: ['dguv-pruefer'],
    queryFn: async () => { const { data } = await supabase.from('dguv_pruefer').select('*'); return data ?? []; }
  });

  const { data: importe = [] } = useQuery({
    queryKey: ['dguv-importe'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dguv_messungen')
        .select('import_monat, pruefer_name')
        .order('import_monat', { ascending: false });
      if (!data) return [];
      const grouped: Record<string, { monat: string; count: number; pruefer: Set<string> }> = {};
      data.forEach((r: any) => {
        if (!grouped[r.import_monat]) grouped[r.import_monat] = { monat: r.import_monat, count: 0, pruefer: new Set() };
        grouped[r.import_monat].count++;
        grouped[r.import_monat].pruefer.add(r.pruefer_name);
      });
      return Object.values(grouped).map(g => ({ ...g, pruefer: Array.from(g.pruefer) }));
    }
  });

  async function handleFile(file: File) {
    try {
      const text = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? '');
        r.onerror = rej;
        r.readAsText(file, 'ISO-8859-1');
      });

      const rows = parseCSVMessungen(text);
      if (rows.length === 0) { toast.error('Keine gültigen Zeilen gefunden — prüfe das CSV-Format'); return; }

      // Monat aus erstem gültigen Datum ableiten
      const ersteDatum = rows.find(r => r.pruef_datum)?.pruef_datum ?? '';
      const monat = ersteDatum ? ersteDatum.slice(0,7) : new Date().toISOString().slice(0,7);

      // Prüfer gruppieren
      const byPruefer: Record<string, number> = {};
      rows.forEach(r => { byPruefer[r.pruefer_name] = (byPruefer[r.pruefer_name] ?? 0) + 1; });

      // Prüfer in DB nachschlagen (Matching per Name — exakt oder annähernd)
      const prueférNamen = (pruefer as any[]).flatMap(p => [
        p.name?.toLowerCase().trim(),
      ].filter(Boolean));

      const unbekannt = Object.keys(byPruefer).filter(n => !prueférNamen.includes(n.toLowerCase().trim()));
      const bekannt   = Object.keys(byPruefer).filter(n =>  prueférNamen.includes(n.toLowerCase().trim()));

      setPreview({ monat, rows, byPruefer, unbekannt, bekannt });
    } catch (e: any) {
      toast.error('Fehler beim Lesen: ' + e.message);
    }
  }

  async function doImport() {
    if (!preview) return;
    setImporting(true);
    try {
      // Prüfer-ID Lookup
      const prueférMap: Record<string, string | null> = {};
      for (const name of Object.keys(preview.byPruefer)) {
        const match = (pruefer as any[]).find(p =>
          p.name?.toLowerCase().trim() === name.toLowerCase().trim()
        );
        prueférMap[name] = match?.id ?? null;
      }

      // ALLE Zeilen importieren — auch unbekannte Prüfer kommen rein
      const batch = preview.rows.map(r => ({
        pruefer_id:   prueférMap[r.pruefer_name] ?? null,
        pruefer_name: r.pruefer_name,
        pruef_datum:  r.pruef_datum,
        geraete_id:   r.geraete_id  || null,
        bezeichnung:  r.bezeichnung || null,
        ergebnis:     r.ergebnis    || null,
        abteilung:    r.abteilung   || null,
        import_monat: preview.monat,
      }));

      // In 500er Batches einfügen
      let imported = 0;
      for (let i = 0; i < batch.length; i += 500) {
        const { error } = await supabase.from('dguv_messungen').insert(batch.slice(i, i+500));
        if (error) throw error;
        imported += Math.min(500, batch.length - i);
      }

      toast.success(`✅ ${imported} Messungen für ${fmtMonat(preview.monat)} importiert`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['dguv-importe'] });
      qc.invalidateQueries({ queryKey: ['dguv-auswertung-monat'] });
      qc.invalidateQueries({ queryKey: ['dguv-auswertung-jahr'] });
      qc.invalidateQueries({ queryKey: ['dguv-monate'] });
    } catch (e: any) {
      toast.error('Import fehlgeschlagen: ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  async function deleteImport(monat: string) {
    if (!confirm(`Alle Messungen für ${fmtMonat(monat)} löschen?`)) return;
    const { error } = await supabase.from('dguv_messungen').delete().eq('import_monat', monat);
    if (error) { toast.error(error.message); return; }
    toast.success(`${fmtMonat(monat)} gelöscht`);
    qc.invalidateQueries({ queryKey: ['dguv-importe'] });
    qc.invalidateQueries({ queryKey: ['dguv-monate'] });
  }

  const fmtMonat = (m: string) => {
    if (!m) return '';
    const [y,mo] = m.split('-');
    const n = ['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return `${n[parseInt(mo)]} ${y}`;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div>
        <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
          Messungen <span style={{ color:'#f59e0b' }}>Import</span>
        </h1>
        <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>
          CSV aus Prüfgerät hochladen · alle Messungen werden importiert
        </p>
      </div>

      {/* Hinweis wenn keine Prüfer */}
      {(pruefer as any[]).length === 0 && (
        <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'flex-start', gap:10 }}>
          <Info size={16} style={{ color:'#f59e0b', flexShrink:0, marginTop:1 }} />
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:'#92400e', margin:'0 0 3px' }}>Noch keine Prüfer angelegt</p>
            <p style={{ fontSize:12, color:'#b45309', margin:0 }}>
              Du kannst die CSV trotzdem importieren. Lege danach unter "Prüfer" die Mitarbeiter an — die Zuordnung wird dann automatisch hergestellt sobald der Name übereinstimmt.
            </p>
          </div>
        </div>
      )}

      {/* Upload Bereich */}
      {!preview && (
        <div
          onClick={() => fileRef.current?.click()}
          style={{ background:'#fff', borderRadius:18, border:'2px dashed #e2e8f0', padding:'48px 32px', textAlign:'center', cursor:'pointer', transition:'all .2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='#f59e0b'; (e.currentTarget as HTMLElement).style.background='#fffbeb'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'; (e.currentTarget as HTMLElement).style.background='#fff'; }}>
          <Upload size={40} style={{ color:'#f59e0b', marginBottom:12 }} />
          <p style={{ fontSize:16, fontWeight:700, color:'#0f172a', margin:'0 0 6px' }}>CSV-Datei hochladen</p>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>
            Rohdaten-Export aus dem Prüfgerät · erkennt automatisch Prüfer und Datum
          </p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
            onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); e.target.value=''; }} />
        </div>
      )}

      {/* Vorschau */}
      {preview && (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'20px 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
            <div>
              <h3 style={{ fontSize:16, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>
                Vorschau: {fmtMonat(preview.monat)}
              </h3>
              <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>
                <strong style={{ color:'#0f172a' }}>{preview.rows.length}</strong> Messungen werden importiert
              </p>
            </div>
            <button onClick={() => setPreview(null)}
              style={{ padding:'6px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', fontSize:12 }}>
              Abbrechen
            </button>
          </div>

          {/* Prüfer Karten */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10, marginBottom:16 }}>
            {Object.entries(preview.byPruefer).map(([name, count]) => {
              const isKnown = preview.bekannt.includes(name);
              return (
                <div key={name} style={{ padding:'12px 14px', borderRadius:12, background:isKnown?'#f0fdf4':'#fffbeb', border:`1px solid ${isKnown?'#bbf7d0':'#fde68a'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                    {isKnown
                      ? <CheckCircle size={13} style={{ color:'#10b981', flexShrink:0 }} />
                      : <AlertTriangle size={13} style={{ color:'#f59e0b', flexShrink:0 }} />}
                    <span style={{ fontSize:12, fontWeight:700, color:isKnown?'#065f46':'#92400e' }}>{name}</span>
                  </div>
                  <p style={{ fontSize:22, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.02em' }}>
                    {count.toLocaleString('de-DE')}
                  </p>
                  <p style={{ fontSize:11, color:'#64748b', margin:0 }}>
                    {isKnown ? '✓ Prüfer zugeordnet' : 'Wird ohne Zuordnung importiert'}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Warnung unbekannte Prüfer */}
          {preview.unbekannt.length > 0 && (
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:10 }}>
              <Info size={15} style={{ color:'#f59e0b', flexShrink:0, marginTop:1 }} />
              <p style={{ fontSize:12, color:'#92400e', margin:0 }}>
                <strong>{preview.unbekannt.join(', ')}</strong> — werden importiert aber noch keinem Prüfer zugeordnet.
                Lege sie unter "Prüfer" mit exakt diesem Namen an um die Zuordnung herzustellen.
              </p>
            </div>
          )}

          <button onClick={doImport} disabled={importing}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 28px', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(245,158,11,0.3)' }}>
            {importing
              ? <><RefreshCw size={15} style={{ animation:'spin 1s linear infinite' }} /> Importiert...</>
              : <><CheckCircle size={15} /> Alle {preview.rows.length.toLocaleString('de-DE')} Messungen importieren</>}
          </button>
        </div>
      )}

      {/* Bereits importierte Monate */}
      {(importe as any[]).length > 0 && (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9' }}>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 3px' }}>Importierte Monate</h3>
            <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>Alle Monate bleiben gespeichert für den Jahresvergleich</p>
          </div>
          <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                {['Monat','Messungen','Prüfer',''].map(h => (
                  <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(importe as any[]).map((imp: any) => (
                <tr key={imp.monat} style={{ borderBottom:'1px solid #f8fafc' }}>
                  <td style={{ padding:'13px 16px', fontWeight:700, color:'#0f172a' }}>{fmtMonat(imp.monat)}</td>
                  <td style={{ padding:'13px 16px' }}>
                    <span style={{ fontWeight:800, fontSize:16, color:'#f59e0b' }}>{imp.count.toLocaleString('de-DE')}</span>
                    <span style={{ fontSize:11, color:'#94a3b8', marginLeft:4 }}>Stk</span>
                  </td>
                  <td style={{ padding:'13px 16px', color:'#64748b', fontSize:12 }}>{imp.pruefer.join(', ')}</td>
                  <td style={{ padding:'13px 16px', textAlign:'right' }}>
                    <button onClick={() => deleteImport(imp.monat)}
                      style={{ padding:'5px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:4, fontSize:11, marginLeft:'auto' }}>
                      <Trash2 size={11} /> Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(importe as any[]).length === 0 && !preview && (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'32px', textAlign:'center', color:'#94a3b8' }}>
          <FileText size={32} style={{ marginBottom:10, opacity:.3 }} />
          <p style={{ margin:0, fontWeight:500 }}>Noch keine Monate importiert</p>
        </div>
      )}
    </div>
  );
}
