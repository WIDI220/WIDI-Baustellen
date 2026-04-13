import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Archive, HardHat, ArrowRight, Calendar, TrendingUp, Euro, Clock, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectOption } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export default function ArchivPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('baustellen').update({
        name:        form.name,
        status:      form.status,
        gewerk:      form.gewerk,
        auftraggeber:form.auftraggeber || null,
        adresse:     form.adresse      || null,
        startdatum:  form.startdatum   || null,
        enddatum:    form.enddatum     || null,
        beschreibung:form.beschreibung || null,
        budget:      Number(form.budget) || 0,
      }).eq('id', editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Baustelle gespeichert');
      queryClient.invalidateQueries({ queryKey: ['baustellen-archiv'] });
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      setEditItem(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditItem(b);
    setForm({
      name:        b.name || '',
      status:      b.status || 'abgeschlossen',
      gewerk:      b.gewerk || 'Hochbau',
      auftraggeber:b.auftraggeber || '',
      adresse:     b.adresse || '',
      startdatum:  b.startdatum || '',
      enddatum:    b.enddatum || '',
      beschreibung:b.beschreibung || '',
      budget:      String(b.budget || ''),
    });
  };

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-archiv'],
    staleTime: 0,
    refetchOnMount: true, queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').in('status',['abgeschlossen','abgerechnet']).order('created_at',{ascending:false}); return data??[]; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-list'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id,stunden,employees(stundensatz)'); return data??[]; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-list'],     queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id,gesamtpreis'); return data??[]; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-list'],    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id,betrag,status'); return data??[]; } });

  const bs = baustellen as any[], sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[];

  // Gesamtstatistik Archiv
  const alleKosten = bs.map(b => ({...b, ...berechneKosten(b.id, sw, mat, nach, Number(b.budget??0))}));
  const gesamtUmsatz = alleKosten.reduce((s,k) => s+k.effektivBudget, 0);
  const gesamtKosten = alleKosten.reduce((s,k) => s+k.gesamtkosten, 0);
  const gesamtStunden = sw.filter(w => bs.some(b=>b.id===w.baustelle_id)).reduce((s,w)=>s+Number(w.stunden??0),0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:'1.5rem',color:'#0f1f3d',letterSpacing:'-.02em'}}>Archiv</h1>
        <p className="text-sm mt-1" style={{color:'#6b7a99'}}>{bs.length} abgeschlossene Baustellen</p>
      </div>

      {/* Gesamt-KPIs */}
      {bs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Gesamtumsatz', value:fmtEur(gesamtUmsatz), icon:Euro, c:'#1e3a5f', bg:'rgba(30,58,95,.08)' },
            { label:'Gesamtkosten', value:fmtEur(gesamtKosten), icon:TrendingUp, c:'#10b981', bg:'rgba(16,185,129,.08)' },
            { label:'Gesamtstunden', value:`${Math.round(gesamtStunden*10)/10}h`, icon:Clock, c:'#8b5cf6', bg:'rgba(139,92,246,.08)' },
          ].map(k => (
            <div key={k.label} className="card kpi-card p-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{background:k.bg}}>
                <k.icon className="h-4 w-4" style={{color:k.c}} />
              </div>
              <p className="text-xl font-bold" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{k.value}</p>
              <p className="text-xs mt-0.5" style={{color:'#6b7a99'}}>{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Liste */}
      {bs.length === 0 ? (
        <div className="card p-16 text-center">
          <Archive className="h-12 w-12 mx-auto mb-4" style={{color:'#e5e9f2'}} />
          <p className="font-semibold" style={{color:'#9ca3af'}}>Noch keine archivierten Baustellen</p>
          <p className="text-sm mt-1" style={{color:'#d1d5db'}}>Baustellen werden hier angezeigt wenn sie auf "Abgeschlossen" oder "Abgerechnet" gesetzt werden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alleKosten.map((b: any) => {
            const st = STATUS_OPTIONS.find(s=>s.value===b.status)??STATUS_OPTIONS[0];
            const marge = b.effektivBudget - b.gesamtkosten;
            const margePos = marge >= 0;

            return (
              <div key={b.id} onClick={()=>navigate(`/baustellen/${b.id}`)}
                className="card p-5 cursor-pointer transition-all hover:shadow-md"
                style={{borderLeft:`3px solid ${st.dot}`}}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:`${st.dot}18`}}>
                    <Archive className="h-5 w-5" style={{color:st.dot}} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold" style={{color:'#0f1f3d'}}>{b.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:st.bg, color:st.text}}>{st.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'#f4f6fa', color:'#6b7a99'}}>{b.gewerk}</span>
                    </div>
                    <p className="text-sm mt-0.5" style={{color:'#9ca3af'}}>{b.auftraggeber||'–'}{b.adresse?` · ${b.adresse}`:''}</p>

                    {/* Abrechnung */}
                    <div className="flex gap-4 mt-3 flex-wrap">
                      <div className="text-xs">
                        <span style={{color:'#9ca3af'}}>Budget </span>
                        <span className="font-semibold" style={{color:'#0f1f3d'}}>{fmtEur(b.effektivBudget)}</span>
                      </div>
                      <div className="text-xs">
                        <span style={{color:'#9ca3af'}}>Kosten </span>
                        <span className="font-semibold" style={{color:'#0f1f3d'}}>{fmtEur(b.gesamtkosten)}</span>
                      </div>
                      <div className="text-xs">
                        <span style={{color:'#9ca3af'}}>Marge </span>
                        <span className="font-bold" style={{color: margePos ? '#10b981' : '#ef4444'}}>
                          {margePos ? '+' : ''}{fmtEur(marge)}
                          {b.effektivBudget > 0 && <span className="font-normal ml-1">({Math.round(marge/b.effektivBudget*100)}%)</span>}
                        </span>
                      </div>
                      {b.nachtragGenehmigt > 0 && (
                        <div className="text-xs">
                          <span style={{color:'#9ca3af'}}>Nachträge </span>
                          <span className="font-semibold" style={{color:'#10b981'}}>{fmtEur(b.nachtragGenehmigt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    {b.enddatum && <span className="text-xs flex items-center gap-1" style={{color:'#9ca3af'}}><Calendar className="h-3 w-3" />{fmtDate(b.enddatum)}</span>}
                    <button
                      onClick={(e) => openEdit(b, e)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{background:'#f4f6fa', border:'1px solid #e5e9f2'}}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#e5e9f2'}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='#f4f6fa'}
                      title="Bearbeiten">
                      <Pencil className="h-3.5 w-3.5" style={{color:'#6b7a99'}} />
                    </button>
                    <ArrowRight className="h-4 w-4" style={{color:'#d1d5db'}} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Bearbeiten Dialog */}
      <Dialog open={!!editItem} onOpenChange={v => { if(!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Baustelle bearbeiten</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div><Label>Name</Label><Input value={form.name||''} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status||''} onValueChange={v=>setForm((f:any)=>({...f,status:v}))}>
                  {STATUS_OPTIONS.map(o=><SelectOption key={o.value} value={o.value}>{o.label}</SelectOption>)}
                </Select>
              </div>
              <div>
                <Label>Gewerk</Label>
                <Select value={form.gewerk||''} onValueChange={v=>setForm((f:any)=>({...f,gewerk:v}))}>
                  {GEWERK_OPTIONS.map(g=><SelectOption key={g} value={g}>{g}</SelectOption>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber||''} onChange={e=>setForm((f:any)=>({...f,auftraggeber:e.target.value}))} /></div>
              <div><Label>Budget (€)</Label><Input type="number" value={form.budget||''} onChange={e=>setForm((f:any)=>({...f,budget:e.target.value}))} /></div>
            </div>
            <div><Label>Adresse</Label><Input value={form.adresse||''} onChange={e=>setForm((f:any)=>({...f,adresse:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Startdatum</Label><Input type="date" value={form.startdatum||''} onChange={e=>setForm((f:any)=>({...f,startdatum:e.target.value}))} /></div>
              <div><Label>Enddatum</Label><Input type="date" value={form.enddatum||''} onChange={e=>setForm((f:any)=>({...f,enddatum:e.target.value}))} /></div>
            </div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung||''} onChange={e=>setForm((f:any)=>({...f,beschreibung:e.target.value}))} className="min-h-[80px]" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={()=>setEditItem(null)}>Abbrechen</Button>
            <Button className="flex-1" onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
