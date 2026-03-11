import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Euro, Clock, Package, Camera, Plus, Pencil, Trash2, Upload, TrendingUp, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { fmtEur, fmtDate } from '@/lib/utils';
import { exportBaustellePDF } from '@/lib/exportPDF';

const STUNDEN_SATZ = 38.08;
const STATUS_OPTIONS = [
  { value:'offen',          label:'Offen',          dot:'#94a3b8', bg:'#f8fafc', text:'#64748b' },
  { value:'in_bearbeitung', label:'In Bearbeitung',  dot:'#3b82f6', bg:'#eff6ff', text:'#1d4ed8' },
  { value:'pausiert',       label:'Pausiert',        dot:'#f59e0b', bg:'#fffbeb', text:'#b45309' },
  { value:'abgeschlossen',  label:'Abgeschlossen',   dot:'#10b981', bg:'#f0fdf4', text:'#065f46' },
  { value:'abgerechnet',    label:'Abgerechnet',     dot:'#8b5cf6', bg:'#faf5ff', text:'#5b21b6' },
];
const FOTO_KAT = ['vorher','nachher','maengel','abnahme','fortschritt','sonstiges'];
const FOTO_KAT_LABELS: Record<string,string> = {vorher:'Vorher',nachher:'Nachher',maengel:'Mängel',abnahme:'Abnahme',fortschritt:'Fortschritt',sonstiges:'Sonstiges'};
const MAT_STATUS = ['bestellt','geliefert','verbraucht'];
const NACH_STATUS = [
  { value:'entwurf', label:'Entwurf', bg:'#f8fafc', text:'#64748b' },
  { value:'eingereicht', label:'Eingereicht', bg:'#eff6ff', text:'#1d4ed8' },
  { value:'genehmigt', label:'Genehmigt', bg:'#f0fdf4', text:'#065f46' },
  { value:'abgelehnt', label:'Abgelehnt', bg:'#fef2f2', text:'#b91c1c' },
];
const TABS = ['Übersicht','Analyse','Stunden','Material','Nachträge','Fotos'];
const STUNDEN_EMPTY = { mitarbeiter_id:'', datum:new Date().toISOString().split('T')[0], stunden:'', beschreibung:'' };
const MAT_EMPTY = { bezeichnung:'', menge:'1', einheit:'Stk', einzelpreis:'', gesamtpreis:'', status:'bestellt', datum:new Date().toISOString().split('T')[0] };
const NACH_EMPTY = { titel:'', beschreibung:'', betrag:'', status:'entwurf', datum:new Date().toISOString().split('T')[0], begruendung:'' };
const FOTO_EMPTY = { beschreibung:'', kategorie:'fortschritt' };

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card p-2.5 text-xs" style={{minWidth:'120px'}}>
      <p className="font-semibold mb-1" style={{color:'#0f1f3d'}}>{label}</p>
      {payload.map((p:any) => (
        <div key={p.name} className="flex justify-between gap-3">
          <span style={{color:'#6b7a99'}}>{p.name}</span>
          <span className="font-bold" style={{color:p.fill||p.stroke||'#0f1f3d'}}>{typeof p.value==='number'&&p.value>100?fmtEur(p.value):`${p.value}h`}</span>
        </div>
      ))}
    </div>
  );
};

