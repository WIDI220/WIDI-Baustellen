import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Info, Trash2 } from 'lucide-react';

interface ParseResult {
  seite: number;
  a_nummer: string | null;
  mitarbeiter: string | null;
  datum: string | null;   // DD.MM.YYYY
  stunden: number | null;
  bemerkung: string | null;
  fehler: string[];
}

interface VorschauZeile {
  idx: number;
  parse: ParseResult;
  ticket_id: string | null;
  ticket_gefunden: boolean;
  ma_id: string | null;
  ma_gefunden: boolean;
  duplikat: boolean;
  ausschliessen: boolean;
  custom_stunden?: number;
  datumISO: string | null;
}

export default function PdfRuecklauf() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dateien, setDateien] = useState<File[]>([]);
  const [laden, setLaden] = useState(false);
  const [zeilen, setZeilen] = useState<VorschauZeile[]>([]);
  const [buchend, setBuchend] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [bericht, setBericht] = useState<any>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['pdf-employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true); return data ?? []; }
  });
  const { data: tickets = [] } = useQuery({
    queryKey: ['pdf-tickets'],
    queryFn: async () => { const { data } = await supabase.from('tickets').select('id,a_nummer,status'); return data ?? []; }
  });

  function parseDatumToISO(datum: string | null): string | null {
    if (!datum) return null;
    const m = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  function findMA(name: string | null): string | null {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    const emps = employees as any[];
    // Exakter Name
    let found = emps.find(e => e.name.toLowerCase() === lower);
    if (found) return found.id;
    // Nachname
    const parts = lower.split(' ');
    found = emps.find(e => parts.some((p: string) => p.length > 2 && e.name.toLowerCase().includes(p)));
    return found?.id ?? null;
  }

  function findTicket(a_nummer: string | null): { id: string | null; gefunden: boolean } {
    if (!a_nummer) return { id: null, gefunden: false };
    const t = (tickets as any[]).find(t => t.a_nummer === a_nummer);
    return { id: t?.id ?? null, gefunden: !!t };
  }

  const analyseieren = useCallback(async () => {
    if (!dateien.length) { toast.error('Keine Dateien ausgewählt'); return; }
    setLaden(true);
    setZeilen([]);
    const alleZeilen: VorschauZeile[] = [];
    const seenKeys = new Set<string>();

    for (const datei of dateien) {
      try {
        const buffer = await datei.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const res = await fetch('/api/pdf-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 }),
        });
        const data = await res.json();
        if (!data.success) { toast.error(`${datei.name}: ${data.error}`); continue; }

        for (const parse of data.results as ParseResult[]) {
          const { id: ticket_id, gefunden: ticket_gefunden } = findTicket(parse.a_nummer);
          const ma_id = findMA(parse.mitarbeiter);
          const datumISO = parseDatumToISO(parse.datum);
          const key = `${parse.a_nummer}-${ma_id}-${datumISO}`;
          const duplikat = seenKeys.has(key);
          if (!duplikat) seenKeys.add(key);

          alleZeilen.push({
            idx: alleZeilen.length,
            parse,
            ticket_id,
            ticket_gefunden,
            ma_id,
            ma_gefunden: !!ma_id,
            duplikat,
            ausschliessen: duplikat || !ticket_gefunden,
            datumISO,
          });
        }
      } catch (err: any) {
        toast.error(`${datei.name}: ${err.message}`);
      }
    }

    setZeilen(alleZeilen);
    setLaden(false);
    const bereit = alleZeilen.filter(z => !z.ausschliessen).length;
    toast.success(`${alleZeilen.length} Seiten analysiert · ${bereit} bereit zum Buchen`);
  }, [dateien, employees, tickets]);

  const toggle = (idx: number) => setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, ausschliessen: !z.ausschliessen } : z));
  const setStunden = (idx: number, h: number) => setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, custom_stunden: Math.round(h * 4) / 4 } : z));

  const buchen = async () => {
    const zuBuchen = zeilen.filter(z => !z.ausschliessen && z.ticket_id && z.ma_id && z.datumISO);
    if (!zuBuchen.length) { toast.error('Nichts zum Buchen'); return; }
    setBuchend(true);
    let ok = 0, err = 0;

    for (const z of zuBuchen) {
      const stunden = z.custom_stunden ?? z.parse.stunden ?? 0;
      if (stunden <= 0) { err++; continue; }
      try {
        // Status auf erledigt setzen
        await supabase.from('tickets').update({ status: 'erledigt' }).eq('id', z.ticket_id);
        // Worklog eintragen
        const { data: empData } = await supabase.from('employees').select('id').eq('id', z.ma_id).single();
        if (empData) {
          await supabase.from('ticket_worklogs').insert({
            ticket_id: z.ticket_id,
            employee_id: z.ma_id,
            stunden,
            leistungsdatum: z.datumISO,
            notiz: z.parse.bemerkung ?? null,
          });
        }
        ok++;
      } catch { err++; }
    }

    setBericht({ ok, err, gesamt: zuBuchen.length });
    setFertig(true);
    setBuchend(false);
    qc.invalidateQueries({ queryKey: ['tickets'] });
    toast.success(`${ok} Tickets verbucht · ${err} Fehler`);
  };

  const reset = () => { setDateien([]); setZeilen([]); setFertig(false); setBericht(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const bereit = zeilen.filter(z => !z.ausschliessen).length;
  const probleme = zeilen.filter(z => !z.ausschliessen && (z.parse.fehler.length > 0 || !z.ticket_gefunden || !z.ma_gefunden)).length;

  const statusFarbe = (z: VorschauZeile) => {
    if (z.ausschliessen) return '#94a3b8';
    if (!z.ticket_gefunden) return '#ef4444';
    if (!z.ma_gefunden || z.parse.fehler.length > 0) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
        PDF-Rücklauf <span style={{ color: '#2563eb' }}>Ticket-Abschluss</span>
      </h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        Maschinell geschriebene PDFs hochladen — A-Nummer, Mitarbeiter, Stunden und Bemerkung werden automatisch erkannt
      </p>

      {!fertig && !zeilen.length && (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: '40px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', marginBottom: 16 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
              onChange={e => { setDateien(Array.from(e.target.files ?? [])); }} />
            <FileText size={32} style={{ color: '#2563eb', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>PDFs hochladen</p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Mehrere Dateien möglich · Auch mehrseitige PDFs</p>
          </div>
          {dateien.length > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
              {dateien.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1d4ed8', marginBottom: i < dateien.length - 1 ? 4 : 0 }}>
                  <FileText size={13} />
                  <span>{f.name}</span>
                  <span style={{ color: '#93c5fd', fontSize: 11 }}>({(f.size / 1024).toFixed(0)} KB)</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={analyseieren} disabled={!dateien.length || laden}
            style={{ padding: '12px 28px', background: laden ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: laden ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.25)' }}>
            {laden ? '⏳ Analysiere PDFs...' : `PDFs analysieren (${dateien.length} Datei${dateien.length !== 1 ? 'en' : ''})`}
          </button>
        </div>
      )}

      {zeilen.length > 0 && !fertig && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Gefunden', value: zeilen.length, color: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' },
              { label: 'Bereit', value: bereit, color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'Probleme', value: probleme, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
              { label: 'Ausgeschlossen', value: zeilen.filter(z => z.ausschliessen).length, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={13} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: 12, color: '#1d4ed8' }}>Zeile anklicken = aus-/einschließen · Stunden anklicken = bearbeiten · Gleiche A-Nummer doppelt = beide behalten wenn verschiedene MA</span>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['', 'A-Nummer', 'Mitarbeiter', 'Datum', 'Stunden', 'Bemerkung', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z, i) => {
                    const farbe = statusFarbe(z);
                    return (
                      <tr key={i} onClick={() => toggle(i)}
                        style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: z.ausschliessen ? '#f8fafc' : 'transparent', opacity: z.ausschliessen ? 0.45 : 1 }}>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: farbe }} />
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: z.ticket_gefunden ? '#0f172a' : '#ef4444', whiteSpace: 'nowrap' }}>
                          {z.parse.a_nummer ?? <span style={{ color: '#ef4444' }}>Nicht erkannt</span>}
                          {!z.ticket_gefunden && z.parse.a_nummer && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 4 }}>nicht in DB</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: z.ma_gefunden ? '#0f172a' : '#f59e0b', whiteSpace: 'nowrap' }}>
                          {z.parse.mitarbeiter ?? '–'}
                          {!z.ma_gefunden && z.parse.mitarbeiter && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>nicht erkannt</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{z.parse.datum ?? '–'}</td>
                        <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number" step="0.25" min="0.25" max="24"
                            value={z.custom_stunden ?? z.parse.stunden ?? 0}
                            onChange={e => setStunden(i, parseFloat(e.target.value))}
                            style={{ width: 60, fontSize: 12, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 6, background: z.ausschliessen ? '#f8fafc' : '#fff', color: '#0f172a' }}
                          />
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>h</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.parse.bemerkung ?? ''}>
                          {z.parse.bemerkung?.slice(0, 60) ?? '–'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: farbe }}>
                          {z.ausschliessen ? 'Ausgeschlossen' : !z.ticket_gefunden ? 'Ticket fehlt in DB' : !z.ma_gefunden ? 'MA nicht erkannt' : z.parse.fehler.length > 0 ? z.parse.fehler.join(', ') : '✓ Bereit'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={buchen} disabled={buchend || !bereit}
              style={{ padding: '12px 28px', background: buchend ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: buchend ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.25)' }}>
              {buchend ? '⏳ Buche...' : `✓ ${bereit} Tickets abschließen & Stunden buchen`}
            </button>
            <button onClick={reset} style={{ padding: '12px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Neu starten</button>
          </div>
        </>
      )}

      {fertig && bericht && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle size={22} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>Buchung abgeschlossen</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[{ label: 'Erfolgreich', value: bericht.ok, color: '#10b981' }, { label: 'Gesamt versucht', value: bericht.gesamt, color: '#6366f1' }, { label: 'Fehler', value: bericht.err, color: bericht.err > 0 ? '#ef4444' : '#94a3b8' }].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #d1fae5' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={reset} style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Neuen Rücklauf starten
          </button>
        </div>
      )}
    </div>
  );
}
