import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, Trash2, Upload } from 'lucide-react';
import { fmtDate } from '@/lib/utils';

const FOTO_KAT = ['vorher','nachher','maengel','abnahme','fortschritt','sonstiges'];
const FOTO_KAT_LABELS: Record<string,string> = { vorher:'Vorher', nachher:'Nachher', maengel:'Mängel', abnahme:'Abnahme', fortschritt:'Fortschritt', sonstiges:'Sonstiges' };
const FOTO_KAT_COLORS: Record<string,string> = { vorher:'bg-gray-100 text-gray-600', nachher:'bg-emerald-100 text-emerald-700', maengel:'bg-red-100 text-red-700', abnahme:'bg-blue-100 text-blue-700', fortschritt:'bg-purple-100 text-purple-700', sonstiges:'bg-orange-100 text-orange-600' };

export default function FotosPage() {
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ baustelle_id:'', beschreibung:'', kategorie:'fortschritt' });
  const [uploading, setUploading] = useState(false);
  const [katFilter, setKatFilter] = useState('all');
  const [bsFilter, setBsFilter] = useState('all');

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name').order('name'); return data ?? []; } });
  const { data: fotos = [], refetch } = useQuery({ queryKey: ['bs-fotos-all'], queryFn: async () => { const { data } = await supabase.from('bs_fotos').select('*, baustellen(name)').order('created_at', { ascending: false }); return data ?? []; } });

  const handleUpload = async (file: File) => {
    if (!form.baustelle_id) { toast.error('Bitte Baustelle wählen'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${form.baustelle_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('baustellen-fotos').upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('baustellen-fotos').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('bs_fotos').insert({ baustelle_id: form.baustelle_id, url: urlData.publicUrl, beschreibung: form.beschreibung, kategorie: form.kategorie, datum: new Date().toISOString().split('T')[0] });
      if (dbErr) throw dbErr;
      toast.success('Foto hochgeladen'); setDialog(false); refetch();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_fotos').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => refetch(),
  });

  const fts = fotos as any[];
  const bs = baustellen as any[];
  const filtered = fts.filter(f => (katFilter === 'all' || f.kategorie === katFilter) && (bsFilter === 'all' || f.baustelle_id === bsFilter));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Fotodokumentation</h1><p className="text-sm text-gray-500 mt-0.5">{filtered.length} Fotos</p></div>
        <Button onClick={() => setDialog(true)}><Camera className="h-4 w-4 mr-1" />Foto hochladen</Button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2">
        <Select value={bsFilter} onValueChange={setBsFilter}>
          <SelectOption value="all">Alle Baustellen</SelectOption>
          {bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}
        </Select>
        <div className="flex gap-1.5 flex-wrap">
          {['all',...FOTO_KAT].map(k => (
            <button key={k} onClick={() => setKatFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${katFilter===k ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {k === 'all' ? 'Alle' : FOTO_KAT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Camera className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-300">Noch keine Fotos</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((f: any) => (
            <div key={f.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group relative">
              <img src={f.url} alt={f.beschreibung} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
              <button onClick={() => { if(confirm('Foto löschen?')) del.mutate(f.id); }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <div className="p-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${FOTO_KAT_COLORS[f.kategorie]}`}>{FOTO_KAT_LABELS[f.kategorie]}</span>
                <p className="text-xs text-gray-500 mt-1">{f.baustellen?.name}</p>
                {f.beschreibung && <p className="text-xs text-gray-600 truncate">{f.beschreibung}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(f.datum)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Foto hochladen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Baustelle *</Label><Select value={form.baustelle_id} onValueChange={v => setForm(f=>({...f,baustelle_id:v}))}><SelectOption value="">Wählen...</SelectOption>{bs.map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}</Select></div>
            <div><Label>Kategorie</Label><Select value={form.kategorie} onValueChange={v => setForm(f=>({...f,kategorie:v}))}>{FOTO_KAT.map(k => <SelectOption key={k} value={k}>{FOTO_KAT_LABELS[k]}</SelectOption>)}</Select></div>
            <div><Label>Beschreibung</Label><Input placeholder="z.B. Zustand vor Renovierung" value={form.beschreibung} onChange={e => setForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#1e3a5f] transition-colors">
              <Upload className="h-8 w-8 text-gray-300 mb-2" />
              <span className="text-sm text-gray-400">{uploading ? 'Lädt hoch...' : 'Foto auswählen & hochladen'}</span>
              <input type="file" accept="image/*" className="hidden" disabled={uploading || !form.baustelle_id} onChange={e => { if(e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
            </label>
            {!form.baustelle_id && <p className="text-xs text-amber-500 text-center">Bitte zuerst Baustelle auswählen</p>}
            <Button variant="outline" className="w-full" onClick={() => setDialog(false)}>Schließen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
