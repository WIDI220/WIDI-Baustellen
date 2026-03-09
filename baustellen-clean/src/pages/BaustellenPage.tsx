import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, HardHat, Euro, TrendingUp, ArrowRight, Pencil, Trash2, Calendar } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';

const STATUS_OPTIONS = [
  { value: 'offen', label: 'Offen', bg:'bg-gray-100', text:'text-gray-600' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg:'bg-blue-100', text:'text-blue-700' },
  { value: 'pausiert', label: 'Pausiert', bg:'bg-amber-100', text:'text-amber-700' },
  { value: 'abgeschlossen', label: 'Abgeschlossen', bg:'bg-emerald-100', text:'text-emerald-700' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg:'bg-purple-100', text:'text-purple-700' },
];
const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const EMPTY = { name:'', adresse:'', auftraggeber:'', startdatum:'', enddatum:'', status:'offen', gewerk:'Hochbau', projektleiter:'', budget:'', beschreibung:'' };

export default function BaustellenPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);

  // Alle Daten laden für korrekte Berechnungen
  const { data: baustellen = [] } = useQuery({
    queryKey: ['baustellen-list'],
    queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; },
  });
  const { data: stunden = [] } = useQuery({
    queryKey: ['bs-stunden-list'],
    queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id, stunden, employees(stundensatz)'); return data ?? []; },
  });
  const { data: materialien = [] } = useQuery({
    queryKey: ['bs-mat-list'],
    queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id, gesamtpreis'); return data ?? []; },
  });
  const { data: nachtraege = [] } = useQuery({
    queryKey: ['bs-nach-list'],
    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id, betrag, status'); return data ?? []; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, budget: Number(form.budget) || 0, fortschritt: 0, startdatum: form.startdatum || null, enddatum: form.enddatum || null };
      if (editItem) { const { error } = await supabase.from('baustellen').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('baustellen').insert(payload); if (error) throw error; }
    },
    onSuccess: () => {
      toast.success(editItem ? 'Baustelle aktualisiert' : 'Baustelle angelegt');
      setShowDialog(false);
      setEditItem(null);
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      queryClient.invalidateQueries({ queryKey: ['bs-dashboard'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('baustellen').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Gelöscht'); queryClient.invalidateQueries({ queryKey: ['baustellen-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const bs = baustellen as any[];
  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];

  const filtered = bs.filter(b => {
    const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) || (b.auftraggeber||'').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openNew = () => { setForm(EMPTY); setEditItem(null); setShowDialog(true); };
  const openEdit = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setForm({ name:b.name, adresse:b.adresse||'', auftraggeber:b.auftraggeber||'', startdatum:b.startdatum||'', enddatum:b.enddatum||'', status:b.status, gewerk:b.gewerk||'Hochbau', projektleiter:b.projektleiter||'', budget:String(b.budget||''), beschreibung:b.beschreibung||'' });
    setEditItem(b);
    setShowDialog(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Baustellen</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} von {bs.length}</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Neue Baustelle</Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Suche nach Name, Auftraggeber..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter} className="w-44">
          <SelectOption value="all">Alle Status</SelectOption>
          {STATUS_OPTIONS.map(s => <SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}
        </Select>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <HardHat className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Keine Baustellen gefunden</p>
            <Button className="mt-4" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Anlegen</Button>
          </div>
        )}
        {filtered.map((b: any) => {
          const st = STATUS_OPTIONS.find(s => s.value === b.status) ?? STATUS_OPTIONS[0];
          const k = berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0));
          return (
            <div key={b.id} onClick={() => navigate(`/baustellen/${b.id}`)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#1e3a5f]/5 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <HardHat className="h-5 w-5 text-[#1e3a5f]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900">{b.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{b.gewerk}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{b.auftraggeber || '–'}{b.adresse ? ` · ${b.adresse}` : ''}</p>

                  {/* Budget-Leiste */}
                  {k.effektivBudget > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          <span className={k.overBudget ? 'text-red-500 font-semibold' : ''}>
                            {fmtEur(k.gesamtkosten)} Kosten
                          </span>
                          {k.nachtragGenehmigt > 0 && (
                            <span className="text-emerald-600 font-medium">(+{fmtEur(k.nachtragGenehmigt)} Nachträge)</span>
                          )}
                        </span>
                        <span className="font-medium">{fmtEur(k.effektivBudget)} Budget · {k.pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${k.pct}%`, background: k.overBudget ? '#ef4444' : k.pct > 80 ? '#f59e0b' : '#1e3a5f' }} />
                      </div>
                      {k.overBudget && <p className="text-xs text-red-500 font-medium mt-1">⚠ Budget um {fmtEur(k.gesamtkosten - k.effektivBudget)} überschritten!</p>}
                    </div>
                  )}

                  {/* Kosten Breakdown */}
                  {(k.personalkosten > 0 || k.materialkosten > 0) && (
                    <div className="flex gap-3 mt-2">
                      {k.personalkosten > 0 && <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Personal: {fmtEur(k.personalkosten)}</span>}
                      {k.materialkosten > 0 && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Material: {fmtEur(k.materialkosten)}</span>}
                      {k.nachtragEingereicht > 0 && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">⏳ {fmtEur(k.nachtragEingereicht)} eingereicht</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {b.enddatum && <span className="text-xs text-gray-400 flex items-center gap-1 mr-2"><Calendar className="h-3 w-3" />{fmtDate(b.enddatum)}</span>}
                  <button onClick={e => openEdit(b, e)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); if(confirm(`"${b.name}" wirklich löschen?`)) deleteMutation.mutate(b.id); }} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                  <ArrowRight className="h-4 w-4 text-gray-300 ml-1" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if(!v){setEditItem(null);setForm(EMPTY);} }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? 'Baustelle bearbeiten' : 'Neue Baustelle'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Name *</Label><Input value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))} placeholder="z.B. Klinikum – Station 3 Renovierung" autoFocus /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e=>setForm((f:any)=>({...f,auftraggeber:e.target.value}))} placeholder="Klinikum Hellersen" /></div>
              <div><Label>Adresse / Ort</Label><Input value={form.adresse} onChange={e=>setForm((f:any)=>({...f,adresse:e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Gewerk</Label><Select value={form.gewerk} onValueChange={v=>setForm((f:any)=>({...f,gewerk:v}))}>{GEWERK_OPTIONS.map(g=><SelectOption key={g} value={g}>{g}</SelectOption>)}</Select></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v=>setForm((f:any)=>({...f,status:v}))}>{STATUS_OPTIONS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div>
              <div><Label>Budget €</Label><Input type="number" value={form.budget} onChange={e=>setForm((f:any)=>({...f,budget:e.target.value}))} placeholder="5000" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Startdatum</Label><Input type="date" value={form.startdatum} onChange={e=>setForm((f:any)=>({...f,startdatum:e.target.value}))} /></div>
              <div><Label>Frist</Label><Input type="date" value={form.enddatum} onChange={e=>setForm((f:any)=>({...f,enddatum:e.target.value}))} /></div>
            </div>
            <div><Label>Projektleiter</Label><Input value={form.projektleiter} onChange={e=>setForm((f:any)=>({...f,projektleiter:e.target.value}))} /></div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e=>setForm((f:any)=>({...f,beschreibung:e.target.value}))} className="min-h-[80px]" /></div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={()=>setShowDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending||!form.name}>
                {saveMutation.isPending?'Speichert...':'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
