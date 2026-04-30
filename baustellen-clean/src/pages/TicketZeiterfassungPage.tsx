import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, Trash2, Plus } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

const EMPTY = { ticket_id: '', employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] };

export default function TicketZeiterfassungPage() {
  const qc = useQueryClient();
  const { canEdit } = usePermissions();
  const [form, setForm] = useState(EMPTY);
  const [editItem, setEditItem] = useState<any>(null);
  const [filterMA, setFilterMA] = useState('all');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel,stundensatz').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-list-kurz'],
    queryFn: async () => { const { data } = await supabase.from('tickets').select('id,a_nummer,beschreibung,gewerk').order('created_at', { ascending: false }).limit(200); return data ?? []; },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['ticket-worklogs-all'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs').select('*, employees(id,name,kuerzel,stundensatz), tickets(id,a_nummer,beschreibung)').order('leistungsdatum', { ascending: false });
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.ticket_id) throw new Error('Bitte Ticket wählen');
      if (!form.employee_id) throw new Error('Bitte Mitarbeiter wählen');
      if (!form.stunden) throw new Error('Bitte Stunden eingeben');
      const payload = { ticket_id: form.ticket_id, employee_id: form.employee_id, stunden: parseFloat(String(form.stunden).replace(',','.')), leistungsdatum: form.leistungsdatum };
      if (editItem) { const { error } = await supabase.from('ticket_worklogs').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('ticket_worklogs').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(editItem ? 'Gespeichert' : 'Eingetragen'); setForm(EMPTY); setEditItem(null); qc.invalidateQueries({ queryKey: ['ticket-worklogs-all'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('ticket_worklogs').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Gelöscht'); qc.invalidateQueries({ queryKey: ['ticket-worklogs-all'] }); },
  });

  const wl = worklogs as any[];
  const emps = employees as any[];
  const filtered = filterMA === 'all' ? wl : wl.filter(w => w.employee_id === filterMA);
  const totalH = filtered.reduce((s, w) => s + Number(w.stunden ?? 0), 0);

  const sel = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));

  const startEdit = (w: any) => {
    setEditItem(w);
    setForm({ ticket_id: w.ticket_id, employee_id: w.employee_id, stunden: String(w.stunden), leistungsdatum: w.leistungsdatum });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e5e9f2', fontSize: '13px', background: '#fff', color: '#0f1f3d', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '12px', fontWeight: '500' as const, color: '#6b7a99', marginBottom: '5px', display: 'block' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>Zeiterfassung Tickets</h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Stunden pro Ticket und Mitarbeiter erfassen</p>
      </div>

      {/* Formular */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f1f3d', marginBottom: '16px' }}>{editItem ? 'Eintrag bearbeiten' : 'Stunden eintragen'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Ticket</label>
            <select value={form.ticket_id} onChange={e => sel('ticket_id', e.target.value)} style={inputStyle}>
              <option value="">– wählen –</option>
              {(tickets as any[]).map(t => <option key={t.id} value={t.id}>{t.a_nummer ? `T-${t.a_nummer}` : '–'} {t.beschreibung?.slice(0,40) ?? ''}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Mitarbeiter</label>
            <select value={form.employee_id} onChange={e => sel('employee_id', e.target.value)} style={inputStyle}>
              <option value="">– wählen –</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Stunden</label>
            <input type="number" step="0.25" min="0" value={form.stunden} onChange={e => sel('stunden', e.target.value)} style={inputStyle} placeholder="z.B. 2.5" />
          </div>
          <div>
            <label style={labelStyle}>Datum</label>
            <input type="date" value={form.leistungsdatum} onChange={e => sel('leistungsdatum', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => save.mutate()} disabled={save.isPending || !canEdit('tickets')}
              style={{ padding: '9px 18px', background: '#107A57', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={15} />{editItem ? 'Speichern' : 'Eintragen'}
            </button>
            {editItem && <button onClick={() => { setEditItem(null); setForm(EMPTY); }} style={{ padding: '9px 14px', background: '#f0f2f5', color: '#6b7a99', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>✕</button>}
          </div>
        </div>
      </div>

      {/* Filter + Tabelle */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={15} style={{ color: '#107A57' }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f1f3d' }}>Gesamt: {totalH.toFixed(1)}h</span>
          </div>
          <select value={filterMA} onChange={e => setFilterMA(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}>
            <option value="all">Alle Mitarbeiter</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {filtered.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>Keine Einträge gefunden.</p>}

        {filtered.map((w: any) => (
          <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', color: '#0f1f3d', fontWeight: '500' }}>
                {w.tickets?.a_nummer ? `T-${w.tickets.a_nummer}` : '–'} · {w.employees?.name ?? '–'}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                {new Date(w.leistungsdatum).toLocaleDateString('de-DE')} · {w.tickets?.beschreibung?.slice(0,50) ?? ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#107A57' }}>{Number(w.stunden).toFixed(1)}h</span>
              <button onClick={() => startEdit(w)} style={{ padding: '5px 10px', background: '#f0f2f5', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#6b7a99' }}>✏</button>
              <button onClick={() => { if (confirm('Löschen?')) del.mutate(w.id); }} style={{ padding: '5px 10px', background: 'rgba(239,68,68,.1)', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#ef4444' }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
