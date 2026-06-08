import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, X, Plus } from 'lucide-react';

interface BuchungsVorschau {
  mitarbeiter_name: string;
  stunden: number;
  datum: string;
  monat: string;
}

interface Bestaetigung {
  eintrag: any;
  buchungen: BuchungsVorschau[];
}

export default function TicketPruefqueue() {
  const qc = useQueryClient();
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const [bearbeitenForm, setBearbeitenForm] = useState<any>({});
  const [bestaetigung, setBestaetigung] = useState<Bestaetigung | null>(null);
  const [buchend, setBuchend] = useState(false);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['ticket-pruefqueue'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_pruefqueue')
        .select('*')
        .eq('status', 'offen')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['pruef-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id,name')
        .eq('aktiv', true)
        .order('name');
      return data ?? [];
    },
  });

  function getForm(id: string) {
    return bearbeitenForm[id] ?? {};
  }

  function setForm(id: string, patch: any) {
    setBearbeitenForm((f: any) => ({ ...f, [id]: { ...f[id], ...patch } }));
  }

  function addZweiterMA(id: string) {
    const form = getForm(id);
    const zweite = form.zweite_ma ?? [];
    setForm(id, { zweite_ma: [...zweite, { mitarbeiter_id: '', stunden: 0 }] });
  }

  function setZweiterMA(id: string, idx: number, patch: any) {
    const form = getForm(id);
    const zweite = [...(form.zweite_ma ?? [])];
    zweite[idx] = { ...zweite[idx], ...patch };
    setForm(id, { zweite_ma: zweite });
  }

  function removeZweiterMA(id: string, idx: number) {
    const form = getForm(id);
    const zweite = [...(form.zweite_ma ?? [])];
    zweite.splice(idx, 1);
    setForm(id, { zweite_ma: zweite });
  }

  function getMaName(ma_id: string): string {
    const emp = (employees as any[]).find(e => e.id === ma_id);
    return emp?.name ?? '–';
  }

  // Vorschau zusammenbauen und Popup öffnen
  function vorschauOeffnen(eintrag: any) {
    const form = getForm(eintrag.id);
    const stunden = form.stunden ?? eintrag.stunden;
    const ma_id = form.mitarbeiter_id ?? eintrag.mitarbeiter_id;
    const gewerk = form.gewerk ?? eintrag.gewerk ?? 'Elektro';
    const aNummer = form.a_nummer ?? eintrag.a_nummer;

    if (!stunden || stunden <= 0) { toast.error('Stunden müssen > 0 sein'); return; }
    if (!ma_id) { toast.error('Mitarbeiter muss ausgewählt sein'); return; }
    if (!aNummer || aNummer.includes('(#')) {
      toast.error('Bitte eine gültige A-Nummer eingeben (z.B. A26-07049)');
      return;
    }

    const datum = eintrag.datum
      ? new Date(eintrag.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '–';
    const monat = eintrag.datum
      ? new Date(eintrag.datum).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      : '–';

    const buchungen: BuchungsVorschau[] = [
      { mitarbeiter_name: getMaName(ma_id), stunden, datum, monat },
    ];

    // Zweite Mitarbeiter hinzufügen
    const zweite = form.zweite_ma ?? [];
    for (const z of zweite) {
      if (z.mitarbeiter_id && z.stunden > 0) {
        buchungen.push({
          mitarbeiter_name: getMaName(z.mitarbeiter_id),
          stunden: z.stunden,
          datum,
          monat,
        });
      }
    }

    setBestaetigung({ eintrag: { ...eintrag, a_nummer: aNummer, gewerk }, buchungen });
  }

  async function buchungBestaetigen() {
    if (!bestaetigung) return;
    setBuchend(true);
    const { eintrag } = bestaetigung;
    const form = getForm(eintrag.id);
    const stunden = form.stunden ?? eintrag.stunden;
    const ma_id = form.mitarbeiter_id ?? eintrag.mitarbeiter_id;
    const gewerk = form.gewerk ?? eintrag.gewerk ?? 'Elektro';
    const aNummer = eintrag.a_nummer;

    try {
      // Ticket suchen oder anlegen
      let ticketId: string | null = null;
      const { data: vorhandenes } = await supabase
        .from('tickets').select('id').eq('a_nummer', aNummer).maybeSingle();

      if (vorhandenes) {
        ticketId = vorhandenes.id;
      } else {
        const { data: newT } = await supabase.from('tickets').insert({
          a_nummer: aNummer,
          gewerk,
          status: 'erledigt',
          eingangsdatum: eintrag.datum,
        }).select('id').single();
        ticketId = newT?.id ?? null;
      }

      if (!ticketId) { toast.error('Ticket konnte nicht angelegt werden'); setBuchend(false); return; }

      await supabase.from('tickets').update({ status: 'erledigt', gewerk }).eq('id', ticketId);

      // Hauptmitarbeiter buchen
      await supabase.from('ticket_worklogs').insert({
        ticket_id: ticketId,
        employee_id: ma_id,
        stunden,
        leistungsdatum: eintrag.datum,
      });

      // Zweite Mitarbeiter buchen
      const zweite = form.zweite_ma ?? [];
      for (const z of zweite) {
        if (z.mitarbeiter_id && z.stunden > 0) {
          await supabase.from('ticket_worklogs').insert({
            ticket_id: ticketId,
            employee_id: z.mitarbeiter_id,
            stunden: z.stunden,
            leistungsdatum: eintrag.datum,
          });
        }
      }

      // Prüfqueue schließen
      await supabase.from('ticket_pruefqueue').update({ status: 'erledigt' }).eq('id', eintrag.id);

      toast.success(`${aNummer} erfolgreich abgeschlossen`);
      qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
      qc.invalidateQueries({ queryKey: ['ticket-pruefqueue-count'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setBearbeitenId(null);
      setBestaetigung(null);
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    }
    setBuchend(false);
  }

  async function verwerfen(id: string) {
    await supabase.from('ticket_pruefqueue').update({ status: 'verworfen' }).eq('id', id);
    toast.success('Eintrag verworfen');
    qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
    qc.invalidateQueries({ queryKey: ['ticket-pruefqueue-count'] });
  }

  if (isLoading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Lade...</div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* ── Bestätigungs-Popup ──────────────────────────────────────────────── */}
      {bestaetigung && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 32px',
            maxWidth: 520, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
              Buchung bestätigen
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              Folgende Stunden werden gebucht für <strong>{bestaetigung.eintrag.a_nummer}</strong>:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {bestaetigung.buchungen.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: 10, padding: '10px 16px',
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>👤 {b.mitarbeiter_name}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>📅 {b.datum}</span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>📆 {b.monat}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>{b.stunden}h</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBestaetigung(null)}
                disabled={buchend}
                style={{ padding: '10px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                Abbrechen
              </button>
              <button
                onClick={buchungBestaetigen}
                disabled={buchend}
                style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: buchend ? 'wait' : 'pointer' }}>
                {buchend ? '⏳ Buche...' : '✓ Jetzt buchen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
          Prüfqueue <span style={{ color: '#f59e0b' }}>({(queue as any[]).length})</span>
        </h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        Tickets die beim PDF-Import nicht automatisch verarbeitet werden konnten. Prüfen, ggf. zweiten Mitarbeiter hinzufügen und abschließen.
      </p>

      {(queue as any[]).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <CheckCircle size={40} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Alles erledigt</p>
          <p style={{ fontSize: 13 }}>Keine offenen Einträge in der Prüfqueue</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(queue as any[]).map((eintrag: any) => {
            const istOffen = bearbeitenId === eintrag.id;
            const form = getForm(eintrag.id);
            const istSonderformat = eintrag.grund?.includes('Sonderformat');
            const istBemerkung = eintrag.grund?.includes('Bemerkung');

            return (
              <div key={eintrag.id} style={{
                background: '#fff',
                border: `1px solid ${istOffen ? '#fbbf24' : istBemerkung ? '#bfdbfe' : '#f1f5f9'}`,
                borderRadius: 14,
                padding: '16px 20px',
                boxShadow: istOffen ? '0 0 0 3px rgba(251,191,36,.15)' : 'none',
              }}>
                {/* Kopfzeile */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: istOffen ? 16 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      {eintrag.a_nummer ?? '—'}
                    </span>
                    <span style={{
                      fontSize: 11,
                      background: istBemerkung ? '#eff6ff' : '#fffbeb',
                      color: istBemerkung ? '#1d4ed8' : '#92400e',
                      border: `1px solid ${istBemerkung ? '#bfdbfe' : '#fde68a'}`,
                      borderRadius: 6, padding: '2px 8px', fontWeight: 600,
                    }}>
                      {eintrag.grund}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Seite {eintrag.seite} · {eintrag.dateiname}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setBearbeitenId(istOffen ? null : eintrag.id)}
                      style={{ padding: '6px 14px', background: istOffen ? '#f8fafc' : '#2563eb', color: istOffen ? '#64748b' : '#fff', border: istOffen ? '1px solid #e2e8f0' : 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {istOffen ? 'Abbrechen' : 'Bearbeiten'}
                    </button>
                    <button
                      onClick={() => verwerfen(eintrag.id)}
                      style={{ padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
                      title="Verwerfen">
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Info-Zeile (eingeklappt) */}
                {!istOffen && (
                  <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>👤 {eintrag.mitarbeiter_name ?? '–'}</span>
                    <span>📅 {eintrag.datum ? new Date(eintrag.datum).toLocaleDateString('de-DE') : '–'}</span>
                    <span>⏱ {eintrag.stunden ?? 0}h</span>
                    <span>🔧 {eintrag.gewerk ?? '–'}</span>
                    {eintrag.bemerkung && (
                      <span style={{ maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={eintrag.bemerkung}>
                        📝 {eintrag.bemerkung}
                      </span>
                    )}
                  </div>
                )}

                {/* Bearbeitungsformular */}
                {istOffen && (
                  <>
                    {/* Bemerkung vollständig anzeigen */}
                    {eintrag.bemerkung && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>📝 Bemerkung (vollständig):</strong>
                        <span style={{ color: '#0f172a', lineHeight: 1.6 }}>{eintrag.bemerkung}</span>
                      </div>
                    )}

                    {/* Sonderformat-Hinweis */}
                    {istSonderformat && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                        <strong>Sonderformat:</strong> Originalnummer <strong>{eintrag.a_nummer}</strong> — bitte korrekte A-Nummer eintragen.
                      </div>
                    )}

                    {/* Hauptformular */}
                    <div style={{ display: 'grid', gridTemplateColumns: istSonderformat ? '1.5fr 1fr 1fr 0.8fr' : '1.5fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                      {istSonderformat && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>A-Nummer *</label>
                          <input type="text" placeholder="z.B. A26-07049"
                            value={form.a_nummer ?? ''}
                            onChange={e => setForm(eintrag.id, { a_nummer: e.target.value.toUpperCase() })}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 12, background: '#fffbeb' }} />
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Mitarbeiter</label>
                        <select value={form.mitarbeiter_id ?? eintrag.mitarbeiter_id ?? ''}
                          onChange={e => setForm(eintrag.id, { mitarbeiter_id: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#0f172a' }}>
                          <option value="">– auswählen –</option>
                          {(employees as any[]).map((e: any) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Stunden</label>
                        <input type="number" step="0.25" min="0.25" max="24"
                          value={form.stunden ?? eintrag.stunden ?? 0}
                          onChange={e => setForm(eintrag.id, { stunden: parseFloat(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Gewerk</label>
                        <select value={form.gewerk ?? eintrag.gewerk ?? 'Elektro'}
                          onChange={e => setForm(eintrag.id, { gewerk: e.target.value })}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
                          <option value="Elektro">Elektro</option>
                          <option value="Hochbau">Hochbau</option>
                        </select>
                      </div>
                    </div>

                    {/* Zweite Mitarbeiter */}
                    {(form.zweite_ma ?? []).map((z: any, idx: number) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: 12, marginBottom: 8, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
                            Weiterer Mitarbeiter {idx + 1}
                          </label>
                          <select value={z.mitarbeiter_id ?? ''}
                            onChange={e => setZweiterMA(eintrag.id, idx, { mitarbeiter_id: e.target.value })}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#0f172a' }}>
                            <option value="">– auswählen –</option>
                            {(employees as any[]).map((e: any) => (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Stunden</label>
                          <input type="number" step="0.25" min="0.25" max="24"
                            value={z.stunden ?? 0}
                            onChange={e => setZweiterMA(eintrag.id, idx, { stunden: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button onClick={() => removeZweiterMA(eintrag.id, idx)}
                            style={{ padding: '8px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button onClick={() => addZweiterMA(eintrag.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                        <Plus size={13} /> Weiteren Mitarbeiter hinzufügen
                      </button>
                      <button onClick={() => vorschauOeffnen(eintrag)}
                        style={{ padding: '8px 20px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        ✓ Abschließen
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
