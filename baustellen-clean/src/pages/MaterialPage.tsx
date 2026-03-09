import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Package, Pencil, Trash2 } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';

const MAT_STATUS = ['bestellt','geliefert','verbraucht'];
const STATUS_COLORS: Record<string,string> = { bestellt:'bg-amber-100 text-amber-700', geliefert:'bg-blue-100 text-blue-700', verbraucht:'bg-emerald-100 text-emerald-700' };

export default function MaterialPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ baustelle_id:'', bezeichnung:'', menge:'1', einheit:'Stk', einzelpreis:'', gesamtpreis:'', status:'bestellt', datum:new Date().toISOString().split('T')[0] });

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name').order('name'); return data ?? []; } });
  const { data: materialien = [], refetch } = useQuery({ queryKey: ['bs-mat-all'], queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*, baustellen(name)').order('created_at', { ascending: false }); return data ?? []; } });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id:form.baustelle_id, bezeichnung:form.bezeichnung, menge:Number(form.menge), einheit:form.einheit, einzelpreis:Number(form.einzelpreis.replace(',','.')), gesamtpreis:Number(form.gesamtpreis.replace(',','.')) || Number(form.menge)*Number(form.einzelpreis.replace(',','.')), status:form.status, datum:form.datum };
      if (editItem) { const { error } = await supabase.from('bs_materialien').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_materialien').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Gespeichert'); setDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_materialien').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => refetch(),
  });

  const mat = materialien as any[];
  const bs = baustellen as any[];
  const total = mat.reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
  const grouped = mat.reduce<Record<string,any[]>>((acc,m) => { const k = m.baustelle_id; if(!acc[k]) acc[k]=[]; acc[k].push(m); return acc; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Material</h1><p className="text-sm text-gray-500 mt-0.5">{mat.length} Positionen · {fmtEur(total)}</p></div>
        <Button onClick={() => { setForm({ baustelle_id:'', bezeichnung:'', menge:'1', einheit:'Stk', einzelpreis:'', gesamtpreis:'', status:'bestellt', datum:new Date().toISOString().split('T')[0] }); setEditItem(null); setDialog(true); }}><Plus className="h-4 w-4 mr-1" />Neues Material</Button>
      </div>
      {Object.entries(grouped).map(([bsId, items]) => {
        const bsName = bs.find((b:any) => b.id === bsId)?.name || (items as any[])[0]?.baustellen?.name || 'Unbekannt';
        const gesamt = (items as any[]).reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
        return (
          <div key={bsId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-2"><Package className="h-4 w-4 text-orange-400" /><span className="font-semibold text-sm text-gray-700">{bsName}</span></div>
              <span className="text-sm font-bold text-gray-600">{fmtEur(gesamt)}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {(items as any[]).map(m => (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1"><p className="text-sm font-medium text-gray-800">{m.bezeichnung}</p><p className="text-xs text-gray-400">{m.menge} {m.einheit} · {m.einzelpreis} € / Stk · {fmtDate(m.datum)}</p></div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[m.status]}`}>{m.status}</span>
                  <span className="font-bold text-sm text-gray-700">{fmtEur(m.gesamtpreis)}</span>
                  <button onClick={() => { setForm({ baustelle_id:m.baustelle_id, bezeichnung:m.bezeichnung, menge:String(m.menge), einheit:m.einheit, einzelpreis:String(m.einzelpreis), gesamtpreis:String(m.gesamtpreis), status:m.status, datum:m.datum||'' }); setEditItem(m); setDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                  <button onClick={() => { if(confirm('Löschen?')) del.mutate(m.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {mat.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-300">Noch kein Material</div>}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Material bearbeiten' : 'Neues Material'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Baustelle</Label><Select value={form.baustelle_id} onValueChange={v => setForm(f=>({...f,baustelle_id:v}))}><SelectOption value="">Wählen...</SelectOption>{bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}</Select></div>
            <div><Label>Bezeichnung *</Label><Input value={form.bezeichnung} onChange={e => setForm(f=>({...f,bezeichnung:e.target.value}))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Menge</Label><Input value={form.menge} onChange={e => setForm(f=>({...f,menge:e.target.value}))} /></div>
              <div><Label>Einheit</Label><Input value={form.einheit} onChange={e => setForm(f=>({...f,einheit:e.target.value}))} /></div>
              <div><Label>Einzelpreis €</Label><Input value={form.einzelpreis} onChange={e => setForm(f=>({...f,einzelpreis:e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Gesamtpreis €</Label><Input value={form.gesamtpreis} onChange={e => setForm(f=>({...f,gesamtpreis:e.target.value}))} /></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f=>({...f,status:v}))}>{MAT_STATUS.map(s => <SelectOption key={s} value={s}>{s}</SelectOption>)}</Select></div>
            </div>
            <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={e => setForm(f=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending||!form.bezeichnung||!form.baustelle_id}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
