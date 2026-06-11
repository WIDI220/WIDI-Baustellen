import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, CheckCircle, Info, History, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { parsePdfTickets, TicketParseResult } from '@/lib/pdf-ticket-parser';

interface VorschauZeile {
  idx: number;
  dateiName: string;
  parse: TicketParseResult;
  ticket_id: string | null;
  ticket_gefunden: boolean;
  ma_id: string | null;
  ma_gefunden: boolean;
  duplikat: boolean;
  ausschliessen: boolean;
  custom_stunden: number;
  gewerk: 'Elektro' | 'Hochbau';
  // Neu: geht in Prüfqueue statt normal importiert
  pruefqueue: boolean;
  pruefqueue_grund: string;
}

export default function PdfRuecklauf() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dateien, setDateien] = useState<File[]>([]);
  const [laden, setLaden] = useState(false);
  const [zeilen, setZeilen] = useState<VorschauZeile[]>([]);
  const [buchend, setBuchend] = useState(false);
  const [bericht, setBericht] = useState<any>(null);
  const [buchungBestaetigt, setBuchungBestaetigt] = useState(false);
  const [showHistorie, setShowHistorie] = useState(false);

  const { data: ruecklaufHistorie = [], refetch: refetchHistorie } = useQuery({
    queryKey: ['pdf-ruecklauf-historie'],
    queryFn: async () => {
      const { data } = await supabase.from('pdf_ruecklauf_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['pdf-employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true);
      return data ?? [];
    }
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['pdf-tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('id,a_nummer,status,eingangsdatum');
      return data ?? [];
    }
  });

  function findMA(name: string | null): string | null {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    const emps = employees as any[];
    let found = emps.find(e => e.name.toLowerCase() === lower);
    if (found) return found.id;
    const parts = lower.split(/\s+/);
    found = emps.find(e => parts.some((p: string) => p.length > 2 && e.name.toLowerCase().includes(p)));
    return found?.id ?? null;
  }

  async function findTicket(a_nummer: string | null): Promise<{ id: string | null; gefunden: boolean; gewerk: 'Elektro' | 'Hochbau' }> {
    if (!a_nummer) return { id: null, gefunden: false, gewerk: 'Elektro' };
    const { data } = await supabase.from('tickets')
      .select('id,a_nummer,status,gewerk')
      .eq('a_nummer', a_nummer)
      .maybeSingle();
    return { id: data?.id ?? null, gefunden: !!data, gewerk: (data?.gewerk as 'Elektro' | 'Hochbau') ?? 'Elektro' };
  }

  // Prüft ob ein Ticket in die Prüfqueue soll und warum
  function pruefqueueGrund(parse: TicketParseResult, duplikat: boolean, ticket_gefunden: boolean): string {
    if (parse.istSonderformat) return 'Sonderformat (gesplittetes App-Ticket)';
    if (parse.stundenNegativOderNull) return `Stunden ungültig (${parse.stunden}h)`;
    if (parse.stunden === null || parse.stunden === 0) return 'Stunden nicht erkannt (0h)';
    if (duplikat) return 'Duplikat in dieser PDF';
    // Duplikat im System: Ticket bereits erledigt
    if (ticket_gefunden) {
      // Wird im analyseieren geprüft — hier Platzhalter
    }
    return '';
  }

  const analyseieren = useCallback(async () => {
    if (!dateien.length) { toast.error('Keine Dateien ausgewählt'); return; }
    setLaden(true);
    setZeilen([]);
    const alleZeilen: VorschauZeile[] = [];
    const seenKeys = new Set<string>();

    for (const datei of dateien) {
      try {
        const ergebnisse = await parsePdfTickets(datei);
        for (const parse of ergebnisse) {
          // Sonderformat: findTicket nicht aufrufen, macht keinen Sinn
          const { id: ticket_id, gefunden: ticket_gefunden, gewerk: ticket_gewerk } =
            parse.istSonderformat
              ? { id: null, gefunden: false, gewerk: 'Elektro' as 'Elektro' }
              : await findTicket(parse.a_nummer);

          const ma_id = findMA(parse.mitarbeiter);

          // Duplikat innerhalb derselben PDF-Ladung
          const key = `${parse.a_nummer}-${ma_id}-${parse.datumISO}`;
          const duplikat = seenKeys.has(key);
          if (!duplikat && parse.a_nummer) seenKeys.add(key);

          // Duplikat im System: Ticket bereits erledigt
          let duplikatImSystem = false;
          if (ticket_gefunden && !parse.istSonderformat) {
            const { data: vorhandeneWorklogs } = await supabase
              .from('ticket_worklogs')
              .select('id')
              .eq('ticket_id', ticket_id!)
              .limit(1);
            duplikatImSystem = !!(vorhandeneWorklogs && vorhandeneWorklogs.length > 0);
          }

          // Prüfqueue-Logik
          let inPruefqueue = false;
          let grund = '';
          if (parse.istSonderformat) {
            inPruefqueue = true;
            grund = 'Sonderformat (gesplittetes App-Ticket)';
          } else if (parse.stundenNegativOderNull || parse.stunden === null || parse.stunden === 0) {
            inPruefqueue = true;
            grund = `Stunden ungültig (${parse.stunden ?? 0}h)`;
          } else if (duplikat) {
            inPruefqueue = true;
            grund = 'Duplikat in dieser PDF';
          } else if (duplikatImSystem) {
            inPruefqueue = true;
            grund = 'Ticket bereits im System abgeschlossen';
          } else if (parse.bemerkungPruefen) {
            inPruefqueue = true;
            grund = parse.bemerkungPruefenGrund;
          }

          alleZeilen.push({
            idx: alleZeilen.length,
            dateiName: datei.name,
            parse,
            ticket_id,
            ticket_gefunden,
            ma_id,
            ma_gefunden: !!ma_id,
            duplikat,
            ausschliessen: inPruefqueue, // Prüfqueue-Tickets werden nicht direkt importiert
            custom_stunden: parse.stunden ?? 0,
            gewerk: ticket_gewerk as 'Elektro' | 'Hochbau',
            pruefqueue: inPruefqueue,
            pruefqueue_grund: grund,
          });
        }
      } catch (err: any) {
        toast.error(`${datei.name}: ${err.message}`);
      }
    }

    setZeilen(alleZeilen);
    setLaden(false);
    const bereit = alleZeilen.filter(z => !z.ausschliessen).length;
    const pruefAnz = alleZeilen.filter(z => z.pruefqueue).length;
    toast.success(`${alleZeilen.length} Tickets analysiert · ${bereit} bereit · ${pruefAnz} zur Prüfung`);
  }, [dateien, employees, tickets]);

  const toggle = (idx: number) =>
    setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, ausschliessen: !z.ausschliessen } : z));

  const setStunden = (idx: number, h: number) =>
    setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, custom_stunden: Math.round(h * 4) / 4 } : z));

  const setGewerk = (idx: number, g: 'Elektro' | 'Hochbau') =>
    setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, gewerk: g } : z));

  const buchen = async () => {
    const zuBuchen = zeilen.filter(z => !z.ausschliessen && z.ma_id && z.parse.datumISO);
    const zuPruefqueue = zeilen.filter(z => z.pruefqueue);

    if (!zuBuchen.length && !zuPruefqueue.length) { toast.error('Nichts zum Buchen'); return; }
    setBuchend(true);
    let ok = 0, fehler = 0, pruefOk = 0;

    // ── Normale Tickets importieren ──
    for (const z of zuBuchen) {
      const stunden = z.custom_stunden;
      if (stunden <= 0) { fehler++; continue; }
      try {
        let ticketId = z.ticket_id;

        if (!ticketId && z.parse.a_nummer) {
          const { data: newTicket } = await supabase.from('tickets').insert({
            a_nummer: z.parse.a_nummer,
            gewerk: 'Elektro',
            status: 'erledigt',
            eingangsdatum: z.parse.datumISO,
          }).select('id').single();
          ticketId = newTicket?.id ?? null;
        }

        if (!ticketId) { fehler++; continue; }

        await supabase.from('tickets').update({ status: 'erledigt', gewerk: z.gewerk }).eq('id', ticketId);

        await supabase.from('ticket_worklogs').insert({
          ticket_id: ticketId,
          employee_id: z.ma_id,
          stunden,
          leistungsdatum: z.parse.datumISO,
        });

        if (z.parse.bemerkung) {
          await supabase.from('tickets')
            .update({ erledigungsbemerkung: z.parse.bemerkung })
            .eq('id', ticketId);
        }
        ok++;
      } catch (e: any) {
        console.error(e);
        fehler++;
      }
    }

    // ── Prüfqueue-Tickets speichern ──
    for (const z of zuPruefqueue) {
      try {
        await supabase.from('ticket_pruefqueue').insert({
          a_nummer: z.parse.a_nummer,
          mitarbeiter_name: z.parse.mitarbeiter,
          mitarbeiter_id: z.ma_id,
          datum: z.parse.datumISO,
          stunden: z.custom_stunden,
          gewerk: z.gewerk,
          grund: z.pruefqueue_grund,
          seite: z.parse.seite,
          dateiname: z.dateiName,
          bemerkung: z.parse.bemerkung,
          status: 'offen',
        });
        pruefOk++;
      } catch (e: any) {
        console.error('Prüfqueue Fehler:', e);
      }
    }

    // Rücklauf-Run speichern
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('pdf_ruecklauf_runs').insert({
        created_by: userData.user?.id,
        user_email: userData.user?.email,
        dateiname: dateien.map(d => d.name).join(', '),
        seiten_gesamt: zuBuchen.length + zuPruefqueue.length,
        erfolgreich: ok,
        fehler,
        details: zuBuchen.map(z => ({
          a_nummer: z.parse.a_nummer,
          mitarbeiter: z.parse.mitarbeiter,
          stunden: z.custom_stunden,
          datum: z.parse.datum,
        })),
      });
      refetchHistorie();
    } catch {}

    // Monatsübersicht berechnen
    const monatsMap: Record<string, { tickets: number; stunden: number }> = {};
    for (const z of zuBuchen) {
      if (!z.parse.datumISO) continue;
      const monat = z.parse.datumISO.slice(0, 7);
      if (!monatsMap[monat]) monatsMap[monat] = { tickets: 0, stunden: 0 };
      monatsMap[monat].tickets++;
      monatsMap[monat].stunden = Math.round((monatsMap[monat].stunden + z.custom_stunden) * 4) / 4;
    }
    const monatsUebersicht = Object.entries(monatsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monat, v]) => ({ monat, ...v }));

    setBericht({ ok, fehler, gesamt: zuBuchen.length, pruefqueue: pruefOk, monatsUebersicht });
    setBuchend(false);
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['pdf-tickets'] });
    qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
    toast.success(`${ok} Tickets abgeschlossen · ${pruefOk} in Prüfqueue`);
  };

  const reset = () => {
    setDateien([]); setZeilen([]); setBericht(null); setBuchungBestaetigt(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const bereit = zeilen.filter(z => !z.ausschliessen).length;
  const pruefAnzahl = zeilen.filter(z => z.pruefqueue).length;

  const statusFarbe = (z: VorschauZeile) => {
    if (z.pruefqueue) return '#f59e0b';
    if (z.ausschliessen) return '#94a3b8';
    if (!z.ticket_gefunden) return '#ef4444';
    if (!z.ma_gefunden) return '#f59e0b';
    return '#10b981';
  };

  const statusText = (z: VorschauZeile) => {
    if (z.pruefqueue) return `⚠ Prüfqueue: ${z.pruefqueue_grund}`;
    if (z.ausschliessen) return 'Ausgeschlossen';
    if (!z.ticket_gefunden && z.parse.a_nummer) return `⚠ ${z.parse.a_nummer} wird neu angelegt`;
    if (!z.ticket_gefunden) return '⚠ A-Nummer nicht erkannt';
    if (!z.ma_gefunden) return `MA "${z.parse.mitarbeiter}" nicht erkannt`;
    if (z.parse.fehler.length > 0) return z.parse.fehler[0];
    return '✓ Bereit';
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
        PDF-Rücklauf <span style={{ color: '#2563eb' }}>Ticket-Abschluss</span>
      </h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 6px' }}>
        Maschinell geschriebene PDFs hochladen — A-Nummer, Mitarbeiter, Datum und Stunden werden automatisch erkannt
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px', marginBottom: 24, fontSize: 12, color: '#1d4ed8' }}>
        <Info size={13} style={{ flexShrink: 0 }} />
        <span><strong>Monats-Logik:</strong> Das Ticket bleibt im Eingangsdatum-Monat. Die Stunden werden dem Mitarbeiter im Erledigungsdatum-Monat gutgeschrieben.</span>
      </div>

      {!zeilen.length && !bericht && (
        <div>
          <div onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: '40px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc', marginBottom: 16 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
            <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
              onChange={e => setDateien(Array.from(e.target.files ?? []))} />
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
            {laden ? '⏳ Lese PDFs aus...' : `PDFs analysieren (${dateien.length} Datei${dateien.length !== 1 ? 'en' : ''})`}
          </button>
        </div>
      )}

      {zeilen.length > 0 && !bericht && (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Gefunden', value: zeilen.length, color: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' },
              { label: 'Bereit', value: bereit, color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'Zur Prüfung', value: pruefAnzahl, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
              { label: 'Ausgeschlossen', value: zeilen.filter(z => z.ausschliessen && !z.pruefqueue).length, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Prüfqueue-Hinweis */}
          {pruefAnzahl > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>{pruefAnzahl} Ticket{pruefAnzahl !== 1 ? 's' : ''} werden in die Prüfqueue verschoben</strong> (Sonderformat, Null-Stunden oder Duplikat).
                Diese Tickets werden importiert aber als "zur Prüfung" markiert — du kannst sie unter dem <strong>Prüfung</strong>-Button auf der Tickets-Seite abarbeiten.
              </span>
            </div>
          )}

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#1d4ed8' }}>
            <Info size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Zeile anklicken = aus-/einschließen · Stunden direkt editierbar · Seite zeigt die PDF-Seite des Tickets
          </div>

          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['', 'Seite', 'A-Nummer', 'Gewerk', 'Mitarbeiter', 'Erledigungsdatum', 'Stunden', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z, i) => (
                    <tr key={i} onClick={() => !z.pruefqueue && toggle(i)}
                      style={{
                        borderBottom: '1px solid #f8fafc',
                        cursor: z.pruefqueue ? 'default' : 'pointer',
                        opacity: z.ausschliessen && !z.pruefqueue ? 0.4 : 1,
                        background: z.pruefqueue ? '#fffbeb' : z.ausschliessen ? '#f8fafc' : 'transparent',
                      }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusFarbe(z) }} />
                      </td>
                      {/* Seitenzahl */}
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>
                        S.{z.parse.seite}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: z.ticket_gefunden ? '#0f172a' : '#f59e0b', whiteSpace: 'nowrap' }}
                        title={!z.parse.a_nummer ? `Rohtext: ${z.parse.rawText?.slice(0, 200)}` : ''}>
                        {z.parse.a_nummer ?? <span style={{ color: '#ef4444' }}>❌ Nicht erkannt</span>}
                        {z.parse.istSonderformat && (
                          <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 4px', marginLeft: 4 }}>APP</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                        <select value={z.gewerk} onChange={e => setGewerk(i, e.target.value as 'Elektro' | 'Hochbau')}
                          style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${z.gewerk === 'Elektro' ? '#bfdbfe' : '#bbf7d0'}`, background: z.gewerk === 'Elektro' ? '#eff6ff' : '#f0fdf4', color: z.gewerk === 'Elektro' ? '#1d4ed8' : '#15803d', fontWeight: 600, cursor: 'pointer' }}>
                          <option value="Elektro">Elektro</option>
                          <option value="Hochbau">Hochbau</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', color: z.ma_gefunden ? '#0f172a' : '#f59e0b', whiteSpace: 'nowrap' }}>
                        {z.parse.mitarbeiter ?? '–'}
                        {!z.ma_gefunden && z.parse.mitarbeiter && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>?</span>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {z.parse.datum ?? '–'}
                      </td>
                      <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                        <input type="number" step="0.25" min="0" max="24"
                          value={z.custom_stunden}
                          onChange={e => setStunden(i, parseFloat(e.target.value) || 0)}
                          style={{ width: 58, fontSize: 12, padding: '3px 6px', border: `1px solid ${z.parse.stundenNegativOderNull ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 6, color: z.parse.stundenNegativOderNull ? '#ef4444' : '#0f172a', background: '#fff' }} />
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>h</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: statusFarbe(z), maxWidth: 300, verticalAlign: 'top' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusText(z)}</div>
                        {z.parse.bemerkungPruefen && z.parse.bemerkung && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4, whiteSpace: 'normal', background: '#f8fafc', borderRadius: 4, padding: '4px 6px' }}>
                            📝 {z.parse.bemerkung}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Buchungsvorschau */}
          {(bereit > 0 || pruefAnzahl > 0) && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Buchungsvorschau — bitte prüfen:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                {zeilen.filter(z => !z.ausschliessen && z.ma_id && z.parse.datumISO).map((z, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '6px 10px', background: z.ticket_gefunden ? '#f0fdf4' : '#fffbeb', borderRadius: 8, border: `1px solid ${z.ticket_gefunden ? '#bbf7d0' : '#fde68a'}` }}>
                    <span style={{ fontWeight: 600, color: '#94a3b8', minWidth: 30, fontSize: 11 }}>S.{z.parse.seite}</span>
                    <span style={{ fontWeight: 700, color: '#0f172a', minWidth: 100 }}>{z.parse.a_nummer}</span>
                    <span style={{ color: '#64748b', minWidth: 130 }}>{z.parse.mitarbeiter}</span>
                    <span style={{ color: '#64748b', minWidth: 80 }}>{z.parse.datum}</span>
                    <span style={{ fontWeight: 700, color: '#2563eb', minWidth: 50 }}>{z.custom_stunden}h</span>
                    {!z.ticket_gefunden && <span style={{ color: '#b45309', fontSize: 11 }}>⚠ Ticket wird neu angelegt</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="buchBestaetigt" checked={buchungBestaetigt}
                  onChange={e => setBuchungBestaetigt(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="buchBestaetigt" style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}>
                  Ich habe die Buchungsvorschau geprüft und bestätige
                </label>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={buchen} disabled={buchend || (!bereit && !pruefAnzahl) || !buchungBestaetigt}
              style={{ padding: '12px 28px', background: buchend ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: buchend ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.25)' }}>
              {buchend ? '⏳ Buche Stunden...' : `✓ ${bereit} Tickets abschließen${pruefAnzahl > 0 ? ` · ${pruefAnzahl} in Prüfqueue` : ''}`}
            </button>
            <button onClick={reset} style={{ padding: '12px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
              Neu starten
            </button>
          </div>
        </>
      )}

      {bericht && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <CheckCircle size={22} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>Buchung abgeschlossen</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Tickets abgeschlossen', value: bericht.ok, color: '#10b981' },
              { label: 'In Prüfqueue', value: bericht.pruefqueue, color: '#f59e0b' },
              { label: 'Gesamt versucht', value: bericht.gesamt, color: '#6366f1' },
              { label: 'Fehler', value: bericht.fehler, color: bericht.fehler > 0 ? '#ef4444' : '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #d1fae5' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Monatsübersicht */}
          {bericht.monatsUebersicht && bericht.monatsUebersicht.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>
                Importiert nach Monat:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {bericht.monatsUebersicht.map((m: any) => (
                  <div key={m.monat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #d1fae5', borderRadius: 8, padding: '8px 16px' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                      {new Date(m.monat + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                    </span>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{m.tickets} Ticket{m.tickets !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{m.stunden}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bericht.pruefqueue > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              <strong>{bericht.pruefqueue} Tickets</strong> wurden in die Prüfqueue verschoben. Gehe zu <strong>Tickets → Prüfung</strong> um sie abzuarbeiten.
            </div>
          )}
          <button onClick={reset} style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Neuen Rücklauf starten
          </button>
        </div>
      )}

      {/* Rücklauf-Historie */}
      <div style={{ marginTop: 32, border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        <div
          onClick={() => setShowHistorie(!showHistorie)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={15} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Buchungs-Historie</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>({(ruecklaufHistorie as any[]).length} Einträge)</span>
          </div>
          {showHistorie ? <ChevronUp size={15} style={{ color: '#94a3b8' }} /> : <ChevronDown size={15} style={{ color: '#94a3b8' }} />}
        </div>
        {showHistorie && (
          <div>
            {(ruecklaufHistorie as any[]).length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Noch keine Buchungen</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Datum', 'Von', 'Datei', 'Gebucht', 'Prüfqueue', 'Fehler', 'Details'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(ruecklaufHistorie as any[]).map((run: any) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(run.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>{run.user_email?.split('@')[0] ?? '–'}</td>
                      <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={run.dateiname}>{run.dateiname ?? '–'}</td>
                      <td style={{ padding: '10px 16px', color: '#10b981', fontWeight: 700 }}>{run.erfolgreich ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: '#f59e0b', fontWeight: 700 }}>{run.pruefqueue_anzahl ?? 0}</td>
                      <td style={{ padding: '10px 16px', color: (run.fehler ?? 0) > 0 ? '#ef4444' : '#94a3b8', fontWeight: 700 }}>{run.fehler ?? 0}</td>
                      <td style={{ padding: '10px 16px', fontSize: 11, color: '#64748b' }}>
                        {run.details ? (run.details as any[]).slice(0, 3).map((d: any) => d.a_nummer).join(', ') + ((run.details as any[]).length > 3 ? ` +${(run.details as any[]).length - 3}` : '') : '–'}
                      </td>
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
