import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Clock, Pencil, Trash2 } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';

export default function ZeiterfassungPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ baustelle_id:'', mitarbeiter_id:'', datum:new Date().toISOString().split('T')[0], stunden:'', beschreibung:'' });

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name').order('name'); return data ?? []; } });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; } });
  const { data: stunden = [], refetch } = useQuery({ queryKey: ['bs-stunden-all'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(name,kuerzel,stundensatz), baustellen(name)').order('datum', { ascending: false }); return data ?? []; } });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id: form.baustelle_id, mitarbeiter_id: form.mitarbeiter_id, datum: form.datum, stunden: parseFloat(form.stunden.replace(',','.')), beschreibung: form.beschreibung };
      if (editItem) { const { error } = await supabase.from('bs_stundeneintraege').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_stundeneintraege').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Gespeichert'); setDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_stundeneintraege').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => refetch(),
  });

  const sw = stunden as any[];
  const emps = employees as any[];
  const bs = baustellen as any[];
  const totalH = sw.reduce((s,w)=>s+Number(w.stunden??0),0);
  const totalK = sw.reduce((s,w)=>s+Number(w.stunden??0)*Number(w.employees?.stundensatz??45),0);

  const grouped = sw.reduce<Record<string, any[]>>((acc, w) => { const d = w.datum; if (!acc[d]) acc[d] = []; acc[d].push(w); return acc; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Zeiterfassung</h1><p className="text-sm text-gray-500 mt-0.5">{totalH}h gesamt · {fmtEur(totalK)}</p></div>
        <Button onClick={() => { setForm({ baustelle_id:'', mitarbeiter_id:'', datum:new Date().toISOString().split('T')[0], stunden:'', beschreibung:'' }); setEditItem(null); setDialog(true); }}><Plus className="h-4 w-4 mr-1" />Stunden erfassen</Button>
      </div>
      {Object.entries(grouped).map(([datum, eintraege]) => {
        const tH = (eintraege as any[]).reduce((s,e)=>s+Number(e.stunden??0),0);
        return (
          <div key={datum} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" /><span className="font-semibold text-sm text-gray-700">{fmtDate(datum)}</span></div>
              <span className="text-xs text-gray-400">{tH}h</span>
            </div>
            <div className="divide-y divide-gray-50">
              {(eintraege as any[]).map(e => (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1"><p className="text-sm font-medium text-gray-800">{e.employees?.name}</p><p className="text-xs text-gray-400">{e.baustellen?.name} {e.beschreibung ? `· ${e.beschreibung}` : ''}</p></div>
                  <span className="font-mono font-bold text-gray-700">{e.stunden}h</span>
                  <span className="text-sm text-gray-400">{fmtEur(Number(e.stunden)*Number(e.employees?.stundensatz??45))}</span>
                  <button onClick={() => { setForm({ baustelle_id:e.baustelle_id, mitarbeiter_id:e.mitarbeiter_id, datum:e.datum, stunden:String(e.stunden), beschreibung:e.beschreibung||'' }); setEditItem(e); setDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                  <button onClick={() => { if(confirm('Löschen?')) del.mutate(e.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {sw.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-300">Noch keine Einträge</div>}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Bearbeiten' : 'Stunden erfassen'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Baustelle</Label><Select value={form.baustelle_id} onValueChange={v => setForm(f=>({...f,baustelle_id:v}))}><SelectOption value="">Wählen...</SelectOption>{bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}</Select></div>
            <div><Label>Mitarbeiter</Label><Select value={form.mitarbeiter_id} onValueChange={v => setForm(f=>({...f,mitarbeiter_id:v}))}><SelectOption value="">Wählen...</SelectOption>{emps.map((e:any) => <SelectOption key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectOption>)}</Select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={e => setForm(f=>({...f,datum:e.target.value}))} /></div>
              <div><Label>Stunden</Label><Input placeholder="7.5" value={form.stunden} onChange={e => setForm(f=>({...f,stunden:e.target.value}))} /></div>
            </div>
            <div><Label>Beschreibung</Label><Input placeholder="Was wurde gemacht?" value={form.beschreibung} onChange={e => setForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending||!form.baustelle_id||!form.mitarbeiter_id||!form.stunden}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
