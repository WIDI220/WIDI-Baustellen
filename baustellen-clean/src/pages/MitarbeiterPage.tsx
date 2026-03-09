import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Euro, Phone, Mail } from 'lucide-react';

const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Sanitär', 'Allgemein'];
const EMPTY = { name: '', kuerzel: '', gewerk: 'Hochbau', stundensatz: '45', telefon: '', email: '', aktiv: true };

export default function MitarbeiterPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').order('name'); return data ?? []; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, kuerzel: form.kuerzel.toUpperCase(), gewerk: form.gewerk, stundensatz: Number(form.stundensatz), telefon: form.telefon || null, email: form.email || null, aktiv: form.aktiv };
      if (editItem) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editItem ? 'Mitarbeiter aktualisiert' : 'Mitarbeiter angelegt');
      setDialog(false);
      queryClient.invalidateQueries({ queryKey: ['employees-all'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAktiv = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      const { error } = await supabase.from('employees').update({ aktiv }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees-all'] }),
  });

  const emps = employees as any[];
  const aktiv = emps.filter(e => e.aktiv);
  const inaktiv = emps.filter(e => !e.aktiv);

  const openNew = () => { setForm(EMPTY); setEditItem(null); setDialog(true); };
  const openEdit = (e: any) => {
    setForm({ name: e.name, kuerzel: e.kuerzel || '', gewerk: e.gewerk || 'Hochbau', stundensatz: String(e.stundensatz || 45), telefon: e.telefon || '', email: e.email || '', aktiv: e.aktiv });
    setEditItem(e);
    setDialog(true);
  };

  const MitarbeiterKarte = ({ e }: { e: any }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 ${!e.aktiv ? 'opacity-60' : ''}`}>
      <div className="w-11 h-11 bg-[#1e3a5f]/10 rounded-xl flex items-center justify-center flex-shrink-0">
        <span className="font-bold text-[#1e3a5f] text-sm">{e.kuerzel || e.name.substring(0,2).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm">{e.name}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400">{e.gewerk}</span>
          <span className="flex items-center gap-1 text-xs text-gray-500"><Euro className="h-3 w-3" />{e.stundensatz}/h</span>
          {e.telefon && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3 w-3" />{e.telefon}</span>}
          {e.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail className="h-3 w-3" />{e.email}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => toggleAktiv.mutate({ id: e.id, aktiv: !e.aktiv })}
          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${e.aktiv ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          {e.aktiv ? 'Aktiv' : 'Inaktiv'}
        </button>
        <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <Pencil className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mitarbeiter</h1>
          <p className="text-sm text-gray-500 mt-0.5">{aktiv.length} aktiv · {inaktiv.length} inaktiv</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Neuer Mitarbeiter</Button>
      </div>

      {/* Aktive */}
      <div className="space-y-2">
        {aktiv.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">Noch keine Mitarbeiter</p>
            <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Ersten Mitarbeiter anlegen</Button>
          </div>
        )}
        {aktiv.map(e => <MitarbeiterKarte key={e.id} e={e} />)}
      </div>

      {/* Inaktive */}
      {inaktiv.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 px-1">Inaktive Mitarbeiter</p>
          {inaktiv.map(e => <MitarbeiterKarte key={e.id} e={e} />)}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm((f: any) => ({...f, name: e.target.value}))} placeholder="Max Mustermann" />
              </div>
              <div>
                <Label>Kürzel</Label>
                <Input value={form.kuerzel} onChange={e => setForm((f: any) => ({...f, kuerzel: e.target.value.toUpperCase()}))} placeholder="MM" maxLength={4} className="uppercase" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Gewerk</Label>
                <Select value={form.gewerk} onValueChange={v => setForm((f: any) => ({...f, gewerk: v}))}>
                  {GEWERK_OPTIONS.map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)}
                </Select>
              </div>
              <div>
                <Label>Stundensatz (€)</Label>
                <Input type="number" value={form.stundensatz} onChange={e => setForm((f: any) => ({...f, stundensatz: e.target.value}))} placeholder="45" />
              </div>
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => setForm((f: any) => ({...f, telefon: e.target.value}))} placeholder="+49 ..." />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm((f: any) => ({...f, email: e.target.value}))} placeholder="name@widi.de" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
                {save.isPending ? 'Speichert...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
