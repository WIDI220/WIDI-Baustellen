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
import { Plus, Search, HardHat, ArrowRight, Pencil, Trash2, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import { fmtEur, fmtDate } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';

const STATUS_OPTIONS = [
  { value:'offen',          label:'Offen',          dot:'#94a3b8', bg:'#f8fafc', text:'#64748b' },
  { value:'in_bearbeitung', label:'In Bearbeitung',  dot:'#3b82f6', bg:'#eff6ff', text:'#1d4ed8' },
  { value:'pausiert',       label:'Pausiert',        dot:'#f59e0b', bg:'#fffbeb', text:'#b45309' },
  { value:'abgeschlossen',  label:'Abgeschlossen',   dot:'#10b981', bg:'#f0fdf4', text:'#065f46' },
  { value:'abgerechnet',    label:'Abgerechnet',     dot:'#8b5cf6', bg:'#faf5ff', text:'#5b21b6' },
];
const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const EMPTY = { name:'', adresse:'', auftraggeber:'', startdatum:'', enddatum:'', status:'offen', gewerk:'Hochbau', projektleiter:'', budget:'', beschreibung:'' };

export default function BaustellenPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at',{ascending:false}); return data??[]; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-list'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id,stunden,employees(stundensatz)'); return data??[]; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-list'],     queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id,gesamtpreis'); return data??[]; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-list'],    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id,betrag,status'); return data??[]; } });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {...form, budget:Number(form.budget)||0, fortschritt:0, startdatum:form.startdatum||null, enddatum:form.enddatum||null};
      if (editItem) { const {error}=await supabase.from('baustellen').update(payload).eq('id',editItem.id); if(error)throw error; }
      else { const {error}=await supabase.from('baustellen').insert(payload); if(error)throw error; }
    },
    onSuccess: () => { toast.success(editItem?'Aktualisiert':'Baustelle angelegt'); setDialog(false); setEditItem(null); setForm(EMPTY); queryClient.invalidateQueries({queryKey:['baustellen-list']}); queryClient.invalidateQueries({queryKey:['bs-dashboard']}); },
    onError: (e:any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id:string) => { const {error}=await supabase.from('baustellen').delete().eq('id',id); if(error)throw error; },
    onSuccess: () => { toast.success('Gelöscht'); queryClient.invalidateQueries({queryKey:['baustellen-list']}); },
  });

  const bs = baustellen as any[], sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[];

  const filtered = bs.filter(b => {
    if (search && !b.name.toLowerCase().includes(search.toLowerCase()) && !(b.auftraggeber||'').toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  const openEdit = (b:any, e:React.MouseEvent) => { e.stopPropagation(); setForm({name:b.name,adresse:b.adresse||'',auftraggeber:b.auftraggeber||'',startdatum:b.startdatum||'',enddatum:b.enddatum||'',status:b.status,gewerk:b.gewerk||'Hochbau',projektleiter:b.projektleiter||'',budget:String(b.budget||''),beschreibung:b.beschreibung||''}); setEditItem(b); setDialog(true); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:'1.5rem',color:'#0f1f3d',letterSpacing:'-.02em'}}>Baustellen</h1>
          <p className="text-sm mt-1" style={{color:'#6b7a99'}}>{filtered.length} von {bs.length}</p>
        </div>
        <Button onClick={() => {setForm(EMPTY);setEditItem(null);setDialog(true);}}><Plus className="h-4 w-4" />Neue Baustelle</Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:'#9ca3af'}} />
          <Input placeholder="Name oder Auftraggeber..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter} className="w-44">
          <SelectOption value="all">Alle Status</SelectOption>
          {STATUS_OPTIONS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}
        </Select>
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card p-14 text-center">
            <HardHat className="h-10 w-10 mx-auto mb-3" style={{color:'#e5e9f2'}} />
            <p className="text-sm" style={{color:'#9ca3af'}}>Keine Baustellen gefunden</p>
            <Button className="mt-4" size="sm" onClick={()=>{setForm(EMPTY);setDialog(true);}}><Plus className="h-4 w-4" />Erste anlegen</Button>
          </div>
        )}
        {filtered.map((b:any) => {
          const st = STATUS_OPTIONS.find(s=>s.value===b.status)??STATUS_OPTIONS[0];
          const k = berechneKosten(b.id, sw, mat, nach, Number(b.budget??0));
          const daysLeft = b.enddatum ? Math.round((new Date(b.enddatum).getTime()-Date.now())/86400000) : null;
          const fristAlert = daysLeft !== null && daysLeft <= 7 && b.status !== 'abgeschlossen' && b.status !== 'abgerechnet';
          return (
            <div key={b.id} onClick={()=>navigate(`/baustellen/${b.id}`)} className="card p-5 cursor-pointer transition-all hover:shadow-md" style={{borderLeft:`3px solid ${st.dot}`}}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:`${st.dot}18`}}>
                  <HardHat className="h-5 w-5" style={{color:st.dot}} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold" style={{color:'#0f1f3d'}}>{b.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:st.bg, color:st.text}}>{st.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'#f4f6fa', color:'#6b7a99'}}>{b.gewerk}</span>
                    {fristAlert && <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{background:'rgba(239,68,68,.1)', color:'#dc2626'}}><AlertTriangle className="h-2.5 w-2.5" />{daysLeft<0?`${Math.abs(daysLeft)}d überfällig`:`${daysLeft}d`}</span>}
                  </div>
                  <p className="text-sm mt-0.5" style={{color:'#9ca3af'}}>{b.auftraggeber||'–'}{b.adresse?` · ${b.adresse}`:''}</p>

                  {k.effektivBudget > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-1.5" style={{color:'#6b7a99'}}>
                          <TrendingUp className="h-3 w-3" />
                          <span className={k.overBudget ? 'font-semibold' : ''} style={{color: k.overBudget?'#ef4444':'#6b7a99'}}>
                            {fmtEur(k.gesamtkosten)}
                          </span>
                          {k.nachtragGenehmigt > 0 && <span className="font-medium" style={{color:'#10b981'}}>+{fmtEur(k.nachtragGenehmigt)} Nachträge</span>}
                        </span>
                        <span className="font-medium" style={{color:'#0f1f3d'}}>{fmtEur(k.effektivBudget)} · {k.pct}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{height:'5px', background:'#eef1f9'}}>
                        <div className="h-full rounded-full progress-bar" style={{width:`${Math.min(k.pct,100)}%`, background:k.overBudget?'#ef4444':k.pct>80?'#f59e0b':'#1e3a5f'}} />
                      </div>
                      {(k.personalkosten > 0 || k.materialkosten > 0) && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {k.personalkosten>0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'rgba(139,92,246,.08)', color:'#7c3aed'}}>Personal: {fmtEur(k.personalkosten)}</span>}
                          {k.materialkosten>0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'rgba(249,115,22,.08)', color:'#c2410c'}}>Material: {fmtEur(k.materialkosten)}</span>}
                          {k.nachtragEingereicht>0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'rgba(59,130,246,.08)', color:'#1d4ed8'}}>⏳ {fmtEur(k.nachtragEingereicht)} ausstehend</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {b.enddatum && <span className="text-xs flex items-center gap-1 mr-1" style={{color:'#9ca3af'}}><Calendar className="h-3 w-3" />{fmtDate(b.enddatum)}</span>}
                  <button onClick={e=>openEdit(b,e)} className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" style={{color:'#9ca3af'}} /></button>
                  <button onClick={e=>{e.stopPropagation();if(confirm(`"${b.name}" löschen?`))del.mutate(b.id);}} className="p-1.5 rounded-lg transition-colors hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" style={{color:'#fca5a5'}} /></button>
                  <ArrowRight className="h-4 w-4 ml-1" style={{color:'#d1d5db'}} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialog} onOpenChange={v=>{setDialog(v);if(!v){setEditItem(null);setForm(EMPTY);}}}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?'Bearbeiten':'Neue Baustelle'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Name *</Label><Input value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))} autoFocus placeholder="z.B. Klinikum – Station 3 Renovierung" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e=>setForm((f:any)=>({...f,auftraggeber:e.target.value}))} /></div>
              <div><Label>Adresse / Ort</Label><Input value={form.adresse} onChange={e=>setForm((f:any)=>({...f,adresse:e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Gewerk</Label><Select value={form.gewerk} onValueChange={v=>setForm((f:any)=>({...f,gewerk:v}))}>{GEWERK_OPTIONS.map(g=><SelectOption key={g} value={g}>{g}</SelectOption>)}</Select></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v=>setForm((f:any)=>({...f,status:v}))}>{STATUS_OPTIONS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div>
              <div><Label>Budget €</Label><Input type="number" value={form.budget} onChange={e=>setForm((f:any)=>({...f,budget:e.target.value}))} placeholder="0" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><Input type="date" value={form.startdatum} onChange={e=>setForm((f:any)=>({...f,startdatum:e.target.value}))} /></div>
              <div><Label>Frist</Label><Input type="date" value={form.enddatum} onChange={e=>setForm((f:any)=>({...f,enddatum:e.target.value}))} /></div>
            </div>
            <div><Label>Projektleiter</Label><Input value={form.projektleiter} onChange={e=>setForm((f:any)=>({...f,projektleiter:e.target.value}))} /></div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e=>setForm((f:any)=>({...f,beschreibung:e.target.value}))} className="min-h-[70px]" /></div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={()=>setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={()=>save.mutate()} disabled={save.isPending||!form.name}>{save.isPending?'Speichert...':'Speichern'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
