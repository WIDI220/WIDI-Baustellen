import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, MapPin, Calendar, Zap, BarChart2 } from 'lucide-react';

const MONAT_NAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONAT_KURZ  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// IST-Farben — warm/bunt
const IST_COLORS: Record<string,{rgb:string;acc:string;glow:string}> = {
  '2026-01':{rgb:'245,158,11', acc:'#f59e0b',glow:'rgba(245,158,11,.55)'},
  '2026-02':{rgb:'16,185,129', acc:'#10b981',glow:'rgba(16,185,129,.55)'},
  '2026-03':{rgb:'52,211,153', acc:'#34d399',glow:'rgba(52,211,153,.55)'},
  '2026-04':{rgb:'56,189,248', acc:'#38bdf8',glow:'rgba(56,189,248,.55)'},
  '2026-05':{rgb:'59,130,246', acc:'#3b82f6',glow:'rgba(59,130,246,.55)'},
  '2026-06':{rgb:'99,102,241', acc:'#6366f1',glow:'rgba(99,102,241,.55)'},
  '2026-07':{rgb:'139,92,246', acc:'#8b5cf6',glow:'rgba(139,92,246,.55)'},
  '2026-08':{rgb:'239,68,68',  acc:'#ef4444',glow:'rgba(239,68,68,.65)'},
  '2026-09':{rgb:'236,72,153', acc:'#ec4899',glow:'rgba(236,72,153,.55)'},
  '2026-10':{rgb:'251,146,60', acc:'#fb923c',glow:'rgba(251,146,60,.55)'},
  '2026-11':{rgb:'163,230,53', acc:'#a3e635',glow:'rgba(163,230,53,.55)'},
  '2026-12':{rgb:'45,212,191', acc:'#2dd4bf',glow:'rgba(45,212,191,.55)'},
};

// OPTIMAL-Farben — kühles Grün-Teal Design
const OPT_COLORS: Record<string,{rgb:string;acc:string;glow:string}> = {
  '2026-01':{rgb:'20,184,166', acc:'#14b8a6',glow:'rgba(20,184,166,.55)'},
  '2026-02':{rgb:'16,185,129', acc:'#10b981',glow:'rgba(16,185,129,.55)'},
  '2026-03':{rgb:'34,197,94',  acc:'#22c55e',glow:'rgba(34,197,94,.55)'},
  '2026-04':{rgb:'16,185,129', acc:'#10b981',glow:'rgba(16,185,129,.55)'},
  '2026-05':{rgb:'20,184,166', acc:'#14b8a6',glow:'rgba(20,184,166,.55)'},
  '2026-06':{rgb:'6,182,212',  acc:'#06b6d4',glow:'rgba(6,182,212,.55)'},
  '2026-07':{rgb:'14,165,233', acc:'#0ea5e9',glow:'rgba(14,165,233,.55)'},
  '2026-08':{rgb:'34,197,94',  acc:'#22c55e',glow:'rgba(34,197,94,.55)'},
  '2026-09':{rgb:'20,184,166', acc:'#14b8a6',glow:'rgba(20,184,166,.55)'},
  '2026-10':{rgb:'16,185,129', acc:'#10b981',glow:'rgba(16,185,129,.55)'},
  '2026-11':{rgb:'34,197,94',  acc:'#22c55e',glow:'rgba(34,197,94,.55)'},
  '2026-12':{rgb:'6,182,212',  acc:'#06b6d4',glow:'rgba(6,182,212,.55)'},
};

function getColor(key: string, optimal: boolean) {
  const map = optimal ? OPT_COLORS : IST_COLORS;
  return map[key] ?? {rgb:'148,163,184',acc:'#94a3b8',glow:'rgba(148,163,184,.4)'};
}

