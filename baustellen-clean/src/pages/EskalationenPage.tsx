import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Clock, Euro, Users, ShieldAlert, CheckCircle, Plus, Eye, Zap, RefreshCw } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { berechneKosten, pruefeAutoEskalationen } from '@/lib/berechnung';

const SCHWERE = [
  { value:'kritisch', label:'Kritisch', dot:'#ef4444', bg:'rgba(239,68,68,.08)', badge:'bg-red-100 text-red-700', leftBar:'#ef4444' },
  { value:'hoch',     label:'Hoch',     dot:'#f97316', bg:'rgba(249,115,22,.07)', badge:'bg-orange-100 text-orange-700', leftBar:'#f97316' },
  { value:'mittel',   label:'Mittel',   dot:'#f59e0b', bg:'rgba(245,158,11,.07)', badge:'bg-amber-100 text-amber-700', leftBar:'#f59e0b' },
  { value:'niedrig',  label:'Niedrig',  dot:'#94a3b8', bg:'rgba(148,163,184,.07)', badge:'bg-slate-100 text-slate-600', leftBar:'#cbd5e1' },
];
const TYP_OPTIONS = [
  { value:'budget',   label:'Budget',   Icon: Euro },
  { value:'zeit',     label:'Zeit',     Icon: Clock },
  { value:'personal', label:'Personal', Icon: Users },
  { value:'qualitaet',label:'Qualität', Icon: ShieldAlert },
];
const EMPTY = { baustelle_id:'', typ:'budget', schwere:'mittel', nachricht:'', datum:new Date().toISOString().split('T')[0] };