export default function BaustelleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('Übersicht');
  const [stundenDialog, setStundenDialog] = useState(false);
  const [editStunden, setEditStunden] = useState<any>(null);
  const [stundenForm, setStundenForm] = useState<any>(STUNDEN_EMPTY);
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editMaterial, setEditMaterial] = useState<any>(null);
  const [matForm, setMatForm] = useState<any>(MAT_EMPTY);
  const [nachtragDialog, setNachtragDialog] = useState(false);
  const [editNachtrag, setEditNachtrag] = useState<any>(null);
  const [nachForm, setNachForm] = useState<any>(NACH_EMPTY);
  const [fotoDialog, setFotoDialog] = useState(false);
  const [fotoForm, setFotoForm] = useState<any>(FOTO_EMPTY);
  const [uploading, setUploading] = useState(false);

  const { data: bs, isLoading: bsLoading } = useQuery({ queryKey:['baustelle',id], queryFn: async () => { const {data,error}=await supabase.from('baustellen').select('*').eq('id',id!).single(); if(error)throw error; return data; }, enabled:!!id });
  const { data: employees=[] } = useQuery({ queryKey:['employees'], queryFn: async () => { const {data}=await supabase.from('employees').select('id,name,kuerzel,stundensatz').eq('aktiv',true).order('name'); return data??[]; } });
  const { data: stunden=[] } = useQuery({ queryKey:['bs-stunden',id], queryFn: async () => { const {data,error}=await supabase.from('bs_stundeneintraege').select('*, employees(id,name,kuerzel,stundensatz)').eq('baustelle_id',id!).order('datum',{ascending:false}); if(error)throw error; return data??[]; }, enabled:!!id });
  const { data: materialien=[] } = useQuery({ queryKey:['bs-mat',id], queryFn: async () => { const {data,error}=await supabase.from('bs_materialien').select('*').eq('baustelle_id',id!).order('created_at',{ascending:false}); if(error)throw error; return data??[]; }, enabled:!!id });
  const { data: nachtraege=[] } = useQuery({ queryKey:['bs-nach',id], queryFn: async () => { const {data,error}=await supabase.from('bs_nachtraege').select('*').eq('baustelle_id',id!).order('created_at',{ascending:false}); if(error)throw error; return data??[]; }, enabled:!!id });
  const { data: fotos=[] } = useQuery({ queryKey:['bs-fotos',id], queryFn: async () => { const {data,error}=await supabase.from('bs_fotos').select('*').eq('baustelle_id',id!).order('created_at',{ascending:false}); if(error)throw error; return data??[]; }, enabled:!!id });

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`bs-detail-${id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'bs_stundeneintraege',filter:`baustelle_id=eq.${id}`},()=>queryClient.invalidateQueries({queryKey:['bs-stunden',id]}))
      .on('postgres_changes',{event:'*',schema:'public',table:'bs_materialien',filter:`baustelle_id=eq.${id}`},()=>queryClient.invalidateQueries({queryKey:['bs-mat',id]}))
      .on('postgres_changes',{event:'*',schema:'public',table:'bs_nachtraege',filter:`baustelle_id=eq.${id}`},()=>queryClient.invalidateQueries({queryKey:['bs-nach',id]}))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, queryClient]);

  const updateStatus = useMutation({
    mutationFn: async (status:string) => {
      const archivStatus = ['abgeschlossen','abgerechnet'];
      if (archivStatus.includes(status)) {
        const label = status === 'abgeschlossen' ? 'Abgeschlossen' : 'Abgerechnet';
        if (!confirm(`Baustelle als "${label}" markieren und ins Archiv verschieben?\n\nSie ist danach nicht mehr in der aktiven Liste sichtbar, aber jederzeit im Archiv abrufbar.`)) {
          throw new Error('Abgebrochen');
        }
      }
      const {error}=await supabase.from('baustellen').update({status}).eq('id',id!);
      if(error)throw error;
    },
    onSuccess:()=>{
      toast.success('Status aktualisiert');
      queryClient.invalidateQueries({queryKey:['baustelle',id]});
      queryClient.invalidateQueries({queryKey:['baustellen-list']});
      queryClient.invalidateQueries({queryKey:['baustellen-archiv']});
      queryClient.invalidateQueries({queryKey:['bs-dashboard']});
    },
    onError:(e:any)=>{ if(e.message !== 'Abgebrochen') toast.error(e.message); }
  });
  const saveStunden = useMutation({ mutationFn: async () => { if(!stundenForm.mitarbeiter_id)throw new Error('Mitarbeiter wählen'); const payload={baustelle_id:id,mitarbeiter_id:stundenForm.mitarbeiter_id,datum:stundenForm.datum,stunden:parseFloat(String(stundenForm.stunden).replace(',','.')),beschreibung:stundenForm.beschreibung||null}; if(editStunden){const{error}=await supabase.from('bs_stundeneintraege').update(payload).eq('id',editStunden.id);if(error)throw error;}else{const{error}=await supabase.from('bs_stundeneintraege').insert(payload);if(error)throw error;} }, onSuccess:()=>{ toast.success('Stunden gespeichert'); setStundenDialog(false); setEditStunden(null); setStundenForm(STUNDEN_EMPTY); queryClient.invalidateQueries({queryKey:['bs-stunden',id]}); }, onError:(e:any)=>toast.error(e.message) });
  const deleteStunden = useMutation({ mutationFn: async (sid:string)=>{ const{error}=await supabase.from('bs_stundeneintraege').delete().eq('id',sid);if(error)throw error; }, onSuccess:()=>queryClient.invalidateQueries({queryKey:['bs-stunden',id]}), onError:(e:any)=>toast.error(e.message) });
  const saveMat = useMutation({ mutationFn: async ()=>{ const ep=parseFloat(String(matForm.einzelpreis).replace(',','.'))||0; const mg=parseFloat(String(matForm.menge).replace(',','.'))||1; const gp=parseFloat(String(matForm.gesamtpreis).replace(',','.'))||ep*mg; const payload={baustelle_id:id,bezeichnung:matForm.bezeichnung,menge:mg,einheit:matForm.einheit,einzelpreis:ep,gesamtpreis:gp,status:matForm.status,datum:matForm.datum}; if(editMaterial){const{error}=await supabase.from('bs_materialien').update(payload).eq('id',editMaterial.id);if(error)throw error;}else{const{error}=await supabase.from('bs_materialien').insert(payload);if(error)throw error;} }, onSuccess:()=>{ toast.success('Material gespeichert'); setMaterialDialog(false); setEditMaterial(null); setMatForm(MAT_EMPTY); queryClient.invalidateQueries({queryKey:['bs-mat',id]}); }, onError:(e:any)=>toast.error(e.message) });
  const deleteMat = useMutation({ mutationFn: async (mid:string)=>{ const{error}=await supabase.from('bs_materialien').delete().eq('id',mid);if(error)throw error; }, onSuccess:()=>queryClient.invalidateQueries({queryKey:['bs-mat',id]}), onError:(e:any)=>toast.error(e.message) });
  const saveNach = useMutation({ mutationFn: async ()=>{ const payload={baustelle_id:id,titel:nachForm.titel,beschreibung:nachForm.beschreibung||null,betrag:parseFloat(String(nachForm.betrag).replace(',','.'))||0,status:nachForm.status,datum:nachForm.datum,begruendung:nachForm.begruendung||null}; if(editNachtrag){const{error}=await supabase.from('bs_nachtraege').update(payload).eq('id',editNachtrag.id);if(error)throw error;}else{const{error}=await supabase.from('bs_nachtraege').insert(payload);if(error)throw error;} }, onSuccess:()=>{ toast.success('Nachtrag gespeichert'); setNachtragDialog(false); setEditNachtrag(null); setNachForm(NACH_EMPTY); queryClient.invalidateQueries({queryKey:['bs-nach',id]}); }, onError:(e:any)=>toast.error(e.message) });
  const deleteNach = useMutation({ mutationFn: async (nid:string)=>{ const{error}=await supabase.from('bs_nachtraege').delete().eq('id',nid);if(error)throw error; }, onSuccess:()=>queryClient.invalidateQueries({queryKey:['bs-nach',id]}), onError:(e:any)=>toast.error(e.message) });
  const deleteFoto = useMutation({ mutationFn: async (fid:string)=>{ const{error}=await supabase.from('bs_fotos').delete().eq('id',fid);if(error)throw error; }, onSuccess:()=>queryClient.invalidateQueries({queryKey:['bs-fotos',id]}), onError:(e:any)=>toast.error(e.message) });

  if (bsLoading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-t-blue-500 rounded-full animate-spin" style={{borderColor:'#eef1f9', borderTopColor:'#1e3a5f'}} /></div>;
  if (!bs) return <div className="text-center py-20" style={{color:'#9ca3af'}}>Baustelle nicht gefunden</div>;

  const sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[], fts = fotos as any[], emps = employees as any[];

  const gesamtStunden = sw.reduce((s,w) => s+Number(w.stunden??0), 0);
  const personalkosten = sw.reduce((s,w) => s+Number(w.stunden??0)*Number(w.employees?.stundensatz??STUNDEN_SATZ), 0);
  const materialkosten = mat.reduce((s,m) => s+Number(m.gesamtpreis??0), 0);
  const nachtragGenehmigt = nach.filter(n=>n.status==='genehmigt').reduce((s,n)=>s+Number(n.betrag??0),0);
  const nachtragEingereicht = nach.filter(n=>n.status==='eingereicht').reduce((s,n)=>s+Number(n.betrag??0),0);
  const gesamtkosten = personalkosten + materialkosten;
  const budget = Number(bs.budget??0);
  const effektivBudget = budget + nachtragGenehmigt;
  const pct = effektivBudget>0 ? Math.min(Math.round(gesamtkosten/effektivBudget*100), 999) : 0;
  const overBudget = gesamtkosten > effektivBudget && effektivBudget > 0;
  const st = STATUS_OPTIONS.find(s=>s.value===bs.status)??STATUS_OPTIONS[0];

  // Analyse-Daten
  const stundenProMa = emps.map(e => {
    const h = sw.filter(w=>w.mitarbeiter_id===e.id).reduce((s,w)=>s+Number(w.stunden??0),0);
    return {name: e.kuerzel||e.name?.split(' ')[0]||'?', fullName:e.name, stunden:Math.round(h*10)/10, kosten:h*Number(e.stundensatz??STUNDEN_SATZ)};
  }).filter(x=>x.stunden>0).sort((a,b)=>b.stunden-a.stunden);

  // Stunden nach Woche
  // Stunden-Verlauf: täglich wenn < 60 Tage Daten, sonst monatlich
  const datumSet = new Set(sw.map((w:any) => w.datum?.substring(0,10)).filter(Boolean));
  const allesDaten = Array.from(datumSet).sort();
  const spanDays = allesDaten.length > 1 ? Math.round((new Date(allesDaten[allesDaten.length-1]).getTime() - new Date(allesDaten[0]).getTime()) / 86400000) : 0;
  const gruppiereNachTag = spanDays < 60;
  const trendMap: Record<string,number> = {};
  sw.forEach((w:any) => {
    const key = gruppiereNachTag
      ? (w.datum?.substring(0,10)||'')
      : (w.datum?.substring(0,7)||'');
    if (key) trendMap[key] = (trendMap[key]||0) + Number(w.stunden??0);
  });
  const weekTrend = Object.entries(trendMap)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(-20)
    .map(([m,h]) => ({
      monat: gruppiereNachTag
        ? new Date(m).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit'})
        : new Date(m+'-01').toLocaleDateString('de-DE', {month:'short', year:'2-digit'}),
      stunden: Math.round(h*10)/10
    }));

  // Material nach Status
  const matByStatus = [
    {name:'Bestellt', value:mat.filter(m=>m.status==='bestellt').reduce((s,m)=>s+Number(m.gesamtpreis??0),0), color:'#f59e0b'},
    {name:'Geliefert', value:mat.filter(m=>m.status==='geliefert').reduce((s,m)=>s+Number(m.gesamtpreis??0),0), color:'#3b82f6'},
    {name:'Verbraucht', value:mat.filter(m=>m.status==='verbraucht').reduce((s,m)=>s+Number(m.gesamtpreis??0),0), color:'#10b981'},
  ].filter(x=>x.value>0);

  const kostenPie = [{name:'Personal',value:Math.round(personalkosten),color:'#1e3a5f'},{name:'Material',value:Math.round(materialkosten),color:'#0ea5e9'}].filter(k=>k.value>0);

  const handleFotoUpload = async (file:File) => {
    setUploading(true);
    try {
      const ext=file.name.split('.').pop(); const path=`${id}/${Date.now()}.${ext}`;
      const{error:upErr}=await supabase.storage.from('baustellen-fotos').upload(path,file);
      if(upErr)throw upErr;
      const{data:urlData}=supabase.storage.from('baustellen-fotos').getPublicUrl(path);
      const{error:dbErr}=await supabase.from('bs_fotos').insert({baustelle_id:id,url:urlData.publicUrl,beschreibung:fotoForm.beschreibung||null,kategorie:fotoForm.kategorie,datum:new Date().toISOString().split('T')[0]});
      if(dbErr)throw dbErr;
      toast.success('Foto hochgeladen'); setFotoDialog(false); setFotoForm(FOTO_EMPTY); queryClient.invalidateQueries({queryKey:['bs-fotos',id]});
    } catch(e:any){toast.error(e.message);} finally{setUploading(false);}
  };

  const exportPDF = () => exportBaustellePDF(bs, sw, mat, nach, fts);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={()=>navigate('/baustellen')} className="p-2 rounded-xl transition-colors hover:bg-white" style={{border:'1px solid #e5e9f2'}}>
          <ArrowLeft className="h-4 w-4" style={{color:'#6b7a99'}} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold truncate" style={{color:'#0f1f3d', letterSpacing:'-.02em'}}>{bs.name}</h1>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0" style={{background:st.bg, color:st.text}}>{st.label}</span>
          </div>
          <p className="text-sm mt-0.5" style={{color:'#9ca3af'}}>{bs.auftraggeber}{bs.adresse?` · ${bs.adresse}`:''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportPDF}>PDF</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {label:'Effektives Budget', sub:nachtragGenehmigt>0?`+${fmtEur(nachtragGenehmigt)} Nachträge`:'inkl. Nachträge', value:fmtEur(effektivBudget), icon:Euro, c:'#1e3a5f', bg:'rgba(30,58,95,.08)'},
          {label:'Gesamtkosten', sub:`${pct}% des Budgets`, value:fmtEur(gesamtkosten), icon:TrendingUp, c:overBudget?'#ef4444':'#10b981', bg:overBudget?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)'},
          {label:'Personalkosten', sub:`${Math.round(gesamtStunden*10)/10}h · ${sw.length} Einträge`, value:fmtEur(personalkosten), icon:Clock, c:'#8b5cf6', bg:'rgba(139,92,246,.1)'},
          {label:'Materialkosten', sub:`${mat.length} Positionen`, value:fmtEur(materialkosten), icon:Package, c:'#f97316', bg:'rgba(249,115,22,.1)'},
        ].map(k=>(
          <div key={k.label} className="card kpi-card p-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{background:k.bg}}>
              <k.icon className="h-4 w-4" style={{color:k.c}} />
            </div>
            <p className="text-xl font-bold count-up" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{k.value}</p>
            <p className="text-xs mt-0.5" style={{color:'#6b7a99'}}>{k.label}</p>
            <p className="text-[10px] mt-0.5" style={{color:'#9ca3af'}}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Budget Bar */}
      {effektivBudget > 0 && (
        <div className="card p-5">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium" style={{color:'#374151'}}>Budget-Auslastung</span>
            <span className="text-sm font-bold" style={{color:overBudget?'#ef4444':'#0f1f3d'}}>{pct}% {overBudget?'⚠ ÜBERZOGEN':''}</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{height:'8px', background:'#eef1f9'}}>
            <div className="h-full rounded-full progress-bar" style={{width:`${Math.min(pct,100)}%`, background:overBudget?'#ef4444':pct>80?'#f59e0b':'linear-gradient(90deg, #1e3a5f, #3b82f6)'}} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs" style={{color:'#9ca3af'}}>
            <span>{fmtEur(gesamtkosten)} verbraucht</span>
            <span>{fmtEur(effektivBudget-gesamtkosten)} verbleibend</span>
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            {nachtragGenehmigt>0 && <p className="text-xs font-medium" style={{color:'#10b981'}}>✓ {fmtEur(nachtragGenehmigt)} genehmigte Nachträge im Budget</p>}
            {nachtragEingereicht>0 && <p className="text-xs" style={{color:'#3b82f6'}}>⏳ {fmtEur(nachtragEingereicht)} noch nicht genehmigt</p>}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="card p-4">
        <p className="text-xs font-medium mb-2" style={{color:'#9ca3af'}}>Status ändern</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.filter(s=>s.value!==bs.status).map(s=>(
            <button key={s.value} onClick={()=>updateStatus.mutate(s.value)} disabled={updateStatus.isPending}
              className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{background:s.bg, color:s.text, border:`1px solid ${s.dot}30`}}>
              → {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{background:'#eef1f9'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5"
            style={tab===t ? {background:'white',color:'#0f1f3d',boxShadow:'0 1px 3px rgba(15,31,61,.08)'} : {color:'#6b7a99'}}>
            {t==='Analyse' && <BarChart2 className="h-3.5 w-3.5" />}{t}
          </button>
        ))}
      </div>

      {/* ── ÜBERSICHT ── */}
      {tab==='Übersicht' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{color:'#0f1f3d'}}>Kostenaufteilung</h3>
            {kostenPie.length===0 ? <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Noch keine Kosten</div> : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart><Pie data={kostenPie} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>{kostenPie.map((_,i)=><Cell key={i} fill={['#1e3a5f','#0ea5e9'][i]} />)}</Pie><Tooltip formatter={(v:any)=>fmtEur(v)} /></PieChart>
                </ResponsiveContainer>
                <div className="flex justify-around mt-2">
                  {kostenPie.map((k,i)=>(
                    <div key={k.name} className="text-center">
                      <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{background:['#1e3a5f','#0ea5e9'][i]}} />
                      <p className="text-xs" style={{color:'#6b7a99'}}>{k.name}</p>
                      <p className="text-sm font-bold" style={{color:'#0f1f3d'}}>{fmtEur(k.value)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{color:'#0f1f3d'}}>Stunden pro Mitarbeiter</h3>
            {stundenProMa.length===0 ? <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Noch keine Stunden</div> : (
              <div className="space-y-3">
                {stundenProMa.map((m,i)=>(
                  <div key={m.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium" style={{color:'#374151'}}>{m.fullName}</span>
                      <span style={{color:'#6b7a99', fontFamily:'DM Mono, monospace'}}>{m.stunden}h · {fmtEur(m.kosten)}</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{height:'5px', background:'#eef1f9'}}>
                      <div className="h-full rounded-full" style={{width:`${m.stunden/stundenProMa[0].stunden*100}%`, background:`hsl(${215+i*35},65%,45%)`}} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-full card p-5">
            <h3 className="text-sm font-semibold mb-3" style={{color:'#0f1f3d'}}>Projektdetails</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[['Gewerk',bs.gewerk||'–'],['Projektleiter',bs.projektleiter||'–'],['Start',fmtDate(bs.startdatum)],['Frist',fmtDate(bs.enddatum)]].map(([l,v])=>(
                <div key={l}><p className="text-xs mb-1" style={{color:'#9ca3af'}}>{l}</p><p className="font-semibold" style={{color:'#0f1f3d'}}>{v}</p></div>
              ))}
            </div>
            {bs.beschreibung && <p className="text-sm mt-4 p-3 rounded-xl whitespace-pre-line" style={{background:'#f4f6fa', color:'#374151'}}>{bs.beschreibung}</p>}
          </div>
        </div>
      )}

      {/* ── ANALYSE ── */}
      {tab==='Analyse' && (
        <div className="space-y-4">
          {/* Rentabilitäts-Übersicht */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'Marge (Budget − Kosten)', value:fmtEur(effektivBudget-gesamtkosten), pct:effektivBudget>0?Math.round((effektivBudget-gesamtkosten)/effektivBudget*100):0, positive:(effektivBudget-gesamtkosten)>=0},
              {label:'∅ Stundensatz real', value:gesamtStunden>0?fmtEur(personalkosten/gesamtStunden):'–', pct:null, positive:true},
              {label:'Materialanteil', value:gesamtkosten>0?`${Math.round(materialkosten/gesamtkosten*100)}%`:'–', pct:null, positive:true},
            ].map(k=>(
              <div key={k.label} className="card p-4">
                <p className="text-2xl font-bold" style={{color:k.positive===false?'#ef4444':'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{k.value}</p>
                <p className="text-xs mt-1" style={{color:'#6b7a99'}}>{k.label}</p>
                {k.pct!==null && <p className="text-xs mt-0.5 font-semibold" style={{color:k.positive===false?'#ef4444':'#10b981'}}>{k.pct}% Marge</p>}
              </div>
            ))}
          </div>

          {/* Stunden-Trend */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-1" style={{color:'#0f1f3d'}}>Stunden-Verlauf (monatlich)</h3>
            <p className="text-xs mb-4" style={{color:'#9ca3af'}}>Erfasste Arbeitsstunden pro Monat</p>
            {weekTrend.length===0 ? <div className="flex items-center justify-center h-36 text-sm" style={{color:'#d1d5db'}}>Noch keine Daten</div> : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={weekTrend}>
                  <defs><linearGradient id="hGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f9" vertical={false} />
                  <XAxis dataKey="monat" tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="stunden" name="Stunden" stroke="#8b5cf6" strokeWidth={2} fill="url(#hGrad)" dot={false} activeDot={{r:4,fill:'#8b5cf6'}} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* MA Vergleich */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-1" style={{color:'#0f1f3d'}}>Mitarbeiter-Auslastung</h3>
              <p className="text-xs mb-4" style={{color:'#9ca3af'}}>Stunden &amp; Lohnkosten im Vergleich</p>
              {stundenProMa.length===0 ? <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Keine Daten</div> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stundenProMa} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f9" horizontal={false} />
                    <XAxis type="number" tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{fontSize:11,fill:'#374151'}} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="stunden" name="Stunden" fill="#1e3a5f" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 space-y-1.5">
                {stundenProMa.map((m,i)=>(
                  <div key={m.name} className="flex items-center justify-between text-xs p-2 rounded-xl" style={{background:'#f8fafc'}}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{background:`hsl(${215+i*35},65%,45%)`}}>{m.name.substring(0,2)}</div>
                      <span className="font-medium" style={{color:'#374151'}}>{m.fullName}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold mr-2" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{m.stunden}h</span>
                      <span style={{color:'#9ca3af'}}>{fmtEur(m.kosten)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Material Status */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-1" style={{color:'#0f1f3d'}}>Material-Status</h3>
              <p className="text-xs mb-4" style={{color:'#9ca3af'}}>Wert nach Lieferstatus</p>
              {matByStatus.length===0 ? <div className="flex items-center justify-center h-40 text-sm" style={{color:'#d1d5db'}}>Kein Material</div> : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart><Pie data={matByStatus} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3}>{matByStatus.map((d,i)=><Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={(v:any)=>fmtEur(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {matByStatus.map(m=>(
                      <div key={m.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:m.color}} /><span style={{color:'#6b7a99'}}>{m.name}</span></div>
                        <span className="font-bold" style={{color:'#0f1f3d'}}>{fmtEur(m.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Nachträge Analyse */}
          {nach.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold mb-3" style={{color:'#0f1f3d'}}>Nachträge im Detail</h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  {label:'Gesamt beantragt', value:fmtEur(nach.reduce((s,n)=>s+Number(n.betrag??0),0)), color:'#0f1f3d'},
                  {label:'Genehmigt (+Budget)', value:fmtEur(nachtragGenehmigt), color:'#10b981'},
                  {label:'Eingereicht', value:fmtEur(nachtragEingereicht), color:'#3b82f6'},
                  {label:'Abgelehnt', value:fmtEur(nach.filter(n=>n.status==='abgelehnt').reduce((s,n)=>s+Number(n.betrag??0),0)), color:'#ef4444'},
                ].map(k=>(
                  <div key={k.label} className="p-3 rounded-xl text-center" style={{background:'#f4f6fa'}}>
                    <p className="text-lg font-bold" style={{color:k.color, fontFamily:'DM Mono, monospace'}}>{k.value}</p>
                    <p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>{k.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STUNDEN ── */}
      {tab==='Stunden' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b" style={{borderColor:'#eef1f9'}}>
            <div><h3 className="font-semibold" style={{color:'#0f1f3d'}}>Zeiterfassung</h3><p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>{Math.round(gesamtStunden*10)/10}h · {fmtEur(personalkosten)}</p></div>
            <Button size="sm" onClick={()=>{setStundenForm(STUNDEN_EMPTY);setEditStunden(null);setStundenDialog(true);}}><Plus className="h-4 w-4" />Eintragen</Button>
          </div>
          <div className="divide-y divide-gray-50">
            {sw.length===0 && <p className="text-center py-12 text-sm" style={{color:'#d1d5db'}}>Noch keine Stunden</p>}
            {sw.map((w:any)=>(
              <div key={w.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'rgba(139,92,246,.08)'}}>
                  <Clock className="h-3.5 w-3.5" style={{color:'#8b5cf6'}} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{color:'#0f1f3d'}}>{w.employees?.name||'–'}</p>
                  <p className="text-xs truncate" style={{color:'#9ca3af'}}>{fmtDate(w.datum)}{w.beschreibung?` · ${w.beschreibung}`:''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{w.stunden}h</p>
                  <p className="text-xs" style={{color:'#9ca3af'}}>{fmtEur(Number(w.stunden)*Number(w.employees?.stundensatz??STUNDEN_SATZ))}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>{setStundenForm({mitarbeiter_id:w.mitarbeiter_id,datum:w.datum,stunden:String(w.stunden),beschreibung:w.beschreibung||''});setEditStunden(w);setStundenDialog(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="h-3.5 w-3.5" style={{color:'#9ca3af'}} /></button>
                  <button onClick={()=>{if(confirm('Löschen?'))deleteStunden.mutate(w.id);}} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" style={{color:'#fca5a5'}} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MATERIAL ── */}
      {tab==='Material' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b" style={{borderColor:'#eef1f9'}}>
            <div><h3 className="font-semibold" style={{color:'#0f1f3d'}}>Material</h3><p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>{mat.length} Pos. · {fmtEur(materialkosten)}</p></div>
            <Button size="sm" onClick={()=>{setMatForm(MAT_EMPTY);setEditMaterial(null);setMaterialDialog(true);}}><Plus className="h-4 w-4" />Hinzufügen</Button>
          </div>
          <div className="divide-y divide-gray-50">
            {mat.length===0 && <p className="text-center py-12 text-sm" style={{color:'#d1d5db'}}>Noch kein Material</p>}
            {mat.map((m:any)=>{
              const ms = {bestellt:{bg:'#fffbeb',text:'#b45309'},geliefert:{bg:'#eff6ff',text:'#1d4ed8'},verbraucht:{bg:'#f0fdf4',text:'#065f46'}}[m.status as string]||{bg:'#f4f6fa',text:'#6b7a99'};
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                  <Package className="h-4 w-4 flex-shrink-0" style={{color:'#f97316'}} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{color:'#0f1f3d'}}>{m.bezeichnung}</p>
                    <p className="text-xs" style={{color:'#9ca3af'}}>{m.menge} {m.einheit} · {fmtEur(m.einzelpreis)}/Stk · {fmtDate(m.datum)}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{background:ms.bg, color:ms.text}}>{m.status}</span>
                  <span className="font-bold text-sm flex-shrink-0" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{fmtEur(m.gesamtpreis)}</span>
                  <div className="flex gap-1">
                    <button onClick={()=>{setMatForm({bezeichnung:m.bezeichnung,menge:String(m.menge),einheit:m.einheit,einzelpreis:String(m.einzelpreis),gesamtpreis:String(m.gesamtpreis),status:m.status,datum:m.datum||''});setEditMaterial(m);setMaterialDialog(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="h-3.5 w-3.5" style={{color:'#9ca3af'}} /></button>
                    <button onClick={()=>{if(confirm('Löschen?'))deleteMat.mutate(m.id);}} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" style={{color:'#fca5a5'}} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── NACHTRÄGE ── */}
      {tab==='Nachträge' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[{l:'Genehmigt',v:nachtragGenehmigt,c:'#10b981',bg:'rgba(16,185,129,.08)'},{l:'Eingereicht',v:nachtragEingereicht,c:'#3b82f6',bg:'rgba(59,130,246,.08)'},{l:'Gesamt',v:nach.reduce((s,n)=>s+Number(n.betrag??0),0),c:'#0f1f3d',bg:'#f4f6fa'}].map(k=>(
              <div key={k.l} className="card p-4 text-center" style={{background:k.bg}}>
                <p className="text-lg font-bold" style={{color:k.c, fontFamily:'DM Mono, monospace'}}>{fmtEur(k.v)}</p>
                <p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>{k.l}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={()=>{setNachForm(NACH_EMPTY);setEditNachtrag(null);setNachtragDialog(true);}}><Plus className="h-4 w-4" />Neuer Nachtrag</Button>
          </div>
          {nach.length===0 && <div className="card p-12 text-center text-sm" style={{color:'#d1d5db'}}>Noch keine Nachträge</div>}
          {nach.map((n:any)=>{
            const ns=NACH_STATUS.find(s=>s.value===n.status)??NACH_STATUS[0];
            return (
              <div key={n.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold" style={{color:'#0f1f3d'}}>{n.titel}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:ns.bg, color:ns.text}}>{ns.label}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:'#9ca3af'}}>{fmtDate(n.datum)}</p>
                    {n.beschreibung && <p className="text-sm mt-2" style={{color:'#374151'}}>{n.beschreibung}</p>}
                    {n.begruendung && <p className="text-xs mt-1 p-2 rounded-lg" style={{background:'#f4f6fa', color:'#6b7a99'}}>{n.begruendung}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-lg font-bold" style={{color:'#0f1f3d', fontFamily:'DM Mono, monospace'}}>{fmtEur(n.betrag)}</span>
                    <button onClick={()=>{setNachForm({titel:n.titel,beschreibung:n.beschreibung||'',betrag:String(n.betrag),status:n.status,datum:n.datum||'',begruendung:n.begruendung||''});setEditNachtrag(n);setNachtragDialog(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="h-3.5 w-3.5" style={{color:'#9ca3af'}} /></button>
                    <button onClick={()=>{if(confirm('Löschen?'))deleteNach.mutate(n.id);}} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" style={{color:'#fca5a5'}} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FOTOS ── */}
      {tab==='Fotos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={()=>{setFotoForm(FOTO_EMPTY);setFotoDialog(true);}}><Camera className="h-4 w-4" />Hochladen</Button>
          </div>
          {fts.length===0 && (
            <div className="card p-14 text-center">
              <Camera className="h-10 w-10 mx-auto mb-3" style={{color:'#e5e9f2'}} />
              <p className="text-sm" style={{color:'#9ca3af'}}>Noch keine Fotos</p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {fts.map((f:any)=>(
              <div key={f.id} className="card overflow-hidden group relative">
                <img src={f.url} alt={f.beschreibung||''} className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105" />
                <button onClick={()=>{if(confirm('Foto löschen?'))deleteFoto.mutate(f.id);}} className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{background:'rgba(255,255,255,.9)'}}>
                  <Trash2 className="h-3.5 w-3.5" style={{color:'#ef4444'}} />
                </button>
                <div className="p-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{background:'#f4f6fa', color:'#6b7a99'}}>{FOTO_KAT_LABELS[f.kategorie]}</span>
                  {f.beschreibung && <p className="text-xs mt-1 truncate" style={{color:'#374151'}}>{f.beschreibung}</p>}
                  <p className="text-[10px] mt-0.5" style={{color:'#9ca3af'}}>{fmtDate(f.datum)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialoge */}
      <Dialog open={stundenDialog} onOpenChange={v=>{setStundenDialog(v);if(!v){setEditStunden(null);setStundenForm(STUNDEN_EMPTY);}}}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editStunden?'Bearbeiten':'Stunden eintragen'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Mitarbeiter *</Label><Select value={stundenForm.mitarbeiter_id} onValueChange={v=>setStundenForm((f:any)=>({...f,mitarbeiter_id:v}))}><SelectOption value="">Wählen...</SelectOption>{emps.map((e:any)=><SelectOption key={e.id} value={e.id}>{e.name}{e.kuerzel?` (${e.kuerzel})`:''}</SelectOption>)}</Select></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Datum *</Label><Input type="date" value={stundenForm.datum} onChange={e=>setStundenForm((f:any)=>({...f,datum:e.target.value}))} /></div><div><Label>Stunden *</Label><Input placeholder="7.5" value={stundenForm.stunden} onChange={e=>setStundenForm((f:any)=>({...f,stunden:e.target.value}))} /></div></div>
            <div><Label>Tätigkeit</Label><Input value={stundenForm.beschreibung} onChange={e=>setStundenForm((f:any)=>({...f,beschreibung:e.target.value}))} /></div>
            <div className="flex gap-3 pt-1"><Button variant="outline" className="flex-1" onClick={()=>setStundenDialog(false)}>Abbrechen</Button><Button className="flex-1" onClick={()=>saveStunden.mutate()} disabled={saveStunden.isPending||!stundenForm.mitarbeiter_id}>{saveStunden.isPending?'…':'Speichern'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={materialDialog} onOpenChange={v=>{setMaterialDialog(v);if(!v){setEditMaterial(null);setMatForm(MAT_EMPTY);}}}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editMaterial?'Bearbeiten':'Material'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Bezeichnung *</Label><Input value={matForm.bezeichnung} onChange={e=>setMatForm((f:any)=>({...f,bezeichnung:e.target.value}))} autoFocus /></div>
            <div className="grid grid-cols-3 gap-2"><div><Label>Menge</Label><Input value={matForm.menge} onChange={e=>setMatForm((f:any)=>({...f,menge:e.target.value}))} /></div><div><Label>Einheit</Label><Input value={matForm.einheit} onChange={e=>setMatForm((f:any)=>({...f,einheit:e.target.value}))} /></div><div><Label>Einzelpreis €</Label><Input value={matForm.einzelpreis} onChange={e=>setMatForm((f:any)=>({...f,einzelpreis:e.target.value}))} /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Gesamt €</Label><Input placeholder="leer = auto" value={matForm.gesamtpreis} onChange={e=>setMatForm((f:any)=>({...f,gesamtpreis:e.target.value}))} /></div><div><Label>Status</Label><Select value={matForm.status} onValueChange={v=>setMatForm((f:any)=>({...f,status:v}))}>{MAT_STATUS.map(s=><SelectOption key={s} value={s}>{s}</SelectOption>)}</Select></div></div>
            <div><Label>Datum</Label><Input type="date" value={matForm.datum} onChange={e=>setMatForm((f:any)=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-1"><Button variant="outline" className="flex-1" onClick={()=>setMaterialDialog(false)}>Abbrechen</Button><Button className="flex-1" onClick={()=>saveMat.mutate()} disabled={saveMat.isPending||!matForm.bezeichnung}>{saveMat.isPending?'…':'Speichern'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nachtragDialog} onOpenChange={v=>{setNachtragDialog(v);if(!v){setEditNachtrag(null);setNachForm(NACH_EMPTY);}}}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editNachtrag?'Bearbeiten':'Nachtrag'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Titel *</Label><Input value={nachForm.titel} onChange={e=>setNachForm((f:any)=>({...f,titel:e.target.value}))} autoFocus /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Betrag €</Label><Input value={nachForm.betrag} onChange={e=>setNachForm((f:any)=>({...f,betrag:e.target.value}))} /></div><div><Label>Status</Label><Select value={nachForm.status} onValueChange={v=>setNachForm((f:any)=>({...f,status:v}))}>{NACH_STATUS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div></div>
            <div><Label>Beschreibung</Label><Textarea value={nachForm.beschreibung} onChange={e=>setNachForm((f:any)=>({...f,beschreibung:e.target.value}))} /></div>
            <div><Label>Begründung</Label><Textarea value={nachForm.begruendung} onChange={e=>setNachForm((f:any)=>({...f,begruendung:e.target.value}))} /></div>
            <div><Label>Datum</Label><Input type="date" value={nachForm.datum} onChange={e=>setNachForm((f:any)=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-1"><Button variant="outline" className="flex-1" onClick={()=>setNachtragDialog(false)}>Abbrechen</Button><Button className="flex-1" onClick={()=>saveNach.mutate()} disabled={saveNach.isPending||!nachForm.titel}>{saveNach.isPending?'…':'Speichern'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fotoDialog} onOpenChange={v=>{setFotoDialog(v);if(!v)setFotoForm(FOTO_EMPTY);}}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Foto hochladen</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Kategorie</Label><Select value={fotoForm.kategorie} onValueChange={v=>setFotoForm((f:any)=>({...f,kategorie:v}))}>{FOTO_KAT.map(k=><SelectOption key={k} value={k}>{FOTO_KAT_LABELS[k]}</SelectOption>)}</Select></div>
            <div><Label>Beschreibung</Label><Input value={fotoForm.beschreibung} onChange={e=>setFotoForm((f:any)=>({...f,beschreibung:e.target.value}))} /></div>
            <label className="flex flex-col items-center justify-center w-full h-28 cursor-pointer rounded-xl transition-colors hover:bg-blue-50/50" style={{border:'2px dashed #e5e9f2'}}>
              <Upload className="h-7 w-7 mb-2" style={{color:uploading?'#3b82f6':'#d1d5db'}} />
              <span className="text-sm" style={{color:'#9ca3af'}}>{uploading?'Lädt hoch...':'Klicken zum Auswählen'}</span>
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e=>{if(e.target.files?.[0])handleFotoUpload(e.target.files[0]);}} />
            </label>
            <Button variant="outline" className="w-full" onClick={()=>setFotoDialog(false)}>Schließen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
