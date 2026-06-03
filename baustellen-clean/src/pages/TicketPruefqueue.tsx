import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export default function TicketPruefqueue() {
  const qc = useQueryClient();
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const [bearbeitenForm, setBearbeitenForm] = useState<any>({});

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

  function getForm(eintrag: any) {
    return bearbeitenForm[eintrag.id] ?? {};
  }

  async function abschliessen(eintrag: any) {
    const form = getForm(eintrag);
    const stunden = form.stunden ?? eintrag.stunden;
    const ma_id = form.mitarbeiter_id ?? eintrag.mitarbeiter_id;
    const gewerk = form.gewerk ?? eintrag.gewerk ?? 'Elektro';
    // Sonderformat: A-Nummer muss manuell eingegeben werden
    const aNummer = form.a_nummer ?? eintrag.a_nummer;

    if (!stunden || stunden <= 0) { toast.error('Stunden müssen > 0 sein'); return; }
    if (!ma_id) { toast.error('Mitarbeiter muss ausgewählt sein'); return; }
    if (!aNummer || aNummer.includes('(#')) {
      toast.error('Bitte eine gültige A-Nummer eingeben (z.B. A26-07049)'); return;
    }

    try {
      let ticketId: string | null = null;
      const { data: vorhandenesTicket } = await supabase
        .from('tickets').select('id').eq('a_nummer', aNummer).maybeSingle();

      if (vorhandenesTicket) {
        ticketId = vorhandenesTicket.id;
      } else {
        const { data: newTicket } = await supabase.from('tickets').insert({
          a_nummer: aNummer,
          gewerk,
          status: 'erledigt',
          eingangsdatum: eintrag.datum,
        }).select('id').single();
        ticketId = newTicket?.id ?? null;
      }

      if (!ticketId) { toast.error('Ticket konnte nicht angelegt werden'); return; }

      await supabase.from('tickets').update({ status: 'erledigt', gewerk }).eq('id', ticketId);
      await supabase.from('ticket_worklogs').insert({
        ticket_id: ticketId,
        employee_id: ma_id,
        stunden,
        leistungsdatum: eintrag.datum,
      });
      await supabase.from('ticket_pruefqueue').update({ status: 'erledigt' }).eq('id', eintrag.id);

      toast.success(`${aNummer} abgeschlossen`);
      qc.invalidateQueries({ queryKey: ['ticket-pruefqueue'] });
      qc.invalidateQueries({ queryKey: ['ticket-pruefqueue-count'] });
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
    qc.invalidateQueries({ queryKey: ['ticket-pruefqueue-count'] });
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Lade...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
          Prüfqueue <span style={{ color: '#f59e0b' }}>({(queue as any[]).length})</span>
        </h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        Tickets die beim PDF-Import nicht automatisch verarbeitet werden konnten. Hier kannst du sie prüfen und manuell abschließen.
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
            const form = getForm(eintrag);
            const istSonderformat = eintrag.grund?.includes('Sonderformat');

            return (
              <div key={eintrag.id} style={{
                background: '#fff',
                border: `1px solid ${istOffen ? '#fbbf24' : '#f1f5f9'}`,
                borderRadius: 14,
                padding: '16px 20px',
                boxShadow: istOffen ? '0 0 0 3px rgba(251,191,36,.15)' : 'none',
              }}>
                {/* Kopfzeile */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: istOffen ? 16 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      {eintrag.a_nummer ?? '—'}
                    </span>
                    <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
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
                      <span style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📝 {eintrag.bemerkung}
                      </span>
                    )}
                  </div>
                )}

                {/* Bearbeitungsformular */}
                {istOffen && (
                  <>
                    {/* Sonderformat: A-Nummer manuell eingeben */}
                    {istSonderformat && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                        <strong>Sonderformat-Ticket:</strong> Die originale A-Nummer lautet <strong>{eintrag.a_nummer}</strong>.
                        Bitte trage unten die korrekte A-Nummer ein (z.B. das Haupt-Ticket) unter dem die Stunden gebucht werden sollen.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: istSonderformat ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>

                      {/* A-Nummer — nur bei Sonderformat */}
                      {istSonderformat && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>A-Nummer *</label>
                          <input
                            type="text"
                            placeholder="z.B. A26-07049"
                            value={form.a_nummer ?? ''}
                            onChange={e => setBearbeitenForm((f: any) => ({ ...f, [eintrag.id]: { ...f[eintrag.id], a_nummer: e.target.value.toUpperCase() } }))}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 12, color: '#0f172a', background: '#fffbeb' }} />
                        </div>
                      )}

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Mitarbeiter</label>
                        <select
                          value={form.mitarbeiter_id ?? eintrag.mitarbeiter_id ?? ''}
                          onChange={e => setBearbeitenForm((f: any) => ({ ...f, [eintrag.id]: { ...f[eintrag.id], mitarbeiter_id: e.target.value } }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#0f172a' }}>
                          <option value="">– auswählen –</option>
                          {(employees as any[]).map((e: any) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Stunden</label>
                        <input
                          type="number" step="0.25" min="0.25" max="24"
                          value={form.stunden ?? eintrag.stunden ?? 0}
                          onChange={e => setBearbeitenForm((f: any) => ({ ...f, [eintrag.id]: { ...f[eintrag.id], stunden: parseFloat(e.target.value) || 0 } }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Gewerk</label>
                        <select
                          value={form.gewerk ?? eintrag.gewerk ?? 'Elektro'}
                          onChange={e => setBearbeitenForm((f: any) => ({ ...f, [eintrag.id]: { ...f[eintrag.id], gewerk: e.target.value } }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
                          <option value="Elektro">Elektro</option>
                          <option value="Hochbau">Hochbau</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          onClick={() => abschliessen(eintrag)}
                          style={{ width: '100%', padding: '8px 16px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          ✓ Abschließen
                        </button>
                      </div>
                    </div>

                    {/* Bemerkung anzeigen */}
                    {eintrag.bemerkung && (
                      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                        <strong style={{ color: '#0f172a' }}>Bemerkung:</strong> {eintrag.bemerkung}
                      </div>
                    )}
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
