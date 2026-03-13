// Ticket-Eskalationen – zeigt bs_eskalationen gefiltert nach Ticket-Kontext
// Wiederverwendung der gleichen Tabelle wie Baustellen-Eskalationen
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, Plus } from 'lucide-react';

const PRIO = [
  { value: 'niedrig',  label: 'Niedrig',  bg: 'rgba(16,185,129,.1)',  text: '#059669' },
  { value: 'mittel',   label: 'Mittel',   bg: 'rgba(245,158,11,.1)',  text: '#d97706' },
  { value: 'hoch',     label: 'Hoch',     bg: 'rgba(249,115,22,.1)',  text: '#ea580c' },
  { value: 'kritisch', label: 'Kritisch', bg: 'rgba(239,68,68,.1)',   text: '#dc2626' },
];

const EMPTY = { titel: '', beschreibung: '', prioritaet: 'mittel', verantwortlich: '', faellig: '' };

export default function TicketEskalationenPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const { data: eskalationen = [] } = useQuery({
    queryKey: ['eskalationen-tickets'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bs_eskalationen')
        .select('*')
        .is('baustelle_id', null)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.titel) throw new Error('Bitte Titel eingeben');
      const { error } = await supabase.from('bs_eskalationen').insert({
        titel: form.titel,
        beschreibung: form.beschreibung || null,
        prioritaet: form.prioritaet,
        verantwortlich: form.verantwortlich || null,
        faellig_am: form.faellig || null,
        status: 'offen',
        baustelle_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Eskalation erstellt'); setForm(EMPTY); setShowForm(false); qc.invalidateQueries({ queryKey: ['eskalationen-tickets'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_eskalationen').update({ status: 'erledigt' }).eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Erledigt'); qc.invalidateQueries({ queryKey: ['eskalationen-tickets'] }); },
  });

  const esk = eskalationen as any[];
  const offen = esk.filter(e => e.status === 'offen');
  const erledigt = esk.filter(e => e.status === 'erledigt');

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e5e9f2', fontSize: '13px', background: '#fff', boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>Eskalationen</h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>{offen.length} offen · {erledigt.length} erledigt</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: '#107A57', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={15} /> Neue Eskalation
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#6b7a99', display: 'block', marginBottom: '4px' }}>Titel *</label>
              <input value={form.titel} onChange={e => setForm(f => ({...f, titel: e.target.value}))} style={inputStyle} placeholder="Kurzbeschreibung" />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#6b7a99', display: 'block', marginBottom: '4px' }}>Priorität</label>
              <select value={form.prioritaet} onChange={e => setForm(f => ({...f, prioritaet: e.target.value}))} style={inputStyle}>
                {PRIO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#6b7a99', display: 'block', marginBottom: '4px' }}>Verantwortlich</label>
              <input value={form.verantwortlich} onChange={e => setForm(f => ({...f, verantwortlich: e.target.value}))} style={inputStyle} placeholder="Name" />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#6b7a99', display: 'block', marginBottom: '4px' }}>Fällig am</label>
              <input type="date" value={form.faellig} onChange={e => setForm(f => ({...f, faellig: e.target.value}))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '12px', fontWeight: '500', color: '#6b7a99', display: 'block', marginBottom: '4px' }}>Beschreibung</label>
              <textarea value={form.beschreibung} onChange={e => setForm(f => ({...f, beschreibung: e.target.value}))} style={{...inputStyle, minHeight: '80px', resize: 'vertical'}} placeholder="Details..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => save.mutate()} style={{ padding: '9px 20px', background: '#107A57', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>Speichern</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: '#f0f2f5', color: '#6b7a99', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Abbrechen</button>
          </div>
        </div>
      )}

      {/* Offene */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Offen ({offen.length})</div>
        {offen.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px' }}>Keine offenen Eskalationen.</p>}
        {offen.map((e: any) => {
          const p = PRIO.find(x => x.value === e.prioritaet) ?? PRIO[1];
          return (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <AlertTriangle size={13} style={{ color: p.text, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f1f3d' }}>{e.titel}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: p.bg, color: p.text }}>{p.label}</span>
                </div>
                {e.beschreibung && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px 21px' }}>{e.beschreibung}</p>}
                <div style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '21px' }}>
                  {e.verantwortlich && <span>Verantwortlich: {e.verantwortlich} · </span>}
                  {e.faellig_am && <span>Fällig: {new Date(e.faellig_am).toLocaleDateString('de-DE')}</span>}
                </div>
              </div>
              <button onClick={() => close.mutate(e.id)} style={{ padding: '6px 12px', background: 'rgba(16,185,129,.1)', color: '#059669', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', flexShrink: 0, marginLeft: '12px' }}>
                ✓ Erledigt
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
