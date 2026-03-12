import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { HardHat, Euro, Clock, AlertTriangle, TrendingUp, Package, ArrowRight, Flame, CheckCircle2 } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { useNavigate } from 'react-router-dom';

const S: Record<string,{label:string;dot:string;bg:string;text:string;glow:string}> = {
  offen:          {label:'Offen',          dot:'#94a3b8',bg:'#f8fafc',text:'#64748b',glow:'rgba(148,163,184,.15)'},
  in_bearbeitung: {label:'In Bearbeitung', dot:'#3b82f6',bg:'#eff6ff',text:'#1d4ed8',glow:'rgba(59,130,246,.12)'},
  pausiert:       {label:'Pausiert',       dot:'#f59e0b',bg:'#fffbeb',text:'#b45309',glow:'rgba(245,158,11,.12)'},
  abgeschlossen:  {label:'Abgeschlossen',  dot:'#10b981',bg:'#f0fdf4',text:'#065f46',glow:'rgba(16,185,129,.12)'},
  abgerechnet:    {label:'Abgerechnet',    dot:'#8b5cf6',bg:'#faf5ff',text:'#5b21b6',glow:'rgba(139,92,246,.12)'},
};

const TooltipCustom = ({active,payload,label}:any) => {
  if(!active||!payload?.length)return null;
  return (
    <div style={{background:'#0f1f3d',borderRadius:10,padding:'8px 12px',boxShadow:'0 8px 24px rgba(0,0,0,.25)'}}>
      <p style={{color:'#8da3c9',fontSize:10,marginBottom:4}}>{label}</p>
      {payload.map((p:any)=>(
        <div key={p.name} style={{display:'flex',gap:12,alignItems:'center',fontSize:11}}>
          <span style={{color:'#64748b'}}>{p.name}</span>
          <span style={{fontWeight:700,color:p.fill||p.stroke||'#e2e8f0'}}>
            {typeof p.value==='number'&&p.value>200?fmtEur(p.value):`${p.value}h`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: baustellen=[] } = useQuery({queryKey:['bs-dashboard'], queryFn:async()=>{const{data}=await supabase.from('baustellen').select('*').order('created_at',{ascending:false});return data??[];}});
  const { data: stunden=[] }    = useQuery({queryKey:['bs-stunden-dash'], queryFn:async()=>{const{data}=await supabase.from('bs_stundeneintraege').select('*,employees(stundensatz,name,kuerzel)');return data??[];}});
  const { data: materialien=[] }= useQuery({queryKey:['bs-mat-dash'],    queryFn:async()=>{const{data}=await supabase.from('bs_materialien').select('*');return data??[];}});
  const { data: nachtraege=[] } = useQuery({queryKey:['bs-nach-dash'],   queryFn:async()=>{const{data}=await supabase.from('bs_nachtraege').select('*');return data??[];}});
  const { data: eskalationen=[] }=useQuery({queryKey:['bs-esk-dash'],   queryFn:async()=>{const{data}=await supabase.from('bs_eskalationen').select('*').eq('gelesen',false);return data??[];}});

  const bs=baustellen as any[], sw=stunden as any[], mat=materialien as any[], nach=nachtraege as any[], esk=eskalationen as any[];
  const aktive = bs.filter(b=>b.status!=='abgeschlossen'&&b.status!=='abgerechnet');
  const archiv = bs.filter(b=>b.status==='abgeschlossen'||b.status==='abgerechnet');
  const aktiveK = aktive.map(b=>({...b,...berechneKosten(b.id,sw,mat,nach,Number(b.budget??0))}));

  const gesamtBudget   = aktiveK.reduce((s,k)=>s+k.effektivBudget,0);
  const gesamtKosten   = aktiveK.reduce((s,k)=>s+k.gesamtkosten,0);
  const gesamtPersonal = aktiveK.reduce((s,k)=>s+k.personalkosten,0);
  const gesamtH        = sw.reduce((s,w)=>s+Number(w.stunden??0),0);
  const overBudget     = aktiveK.filter(k=>k.overBudget).length;
  const kritisch       = esk.filter((e:any)=>e.schwere==='kritisch').length;

  const weekData = Array.from({length:8},(_,i)=>{
    const start=new Date(); start.setDate(start.getDate()-(7-i)*7);
    const end=new Date(start); end.setDate(end.getDate()+7);
    const kosten=sw.filter((w:any)=>{const d=new Date(w.datum);return d>=start&&d<end;})
      .reduce((s:number,w:any)=>s+Number(w.stunden??0)*Number(w.employees?.stundensatz??38.08),0);
    return {label:`KW${String(i+1).padStart(2,'0')}`, kosten:Math.round(kosten)};
  });

  const budgetVsKosten = aktiveK.filter(b=>b.effektivBudget>0).slice(0,5).map(b=>({
    name: b.name.length>12 ? b.name.substring(0,12)+'…' : b.name,
    Budget: Math.round(b.effektivBudget),
    Kosten: Math.round(b.gesamtkosten),
  }));

  const heute = new Date();
  const fristKritisch = aktiveK.filter(b=>{
    if(!b.enddatum)return false;
    const diff = Math.round((new Date(b.enddatum).getTime()-heute.getTime())/86400000);
    return diff<=7;
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontFamily:'DM Sans',fontWeight:800,fontSize:'1.5rem',color:'#0f1f3d',letterSpacing:'-.03em',margin:0}}>
            Dashboard
          </h1>
          <p style={{color:'#6b7a99',fontSize:13,margin:'2px 0 0'}}>
            {aktive.length} aktive Baustellen · {archiv.length} archiviert
          </p>
        </div>
        {esk.length>0 && (
          <button onClick={()=>navigate('/eskalationen')}
            style={{display:'flex',alignItems:'center',gap:6,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:12,padding:'7px 14px',color:'#dc2626',fontWeight:700,fontSize:12,cursor:'pointer'}}>
            <AlertTriangle style={{width:14,height:14}}/>
            {kritisch>0?`${kritisch} kritisch · `:''}{esk.length} Eskalation{esk.length!==1?'en':''}
          </button>
        )}
      </div>

      {/* KPI-Leiste */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
        {[
          {l:'Aktive Baustellen',v:aktive.length,      sub:`${archiv.length} archiviert`,    icon:HardHat,   c:'#3b82f6', bg:'rgba(59,130,246,.1)'},
          {l:'Eff. Budget',      v:fmtEur(gesamtBudget),sub:'Aktive BS',                     icon:Euro,      c:'#1e3a5f', bg:'rgba(30,58,95,.08)'},
          {l:'Gesamtkosten',     v:fmtEur(gesamtKosten),sub:`${Math.round(gesamtKosten/gesamtBudget*100)||0}% Budget`, icon:TrendingUp,c:gesamtKosten>gesamtBudget&&gesamtBudget>0?'#ef4444':'#10b981',bg:gesamtKosten>gesamtBudget&&gesamtBudget>0?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)'},
          {l:'Personalkosten',   v:fmtEur(gesamtPersonal),sub:`${Math.round(gesamtH*10)/10}h gesamt`,icon:Clock,c:'#8b5cf6',bg:'rgba(139,92,246,.1)'},
          {l:'Über Budget',      v:overBudget,          sub:overBudget>0?'⚠ Prüfen':'Alles OK',icon:AlertTriangle,c:overBudget>0?'#ef4444':'#10b981',bg:overBudget>0?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)'},
          {l:'Frist ≤7 Tage',   v:fristKritisch.length,sub:fristKritisch.length>0?'Dringend':'Keine',icon:Flame,c:fristKritisch.length>0?'#f97316':'#10b981',bg:fristKritisch.length>0?'rgba(249,115,22,.1)':'rgba(16,185,129,.1)'},
        ].map(k=>(
          <div key={k.l} className="card" style={{padding:'14px 16px',cursor:'default'}}>
            <div style={{width:32,height:32,borderRadius:10,background:k.bg,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
              <k.icon style={{width:15,height:15,color:k.c}}/>
            </div>
            <div style={{fontSize:18,fontWeight:800,color:'#0f1f3d',letterSpacing:'-.02em',lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:11,color:'#6b7a99',marginTop:2}}>{k.l}</div>
            <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Baustellen-Cards */}
      <div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <h2 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:14,color:'#0f1f3d',margin:0}}>Aktive Baustellen</h2>
          <button onClick={()=>navigate('/baustellen')}
            style={{display:'flex',alignItems:'center',gap:4,color:'#3b82f6',fontSize:12,fontWeight:600,background:'none',border:'none',cursor:'pointer'}}>
            Alle anzeigen <ArrowRight style={{width:12,height:12}}/>
          </button>
        </div>

        {aktiveK.length===0 ? (
          <div className="card" style={{padding:40,textAlign:'center'}}>
            <HardHat style={{width:32,height:32,color:'#e5e9f2',margin:'0 auto 8px'}}/>
            <p style={{color:'#9ca3af',fontSize:13}}>Keine aktiven Baustellen</p>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:12}}>
            {aktiveK.map((b:any)=>{
              const st = S[b.status]||S.offen;
              const daysLeft = b.enddatum ? Math.round((new Date(b.enddatum).getTime()-heute.getTime())/86400000) : null;
              const fristWarn = daysLeft!==null&&daysLeft<=14;
              const fristErr  = daysLeft!==null&&daysLeft<=0;
              return (
                <div key={b.id} onClick={()=>navigate(`/baustellen/${b.id}`)}
                  style={{
                    background:'#fff', borderRadius:16,
                    border:`1px solid ${b.overBudget?'rgba(239,68,68,.3)':fristErr?'rgba(249,115,22,.3)':'#eef1f9'}`,
                    borderTop:`3px solid ${st.dot}`,
                    boxShadow:`0 2px 8px ${st.glow}`,
                    cursor:'pointer', padding:16,
                    transition:'all .18s',
                  }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow=`0 8px 24px ${st.glow}`;}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='';(e.currentTarget as HTMLElement).style.boxShadow=`0 2px 8px ${st.glow}`;}}
                >
                  {/* Card-Header */}
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:'#0f1f3d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.name}</div>
                      <div style={{fontSize:11,color:'#9ca3af',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.auftraggeber||'–'}{b.gewerk?` · ${b.gewerk}`:''}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:st.bg,color:st.text}}>{st.label}</span>
                      {fristWarn && (
                        <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:fristErr?'rgba(239,68,68,.1)':'rgba(249,115,22,.1)',color:fristErr?'#dc2626':'#d97706'}}>
                          {fristErr?`${Math.abs(daysLeft!)}d überfällig`:`${daysLeft}d`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Budget-Bar */}
                  {b.effektivBudget>0 ? (
                    <>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:5}}>
                        <span style={{color:b.overBudget?'#ef4444':'#6b7a99',fontWeight:b.overBudget?700:400}}>{fmtEur(b.gesamtkosten)}</span>
                        <span style={{fontWeight:800,color:b.overBudget?'#ef4444':b.pct>80?'#f59e0b':'#1e3a5f'}}>{b.pct}%</span>
                      </div>
                      <div style={{height:5,borderRadius:99,background:'#f0f2f8',overflow:'hidden',marginBottom:8}}>
                        <div style={{height:'100%',borderRadius:99,background:b.overBudget?'#ef4444':b.pct>80?'#f59e0b':'#1e3a5f',width:`${Math.min(b.pct,100)}%`,transition:'width .6s ease'}}/>
                      </div>
                      <div style={{fontSize:10,color:'#9ca3af'}}>Budget: {fmtEur(b.effektivBudget)}</div>
                    </>
                  ) : (
                    <div style={{fontSize:11,color:'#d1d5db',padding:'6px 0'}}>Kein Budget definiert</div>
                  )}

                  {/* Footer */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12,paddingTop:10,borderTop:'1px solid #f0f2f8'}}>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {b.personalkosten>0 && <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:6,background:'rgba(139,92,246,.08)',color:'#7c3aed'}}>P {fmtEur(b.personalkosten)}</span>}
                      {b.materialkosten>0 && <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:6,background:'rgba(249,115,22,.08)',color:'#c2410c'}}>M {fmtEur(b.materialkosten)}</span>}
                    </div>
                    <ArrowRight style={{width:13,height:13,color:'#cbd5e1'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts */}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
        {/* Timeline */}
        <div className="card" style={{padding:20}}>
          <h3 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:13,color:'#0f1f3d',margin:'0 0 2px'}}>Personalkosten-Verlauf</h3>
          <p style={{color:'#9ca3af',fontSize:11,margin:'0 0 16px'}}>Letzte 8 Wochen</p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={weekData}>
              <defs>
                <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e3a5f" stopOpacity={0.18}/>
                  <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:9,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>`${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<TooltipCustom/>}/>
              <Area type="monotone" dataKey="kosten" name="€" stroke="#1e3a5f" strokeWidth={2.5} fill="url(#dg1)" dot={false} activeDot={{r:4,fill:'#1e3a5f',strokeWidth:0}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status-Donut */}
        <div className="card" style={{padding:20}}>
          <h3 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:13,color:'#0f1f3d',margin:'0 0 2px'}}>Status</h3>
          <p style={{color:'#9ca3af',fontSize:11,margin:'0 0 16px'}}>{bs.length} Baustellen gesamt</p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {Object.entries(S).map(([k,v])=>{
              const cnt=bs.filter(b=>b.status===k).length;
              if(cnt===0)return null;
              const pct=Math.round(cnt/bs.length*100);
              return (
                <div key={k}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#374151'}}>
                      <div style={{width:7,height:7,borderRadius:99,background:v.dot,flexShrink:0}}/>
                      {v.label}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:'#0f1f3d'}}>{cnt}</span>
                  </div>
                  <div style={{height:3,borderRadius:99,background:'#f0f2f8',overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,background:v.dot,width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Budget-Vergleich */}
      {budgetVsKosten.length>0 && (
        <div className="card" style={{padding:20}}>
          <h3 style={{fontFamily:'DM Sans',fontWeight:700,fontSize:13,color:'#0f1f3d',margin:'0 0 2px'}}>Budget vs. Kosten</h3>
          <p style={{color:'#9ca3af',fontSize:11,margin:'0 0 16px'}}>Aktive Baustellen</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={budgetVsKosten} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:9,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>`${Math.round(v/1000)}k€`} tick={{fontSize:9,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<TooltipCustom/>}/>
              <Bar dataKey="Budget" fill="#e2e8f0" radius={[5,5,0,0]}/>
              <Bar dataKey="Kosten" fill="#1e3a5f" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
