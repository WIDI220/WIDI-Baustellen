import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, FileText, Pencil, Trash2 } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';

const NACH_STATUS = ['entwurf','eingereicht','genehmigt','abgelehnt'];
const STATUS_COLORS: Record<string,string> = { entwurf:'bg-gray-100 text-gray-600', eingereicht:'bg-blue-100 text-blue-700', genehmigt:'bg-emerald-100 text-emerald-700', abgelehnt:'bg-red-100 text-red-700' };

export default function NachtraegePage() {
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ baustelle_id:'', titel:'', beschreibung:'', betrag:'', status:'entwurf', datum:new Date().toISOString().split('T')[0], begruendung:'' });

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name').order('name'); return data ?? []; } });
  const { data: nachtraege = [], refetch } = useQuery({ queryKey: ['bs-nach-all'], queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*, baustellen(name)').order('created_at', { ascending: false }); return data ?? []; } });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id:form.baustelle_id, titel:form.titel, beschreibung:form.beschreibung, betrag:Number(form.betrag.replace(',','.')), status:form.status, datum:form.datum, begruendung:form.begruendung };
      if (editItem) { const { error } = await supabase.from('bs_nachtraege').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_nachtraege').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Gespeichert'); setDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_nachtraege').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => refetch(),
  });

  const nach = nachtraege as any[];
  const bs = baustellen as any[];
  const total = nach.reduce((s,n)=>s+Number(n.betrag??0),0);
  const genehmigt = nach.filter((n:any)=>n.status==='genehmigt').reduce((s,n)=>s+Number(n.betrag??0),0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Nachträge</h1><p className="text-sm text-gray-500 mt-0.5">Gesamt: {fmtEur(total)} · Genehmigt: <span className="text-emerald-600 font-medium">{fmtEur(genehmigt)}</span></p></div>
        <Button onClick={() => { setForm({ baustelle_id:'', titel:'', beschreibung:'', betrag:'', status:'entwurf', datum:new Date().toISOString().split('T')[0], begruendung:'' }); setEditItem(null); setDialog(true); }}><Plus className="h-4 w-4 mr-1" />Neuer Nachtrag</Button>
      </div>
      <div className="space-y-3">
        {nach.map((n: any) => (
          <div key={n.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div><p className="font-bold text-gray-800">{n.titel}</p><p className="text-xs text-gray-400 mt-0.5">{n.baustellen?.name} · {fmtDate(n.datum)}</p></div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{fmtEur(n.betrag)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[n.status]}`}>{n.status}</span>
                <button onClick={() => { setForm({ baustelle_id:n.baustelle_id, titel:n.titel, beschreibung:n.beschreibung||'', betrag:String(n.betrag), status:n.status, datum:n.datum||'', begruendung:n.begruendung||'' }); setEditItem(n); setDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                <button onClick={() => { if(confirm('Löschen?')) del.mutate(n.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
              </div>
            </div>
            {n.beschreibung && <p className="text-sm text-gray-600 mt-2">{n.beschreibung}</p>}
            {n.begruendung && <p className="text-xs text-gray-400 mt-1 bg-gray-50 rounded-lg p-2">{n.begruendung}</p>}
          </div>
        ))}
        {nach.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-300">Noch keine Nachträge</div>}
      </div>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Nachtrag bearbeiten' : 'Neuer Nachtrag'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Baustelle</Label><Select value={form.baustelle_id} onValueChange={v => setForm(f=>({...f,baustelle_id:v}))}><SelectOption value="">Wählen...</SelectOption>{bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}</Select></div>
            <div><Label>Titel *</Label><Input value={form.titel} onChange={e => setForm(f=>({...f,titel:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Betrag €</Label><Input value={form.betrag} onChange={e => setForm(f=>({...f,betrag:e.target.value}))} /></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f=>({...f,status:v}))}>{NACH_STATUS.map(s => <SelectOption key={s} value={s}>{s}</SelectOption>)}</Select></div>
            </div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e => setForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <div><Label>Begründung</Label><Textarea value={form.begruendung} onChange={e => setForm(f=>({...f,begruendung:e.target.value}))} /></div>
            <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={e => setForm(f=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending||!form.titel||!form.baustelle_id}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
