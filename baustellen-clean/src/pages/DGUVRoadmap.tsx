import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, MapPin, Calendar, Zap } from 'lucide-react';

const MONAT_NAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONAT_KURZ  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const COLORS: Record<string,{rgb:string;acc:string;glow:string}> = {
  '2025-01':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-07':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-08':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-09':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-10':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-11':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2025-12':{rgb:'156,163,175',acc:'#9ca3af',glow:'rgba(156,163,175,.4)'},
  '2026-01':{rgb:'245,158,11', acc:'#f59e0b',glow:'rgba(245,158,11,.5)'},
  '2026-02':{rgb:'16,185,129', acc:'#10b981',glow:'rgba(16,185,129,.5)'},
  '2026-03':{rgb:'52,211,153', acc:'#34d399',glow:'rgba(52,211,153,.5)'},
  '2026-04':{rgb:'56,189,248', acc:'#38bdf8',glow:'rgba(56,189,248,.5)'},
  '2026-05':{rgb:'59,130,246', acc:'#3b82f6',glow:'rgba(59,130,246,.5)'},
  '2026-06':{rgb:'99,102,241', acc:'#6366f1',glow:'rgba(99,102,241,.5)'},
  '2026-07':{rgb:'139,92,246', acc:'#8b5cf6',glow:'rgba(139,92,246,.5)'},
  '2026-08':{rgb:'239,68,68',  acc:'#ef4444',glow:'rgba(239,68,68,.6)'},
  '2026-09':{rgb:'236,72,153', acc:'#ec4899',glow:'rgba(236,72,153,.5)'},
  '2026-10':{rgb:'251,146,60', acc:'#fb923c',glow:'rgba(251,146,60,.5)'},
  '2026-11':{rgb:'163,230,53', acc:'#a3e635',glow:'rgba(163,230,53,.5)'},
  '2026-12':{rgb:'45,212,191', acc:'#2dd4bf',glow:'rgba(45,212,191,.5)'},
};
function getColor(key: string) {
  return COLORS[key] ?? {rgb:'148,163,184',acc:'#94a3b8',glow:'rgba(148,163,184,.4)'};
}

interface MonatData {
  key: string; label: string; short: string; year: string;
  count: number; optCount: number;
  standorte: [string,number][]; etagen: [string,number][];
  color: ReturnType<typeof getColor>;
  isUeberfaellig: boolean; isOhneDatum: boolean;
}

