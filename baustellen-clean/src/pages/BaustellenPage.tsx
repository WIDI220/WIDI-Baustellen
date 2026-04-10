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
import { Plus, Search, HardHat, ArrowRight, Pencil, Trash2, Calendar, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { fmtEur, fmtDate } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { erkenneBudget, budgetAnzeige } from '@/lib/budgetErkennung';

const STATUS_OPTIONS = [
  { value:'offen',          label:'Offen',          dot:'#94a3b8', bg:'#f8fafc', text:'#64748b' },
  { value:'in_bearbeitung', label:'In Bearbeitung',  dot:'#3b82f6', bg:'#eff6ff', text:'#1d4ed8' },
  { value:'pausiert',       label:'Pausiert',        dot:'#f59e0b', bg:'#fffbeb', text:'#b45309' },
  { value:'abgeschlossen',  label:'Abgeschlossen',   dot:'#10b981', bg:'#f0fdf4', text:'#065f46' },
  { value:'abgerechnet',    label:'Abgerechnet',     dot:'#8b5cf6', bg:'#faf5ff', text:'#5b21b6' },
];
const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const EMPTY = { name:'', adresse:'', auftraggeber:'', kostenstelle:'', startdatum:'', enddatum:'', status:'offen', gewerk:'Hochbau', projektleiter:'', beschreibung:'', budgetInput:'' };


// A-Nummer aus Baustellenname extrahieren: "[A20917] Betreff" → "20917"
function extractANummer(name: string): string {
  const m = name.match(/^\[A(\w+)\]/);
  return m ? m[1] : '';
}
export default function BaustellenPage() {
  const [aktiverTyp, setAktiverTyp] = useState<'intern'|'extern'>('intern');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at',{ascending:false}); return data??[]; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-list'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id,stunden,employees(stundensatz)'); return data??[]; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-list'],     queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id,gesamtpreis'); return data??[]; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-list'],    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id,betrag,status'); return data??[]; } });

  const save = useMutation({
    mutationFn: async () => {
      const erkannt = erkenneBudget(form.budgetInput);
      const payload = {
        name: form.name,
        adresse: form.adresse || null,
        auftraggeber: form.auftraggeber || null,
        typ: aktiverTyp,
        kostenstelle: (form as any).kostenstelle || null,
        startdatum: form.startdatum || null,
        enddatum: form.enddatum || null,
        status: form.status,
        gewerk: form.gewerk,
        projektleiter: form.projektleiter || null,
        beschreibung: form.beschreibung || null,
        budget: erkannt?.budget ?? 0,
        budget_typ: erkannt?.typ ?? 'festpreis',
        budget_menge: erkannt?.menge ?? 0,
        fortschritt: 0,
      };
      if (editItem) { const {error}=await supabase.from('baustellen').update(payload).eq('id',editItem.id); if(error)throw error; }
      else { const {error}=await supabase.from('baustellen').insert(payload); if(error)throw error; }
    },
    onSuccess: async () => {
      toast.success(editItem?'Aktualisiert':'Baustelle angelegt');
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, editItem ? `Baustelle bearbeitet: ${form.name}` : `Baustelle angelegt: ${form.name}`, 'baustelle', editItem?.id, { name: form.name, status: form.status });
      setDialog(false); setEditItem(null); setForm(EMPTY);
      queryClient.invalidateQueries({queryKey:['baustellen-list']});
      queryClient.invalidateQueries({queryKey:['bs-dashboard']});
    },
    onError: (e:any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id:string) => { const {error}=await supabase.from('baustellen').delete().eq('id',id); if(error)throw error; },
    onSuccess: async (_: any, id: string) => {
      toast.success('Gelöscht');
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, `Baustelle gelöscht`, 'baustelle', id);
      queryClient.invalidateQueries({queryKey:['baustellen-list']});
    },
  });

  const bs = baustellen as any[], sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[];
  const aktiveBS = bs.filter(b => b.status !== 'abgeschlossen' && b.status !== 'abgerechnet');
  const countIntern = aktiveBS.filter(b => ((b as any).typ || 'intern') === 'intern').length;
  const countExtern = aktiveBS.filter(b => ((b as any).typ || 'intern') === 'extern').length;

  const filtered = aktiveBS.filter(b => {
    const bTyp = (b as any).typ || 'intern';
    if (bTyp !== aktiverTyp) return false;
    if (!search) return true;
    return b.name.toLowerCase().includes(search.toLowerCase()) || (b.auftraggeber||'').toLowerCase().includes(search.toLowerCase());
  });

  const openEdit = (b:any, e:React.MouseEvent) => {
    e.stopPropagation();
    // Budget-Input aus gespeichertem Typ wiederherstellen
    let budgetInput = String(b.budget || '');
    if (b.budget_typ === 'stunden' && b.budget_menge) budgetInput = `${b.budget_menge}h`;
    else if (b.budget_typ === 'stueckzahl' && b.budget_menge) budgetInput = `${b.budget_menge}stk`;
    setForm({ name:b.name, adresse:b.adresse||'', auftraggeber:b.auftraggeber||'', kostenstelle:(b as any).kostenstelle||'', startdatum:b.startdatum||'', enddatum:b.enddatum||'', status:b.status, gewerk:b.gewerk||'Hochbau', projektleiter:b.projektleiter||'', beschreibung:b.beschreibung||'', budgetInput });
    setEditItem(b);
    setDialog(true);
  };

  // Live-Erkennung im Dialog
  const erkannt = erkenneBudget(form.budgetInput);
  const erkennungHinweis: Record<string, string> = {
    festpreis: '💰 Festpreis erkannt',
    stunden: '⏱ Stundenbudget erkannt',
    stueckzahl: '📦 Stückzahl erkannt',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .bs-card { animation:fadeUp 0.35s ease forwards; opacity:0; transition:box-shadow .2s,transform .2s; }
        .bs-card:hover { box-shadow:0 8px 30px rgba(0,0,0,0.08) !important; transform:translateY(-2px); }
        .bs-action:hover { background:#f1f5f9 !important; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Baustellen <span style={{ color:'#2563eb' }}>({aktiveBS.length})</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>{filtered.length} {aktiverTyp==='extern'?'externe Tickets':'Baustellen'} aktiv</p>
        </div>
        <button
          onClick={() => {setForm(EMPTY);setEditItem(null);setDialog(true);}}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', background: aktiverTyp==='extern'?'linear-gradient(135deg,#e11d48,#9f1239)':'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: aktiverTyp==='extern'?'0 4px 14px rgba(225,29,72,0.3)':'0 4px 14px rgba(37,99,235,0.3)', transition:'all .15s' }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-1px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 20px rgba(37,99,235,0.4)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 14px rgba(37,99,235,0.3)';}}>
          <Plus size={15} /> {aktiverTyp==='extern'?'Neues ext. Ticket':'Neue Baustelle'}
        </button>
      </div>

      {/* Typ-Toggle */}
      <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:12, padding:4, width:'fit-content' }}>
        {([['intern','Baustellen',countIntern,'#2563eb'],['extern','Externe Tickets',countExtern,'#e11d48']] as [string,string,number,string][]).map(([t,label,count,color]) => (
          <button key={t} onClick={() => setAktiverTyp(t as 'intern'|'extern')}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:9, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .15s', fontFamily:'inherit',
              background: aktiverTyp===t ? '#fff' : 'transparent',
              color: aktiverTyp===t ? color : '#94a3b8',
              boxShadow: aktiverTyp===t ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            }}>
            {label}
            <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:20,
              background: aktiverTyp===t ? color+'18' : 'rgba(0,0,0,.04)',
              color: aktiverTyp===t ? color : '#94a3b8' }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative' }}>
        <Search size={15} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
        <input
          placeholder="Name oder Auftraggeber suchen..."
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{ width:'100%', padding:'10px 14px 10px 40px', borderRadius:12, border:'1px solid #e2e8f0', background:'#fff', fontSize:13, color:'#0f172a', outline:'none', boxSizing:'border-box', fontFamily:'inherit', transition:'border-color .15s' }}
          onFocus={e=>{e.target.style.borderColor='#2563eb';}}
          onBlur={e=>{e.target.style.borderColor='#e2e8f0';}}
        />
      </div>

      {/* Liste */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.length === 0 && (
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'56px 24px', textAlign:'center' }}>
            <HardHat size={36} style={{ color:'#e2e8f0', marginBottom:12 }} />
            <p style={{ color:'#94a3b8', fontSize:14, marginBottom:16 }}>{aktiverTyp==='extern'?'Keine externen Tickets gefunden':'Keine Baustellen gefunden'}</p>
            <button onClick={()=>{setForm(EMPTY);setDialog(true);}}
              style={{ padding:'9px 18px', background:'#2563eb', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <Plus size={14} style={{ display:'inline', marginRight:6 }} />{aktiverTyp==='extern'?'Erstes Ticket anlegen':'Erste anlegen'}
            </button>
          </div>
        )}
        {filtered.map((b:any, idx:number) => {
          const st = STATUS_OPTIONS.find(s=>s.value===b.status)??STATUS_OPTIONS[0];
          const k = berechneKosten(b.id, sw, mat, nach, Number(b.budget??0));
          const daysLeft = b.enddatum ? Math.round((new Date(b.enddatum).getTime()-Date.now())/86400000) : null;
          const fristAlert = daysLeft !== null && daysLeft <= 7;
          const barColor = k.overBudget ? '#ef4444' : k.pct > 80 ? '#f59e0b' : '#2563eb';

          return (
            <div key={b.id} className="bs-card"
              style={{ animationDelay:`${idx*0.04}s`, background:'#fff', borderRadius:16, border:'1px solid #f1f5f9', padding:'18px 20px', cursor:'pointer', position:'relative', overflow:'hidden', borderLeft:`3px solid ${st.dot}` }}
              onClick={()=>navigate(`/baustellen/liste/${b.id}`)}>

              <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                {/* Icon */}
                <div style={{ width:42, height:42, borderRadius:13, background:`${st.dot}15`, border:`1px solid ${st.dot}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <HardHat size={20} style={{ color:st.dot }} />
                </div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{b.name}</span>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:20, background:st.bg, color:st.text }}>{st.label}</span>
                    <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, background: b.gewerk==='Hochbau'?'#eff6ff':'#f0fdf4', color: b.gewerk==='Hochbau'?'#1d4ed8':'#065f46', fontWeight:600 }}>{b.gewerk}</span>
                    {fristAlert && (
                      <span style={{ fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:'#fef2f2', color:'#dc2626', display:'flex', alignItems:'center', gap:4 }}>
                        <AlertTriangle size={10} />{(daysLeft??0)<0?`${Math.abs(daysLeft??0)}d überfällig`:`${daysLeft}d`}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 8px' }}>
                    {b.auftraggeber||'–'}{b.adresse?` · ${b.adresse}`:''}{(b as any).kostenstelle?` · KST ${(b as any).kostenstelle}`:''}
                    {b.enddatum && <span style={{ marginLeft:8 }}><Calendar size={11} style={{ display:'inline', marginRight:3 }} />{fmtDate(b.enddatum)}</span>}
                  </p>

                  {k.effektivBudget > 0 && (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:11 }}>
                        <span style={{ color:k.overBudget?'#dc2626':'#64748b' }}>
                          {fmtEur(k.gesamtkosten)}
                          {k.nachtragGenehmigt>0 && <span style={{ color:'#10b981', marginLeft:6 }}>+{fmtEur(k.nachtragGenehmigt)}</span>}
                          <span style={{ color:'#cbd5e1', marginLeft:4 }}>/ {fmtEur(k.effektivBudget)}</span>
                        </span>
                        <span style={{ fontWeight:700, color:barColor }}>{k.pct}%</span>
                      </div>
                      <div style={{ height:5, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(k.pct,100)}%`, background:barColor, borderRadius:99, transition:'width .6s ease' }} />
                      </div>
                      {(k.personalkosten>0||k.materialkosten>0) && (
                        <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                          {k.personalkosten>0 && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#faf5ff', color:'#7c3aed' }}>Personal {fmtEur(k.personalkosten)}</span>}
                          {k.materialkosten>0 && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#fff7ed', color:'#c2410c' }}>Material {fmtEur(k.materialkosten)}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                  <button className="bs-action" onClick={e=>openEdit(b,e)}
                    style={{ padding:'7px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', color:'#94a3b8', transition:'all .15s' }}>
                    <Pencil size={14} />
                  </button>
                  <button className="bs-action" onClick={e=>{e.stopPropagation();if(confirm(`"${b.name}" löschen?`))del.mutate(b.id);}}
                    style={{ padding:'7px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', color:'#fca5a5', transition:'all .15s' }}>
                    <Trash2 size={14} />
                  </button>
                  <ArrowRight size={15} style={{ color:'#e2e8f0', marginLeft:4 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialog} onOpenChange={v=>{setDialog(v);if(!v){setEditItem(null);setForm(EMPTY);}}}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?(aktiverTyp==='extern'?'Ext. Ticket bearbeiten':'Baustelle bearbeiten'):(aktiverTyp==='extern'?'Ext. Ticket anlegen':'Neue Baustelle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Name *</Label><Input value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))} autoFocus placeholder="z.B. Klinikum – Station 3" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e=>setForm((f:any)=>({...f,auftraggeber:e.target.value}))} /></div>
              {aktiverTyp==='extern' && <div><Label>Kostenstelle</Label><Input value={(form as any).kostenstelle||''} placeholder="z.B. 900120" onChange={e=>setForm((f:any)=>({...f,kostenstelle:e.target.value}))} /></div>}
              <div><Label>Adresse / Ort</Label><Input value={form.adresse} onChange={e=>setForm((f:any)=>({...f,adresse:e.target.value}))} /></div>
            </div>

            {/* Smart Budget-Eingabe */}
            <div>
              <Label>Budget</Label>
              <Input
                value={form.budgetInput}
                onChange={e=>setForm((f:any)=>({...f,budgetInput:e.target.value}))}
                placeholder="z.B.  5000  oder  120h  oder  50stk"
              />
              {/* Erkennungs-Feedback */}
              {form.budgetInput && (
                <div className="mt-1.5 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
                  style={erkannt ? {background:'rgba(16,185,129,.08)', color:'#065f46', border:'1px solid rgba(16,185,129,.2)'} : {background:'rgba(239,68,68,.08)', color:'#991b1b', border:'1px solid rgba(239,68,68,.2)'}}>
                  {erkannt ? (
                    <><Lightbulb className="h-3.5 w-3.5 flex-shrink-0" /><span><strong>{erkennungHinweis[erkannt.typ]}</strong> – {erkannt.anzeige}{erkannt.typ !== 'festpreis' && <span className="ml-1 opacity-70">(Material nicht enthalten)</span>}</span></>
                  ) : (
                    <><span>❓ Nicht erkannt. Beispiele: </span><code className="font-mono">5000</code><span>, </span><code className="font-mono">120h</code><span>, </span><code className="font-mono">50stk</code></>
                  )}
                </div>
              )}
              {!form.budgetInput && (
                <p className="text-xs mt-1" style={{color:'#9ca3af'}}>
                  Eingabe-Beispiele: <code className="font-mono">5000</code> = Festpreis · <code className="font-mono">120h</code> = Stundenbudget · <code className="font-mono">50stk</code> = Stückzahl
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div><Label>Gewerk</Label><Select value={form.gewerk} onValueChange={v=>setForm((f:any)=>({...f,gewerk:v}))}>{GEWERK_OPTIONS.map(g=><SelectOption key={g} value={g}>{g}</SelectOption>)}</Select></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v=>setForm((f:any)=>({...f,status:v}))}>{STATUS_OPTIONS.map(s=><SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div>
              <div><Label>Projektleiter</Label><Input value={form.projektleiter} onChange={e=>setForm((f:any)=>({...f,projektleiter:e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><Input type="date" value={form.startdatum} onChange={e=>setForm((f:any)=>({...f,startdatum:e.target.value}))} /></div>
              <div><Label>Frist</Label><Input type="date" value={form.enddatum} onChange={e=>setForm((f:any)=>({...f,enddatum:e.target.value}))} /></div>
            </div>
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