// Optimale Verteilung berechnen — max 2000 pro Monat
function calcOptimal(raw: Map<string, number>): Map<string, number> {
  const LIMIT = 2000;
  const keys = Array.from(raw.keys()).filter(k => k.startsWith('2026')).sort();
  const opt = new Map<string, number>();
  keys.forEach(k => opt.set(k, raw.get(k) ?? 0));

  // 3 Passes: Überschuss auf Nachbarmonate verteilen
  for (let pass = 0; pass < 5; pass++) {
    for (const key of keys) {
      const cnt = opt.get(key) ?? 0;
      if (cnt <= LIMIT) continue;
      let overflow = cnt - LIMIT;
      const idx = keys.indexOf(key);

      // Verteile erst auf nächsten Monat, dann vorherigen
      const neighbors = [keys[idx+1], keys[idx-1], keys[idx+2], keys[idx-1]].filter(Boolean);
      for (const nb of neighbors) {
        if (overflow <= 0) break;
        const nbCnt = opt.get(nb) ?? 0;
        if (nbCnt >= LIMIT) continue;
        const space = LIMIT - nbCnt;
        const move = Math.min(overflow, space);
        opt.set(nb, nbCnt + move);
        overflow -= move;
      }
      opt.set(key, LIMIT + overflow); // Rest bleibt wenn kein Platz
    }
  }
  return opt;
}

interface MonatData {
  key: string; label: string; short: string;
  istCount: number; optCount: number;
  standorte: [string,number][]; etagen: [string,number][];
}

