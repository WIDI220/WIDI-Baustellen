import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, MapPin, Calendar } from 'lucide-react';

const MONAT_NAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONAT_KURZ  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const CARD_COLORS: Record<string, { rgb: string; acc: string; glow: string; bg: string }> = {
  '2025-01': { rgb:'245,158,11',  acc:'#f59e0b', glow:'rgba(245,158,11,.5)',  bg:'#78350f' },
  '2025-07': { rgb:'16,185,129',  acc:'#10b981', glow:'rgba(16,185,129,.5)',  bg:'#064e3b' },
  '2025-08': { rgb:'52,211,153',  acc:'#34d399', glow:'rgba(52,211,153,.5)',  bg:'#065f46' },
  '2025-09': { rgb:'96,165,250',  acc:'#60a5fa', glow:'rgba(96,165,250,.5)',  bg:'#1e3a8a' },
  '2025-10': { rgb:'59,130,246',  acc:'#3b82f6', glow:'rgba(59,130,246,.5)',  bg:'#1e40af' },
  '2025-11': { rgb:'129,140,248', acc:'#818cf8', glow:'rgba(129,140,248,.5)', bg:'#3730a3' },
  '2025-12': { rgb:'167,139,250', acc:'#a78bfa', glow:'rgba(167,139,250,.5)', bg:'#5b21b6' },
  '2026-01': { rgb:'245,158,11',  acc:'#f59e0b', glow:'rgba(245,158,11,.5)',  bg:'#78350f' },
  '2026-02': { rgb:'16,185,129',  acc:'#10b981', glow:'rgba(16,185,129,.5)',  bg:'#064e3b' },
  '2026-03': { rgb:'52,211,153',  acc:'#34d399', glow:'rgba(52,211,153,.5)',  bg:'#065f46' },
  '2026-04': { rgb:'56,189,248',  acc:'#38bdf8', glow:'rgba(56,189,248,.5)',  bg:'#0c4a6e' },
  '2026-05': { rgb:'59,130,246',  acc:'#3b82f6', glow:'rgba(59,130,246,.5)',  bg:'#1e40af' },
  '2026-06': { rgb:'99,102,241',  acc:'#6366f1', glow:'rgba(99,102,241,.5)',  bg:'#3730a3' },
  '2026-07': { rgb:'139,92,246',  acc:'#8b5cf6', glow:'rgba(139,92,246,.5)',  bg:'#5b21b6' },
  '2026-08': { rgb:'239,68,68',   acc:'#ef4444', glow:'rgba(239,68,68,.6)',   bg:'#991b1b' },
  '2026-09': { rgb:'236,72,153',  acc:'#ec4899', glow:'rgba(236,72,153,.5)',  bg:'#9d174d' },
  '2026-10': { rgb:'251,146,60',  acc:'#fb923c', glow:'rgba(251,146,60,.5)',  bg:'#92400e' },
  '2026-11': { rgb:'163,230,53',  acc:'#a3e635', glow:'rgba(163,230,53,.5)',  bg:'#3f6212' },
  '2026-12': { rgb:'45,212,191',  acc:'#2dd4bf', glow:'rgba(45,212,191,.5)',  bg:'#115e59' },
};

function getColor(key: string) {
  return CARD_COLORS[key] ?? { rgb:'148,163,184', acc:'#94a3b8', glow:'rgba(148,163,184,.4)', bg:'#334155' };
}

interface MonatData {
  key: string;
  label: string;
  short: string;
  year: string;
  count: number;
  standorte: [string, number][];
  color: ReturnType<typeof getColor>;
}