function CardEl({ m, active, showOpt }: { m: MonatData; active?: boolean; showOpt: boolean }) {
  const cnt = showOpt ? m.optCount : m.count;
  const { rgb, acc, glow } = m.color;
  const w = active ? 200 : 165;
  const h = active ? 255 : 210;
  return (
    <div style={{ width:w, height:h, borderRadius:22, background:`linear-gradient(145deg,rgba(${rgb},.22),rgba(${rgb},.07))`, border:`1px solid rgba(${rgb},${active?.22:.1})`, position:'relative', overflow:'hidden', boxShadow: active ? `0 0 60px ${glow}` : 'none' }}>
      <div style={{ position:'absolute', top:'-25%', left:'-15%', width:'70%', height:'60%', background:`radial-gradient(ellipse,rgba(${rgb},.28) 0%,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ position:'relative', zIndex:1, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: active?7:5 }}>
        {m.isUeberfaellig && <div style={{ fontSize:9, color:`rgb(${rgb})`, background:`rgba(${rgb},.15)`, padding:'2px 8px', borderRadius:99, marginBottom:2 }}>ÜBERFÄLLIG</div>}
        <p style={{ fontSize: active?50:38, fontWeight:900, color:'#fff', letterSpacing:'-.06em', margin:0, lineHeight:1, textShadow:`0 0 ${active?55:25}px rgba(${rgb},.8)` }}>{m.short}</p>
        <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:'.1em', textTransform:'uppercase', margin:0 }}>{m.year}</p>
        <div style={{ width:32, height:1, background:'rgba(255,255,255,.1)', margin:'3px 0' }} />
        <p style={{ fontSize: active?28:20, fontWeight:900, color:acc, letterSpacing:'-.04em', margin:0, textShadow:`0 0 18px ${glow}` }}>
          {cnt >= 1000 ? (cnt/1000).toFixed(1)+'k' : cnt}
        </p>
        <p style={{ fontSize:10, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>Geräte</p>
        {showOpt && m.count !== m.optCount && active && (
          <p style={{ fontSize:9, color:`rgba(${rgb},.7)`, margin:'2px 0 0' }}>IST: {m.count >= 1000 ? (m.count/1000).toFixed(1)+'k' : m.count}</p>
        )}
      </div>
      {active && <div style={{ position:'absolute', inset:-1, borderRadius:23, border:`1px solid rgba(${rgb},.35)`, pointerEvents:'none' }} />}
    </div>
  );
}

// Optimale Verteilung berechnen
function calcOptimal(monate: MonatData[]): Map<string, number> {
  const LIMIT = 2000;
  const counts = new Map<string, number>(monate.map(m => [m.key, m.count]));
  const opt = new Map<string, number>(counts);
  
  // Überschuss aus übervollen Monaten auf benachbarte leere Monate verschieben
  const keys2026 = monate.filter(m => m.key.startsWith('2026')).map(m => m.key).sort();
  
  for (let pass = 0; pass < 3; pass++) {
    for (const key of keys2026) {
      const cnt = opt.get(key) ?? 0;
      if (cnt > LIMIT) {
        const overflow = cnt - LIMIT;
        const idx = keys2026.indexOf(key);
        // Verteile auf Vormonat und Nachmonat
        const prev = keys2026[idx - 1];
        const next = keys2026[idx + 1];
        let moved = 0;
        if (prev && (opt.get(prev) ?? 0) < LIMIT) {
          const space = LIMIT - (opt.get(prev) ?? 0);
          const move = Math.min(Math.ceil(overflow/2), space);
          opt.set(prev, (opt.get(prev) ?? 0) + move);
          moved += move;
        }
        if (next && (opt.get(next) ?? 0) < LIMIT) {
          const space = LIMIT - (opt.get(next) ?? 0);
          const move = Math.min(overflow - moved, space);
          opt.set(next, (opt.get(next) ?? 0) + move);
          moved += move;
        }
        opt.set(key, cnt - moved);
      }
    }
  }
  return opt;
}

export default function DGUVRoadmap() {
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<1|-1>(1);
  const [animKey, setAnimKey] = useState(0);
  const [detailTab, setDetailTab] = useState<'Standorte'|'Etagen'>('Standorte');
  const [showOpt, setShowOpt] = useState(false);
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

  const monate: MonatData[] = (() => {
    const m: Record<string,{count:number;standorte:Record<string,number>;etagen:Record<string,number>}> = {};
    raw.forEach((r: any) => {
      const np = r.naechste_pruefung;
      const key = np ? np.slice(0,7) : 'ohne-datum';
      if (!m[key]) m[key] = {count:0,standorte:{},etagen:{}};
      m[key].count++;
      const g = r.gebaeude || 'Unbekannt';
      m[key].standorte[g] = (m[key].standorte[g]||0)+1;
      const ebene = r.ebene || '';
      const abt = r.abteilung || '';
      const gebShort = g.replace('KH ','').replace('Senioren ','Sen.').replace('Reha-Klinik ','Reha ').slice(0,12);
      let ek = '';
      if (ebene && ebene !== 'nan') { ek = `${gebShort}·${ebene}`; }
      else { const mt = abt.match(/^[A-Z]{2}\.(\d+)\./); if (mt) { const n=parseInt(mt[1]); ek=`${gebShort}·${n===0?'EG':n<10?n+'.OG':(n-10)+'.UG'}`; } }
      if (ek) m[key].etagen[ek] = (m[key].etagen[ek]||0)+1;
    });
    return Object.entries(m)
      .filter(([k]) => k !== 'ohne-datum')
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [yr, mo] = key.split('-').map(Number);
        return {
          key, label:`${MONAT_NAMEN[mo-1]} ${yr}`, short:MONAT_KURZ[mo-1], year:String(yr),
          count: val.count, optCount: val.count,
          standorte: Object.entries(val.standorte).sort(([,a],[,b])=>b-a).slice(0,6) as [string,number][],
          etagen: Object.entries(val.etagen).sort(([,a],[,b])=>b-a).slice(0,8) as [string,number][],
          color: getColor(key),
          isUeberfaellig: yr < 2026,
          isOhneDatum: false,
        };
      });
  })();

  // Optimale Counts berechnen
  const optMap = calcOptimal(monate);
  const monateWithOpt = monate.map(m => ({ ...m, optCount: optMap.get(m.key) ?? m.count }));

  // Nur 2026 in der Roadmap, 2025 als "überfällig" markiert aber anzeigbar
  const nur2026 = monateWithOpt.filter(m => m.key.startsWith('2026'));
  const alle = monateWithOpt;
  const anzeige = nur2026;

  function spawnBurst(color: string) {
    const el = burstRef.current; if (!el) return;
    for (let k = 0; k < 18; k++) {
      const p = document.createElement('div');
      const angle = Math.random()*360, dist = 40+Math.random()*100;
      p.style.cssText = `position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};transform:translate(-50%,-50%) scale(0);opacity:1;transition:all ${.35+Math.random()*.2}s cubic-bezier(.16,1,.3,1);pointer-events:none`;
      el.appendChild(p);
      setTimeout(() => { p.style.transform=`translate(calc(-50% + ${Math.cos(angle*Math.PI/180)*dist}px),calc(-50% + ${Math.sin(angle*Math.PI/180)*dist}px)) scale(0)`; p.style.opacity='0'; }, 10);
      setTimeout(() => p.remove(), 700);
    }
  }

  function navigate(d: 1|-1) {
    const nxt = current+d;
    if (nxt < 0 || nxt >= anzeige.length) return;
    setDir(d); spawnBurst(anzeige[nxt].color.acc);
    setCurrent(nxt); setAnimKey(k=>k+1); setDetailTab('Standorte');
  }

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid #f59e0b', borderTopColor:'transparent', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (anzeige.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'rgba(255,255,255,.3)', fontSize:14, fontFamily:"'Inter',system-ui,sans-serif" }}>
      Gesamtliste in der Sidebar hochladen
    </div>
  );

  const active = anzeige[current];
  const totalStandorte = active.standorte.reduce((s,[,c])=>s+c,0);
  const displayData = detailTab==='Standorte' ? active.standorte : active.etagen;

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", minHeight:'calc(100vh - 56px)', background:'#0f172a', margin:'-28px -32px', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes slideR{from{opacity:0;transform:translateX(90px) scale(.88)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes slideL{from{opacity:0;transform:translateX(-90px) scale(.88)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .card-float{animation:float 4s ease-in-out infinite}
        .loc-in{animation:fadeUp .28s ease both}
        .nbtn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.7);width:40px;height:40px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s ease}
        .nbtn:hover{background:rgba(255,255,255,.15);color:#fff;transform:scale(1.08)}
        .nbtn:disabled{opacity:.2;cursor:not-allowed;transform:none!important}
        .sdot{cursor:pointer;height:7px;border-radius:99px;transition:all .22s cubic-bezier(.16,1,.3,1)}
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-.04em' }}>
            Prüf<span style={{ color:'#f59e0b' }}>roadmap</span> 2026
          </h1>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', margin:'3px 0 0' }}>
            {raw.length.toLocaleString('de-DE')} Geräte gesamt · {anzeige.length} Monate
          </p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {/* IST / OPTIMAL Toggle */}
          <div style={{ display:'flex', background:'rgba(255,255,255,.07)', borderRadius:12, padding:3 }}>
            {[{label:'IST',val:false},{label:'OPTIMAL',val:true}].map(({label,val})=>(
              <button key={label} onClick={()=>setShowOpt(val)}
                style={{ padding:'6px 14px', borderRadius:9, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, transition:'all .15s',
                  background: showOpt===val ? (val?'#10b981':'rgba(255,255,255,.15)') : 'transparent',
                  color: showOpt===val ? '#fff' : 'rgba(255,255,255,.4)' }}>
                {label}
              </button>
            ))}
          </div>
          {[
            {val:raw.length.toLocaleString('de-DE'), lbl:'Geräte gesamt'},
            {val:anzeige.length.toString(), lbl:'Monate 2026'},
          ].map((k,i)=>(
            <div key={i} style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'8px 16px', textAlign:'center' }}>
              <p style={{ fontSize:16, fontWeight:900, color:'#f59e0b', margin:0, letterSpacing:'-.03em' }}>{k.val}</p>
              <p style={{ fontSize:10, color:'rgba(255,255,255,.22)', margin:'1px 0 0', textTransform:'uppercase', letterSpacing:'.06em' }}>{k.lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {showOpt && (
        <div style={{ background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.25)', borderRadius:14, padding:'12px 18px', display:'flex', alignItems:'center', gap:12 }}>
          <Zap size={16} style={{ color:'#10b981', flexShrink:0 }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'#10b981', margin:0 }}>Optimale Verteilung — max. ~2.000 Geräte pro Monat</p>
            <p style={{ fontSize:11, color:'rgba(16,185,129,.7)', margin:'2px 0 0' }}>Überschuss aus Aug/Sep wird auf benachbarte Monate verteilt. Die Originalzahl steht klein darunter.</p>
          </div>
        </div>
      )}

      {/* Stage + Detail */}
      <div style={{ flex:1, display:'flex', gap:20, alignItems:'center', minHeight:360 }}>
        <div style={{ flex:1, position:'relative', height:340, perspective:1100, perspectiveOrigin:'50% 50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div ref={burstRef} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:20 }} />

          {current>=2 && <div onClick={()=>navigate(-1)} style={{ position:'absolute', left:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(-14px) scale(.55) rotateY(30deg)', transformOrigin:'center', opacity:.18, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}><CardEl m={anzeige[current-2]} showOpt={showOpt} /></div>}
          {current>=1 && <div onClick={()=>navigate(-1)} style={{ position:'absolute', left:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(20deg)', transformOrigin:'center', opacity:.5, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}><CardEl m={anzeige[current-1]} showOpt={showOpt} /></div>}

          <div key={animKey} style={{ position:'relative', zIndex:5, animation:`${dir===1?'slideR':'slideL'} .35s cubic-bezier(.16,1,.3,1) both`, filter:`drop-shadow(0 28px 56px ${active.color.glow})` }}>
            <div className="card-float"><CardEl m={active} active showOpt={showOpt} /></div>
          </div>

          {current<anzeige.length-1 && <div onClick={()=>navigate(1)} style={{ position:'absolute', right:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(-20deg)', transformOrigin:'center', opacity:.5, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}><CardEl m={anzeige[current+1]} showOpt={showOpt} /></div>}
          {current<anzeige.length-2 && <div onClick={()=>navigate(1)} style={{ position:'absolute', right:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(14px) scale(.55) rotateY(-30deg)', transformOrigin:'center', opacity:.18, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}><CardEl m={anzeige[current+2]} showOpt={showOpt} /></div>}

          <button className="nbtn" onClick={()=>navigate(-1)} disabled={current===0} style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}><ChevronLeft size={18}/></button>
          <button className="nbtn" onClick={()=>navigate(1)} disabled={current===anzeige.length-1} style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}><ChevronRight size={18}/></button>
        </div>

        {/* Detail Panel */}
        <div key={active.key} style={{ width:256, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, padding:20, flexShrink:0, animation:'fadeUp .3s ease both' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:`rgba(${active.color.rgb},.18)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Calendar size={16} style={{ color:active.color.acc }} />
            </div>
            <div>
              <p style={{ fontSize:15, fontWeight:800, color:'#fff', margin:0, letterSpacing:'-.02em' }}>{active.label}</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', margin:'1px 0 0' }}>
                <span style={{ color:active.color.acc, fontWeight:900, fontSize:18 }}>{(showOpt ? active.optCount : active.count).toLocaleString('de-DE')}</span> Geräte
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            {(['Standorte','Etagen'] as const).map(tab=>(
              <button key={tab} onClick={()=>setDetailTab(tab)}
                style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:99, border:'none', cursor:'pointer', background:detailTab===tab?active.color.acc:'rgba(255,255,255,.08)', color:detailTab===tab?'#0f172a':'rgba(255,255,255,.4)', transition:'all .15s' }}>
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {displayData.map(([name, cnt], i) => {
              const pct = cnt / (totalStandorte || 1);
              return (
                <div key={name} className="loc-in" style={{ animationDelay:`${i*.05}s` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                    <MapPin size={10} style={{ color:active.color.acc, flexShrink:0 }} />
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.65)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:active.color.acc }}>{cnt.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,.06)', borderRadius:99, overflow:'hidden', marginLeft:17 }}>
                    <div style={{ height:'100%', width:`${pct*100}%`, background:active.color.acc, borderRadius:99, transition:'width .5s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ display:'flex', justifyContent:'center', gap:5 }}>
        {anzeige.map((m,i)=>(
          <div key={m.key} className="sdot"
            onClick={()=>{setDir(i>current?1:-1);setCurrent(i);setAnimKey(k=>k+1);}}
            style={{ width:i===current?22:7, background:i===current?m.color.acc:'rgba(255,255,255,.12)', boxShadow:i===current?`0 0 7px ${m.color.glow}`:'none' }} />
        ))}
      </div>
    </div>
  );
}
