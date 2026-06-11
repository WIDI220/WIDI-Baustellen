import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface ZusatzMA {
  mitarbeiter_id: string;
  stunden: number;
}

interface FormState {
  mitarbeiter_id: string;
  stunden: number;
  gewerk: string;
  a_nummer?: string;
  zusatz: ZusatzMA[];
}

export default function TicketPruefqueue() {
  const qc = useQueryClient();
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [expandedBemerkung, setExpandedBemerkung] = useState<Record<string, boolean>>({});

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
      const { data } = await supabase.from('employees').select('id,name').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  function openBearbeiten(eintrag: any) {
    if (bearbeitenId === eintrag.id) { setBearbeitenId(null); return; }
    setBearbeitenId(eintrag.id);
    if (!forms[eintrag.id]) {
      setForms(f => ({
        ...f,
        [eintrag.id]: {
          mitarbeiter_id: eintrag.mitarbeiter_id ?? '',
          stunden: eintrag.stunden ?? 0,
          gewerk: eintrag.gewerk ?? 'Elektro',
          a_nummer: eintrag.a_nummer ?? '',
          zusatz: [],
        },
      }));
    }
  }

  function updateForm(id: string, patch: Partial<FormState>) {
    setForms(f => ({ ...f, [id]: { ...f[id], ...patch } }));
  }

  function addZusatzMA(id: string) {
    setForms(f => ({
      ...f,
      [id]: { ...f[id], zusatz: [...(f[id]?.zusatz ?? []), { mitarbeiter_id: '', stunden: 0 }] },
    }));
  }

  function updateZusatz(id: string, idx: number, patch: Partial<ZusatzMA>) {
    setForms(f => {
      const zusatz = [...(f[id]?.zusatz ?? [])];
      zusatz[idx] = { ...zusatz[idx], ...patch };
      return { ...f, [id]: { ...f[id], zusatz } };
    });
  }

  function removeZusatz(id: string, idx: number) {
    setForms(f => {
      const zusatz = (f[id]?.zusatz ?? []).filter((_, i) => i !== idx);
      return { ...f, [id]: { ...f[id], zusatz } };
    });
  }

  async function abschliessen(eintrag: any) {
    const form = forms[eintrag.id];
    if (!form) return;

    const { stunden, mitarbeiter_id, gewerk, zusatz } = form;
    const a_nummer = form.a_nummer?.trim() || eintrag.a_nummer;

    if (!a_nummer) { toast.error('A-Nummer fehlt'); return; }
    if (!mitarbeiter_id) { toast.error('Mitarbeiter muss ausgewählt sein'); return; }
    if (!stunden || stunden <= 0) { toast.error('Stunden müssen > 0 sein'); return; }

    for (const z of zusatz) {
      if (!z.mitarbeiter_id) { toast.error('Mitarbeiter bei zusätzlicher Buchung fehlt'); return; }
      if (!z.stunden || z.stunden <= 0) { toast.error('Stunden bei zusätzlicher Buchung müssen > 0 sein'); return; }
    }

    try {
      // Ticket suchen oder anlegen
      let ticketId: string | null = null;
      const { data: vorhandenesTicket } = await supabase
        .from('tickets').select('id').eq('a_nummer', a_nummer).maybeSingle();

      if (vorhandenesTicket) {
        ticketId = vorhandenesTicket.id;
      } else {
        const { data: newTicket } = await supabase.from('tickets').insert({
          a_nummer,
          gewerk,
          status: 'erledigt',
          eingangsdatum: eintrag.datum,
        }).select('id').single();
        ticketId = newTicket?.id ?? null;
      }

      if (!ticketId) { toast.error('Ticket konnte nicht gefunden/angelegt werden'); return; }

      await supabase.from('tickets').update({ status: 'erledigt', gewerk }).eq('id', ticketId);

      // Hauptbuchung
      await supabase.from('ticket_worklogs').insert({
        ticket_id: ticketId,
        employee_id: mitarbeiter_id,
        stunden,
        leistungsdatum: eintrag.datum,
      });

      // Zusatzbuchungen
      for (const z of zusatz) {
        await supabase.from('ticket_worklogs').insert({
          ticket_id: ticketId,
          employee_id: z.mitarbeiter_id,
          stunden: z.stunden,
          leistungsdatum: eintrag.datum,
        });
      }

      await supabase.from('ticket_pruefqueue').update({ status: 'erledigt' }).eq('id', eintrag.id);

      const total = stunden + zusatz.reduce((s, z) => s + z.stunden, 0);
      toast.success(`${a_nummer} abgeschlossen — ${total}h gebucht`);
      qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setBearbeitenId(null);
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    }
  }

  async function verwerfen(id: string) {
    await supabase.from('ticket_pruefqueue').update({ status: 'verworfen' }).eq('id', id);
    toast.success('Eintrag verworfen');
    qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Lade...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
          Prüfqueue <span style={{ color: '#f59e0b' }}>({(queue as any[]).length})</span>
        </h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        Tickets die beim PDF-Import nicht automatisch verarbeitet werden konnten. Hier kannst du sie prüfen und manuell abschließen.
      </p>

      {(queue as any[]).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <CheckCircle size={40} style={{ color: '#10b981', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Alles erledigt</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Keine offenen Einträge in der Prüfqueue</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(queue as any[]).map((eintrag: any) => {
            const istOffen = bearbeitenId === eintrag.id;
            const form = forms[eintrag.id];
            const istSonderformat = eintrag.grund?.toLowerCase().includes('sonderformat');
            const bemerkungLang = (eintrag.bemerkung ?? '').length > 120;
            const bemerkungExpanded = expandedBemerkung[eintrag.id];

            return (
              <div key={eintrag.id} style={{
                background: '#fff',
                border: `1.5px solid ${istOffen ? '#fbbf24' : '#e2e8f0'}`,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: istOffen ? '0 0 0 3px rgba(251,191,36,.12)' : '0 1px 3px rgba(0,0,0,.04)',
              }}>

                {/* ── Kopfzeile ── */}
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: istOffen ? '1px solid #fde68a' : 'none', background: istOffen ? '#fffdf5' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                    {/* A-Nummer */}
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                      {eintrag.a_nummer ?? <span style={{ color: '#ef4444' }}>Keine A-Nr.</span>}
                    </span>
                    {/* Grund-Badge */}
                    <span style={{ fontSize: 11, background: istSonderformat ? '#fef2f2' : '#fffbeb', color: istSonderformat ? '#b91c1c' : '#92400e', border: `1px solid ${istSonderformat ? '#fecaca' : '#fde68a'}`, borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
                      {eintrag.grund}
                    </span>
                    {/* Datei-Info */}
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Seite {eintrag.seite} · {eintrag.dateiname}
                    </span>
                  </div>

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => openBearbeiten(eintrag)}
                      style={{ padding: '6px 14px', background: istOffen ? '#f1f5f9' : '#2563eb', color: istOffen ? '#64748b' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {istOffen ? 'Abbrechen' : 'Bearbeiten'}
                    </button>
                    <button
                      onClick={() => verwerfen(eintrag.id)}
                      style={{ padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}
                      title="Verwerfen">
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* ── Info-Chips (wenn nicht offen) ── */}
                {!istOffen && (
                  <div style={{ padding: '10px 18px 12px', borderTop: '1px solid #f8fafc' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: eintrag.bemerkung ? 8 : 0 }}>
                      {[
                        { icon: '👤', val: eintrag.mitarbeiter_name ?? '–' },
                        { icon: '📅', val: eintrag.datum ? new Date(eintrag.datum).toLocaleDateString('de-DE') : '–' },
                        { icon: '⏱', val: `${eintrag.stunden ?? 0} h` },
                        { icon: '🔧', val: eintrag.gewerk ?? '–' },
                      ].map(({ icon, val }) => (
                        <span key={icon} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, fontSize: 12, color: '#374151', fontWeight: 500 }}>
                          {icon} {val}
                        </span>
                      ))}
                    </div>

                    {/* Bemerkung */}
                    {eintrag.bemerkung && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>📝 Bemerkung</span>
                        <div style={{ marginTop: 4 }}>
                          {bemerkungLang && !bemerkungExpanded
                            ? eintrag.bemerkung.slice(0, 120) + '…'
                            : eintrag.bemerkung}
                        </div>
                        {bemerkungLang && (
                          <button
                            onClick={() => setExpandedBemerkung(b => ({ ...b, [eintrag.id]: !b[eintrag.id] }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 11, fontWeight: 600, padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {bemerkungExpanded ? <><ChevronUp size={12} /> Weniger</> : <><ChevronDown size={12} /> Mehr anzeigen</>}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Bearbeitungsformular ── */}
                {istOffen && form && (
                  <div style={{ padding: '16px 18px', background: '#fafafa' }}>

                    {/* A-Nummer Feld (nur bei Sonderformat ohne A-Nummer) */}
                    {(!eintrag.a_nummer || istSonderformat) && (
                      <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
                        <label style={labelStyle}>A-Nummer</label>
                        <input
                          type="text"
                          placeholder="z.B. A26-09123"
                          value={form.a_nummer ?? ''}
                          onChange={e => updateForm(eintrag.id, { a_nummer: e.target.value })}
                          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }} />
                      </div>
                    )}

                    {/* Hauptbuchung */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Buchung</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={labelStyle}>Mitarbeiter</label>
                          <select value={form.mitarbeiter_id} onChange={e => updateForm(eintrag.id, { mitarbeiter_id: e.target.value })} style={inputStyle}>
                            <option value="">– auswählen –</option>
                            {(employees as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Stunden</label>
                          <input type="number" step="0.25" min="0.25" max="24"
                            value={form.stunden}
                            onChange={e => updateForm(eintrag.id, { stunden: parseFloat(e.target.value) || 0 })}
                            style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Gewerk</label>
                          <select value={form.gewerk} onChange={e => updateForm(eintrag.id, { gewerk: e.target.value })} style={inputStyle}>
                            <option value="Elektro">Elektro</option>
                            <option value="Hochbau">Hochbau</option>
                            <option value="Werdohl">Werdohl</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Zusatz-Mitarbeiter */}
                    {form.zusatz.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Weitere Mitarbeiter</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {form.zusatz.map((z, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                              <div>
                                <label style={labelStyle}>Mitarbeiter {idx + 2}</label>
                                <select value={z.mitarbeiter_id} onChange={e => updateZusatz(eintrag.id, idx, { mitarbeiter_id: e.target.value })} style={inputStyle}>
                                  <option value="">– auswählen –</option>
                                  {(employees as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={labelStyle}>Stunden</label>
                                <input type="number" step="0.25" min="0.25" max="24"
                                  value={z.stunden}
                                  onChange={e => updateZusatz(eintrag.id, idx, { stunden: parseFloat(e.target.value) || 0 })}
                                  style={inputStyle} />
                              </div>
                              <button onClick={() => removeZusatz(eintrag.id, idx)}
                                style={{ padding: '8px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', marginBottom: 1 }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Aktionen */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                      <button onClick={() => abschliessen(eintrag)}
                        style={{ padding: '9px 22px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,.25)' }}>
                        ✓ Abschließen
                      </button>
                      <button onClick={() => addZusatzMA(eintrag.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={13} /> Weiterer Mitarbeiter
                      </button>

                      {/* Stunden-Summe */}
                      {(form.stunden > 0 || form.zusatz.some(z => z.stunden > 0)) && (
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                          Gesamt: <strong style={{ color: '#0f172a' }}>
                            {(form.stunden + form.zusatz.reduce((s, z) => s + (z.stunden || 0), 0)).toFixed(2).replace('.00', '')} h
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#94a3b8',
  display: 'block',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
  background: '#fff',
  boxSizing: 'border-box',
};