function CardEl({ m, active }: { m: MonatData; active?: boolean }) {
  const sz = active ? 200 : 165;
  const ht = active ? 255 : 210;
  const { rgb, acc, glow } = m.color;
  return (
    <div style={{ width: sz, height: ht, borderRadius: 22, background: `linear-gradient(145deg,rgba(${rgb},.22),rgba(${rgb},.07))`, border: `1px solid rgba(${rgb},${active?.22:.1})`, position: 'relative', overflow: 'hidden', boxShadow: active ? `0 0 60px ${glow}` : 'none' }}>
      <div style={{ position:'absolute', top:'-25%', left:'-15%', width:'70%', height:'60%', background:`radial-gradient(ellipse,rgba(${rgb},.28) 0%,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:'55%', height:'50%', background:`radial-gradient(ellipse,rgba(${rgb},.1) 0%,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ position:'relative', zIndex:1, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: active?7:5 }}>
        <p style={{ fontSize: active?50:38, fontWeight:900, color:'#fff', letterSpacing:'-.06em', margin:0, lineHeight:1, textShadow:`0 0 ${active?55:25}px rgba(${rgb},.8)` }}>{m.short}</p>
        <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:'.1em', textTransform:'uppercase', margin:0 }}>{m.year}</p>
        <div style={{ width:32, height:1, background:'rgba(255,255,255,.1)', margin:'3px 0' }} />
        <p style={{ fontSize: active?28:20, fontWeight:900, color:acc, letterSpacing:'-.04em', margin:0, textShadow:`0 0 18px ${glow}` }}>
          {m.count >= 1000 ? (m.count/1000).toFixed(1)+'k' : m.count}
        </p>
        <p style={{ fontSize:10, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>Geräte</p>
      </div>
      {active && <div style={{ position:'absolute', inset:-1, borderRadius:23, border:`1px solid rgba(${rgb},.35)`, pointerEvents:'none' }} />}
    </div>
  );
}

export default function DGUVRoadmap() {
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<1|-1>(1);
  const [animKey, setAnimKey] = useState(0);
  const burstRef = useRef<HTMLDivElement>(null);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['dguv-roadmap-full'],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('dguv_geraete').select('naechste_pruefung, gebaeude').not('naechste_pruefung','is',null).range(from, from+999);
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
    const m: Record<string, { count: number; standorte: Record<string, number> }> = {};
    raw.forEach((r: any) => {
      const key = r.naechste_pruefung?.slice(0, 7);
      if (!key) return;
      if (!m[key]) m[key] = { count: 0, standorte: {} };
      m[key].count++;
      const g = r.gebaeude || 'Unbekannt';
      m[key].standorte[g] = (m[key].standorte[g] || 0) + 1;
    });
    return Object.entries(m)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [year, mo] = key.split('-').map(Number);
        return {
          key, label: `${MONAT_NAMEN[mo-1]} ${year}`, short: MONAT_KURZ[mo-1], year: String(year),
          count: val.count,
          standorte: Object.entries(val.standorte).sort(([,a],[,b])=>b-a).slice(0,6) as [string,number][],
          color: getColor(key),
        };
      });
  })();

  function spawnBurst(color: string) {
    const el = burstRef.current;
    if (!el) return;
    for (let k = 0; k < 18; k++) {
      const p = document.createElement('div');
      const angle = Math.random() * 360;
      const dist = 40 + Math.random() * 100;
      p.style.cssText = `position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};transform:translate(-50%,-50%) scale(0);opacity:1;transition:all ${.35+Math.random()*.2}s cubic-bezier(.16,1,.3,1);pointer-events:none`;
      el.appendChild(p);
      setTimeout(() => {
        p.style.transform = `translate(calc(-50% + ${Math.cos(angle*Math.PI/180)*dist}px), calc(-50% + ${Math.sin(angle*Math.PI/180)*dist}px)) scale(0)`;
        p.style.opacity = '0';
      }, 10);
      setTimeout(() => p.remove(), 700);
    }
  }

  function navigate(d: 1|-1) {
    const nxt = current + d;
    if (nxt < 0 || nxt >= monate.length) return;
    setDir(d);
    spawnBurst(monate[nxt].color.acc);
    setCurrent(nxt);
    setAnimKey(k => k+1);
  }

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid #f59e0b', borderTopColor:'transparent', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (monate.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'rgba(255,255,255,.3)', fontSize:14, fontFamily:"'Inter',system-ui,sans-serif" }}>
      Gesamtliste in der Sidebar hochladen
    </div>
  );

  const active = monate[current];
  const totalStandorte = active.standorte.reduce((s,[,c])=>s+c, 0);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", minHeight:'calc(100vh - 56px)', background:'#0f172a', margin:'-28px -32px', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes slideR{from{opacity:0;transform:translateX(90px) scale(.88) rotateY(-18deg)}to{opacity:1;transform:translateX(0) scale(1) rotateY(0)}}
        @keyframes slideL{from{opacity:0;transform:translateX(-90px) scale(.88) rotateY(18deg)}to{opacity:1;transform:translateX(0) scale(1) rotateY(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .card-float{animation:float 4s ease-in-out infinite}
        .loc-in{animation:fadeUp .28s ease both}
        .nbtn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.7);width:40px;height:40px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s ease;flex-shrink:0}
        .nbtn:hover{background:rgba(255,255,255,.15);color:#fff;transform:scale(1.08)}
        .nbtn:disabled{opacity:.2;cursor:not-allowed;transform:none!important}
        .sdot{cursor:pointer;height:7px;border-radius:99px;transition:all .22s cubic-bezier(.16,1,.3,1)}
        .sdot:hover{transform:scaleY(1.5)}
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-.04em' }}>
            Prüf<span style={{ color:'#f59e0b' }}>roadmap</span>
          </h1>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', margin:'3px 0 0' }}>
            {raw.length.toLocaleString('de-DE')} Geräte · {monate.length} Monate geplant
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { val: raw.length.toLocaleString('de-DE'), lbl:'Geräte gesamt' },
            { val: monate.length.toString(), lbl:'Monate' },
            { val: Math.max(...monate.map(m=>m.count)).toLocaleString('de-DE'), lbl:'Peak' },
          ].map((k,i) => (
            <div key={i} style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'8px 16px', textAlign:'center' }}>
              <p style={{ fontSize:16, fontWeight:900, color:'#f59e0b', margin:0, letterSpacing:'-.03em' }}>{k.val}</p>
              <p style={{ fontSize:10, color:'rgba(255,255,255,.22)', margin:'1px 0 0', textTransform:'uppercase', letterSpacing:'.06em' }}>{k.lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stage + Detail */}
      <div style={{ flex:1, display:'flex', gap:20, alignItems:'center', minHeight:360 }}>

        {/* 3D Stage */}
        <div style={{ flex:1, position:'relative', height:340, perspective:1100, perspectiveOrigin:'50% 50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div ref={burstRef} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:20 }} />

          {/* Far left */}
          {current >= 2 && (
            <div onClick={() => navigate(-1)} style={{ position:'absolute', left:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(-14px) scale(.55) rotateY(30deg)', transformOrigin:'center', opacity:.18, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}>
              <CardEl m={monate[current-2]} />
            </div>
          )}
          {/* Left */}
          {current >= 1 && (
            <div onClick={() => navigate(-1)} style={{ position:'absolute', left:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(20deg)', transformOrigin:'center', opacity:.5, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}>
              <CardEl m={monate[current-1]} />
            </div>
          )}

          {/* Center */}
          <div key={animKey} style={{ position:'relative', zIndex:5, animation:`${dir===1?'slideR':'slideL'} .35s cubic-bezier(.16,1,.3,1) both`, filter:`drop-shadow(0 28px 56px ${active.color.glow})` }}>
            <div className="card-float">
              <CardEl m={active} active />
            </div>
          </div>

          {/* Right */}
          {current < monate.length-1 && (
            <div onClick={() => navigate(1)} style={{ position:'absolute', right:'9%', top:'50%', cursor:'pointer', zIndex:2, transform:'translateY(-50%) scale(.74) rotateY(-20deg)', transformOrigin:'center', opacity:.5, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}>
              <CardEl m={monate[current+1]} />
            </div>
          )}
          {/* Far right */}
          {current < monate.length-2 && (
            <div onClick={() => navigate(1)} style={{ position:'absolute', right:'2%', top:'50%', cursor:'pointer', zIndex:1, transform:'translateY(-50%) translateX(14px) scale(.55) rotateY(-30deg)', transformOrigin:'center', opacity:.18, transition:'all .35s cubic-bezier(.16,1,.3,1)' }}>
              <CardEl m={monate[current+2]} />
            </div>
          )}

          {/* Nav */}
          <button className="nbtn" onClick={() => navigate(-1)} disabled={current===0} style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}>
            <ChevronLeft size={18} />
          </button>
          <button className="nbtn" onClick={() => navigate(1)} disabled={current===monate.length-1} style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', zIndex:10 }}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Detail */}
        <div key={active.key} style={{ width:256, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, padding:20, flexShrink:0, animation:'fadeUp .3s ease both' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:`rgba(${active.color.rgb},.18)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Calendar size={16} style={{ color:active.color.acc }} />
            </div>
            <div>
              <p style={{ fontSize:15, fontWeight:800, color:'#fff', margin:0, letterSpacing:'-.02em' }}>{active.label}</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', margin:'1px 0 0' }}>
                <span style={{ color:active.color.acc, fontWeight:900, fontSize:18 }}>{active.count.toLocaleString('de-DE')}</span> Geräte
              </p>
            </div>
          </div>
          <p style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,.18)', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 10px' }}>Standorte</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {active.standorte.map(([name, cnt], i) => {
              const pct = cnt / totalStandorte;
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
        {monate.map((m, i) => (
          <div key={m.key} className="sdot"
            onClick={() => { setDir(i>current?1:-1); setCurrent(i); setAnimKey(k=>k+1); }}
            style={{ width: i===current?22:7, background: i===current?m.color.acc:'rgba(255,255,255,.12)', boxShadow: i===current?`0 0 7px ${m.color.glow}`:'none' }} />
        ))}
      </div>
    </div>
  );
}
