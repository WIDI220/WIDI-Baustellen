import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Clock, Pencil, Trash2, Users, Euro } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const EMPTY = { baustelle_id:'', mitarbeiter_id:'', datum:new Date().toISOString().split('T')[0], stunden:'', beschreibung:'' };

export default function ZeiterfassungPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [filterMa, setFilterMa] = useState('all');
  const [filterBs, setFilterBs] = useState('all');

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name').order('name'); return data ?? []; } });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel,stundensatz').eq('aktiv', true).order('name'); return data ?? []; } });
  const { data: stunden = [] } = useQuery({ queryKey: ['bs-stunden-all'], queryFn: async () => { const { data, error } = await supabase.from('bs_stundeneintraege').select('*, employees(id,name,kuerzel,stundensatz), baustellen(id,name)').order('datum', { ascending: false }); if (error) throw error; return data ?? []; } });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.baustelle_id) throw new Error('Bitte Baustelle wählen');
      if (!form.mitarbeiter_id) throw new Error('Bitte Mitarbeiter wählen');
      if (!form.stunden) throw new Error('Bitte Stunden eingeben');
      const payload = { baustelle_id:form.baustelle_id, mitarbeiter_id:form.mitarbeiter_id, datum:form.datum, stunden:parseFloat(String(form.stunden).replace(',','.')), beschreibung:form.beschreibung||null };
      if (editItem) { const { error } = await supabase.from('bs_stundeneintraege').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_stundeneintraege').insert(payload); if (error) throw error; }
    },
    onSuccess: () => {
      toast.success('Stunden gespeichert');
      setDialog(false); setEditItem(null); setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ['bs-stunden-all'] });
      queryClient.invalidateQueries({ queryKey: ['bs-stunden-dash'] });
      queryClient.invalidateQueries({ queryKey: ['bs-stunden'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_stundeneintraege').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bs-stunden-all'] }); queryClient.invalidateQueries({ queryKey: ['bs-stunden-dash'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const sw = stunden as any[];
  const emps = employees as any[];
  const bs = baustellen as any[];

  const filtered = sw.filter(w => {
    if (filterMa !== 'all' && w.mitarbeiter_id !== filterMa) return false;
    if (filterBs !== 'all' && w.baustelle_id !== filterBs) return false;
    return true;
  });

  const totalH = filtered.reduce((s,w) => s + Number(w.stunden??0), 0);
  const totalK = filtered.reduce((s,w) => s + Number(w.stunden??0) * Number(w.employees?.stundensatz??38.08), 0);

  // Stunden pro Mitarbeiter Chart
  const stundenProMa = emps.map(e => ({
    name: e.kuerzel || e.name.split(' ')[0],
    fullName: e.name,
    stunden: Math.round(sw.filter(w => w.mitarbeiter_id === e.id).reduce((s,w) => s+Number(w.stunden??0), 0) * 10) / 10,
    kosten: sw.filter(w => w.mitarbeiter_id === e.id).reduce((s,w) => s+Number(w.stunden??0)*Number(w.employees?.stundensatz??38.08), 0),
  })).filter(x => x.stunden > 0).sort((a,b) => b.stunden - a.stunden);

  // Gruppiert nach Datum
  const grouped = filtered.reduce<Record<string,any[]>>((acc, w) => {
    if (!acc[w.datum]) acc[w.datum] = [];
    acc[w.datum].push(w);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Zeiterfassung</h1>
          <p className="text-sm text-gray-500 mt-0.5">{Math.round(totalH*10)/10}h · {fmtEur(totalK)} · {filtered.length} Einträge</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setEditItem(null); setDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" />Stunden erfassen
        </Button>
      </div>

      {/* Grafik */}
      {stundenProMa.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Stunden pro Mitarbeiter</h3>
          <p className="text-xs text-gray-400 mb-4">Alle Baustellen gesamt</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stundenProMa} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: any) => [`${v}h`, 'Stunden']} />
                <Bar dataKey="stunden" fill="#1e3a5f" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {stundenProMa.map((m, i) => (
                <div key={m.name} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{background:`hsl(${210+i*35},65%,45%)`}}>{m.name.substring(0,2)}</div>
                    <span className="text-sm font-medium text-gray-700">{m.fullName}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-800">{m.stunden}h</p>
                    <p className="text-xs text-gray-400">{fmtEur(m.kosten)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterMa} onValueChange={setFilterMa} className="flex-1 min-w-40">
          <SelectOption value="all">Alle Mitarbeiter</SelectOption>
          {emps.map((e:any) => <SelectOption key={e.id} value={e.id}>{e.name}</SelectOption>)}
        </Select>
        <Select value={filterBs} onValueChange={setFilterBs} className="flex-1 min-w-40">
          <SelectOption value="all">Alle Baustellen</SelectOption>
          {bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}
        </Select>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {Object.keys(grouped).length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Clock className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Noch keine Stunden erfasst</p>
          </div>
        )}
        {Object.entries(grouped).map(([datum, eintraege]) => {
          const tagH = eintraege.reduce((s,w) => s+Number(w.stunden??0), 0);
          const tagK = eintraege.reduce((s,w) => s+Number(w.stunden??0)*Number(w.employees?.stundensatz??38.08), 0);
          return (
            <div key={datum} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">{fmtDate(datum)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500">{Math.round(tagH*10)/10}h</span>
                  <span className="text-xs font-medium text-gray-600">{fmtEur(tagK)}</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {(eintraege as any[]).map((w: any) => (
                  <div key={w.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Clock className="h-4 w-4 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{w.employees?.name || '–'}</p>
                      <p className="text-xs text-gray-400 truncate">{w.baustellen?.name || '–'}{w.beschreibung ? ` · ${w.beschreibung}` : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-bold text-gray-700 text-sm">{w.stunden}h</p>
                      <p className="text-xs text-gray-400">{fmtEur(Number(w.stunden)*Number(w.employees?.stundensatz??38.08))}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setForm({ baustelle_id:w.baustelle_id, mitarbeiter_id:w.mitarbeiter_id, datum:w.datum, stunden:String(w.stunden), beschreibung:w.beschreibung||'' }); setEditItem(w); setDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                      <button onClick={() => { if(confirm('Eintrag löschen?')) del.mutate(w.id); }} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialog} onOpenChange={v => { setDialog(v); if(!v){setEditItem(null);setForm(EMPTY);} }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Stunden bearbeiten' : 'Stunden erfassen'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Baustelle *</Label>
              <Select value={form.baustelle_id} onValueChange={v=>setForm((f:any)=>({...f,baustelle_id:v}))}>
                <SelectOption value="">Bitte wählen...</SelectOption>
                {bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}
              </Select>
            </div>
            <div><Label>Mitarbeiter *</Label>
              <Select value={form.mitarbeiter_id} onValueChange={v=>setForm((f:any)=>({...f,mitarbeiter_id:v}))}>
                <SelectOption value="">Bitte wählen...</SelectOption>
                {emps.map((e:any) => <SelectOption key={e.id} value={e.id}>{e.name}</SelectOption>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Datum *</Label><Input type="date" value={form.datum} onChange={e=>setForm((f:any)=>({...f,datum:e.target.value}))} /></div>
              <div><Label>Stunden *</Label><Input placeholder="z.B. 7.5" value={form.stunden} onChange={e=>setForm((f:any)=>({...f,stunden:e.target.value}))} /></div>
            </div>
            <div><Label>Tätigkeit</Label><Input placeholder="Was wurde gemacht?" value={form.beschreibung} onChange={e=>setForm((f:any)=>({...f,beschreibung:e.target.value}))} /></div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={()=>setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={()=>save.mutate()} disabled={save.isPending}>
                {save.isPending?'Speichert...':'Speichern'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
