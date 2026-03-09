import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, HardHat, MapPin, Calendar, Euro, ArrowRight, Pencil, Trash2, Search } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'offen', label: 'Offen', bg: 'bg-gray-100', text: 'text-gray-600' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg: 'bg-blue-100', text: 'text-blue-700' },
  { value: 'pausiert', label: 'Pausiert', bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'abgeschlossen', label: 'Abgeschlossen', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg: 'bg-purple-100', text: 'text-purple-700' },
];
const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];

const EMPTY = { name: '', adresse: '', auftraggeber: '', startdatum: '', enddatum: '', status: 'offen', gewerk: 'Hochbau', projektleiter: '', fortschritt: 0, budget: 0, beschreibung: '' };

export default function BaustellenPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);

  const { data: baustellen = [] } = useQuery({
    queryKey: ['baustellen-list'],
    queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; },
  });
  const { data: stunden = [] } = useQuery({
    queryKey: ['bs-stunden-list'],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(stundensatz)'); return data ?? []; },
  });
  const { data: materialien = [] } = useQuery({
    queryKey: ['bs-mat-list'],
    queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('gesamtpreis, baustelle_id'); return data ?? []; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, budget: Number(form.budget), fortschritt: Number(form.fortschritt) };
      if (editItem) { const { error } = await supabase.from('baustellen').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('baustellen').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(editItem ? 'Gespeichert' : 'Baustelle angelegt'); setShowDialog(false); queryClient.invalidateQueries({ queryKey: ['baustellen-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('baustellen').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Gelöscht'); queryClient.invalidateQueries({ queryKey: ['baustellen-list'] }); },
  });

  const openNew = () => { setForm(EMPTY); setEditItem(null); setShowDialog(true); };
  const openEdit = (b: any) => { setForm({ name:b.name, adresse:b.adresse||'', auftraggeber:b.auftraggeber||'', startdatum:b.startdatum||'', enddatum:b.enddatum||'', status:b.status, gewerk:b.gewerk||'Hochbau', projektleiter:b.projektleiter||'', fortschritt:b.fortschritt||0, budget:b.budget||0, beschreibung:b.beschreibung||'' }); setEditItem(b); setShowDialog(true); };

  const filtered = (baustellen as any[]).filter(b => {
    const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) || (b.auftraggeber||'').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getKosten = (id: string) => {
    const sw = (stunden as any[]).filter(w => w.baustelle_id === id).reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? 45), 0);
    const mat = (materialien as any[]).filter(m => m.baustelle_id === id).reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);
    return sw + mat;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Baustellen</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} von {(baustellen as any[]).length}</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Neue Baustelle</Button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter} className="w-40">
          <SelectOption value="all">Alle Status</SelectOption>
          {STATUS_OPTIONS.map(s => <SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}
        </Select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((b: any) => {
          const st = STATUS_OPTIONS.find(s => s.value === b.status);
          const kosten = getKosten(b.id);
          const budget = Number(b.budget ?? 0);
          const pct = budget > 0 ? Math.min(Math.round(kosten / budget * 100), 100) : 0;
          const overBudget = kosten > budget && budget > 0;
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/baustellen/${b.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-[#1e3a5f]/5 rounded-xl flex items-center justify-center">
                    <HardHat className="h-4 w-4 text-[#1e3a5f]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900 leading-tight">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.gewerk}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { if (confirm('Löschen?')) deleteMutation.mutate(b.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="space-y-1.5 mb-3 text-xs text-gray-500">
                {b.auftraggeber && <div className="flex items-center gap-1.5"><Euro className="h-3 w-3" />{b.auftraggeber}</div>}
                {b.adresse && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{b.adresse}</div>}
                {(b.startdatum || b.enddatum) && <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{fmtDate(b.startdatum)} – {fmtDate(b.enddatum)}</div>}
              </div>

              {budget > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={overBudget ? 'text-red-500 font-medium' : 'text-gray-500'}>{fmtEur(kosten)}</span>
                    <span className="text-gray-400">/ {fmtEur(budget)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: overBudget ? '#ef4444' : '#1e3a5f' }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#1e3a5f] transition-colors" />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <HardHat className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">Keine Baustellen gefunden</p>
            <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Erste Baustelle anlegen</Button>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editItem ? 'Baustelle bearbeiten' : 'Neue Baustelle'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="z.B. Umbau OG Krankenhaus" /></div>
            <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e => setForm(f=>({...f,auftraggeber:e.target.value}))} /></div>
            <div><Label>Projektleiter</Label><Input value={form.projektleiter} onChange={e => setForm(f=>({...f,projektleiter:e.target.value}))} /></div>
            <div className="col-span-2"><Label>Adresse</Label><Input value={form.adresse} onChange={e => setForm(f=>({...f,adresse:e.target.value}))} /></div>
            <div><Label>Start</Label><Input type="date" value={form.startdatum} onChange={e => setForm(f=>({...f,startdatum:e.target.value}))} /></div>
            <div><Label>Ende (geplant)</Label><Input type="date" value={form.enddatum} onChange={e => setForm(f=>({...f,enddatum:e.target.value}))} /></div>
            <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f=>({...f,status:v}))}>{STATUS_OPTIONS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div>
            <div><Label>Gewerk</Label><Select value={form.gewerk} onValueChange={v => setForm(f=>({...f,gewerk:v}))}>{GEWERK_OPTIONS.map(g=><SelectOption key={g} value={g}>{g}</SelectOption>)}</Select></div>
            <div><Label>Budget (€)</Label><Input type="number" value={form.budget} onChange={e => setForm(f=>({...f,budget:Number(e.target.value)}))} /></div>
            <div><Label>Fortschritt (%)</Label><Input type="number" min="0" max="100" value={form.fortschritt} onChange={e => setForm(f=>({...f,fortschritt:Number(e.target.value)}))} /></div>
            <div className="col-span-2"><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e => setForm(f=>({...f,beschreibung:e.target.value}))} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>Abbrechen</Button>
            <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>{saveMutation.isPending ? 'Speichert...' : 'Speichern'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