function CardEl({ m, optimal, active }: { m: MonatData; optimal: boolean; active?: boolean }) {
  const cnt = optimal ? m.optCount : m.istCount;
  const { rgb, acc, glow } = getColor(m.key, optimal);
  const w = active ? 200 : 165;
  const h = active ? 255 : 210;
  const diff = m.optCount - m.istCount;
  const hasDiff = optimal && diff !== 0;

  return (
    <div style={{ width:w, height:h, borderRadius:22,
      background:`linear-gradient(145deg,rgba(${rgb},.22),rgba(${rgb},.07))`,
      border:`1px solid rgba(${rgb},${active?.22:.1})`,
      position:'relative', overflow:'hidden',
      boxShadow: active ? `0 0 60px ${glow}, 0 20px 60px rgba(0,0,0,.4)` : 'none',
      transition:'all .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ position:'absolute', top:'-25%', left:'-15%', width:'70%', height:'60%', background:`radial-gradient(ellipse,rgba(${rgb},.3) 0%,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ position:'relative', zIndex:1, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: active?6:4 }}>
        {optimal && active && (
          <div style={{ fontSize:9, color:`rgb(${rgb})`, background:`rgba(${rgb},.18)`, padding:'2px 10px', borderRadius:99, letterSpacing:'.08em', textTransform:'uppercase', fontWeight:700 }}>
            Optimal
          </div>
        )}
        <p style={{ fontSize:active?50:38, fontWeight:900, color:'#fff', letterSpacing:'-.06em', margin:0, lineHeight:1, textShadow:`0 0 ${active?55:25}px rgba(${rgb},.85)` }}>{m.short}</p>
        <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:'.1em', textTransform:'uppercase', margin:0 }}>2026</p>
        <div style={{ width:32, height:1, background:'rgba(255,255,255,.1)', margin:'3px 0' }} />
        <p style={{ fontSize:active?30:21, fontWeight:900, color:acc, letterSpacing:'-.04em', margin:0, textShadow:`0 0 18px ${glow}` }}>
          {cnt >= 1000 ? (cnt/1000).toFixed(1)+'k' : cnt}
        </p>
        <p style={{ fontSize:10, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>Geräte</p>

      </div>
      {active && <div style={{ position:'absolute', inset:-1, borderRadius:23, border:`1px solid rgba(${rgb},.4)`, pointerEvents:'none' }} />}
    </div>
  );
}

export default function DGUVRoadmap() {
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<1|-1>(1);
  const [animKey, setAnimKey] = useState(0);
  const [detailTab, setDetailTab] = useState<'Standorte'|'Etagen'>('Standorte');
  const [optimal, setOptimal] = useState(false);
  const burstRef = useRef<HTMLDivElement>(null);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['dguv-roadmap-all'],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('dguv_geraete')
          .select('naechste_pruefung,gebaeude,ebene,abteilung')
          .range(from, from+999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { monate, istMap } = useMemo(() => {
    const m: Record<string,{count:number;standorte:Record<string,number>;etagen:Record<string,number>}> = {};
    raw.forEach((r: any) => {
      const np = r.naechste_pruefung;
      if (!np || !np.startsWith('2026')) return;
      const key = np.slice(0,7);
      if (!m[key]) m[key] = {count:0,standorte:{},etagen:{}};
      m[key].count++;
      const g = r.gebaeude || 'Unbekannt';
      m[key].standorte[g] = (m[key].standorte[g]||0)+1;
      const ebene = r.ebene||''; const abt = r.abteilung||'';
      const gs = g.replace('KH ','').replace('Senioren ','Sen.').replace('Reha-Klinik ','Reha ').slice(0,12);
      let ek = '';
      if (ebene && ebene!=='nan') { ek=`${gs}·${ebene}`; }
      else { const mt = abt.match(/^[A-Z]{2}\.(\d+)\./); if(mt){const n=parseInt(mt[1]);ek=`${gs}·${n===0?'EG':n<10?n+'.OG':(n-10)+'.UG'}`;} }
      if (ek) m[key].etagen[ek]=(m[key].etagen[ek]||0)+1;
    });

    const istMap = new Map<string,number>(Object.entries(m).map(([k,v])=>[k,v.count]));
    const optMap = calcOptimal(istMap);

    const result: MonatData[] = Object.entries(m)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key, val]) => {
        const mo = parseInt(key.split('-')[1]) - 1;
        return {
          key, label:`${MONAT_NAMEN[mo]} 2026`, short:MONAT_KURZ[mo],
          istCount: val.count,
          optCount: optMap.get(key) ?? val.count,
          standorte: Object.entries(val.standorte).sort(([,a],[,b])=>b-a).slice(0,6) as [string,number][],
          etagen: Object.entries(val.etagen).sort(([,a],[,b])=>b-a).slice(0,8) as [string,number][],
        };
      });
    return { monate: result, istMap };
  }, [raw]);

  function spawnBurst(color: string) {
    const el = burstRef.current; if (!el) return;
    for (let k = 0; k < 20; k++) {
      const p = document.createElement('div');
      const angle = Math.random()*360, dist = 40+Math.random()*110;
      p.style.cssText = `position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};transform:translate(-50%,-50%) scale(0);opacity:1;transition:all ${.35+Math.random()*.25}s cubic-bezier(.16,1,.3,1);pointer-events:none`;
      el.appendChild(p);
      setTimeout(()=>{p.style.transform=`translate(calc(-50% + ${Math.cos(angle*Math.PI/180)*dist}px),calc(-50% + ${Math.sin(angle*Math.PI/180)*dist}px)) scale(0)`;p.style.opacity='0';},10);
      setTimeout(()=>p.remove(),700);
    }
  }

  function navigate(d: 1|-1) {
    const nxt = current+d;
    if (nxt < 0 || nxt >= monate.length) return;
    setDir(d);
    spawnBurst(getColor(monate[nxt].key, optimal).acc);
    setCurrent(nxt); setAnimKey(k=>k+1); setDetailTab('Standorte');
  }

  function toggleOptimal() {
    const newOpt = !optimal;
    setOptimal(newOpt);
    setAnimKey(k=>k+1);
    // Burst in neuer Farbe
    if (monate[current]) spawnBurst(getColor(monate[current].key, newOpt).acc);
  }

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid #f59e0b', borderTopColor:'transparent', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (monate.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'rgba(255,255,255,.3)', fontSize:14 }}>
      Gesamtliste in der Sidebar hochladen
    </div>
  );

  const active = monate[current];
  const { rgb, acc, glow } = getColor(active.key, optimal);
  const displayData = detailTab==='Standorte' ? active.standorte : active.etagen;
  const totalDisplay = active.standorte.reduce((s,[,c])=>s+c,0);

  const bgColor = optimal ? '#0a1628' : '#0f172a';
  const headerAccent = optimal ? '#10b981' : '#f59e0b';

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", minHeight:'calc(100vh - 56px)', background:bgColor, margin:'-28px -32px', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20, transition:'background .5s ease' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes slideR{from{opacity:0;transform:translateX(90px) scale(.88)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes slideL{from{opacity:0;transform:translateX(-90px) scale(.88)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes optIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        .card-float{animation:float 4s ease-in-out infinite}
        .loc-in{animation:fadeUp .28s ease both}
        .nbtn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.7);width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s ease}
        .nbtn:hover{background:rgba(255,255,255,.15);color:#fff;transform:scale(1.08)}
        .nbtn:disabled{opacity:.2;cursor:not-allowed;transform:none!important}
        .sdot{cursor:pointer;height:7px;border-radius:99px;transition:all .22s cubic-bezier(.16,1,.3,1)}
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-.04em', transition:'all .3s' }}>
            {optimal
              ? <>Optimale <span style={{color:'#10b981'}}>Roadmap</span> 2026</>
              : <>Prüf<span style={{color:'#f59e0b'}}>roadmap</span> 2026</>
            }
          </h1>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', margin:'3px 0 0' }}>
            {raw.filter((r:any)=>r.naechste_pruefung?.startsWith('2026')).length.toLocaleString('de-DE')} Geräte · {monate.length} Monate
            {optimal && <span style={{color:'#10b981',marginLeft:8}}>· max. 2.000 pro Monat</span>}
          </p>
        </div>

        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {/* IST / OPTIMAL Toggle */}
          <div style={{ display:'flex', background:'rgba(255,255,255,.08)', borderRadius:14, padding:4, gap:4 }}>
            <button onClick={() => { if(optimal) toggleOptimal(); }}
              style={{ padding:'8px 18px', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .25s cubic-bezier(.16,1,.3,1)',
                background: !optimal ? 'rgba(245,158,11,.9)' : 'transparent',
                color: !optimal ? '#fff' : 'rgba(255,255,255,.4)',
                boxShadow: !optimal ? '0 4px 12px rgba(245,158,11,.4)' : 'none' }}>
              <BarChart2 size={13} style={{display:'inline',marginRight:5,verticalAlign:'middle'}}/>IST
            </button>
            <button onClick={() => { if(!optimal) toggleOptimal(); }}
              style={{ padding:'8px 18px', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .25s cubic-bezier(.16,1,.3,1)',
                background: optimal ? 'rgba(16,185,129,.9)' : 'transparent',
                color: optimal ? '#fff' : 'rgba(255,255,255,.4)',
                boxShadow: optimal ? '0 4px 12px rgba(16,185,129,.4)' : 'none' }}>
              <Zap size={13} style={{display:'inline',marginRight:5,verticalAlign:'middle'}}/>OPTIMAL
            </button>
          </div>

          <div style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'8px 16px', textAlign:'center' }}>
            <p style={{ fontSize:16, fontWeight:900, color:headerAccent, margin:0, letterSpacing:'-.03em', transition:'color .3s' }}>
              {raw.filter((r:any)=>r.naechste_pruefung?.startsWith('2026')).length.toLocaleString('de-DE')}
            </p>
            <p style={{ fontSize:10, color:'rgba(255,255,255,.22)', margin:'1px 0 0', textTransform:'uppercase', letterSpacing:'.06em' }}>Geräte 2026</p>
          </div>
        </div>
      </div>

      {/* Optimal Banner */}
      {optimal && (
        <div style={{ background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.25)', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, animation:'optIn .3s ease both' }}>
          <Zap size={16} style={{ color:'#10b981', flexShrink:0 }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'#10b981', margin:0 }}>Optimale Laufroutenplanung aktiv</p>
            <p style={{ fontSize:11, color:'rgba(16,185,129,.7)', margin:'2px 0 0' }}>Überschuss aus August ({(istMap.get('2026-08')||0).toLocaleString('de-DE')}) wird automatisch auf benachbarte Monate verteilt — max. 2.000 Geräte pro Monat</p>
          </div>
        </div>
      )}

      {/* Stage + Detail */}
      <div style={{ flex:1, display:'flex', gap:20, alignItems:'center', minHeight:360 }}>
        <div style={{ flex:1, position:'relative', height:340, perspective:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div ref={burstRef} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:20 }} />

          {current>=2 && <div onClick={()=>navigate(-1)} style={{ position:'absolute', left:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(-14px) scale(.55) rotateY(30deg)', opacity:.18, transition:'all .35s' }}><CardEl m={monate[current-2]} optimal={optimal} /></div>}
          {current>=1 && <div onClick={()=>navigate(-1)} style={{ position:'absolute', left:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(20deg)', opacity:.5, transition:'all .35s' }}><CardEl m={monate[current-1]} optimal={optimal} /></div>}

          <div key={`${animKey}-${optimal}`} style={{ position:'relative', zIndex:5, animation:`${dir===1?'slideR':'slideL'} .35s cubic-bezier(.16,1,.3,1) both`, filter:`drop-shadow(0 28px 56px ${glow})` }}>
            <div className="card-float"><CardEl m={active} optimal={optimal} active /></div>
          </div>

          {current<monate.length-1 && <div onClick={()=>navigate(1)} style={{ position:'absolute', right:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(-20deg)', opacity:.5, transition:'all .35s' }}><CardEl m={monate[current+1]} optimal={optimal} /></div>}
          {current<monate.length-2 && <div onClick={()=>navigate(1)} style={{ position:'absolute', right:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(14px) scale(.55) rotateY(-30deg)', opacity:.18, transition:'all .35s' }}><CardEl m={monate[current+2]} optimal={optimal} /></div>}

          <button className="nbtn" onClick={()=>navigate(-1)} disabled={current===0} style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}><ChevronLeft size={18}/></button>
          <button className="nbtn" onClick={()=>navigate(1)} disabled={current===monate.length-1} style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}><ChevronRight size={18}/></button>
        </div>

        {/* Detail Panel */}
        <div key={`detail-${active.key}-${optimal}`} style={{ width:256, background:'rgba(255,255,255,.05)', border:`1px solid rgba(${rgb},.2)`, borderRadius:18, padding:20, flexShrink:0, animation:'fadeUp .3s ease both', transition:'border-color .3s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:`rgba(${rgb},.2)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Calendar size={16} style={{ color:acc }} />
            </div>
            <div>
              <p style={{ fontSize:15, fontWeight:800, color:'#fff', margin:0 }}>{active.label}</p>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:2 }}>
                <span style={{ fontSize:20, fontWeight:900, color:acc, letterSpacing:'-.03em' }}>
                  {(optimal ? active.optCount : active.istCount).toLocaleString('de-DE')}
                </span>

              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            {(['Standorte','Etagen'] as const).map(tab=>(
              <button key={tab} onClick={()=>setDetailTab(tab)}
                style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:99, border:'none', cursor:'pointer', transition:'all .15s', background:detailTab===tab?acc:'rgba(255,255,255,.08)', color:detailTab===tab?'#0f172a':'rgba(255,255,255,.4)' }}>
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {displayData.map(([name, cnt], i) => (
              <div key={name} className="loc-in" style={{ animationDelay:`${i*.05}s` }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                  <MapPin size={10} style={{ color:acc, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.65)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:acc }}>{cnt.toLocaleString('de-DE')}</span>
                </div>
                <div style={{ height:3, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden', marginLeft:17 }}>
                  <div style={{ height:'100%', width:`${cnt/totalDisplay*100}%`, background:acc, borderRadius:99, transition:'width .5s cubic-bezier(.16,1,.3,1)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ display:'flex', justifyContent:'center', gap:5 }}>
        {monate.map((m,i)=>{
          const c = getColor(m.key, optimal);
          return (
            <div key={m.key} className="sdot"
              onClick={()=>{setDir(i>current?1:-1);setCurrent(i);setAnimKey(k=>k+1);}}
              style={{ width:i===current?22:7, background:i===current?c.acc:'rgba(255,255,255,.12)', boxShadow:i===current?`0 0 7px ${c.glow}`:'none' }} />
          );
        })}
      </div>
    </div>
  );
}