export default function EskalationenPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [showGelesen, setShowGelesen] = useState(false);
  const [autoDialog, setAutoDialog] = useState(false);
  const [pendingAutos, setPendingAutos] = useState<any[]>([]);

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('name'); return data ?? []; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-all'],  queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id, mitarbeiter_id, stunden, datum, employees(stundensatz, name)'); return data ?? []; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-all'],      queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id, gesamtpreis'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-all'],     queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id, betrag, status'); return data ?? []; } });
  const { data: employees = [] }  = useQuery({ queryKey: ['employees'],       queryFn: async () => { const { data } = await supabase.from('employees').select('id,name').eq('aktiv', true); return data ?? []; } });
  const { data: eskalationen = [] } = useQuery({
    queryKey: ['bs-esk-all'],
    queryFn: async () => { const { data, error } = await supabase.from('bs_eskalationen').select('*, baustellen(name)').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });

  const markGelesen = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_eskalationen').update({ gelesen: true }).eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Als gelesen markiert'); queryClient.invalidateQueries({ queryKey: ['bs-esk-all'] }); queryClient.invalidateQueries({ queryKey: ['bs-esk-dash'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (payload?: any) => {
      const p = payload ?? { baustelle_id:form.baustelle_id, typ:form.typ, schwere:form.schwere, nachricht:form.nachricht, datum:form.datum, gelesen:false };
      if (!p.baustelle_id) throw new Error('Bitte Baustelle wählen');
      if (!p.nachricht) throw new Error('Nachricht erforderlich');
      const { error } = await supabase.from('bs_eskalationen').insert(p);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Eskalation gespeichert'); setDialog(false); setForm(EMPTY); queryClient.invalidateQueries({ queryKey: ['bs-esk-all'] }); queryClient.invalidateQueries({ queryKey: ['bs-esk-dash'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMultiple = useMutation({
    mutationFn: async (items: any[]) => {
      const { error } = await supabase.from('bs_eskalationen').insert(items);
      if (error) throw error;
    },
    onSuccess: (_, items) => { toast.success(`${items.length} Eskalation${items.length>1?'en':''} erstellt`); setAutoDialog(false); setPendingAutos([]); queryClient.invalidateQueries({ queryKey: ['bs-esk-all'] }); queryClient.invalidateQueries({ queryKey: ['bs-esk-dash'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Auto-Analyse: alle Baustellen prüfen
  const runAutoCheck = () => {
    const bs = baustellen as any[];
    const sw = stunden as any[];
    const mat = materialien as any[];
    const nach = nachtraege as any[];
    const emps = employees as any[];
    const heute = new Date().toISOString().split('T')[0];

    const all: any[] = [];
    bs.filter(b => b.status === 'in_bearbeitung' || b.status === 'offen').forEach(b => {
      const auto = pruefeAutoEskalationen(b, sw, mat, nach, emps);
      auto.forEach(a => all.push({ baustelle_id: b.id, ...a, datum: heute, gelesen: false, _bsName: b.name }));
    });

    if (all.length === 0) { toast.success('Keine kritischen Schwellwerte überschritten ✓'); return; }
    setPendingAutos(all);
    setAutoDialog(true);
  };

  const esk = eskalationen as any[];
  const offen = esk.filter(e => !e.gelesen);
  const anzeige = showGelesen ? esk : offen;

  const kritisch = offen.filter(e => e.schwere === 'kritisch').length;
  const hoch = offen.filter(e => e.schwere === 'hoch').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{fontFamily:'DM Sans', fontWeight:700, fontSize:'1.5rem', color:'#0f1f3d', letterSpacing:'-.02em'}}>Eskalationen</h1>
          <p className="text-sm mt-1" style={{color:'#6b7a99'}}>
            {offen.length} offen
            {kritisch > 0 && <span className="ml-2 text-red-600 font-semibold">· {kritisch} kritisch</span>}
            {hoch > 0 && <span className="ml-2 text-orange-600 font-semibold">· {hoch} hoch</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runAutoCheck} className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />Auto-Prüfung
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowGelesen(!showGelesen)}>
            {showGelesen ? 'Nur offene' : `Alle (${esk.length})`}
          </Button>
          <Button size="sm" onClick={() => { setForm(EMPTY); setDialog(true); }}>
            <Plus className="h-3.5 w-3.5" />Melden
          </Button>
        </div>
      </div>

      {/* Status-Banner */}
      {offen.length === 0 ? (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.2)'}}>
          <CheckCircle className="h-5 w-5 flex-shrink-0" style={{color:'#10b981'}} />
          <p className="text-sm font-semibold" style={{color:'#065f46'}}>Alles im grünen Bereich – keine offenen Eskalationen.</p>
        </div>
      ) : kritisch > 0 ? (
        <div className="rounded-2xl p-4 flex items-center gap-3 pulse" style={{background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)'}}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{color:'#ef4444'}} />
          <p className="text-sm font-bold" style={{color:'#991b1b'}}>{kritisch} kritische Eskalation{kritisch>1?'en':''} – sofortige Maßnahmen erforderlich!</p>
        </div>
      ) : (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.2)'}}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{color:'#f97316'}} />
          <p className="text-sm font-semibold" style={{color:'#9a3412'}}>{offen.length} offene Eskalation{offen.length>1?'en':''} müssen bearbeitet werden.</p>
        </div>
      )}

      {/* KPI-Streifen */}
      <div className="grid grid-cols-4 gap-3">
        {SCHWERE.map(s => {
          const cnt = offen.filter(e => e.schwere === s.value).length;
          return (
            <div key={s.value} className="card kpi-card p-4 text-center">
              <div className="w-2 h-2 rounded-full mx-auto mb-2" style={{background:s.dot}} />
              <p className="text-2xl font-bold count-up" style={{color: cnt > 0 ? s.dot : '#d1d5db'}}>{cnt}</p>
              <p className="text-xs mt-0.5" style={{color:'#6b7a99'}}>{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {anzeige.length === 0 && (
          <div className="card p-14 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{background:'#f4f6fa'}}>
              <CheckCircle className="h-6 w-6" style={{color:'#cbd5e1'}} />
            </div>
            <p className="text-sm" style={{color:'#9ca3af'}}>Keine Eskalationen vorhanden</p>
            <p className="text-xs mt-1" style={{color:'#d1d5db'}}>Nutze die Auto-Prüfung um Schwellwerte zu analysieren</p>
          </div>
        )}
        {anzeige.map((e: any) => {
          const sc = SCHWERE.find(s => s.value === e.schwere) ?? SCHWERE[2];
          const tp = TYP_OPTIONS.find(t => t.value === e.typ) ?? TYP_OPTIONS[0];
          return (
            <div key={e.id} className={`card p-5 flex gap-4 ${e.gelesen ? 'opacity-50' : ''}`}
              style={{borderLeft:`3px solid ${sc.leftBar}`, background: e.gelesen ? 'white' : sc.bg}}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:`${sc.leftBar}18`}}>
                <tp.Icon className="h-4 w-4" style={{color:sc.leftBar}} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sc.badge}`}>{sc.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:'#f4f6fa', color:'#6b7a99'}}>{tp.label}</span>
                  <span className="text-xs" style={{color:'#9ca3af'}}>{e.baustellen?.name} · {fmtDate(e.datum)}</span>
                  {e.gelesen && <span className="text-xs px-2 py-0.5 rounded-full" style={{background:'#f0fdf4', color:'#16a34a'}}>✓ Gelesen</span>}
                </div>
                <p className="text-sm leading-relaxed" style={{color:'#1e293b'}}>{e.nachricht}</p>
              </div>
              {!e.gelesen && (
                <Button size="sm" variant="outline" onClick={() => markGelesen.mutate(e.id)} disabled={markGelesen.isPending} className="flex-shrink-0 self-center">
                  <Eye className="h-3.5 w-3.5" />Gelesen
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Manueller Dialog */}
      <Dialog open={dialog} onOpenChange={v => { setDialog(v); if(!v) setForm(EMPTY); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Eskalation melden</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Baustelle *</Label>
              <Select value={form.baustelle_id} onValueChange={v=>setForm((f:any)=>({...f,baustelle_id:v}))}>
                <SelectOption value="">Bitte wählen...</SelectOption>
                {(baustellen as any[]).map((b:any) => <SelectOption key={b.id} value={b.id}>{b.name}</SelectOption>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Typ</Label>
                <Select value={form.typ} onValueChange={v=>setForm((f:any)=>({...f,typ:v}))}>
                  {TYP_OPTIONS.map(t=><SelectOption key={t.value} value={t.value}>{t.label}</SelectOption>)}
                </Select>
              </div>
              <div><Label>Schwere</Label>
                <Select value={form.schwere} onValueChange={v=>setForm((f:any)=>({...f,schwere:v}))}>
                  {SCHWERE.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}
                </Select>
              </div>
            </div>
            <div><Label>Nachricht *</Label><Textarea value={form.nachricht} onChange={e=>setForm((f:any)=>({...f,nachricht:e.target.value}))} placeholder="Was ist passiert?" className="min-h-[90px]" autoFocus /></div>
            <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={e=>setForm((f:any)=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={()=>setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending?'Speichert...':'Melden'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-Check Dialog */}
      <Dialog open={autoDialog} onOpenChange={v => { setAutoDialog(v); if(!v) setPendingAutos([]); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Auto-Prüfung: {pendingAutos.length} Schwellwert{pendingAutos.length>1?'e':''} erkannt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto py-1">
            {pendingAutos.map((a, i) => {
              const sc = SCHWERE.find(s => s.value === a.schwere) ?? SCHWERE[2];
              return (
                <div key={i} className="rounded-xl p-3 flex gap-3" style={{background:sc.bg, borderLeft:`3px solid ${sc.leftBar}`}}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sc.badge}`}>{sc.label}</span>
                      <span className="text-xs font-medium" style={{color:'#6b7a99'}}>{a._bsName}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{color:'#374151'}}>{a.nachricht}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs" style={{color:'#6b7a99'}}>Diese Eskalationen werden als ungelesen angelegt und im Dashboard angezeigt.</p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={()=>setAutoDialog(false)}>Abbrechen</Button>
            <Button className="flex-1" onClick={() => saveMultiple.mutate(pendingAutos.map(({_bsName, ...rest}) => rest))} disabled={saveMultiple.isPending}>
              {saveMultiple.isPending ? 'Erstelle...' : `${pendingAutos.length} anlegen`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
