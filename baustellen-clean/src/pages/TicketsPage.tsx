import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, Trash2, Pencil, Clock, Plus, AlertTriangle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung',  label: 'In Bearbeitung',   bg: 'rgba(59,130,246,.1)',  text: '#2563eb' },
  { value: 'erledigt',        label: 'Erledigt',          bg: 'rgba(16,185,129,.1)',  text: '#059669' },
  { value: 'zur_unterschrift',label: 'Zur Unterschrift',  bg: 'rgba(245,158,11,.1)', text: '#d97706' },
  { value: 'abrechenbar',     label: 'Abrechenbar',       bg: 'rgba(249,115,22,.1)', text: '#ea580c' },
  { value: 'abgerechnet',     label: 'Abgerechnet',       bg: 'rgba(107,114,128,.1)',text: '#6b7280' },
];
const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const PAGE_SIZE = 50;

const EMPTY_TICKET = { beschreibung: '', auftraggeber: '', gewerk: 'Hochbau', status: 'in_bearbeitung', a_nummer: '', adresse: '', notizen: '' };
const EMPTY_STUNDEN = { employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] };

const sel = (style: any) => ({ ...style, width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e9f2', fontSize: '13px', background: '#fff' });

export default function TicketsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterGewerk, setFilterGewerk] = useState('all');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editTicket, setEditTicket] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_TICKET);
  const [stundenTicket, setStundenTicket] = useState<any>(null);
  const [stundenForm, setStundenForm] = useState(EMPTY_STUNDEN);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: result } = useQuery({
    queryKey: ['tickets-list', search, filterStatus, filterGewerk, page],
    queryFn: async () => {
      let q = supabase.from('tickets').select('*, ticket_worklogs(stunden, employees(name,kuerzel))', { count: 'exact' });
      if (search) q = q.or(`beschreibung.ilike.%${search}%,auftraggeber.ilike.%${search}%,a_nummer.ilike.%${search}%`);
      if (filterStatus !== 'all') q = q.eq('status', filterStatus);
      if (filterGewerk !== 'all') q = q.eq('gewerk', filterGewerk);
      q = q.order('created_at', { ascending: false }).range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);
      const { data, count } = await q;
      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const tickets = result?.data ?? [];
  const totalCount = result?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const { data: worklogs = [] } = useQuery({
    queryKey: ['ticket-worklogs', stundenTicket?.id],
    queryFn: async () => {
      if (!stundenTicket) return [];
      const { data } = await supabase.from('ticket_worklogs').select('*, employees(name,kuerzel)').eq('ticket_id', stundenTicket.id).order('leistungsdatum', { ascending: false });
      return data ?? [];
    },
    enabled: !!stundenTicket,
  });

  const saveTicket = useMutation({
    mutationFn: async () => {
      if (!form.beschreibung) throw new Error('Bitte Beschreibung eingeben');
      const payload = { ...form, created_by: user?.id };
      if (editTicket) { const { error } = await supabase.from('tickets').update(payload).eq('id', editTicket.id); if (error) throw error; }
      else { const { error } = await supabase.from('tickets').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(editTicket ? 'Ticket gespeichert' : 'Ticket erstellt'); setShowForm(false); setEditTicket(null); setForm(EMPTY_TICKET); qc.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const delTicket = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('tickets').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Gelöscht'); qc.invalidateQueries({ queryKey: ['tickets-list'] }); },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from('tickets').update({ status }).eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets-list'] }),
  });

  const saveStunden = useMutation({
    mutationFn: async () => {
      if (!stundenForm.employee_id || !stundenForm.stunden) throw new Error('Mitarbeiter und Stunden erforderlich');
      const { error } = await supabase.from('ticket_worklogs').insert({ ticket_id: stundenTicket.id, employee_id: stundenForm.employee_id, stunden: parseFloat(stundenForm.stunden), leistungsdatum: stundenForm.leistungsdatum });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Stunden eingetragen'); setStundenForm(EMPTY_STUNDEN); qc.invalidateQueries({ queryKey: ['ticket-worklogs', stundenTicket?.id] }); qc.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (t: any) => { setEditTicket(t); setForm({ beschreibung: t.beschreibung||'', auftraggeber: t.auftraggeber||'', gewerk: t.gewerk||'Hochbau', status: t.status||'in_bearbeitung', a_nummer: t.a_nummer||'', adresse: t.adresse||'', notizen: t.notizen||'' }); setShowForm(true); };

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e5e9f2', fontSize: '13px', background: '#fff', boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>Tickets</h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>{totalCount} Tickets gesamt</p>
        </div>
        <button onClick={() => { setEditTicket(null); setForm(EMPTY_TICKET); setShowForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: '#107A57', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={15} /> Neues Ticket
        </button>
      </div>

      {/* Filter */}
      <div style={{ background: '#fff', borderRadius: '14px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Suche..." style={{ ...inputStyle, paddingLeft: '32px' }} />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 'auto', minWidth: '150px' }}>
          <option value="all">Alle Status</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterGewerk} onChange={e => { setFilterGewerk(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}>
          <option value="all">Alle Gewerke</option>
          {GEWERK_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Ticket-Liste */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        {tickets.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Keine Tickets gefunden.</p>}
        {(tickets as any[]).map((t: any) => {
          const st = STATUS_OPTIONS.find(s => s.value === t.status) ?? STATUS_OPTIONS[0];
          const totalH = (t.ticket_worklogs ?? []).reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
          return (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f5f5f5', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  {t.a_nummer && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6b7a99', background: '#f0f2f5', padding: '2px 6px', borderRadius: '4px' }}>T-{t.a_nummer}</span>}
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f1f3d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>{t.beschreibung || '–'}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{t.auftraggeber || '–'}</span>
                  {t.gewerk && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {t.gewerk}</span>}
                  {totalH > 0 && <span style={{ fontSize: '11px', color: '#107A57', fontWeight: '500' }}>· {totalH.toFixed(1)}h</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <select value={t.status} onChange={e => updateStatus.mutate({ id: t.id, status: e.target.value })}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '20px', border: 'none', background: st.bg, color: st.text, fontWeight: '500', cursor: 'pointer' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={() => setStundenTicket(t)} style={{ padding: '6px 10px', background: 'rgba(16,122,87,.1)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#107A57', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <Clock size={13} />
                </button>
                <button onClick={() => openEdit(t)} style={{ padding: '6px 10px', background: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#6b7a99' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => { if (confirm(`Ticket löschen?`)) delTicket.mutate(t.id); }} style={{ padding: '6px 10px', background: 'rgba(239,68,68,.1)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#ef4444' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e9f2', background: '#fff', cursor: 'pointer', color: '#6b7a99' }}><ChevronLeft size={15} /></button>
          <span style={{ fontSize: '13px', color: '#6b7a99' }}>Seite {page} von {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e5e9f2', background: '#fff', cursor: 'pointer', color: '#6b7a99' }}><ChevronRight size={15} /></button>
        </div>
      )}

      {/* Ticket-Formular Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editTicket ? 'Ticket bearbeiten' : 'Neues Ticket'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Beschreibung *</Label><Textarea value={form.beschreibung} onChange={e => setForm(f => ({...f, beschreibung: e.target.value}))} className="mt-1" /></div>
              <div><Label>A-Nummer</Label><Input value={form.a_nummer} onChange={e => setForm(f => ({...f, a_nummer: e.target.value}))} className="mt-1" /></div>
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e => setForm(f => ({...f, auftraggeber: e.target.value}))} className="mt-1" /></div>
              <div>
                <Label>Gewerk</Label>
                <select value={form.gewerk} onChange={e => setForm(f => ({...f, gewerk: e.target.value}))} style={{ ...inputStyle, marginTop: '4px' }}>
                  {GEWERK_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} style={{ ...inputStyle, marginTop: '4px' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Label>Adresse</Label><Input value={form.adresse} onChange={e => setForm(f => ({...f, adresse: e.target.value}))} className="mt-1" /></div>
              <div className="col-span-2"><Label>Notizen</Label><Textarea value={form.notizen} onChange={e => setForm(f => ({...f, notizen: e.target.value}))} className="mt-1" /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
              <Button onClick={() => saveTicket.mutate()} disabled={saveTicket.isPending}>{editTicket ? 'Speichern' : 'Erstellen'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stunden Dialog */}
      <Dialog open={!!stundenTicket} onOpenChange={open => !open && setStundenTicket(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Stunden – {stundenTicket?.a_nummer ? `T-${stundenTicket.a_nummer}` : 'Ticket'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <Label>Mitarbeiter</Label>
                <select value={stundenForm.employee_id} onChange={e => setStundenForm(f => ({...f, employee_id: e.target.value}))} style={{ ...inputStyle, marginTop: '4px' }}>
                  <option value="">– wählen –</option>
                  {(employees as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div><Label>Stunden</Label><Input type="number" step="0.25" value={stundenForm.stunden} onChange={e => setStundenForm(f => ({...f, stunden: e.target.value}))} className="mt-1" /></div>
              <div className="col-span-2"><Label>Datum</Label><Input type="date" value={stundenForm.leistungsdatum} onChange={e => setStundenForm(f => ({...f, leistungsdatum: e.target.value}))} className="mt-1" /></div>
            </div>
            <Button onClick={() => saveStunden.mutate()} disabled={saveStunden.isPending}>Eintragen</Button>
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
              {(worklogs as any[]).map((w: any) => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#374151' }}>
                  <span>{w.employees?.name} · {new Date(w.leistungsdatum).toLocaleDateString('de-DE')}</span>
                  <span style={{ fontWeight: '600', color: '#107A57' }}>{Number(w.stunden).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
