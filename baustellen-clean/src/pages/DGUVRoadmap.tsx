import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, MapPin, Calendar } from 'lucide-react';

const MONAT_NAMEN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONAT_KURZ  = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

const CARD_COLORS = [
  { bg:'linear-gradient(145deg,#92400e,#78350f)', accent:'#f59e0b', glow:'rgba(245,158,11,0.5)' },
  { bg:'linear-gradient(145deg,#065f46,#064e3b)', accent:'#10b981', glow:'rgba(16,185,129,0.5)' },
  { bg:'linear-gradient(145deg,#065f46,#064e3b)', accent:'#34d399', glow:'rgba(52,211,153,0.5)' },
  { bg:'linear-gradient(145deg,#1e3a8a,#1e40af)', accent:'#60a5fa', glow:'rgba(96,165,250,0.5)' },
  { bg:'linear-gradient(145deg,#1e3a8a,#1e40af)', accent:'#3b82f6', glow:'rgba(59,130,246,0.5)' },
  { bg:'linear-gradient(145deg,#312e81,#3730a3)', accent:'#818cf8', glow:'rgba(129,140,248,0.5)' },
  { bg:'linear-gradient(145deg,#4c1d95,#5b21b6)', accent:'#a78bfa', glow:'rgba(167,139,250,0.5)' },
  { bg:'linear-gradient(145deg,#7f1d1d,#991b1b)', accent:'#f87171', glow:'rgba(248,113,113,0.6)' },
  { bg:'linear-gradient(145deg,#831843,#9d174d)', accent:'#f472b6', glow:'rgba(244,114,182,0.5)' },
  { bg:'linear-gradient(145deg,#7c2d12,#92400e)', accent:'#fb923c', glow:'rgba(251,146,60,0.5)' },
  { bg:'linear-gradient(145deg,#365314,#3f6212)', accent:'#a3e635', glow:'rgba(163,230,53,0.5)' },
  { bg:'linear-gradient(145deg,#134e4a,#115e59)', accent:'#2dd4bf', glow:'rgba(45,212,191,0.5)' },
];

interface MonatData {
  key: string;
  monat: number;
  count: number;
  standorte: [string, number][];
  color: typeof CARD_COLORS[0];
}

export default function DGUVRoadmap() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'left'|'right'>('right');
  const [animating, setAnimating] = useState(false);
  const [particles, setParticles] = useState<any[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['dguv-roadmap-full'],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('dguv_geraete')
          .select('naechste_pruefung, gebaeude')
          .not('naechste_pruefung', 'is', null)
          .range(from, from + 999);
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
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([,v]) => v.count > 0)
      .map(([key, val], i) => ({
        key,
        monat: parseInt(key.split('-')[1]) - 1,
        count: val.count,
        standorte: Object.entries(val.standorte).sort(([,a],[,b]) => b-a).slice(0,6) as [string,number][],
        color: CARD_COLORS[i % CARD_COLORS.length],
      }));
  })();

  const total = raw.length;

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pts = [...particles];
    function loop() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      pts = pts.filter(p => p.life > 0);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.vx *= 0.97; p.life -= p.decay;
        ctx!.save();
        ctx!.globalAlpha = p.life * 0.9;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 10;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      });
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [particles]);

  function spawnParticles(color: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const newPts = Array.from({ length: 35 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      return { x: cx + (Math.random()-0.5)*120, y: cy + (Math.random()-0.5)*80, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 2, life: 1, decay: 0.015+Math.random()*0.025, color, size: 2+Math.random()*4 };
    });
    setParticles(p => [...p, ...newPts]);
  }

  function navigate(dir: 'left'|'right') {
    if (animating || monate.length === 0) return;
    const next = dir === 'right' ? current + 1 : current - 1;
    if (next < 0 || next >= monate.length) return;
    setDirection(dir);
    setAnimating(true);
    spawnParticles(monate[next].color.accent);
    setTimeout(() => { setCurrent(next); setAnimating(false); }, 320);
  }

  if (isLoading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid #f59e0b', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#94a3b8', fontSize:14 }}>Lade Gesamtliste...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (monate.length === 0) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'#94a3b8', fontSize:14, fontFamily:"'Inter',system-ui,sans-serif" }}>
      Gesamtliste in der Sidebar hochladen um die Roadmap zu sehen
    </div>
  );

  const active = monate[current];
  const prev2 = current >= 2 ? monate[current-2] : null;
  const prev1 = current >= 1 ? monate[current-1] : null;
  const next1 = current < monate.length-1 ? monate[current+1] : null;
  const next2 = current < monate.length-2 ? monate[current+2] : null;

  const totalStandorte = active.standorte.reduce((s,[,c])=>s+c,0);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", minHeight:'calc(100vh - 56px)', display:'flex', flexDirection:'column', background:'#0f172a', margin:'-28px -32px', padding:'32px' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes cardIn_right{from{opacity:0;transform:translateX(120px) scale(0.85) rotateY(-20deg)}to{opacity:1;transform:translateX(0) scale(1) rotateY(0)}}
        @keyframes cardIn_left{from{opacity:0;transform:translateX(-120px) scale(0.85) rotateY(20deg)}to{opacity:1;transform:translateX(0) scale(1) rotateY(0)}}
        @keyframes cardOut_right{from{opacity:1;transform:translateX(0) scale(1)}to{opacity:0;transform:translateX(-160px) scale(0.8)}}
        @keyframes cardOut_left{from{opacity:1;transform:translateX(0) scale(1)}to{opacity:0;transform:translateX(160px) scale(0.8)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .main-card{animation:${animating ? `cardOut_${direction}` : `cardIn_${direction}`} 0.32s cubic-bezier(0.16,1,0.3,1) both}
        .side-card{transition:all 0.35s cubic-bezier(0.16,1,0.3,1)}
        .detail-row{animation:fadeUp 0.3s ease both}
        .nav-btn-widi{transition:all 0.15s ease;}
        .nav-btn-widi:hover{transform:scale(1.08)!important}
        .nav-btn-widi:disabled{opacity:0.2!important;cursor:not-allowed!important;transform:none!important}
        .dot-nav{transition:all 0.2s cubic-bezier(0.16,1,0.3,1);cursor:pointer}
        .dot-nav:hover{transform:scale(1.3)}
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-.04em' }}>
            Prüf<span style={{ color:'#f59e0b' }}>roadmap</span> 2026
          </h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:'4px 0 0' }}>
            Navigiere durch die Monate · {total.toLocaleString('de-DE')} Geräte geladen
          </p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { val:total.toLocaleString('de-DE'), lbl:'Geräte gesamt' },
            { val:monate.length.toString(), lbl:'Monate geplant' },
            { val:Math.max(...monate.map(m=>m.count)).toLocaleString('de-DE'), lbl:'Peak Monat' },
          ].map((k,i) => (
            <div key={i} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:'10px 18px', textAlign:'center' }}>
              <p style={{ fontSize:18, fontWeight:900, color:'#f59e0b', margin:0, letterSpacing:'-.03em' }}>{k.val}</p>
              <p style={{ fontSize:10, color:'rgba(255,255,255,0.25)', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'.06em' }}>{k.lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div style={{ flex:1, display:'flex', gap:24, alignItems:'center', minHeight:520 }}>

        {/* Card Arc */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', perspective:1200, perspectiveOrigin:'50% 50%', position:'relative', height:440 }}>

          {/* Canvas for particles */}
          <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:10 }} width={800} height={440} />

          {/* Far Left */}
          {prev2 && (
            <div className="side-card" onClick={() => navigate('left')} style={{ position:'absolute', left:'3%', top:'50%', cursor:'pointer', zIndex:1,
              transform:'translateY(-50%) translateX(-20px) scale(0.62) rotateY(28deg)', opacity:0.2, transformOrigin:'center center' }}>
              <Card m={prev2} size={300} />
            </div>
          )}

          {/* Left */}
          {prev1 && (
            <div className="side-card" onClick={() => navigate('left')} style={{ position:'absolute', left:'10%', top:'50%', cursor:'pointer', zIndex:2,
              transform:'translateY(-50%) translateX(0) scale(0.75) rotateY(20deg)', opacity:0.5, transformOrigin:'center center' }}>
              <Card m={prev1} size={300} />
            </div>
          )}

          {/* CENTER — active */}
          <div className="main-card" key={current} style={{ position:'relative', zIndex:5,
            animation:`cardIn_${direction} 0.35s cubic-bezier(0.16,1,0.3,1) both`,
            filter:`drop-shadow(0 32px 64px ${active.color.glow})` }}>
            <Card m={active} size={300} active />
          </div>

          {/* Right */}
          {next1 && (
            <div className="side-card" onClick={() => navigate('right')} style={{ position:'absolute', right:'10%', top:'50%', cursor:'pointer', zIndex:2,
              transform:'translateY(-50%) translateX(0) scale(0.75) rotateY(-20deg)', opacity:0.5, transformOrigin:'center center' }}>
              <Card m={next1} size={300} />
            </div>
          )}

          {/* Far Right */}
          {next2 && (
            <div className="side-card" onClick={() => navigate('right')} style={{ position:'absolute', right:'3%', top:'50%', cursor:'pointer', zIndex:1,
              transform:'translateY(-50%) translateX(20px) scale(0.62) rotateY(-28deg)', opacity:0.2, transformOrigin:'center center' }}>
              <Card m={next2} size={300} />
            </div>
          )}

          {/* Nav arrows */}
          <button className="nav-btn-widi" onClick={() => navigate('left')} disabled={current === 0}
            style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20 }}>
            <ChevronLeft size={20} />
          </button>
          <button className="nav-btn-widi" onClick={() => navigate('right')} disabled={current === monate.length-1}
            style={{ position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20 }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Detail Panel */}
        <div key={active.key} style={{ width:280, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:20, padding:22, flexShrink:0, animation:'fadeUp 0.35s ease both' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:active.color.accent + '20', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Calendar size={18} style={{ color:active.color.accent }} />
            </div>
            <div>
              <p style={{ fontSize:16, fontWeight:800, color:'#fff', margin:0, letterSpacing:'-.02em' }}>
                {MONAT_NAMEN[active.monat]} 2026
              </p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', margin:'2px 0 0' }}>
                <span style={{ color:active.color.accent, fontWeight:700, fontSize:16 }}>
                  {active.count.toLocaleString('de-DE')}
                </span> Geräte
              </p>
            </div>
          </div>

          <p style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.2)', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 10px' }}>Standorte</p>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {active.standorte.map(([name, cnt], i) => {
              const pct = cnt / totalStandorte;
              return (
                <div key={name} className="detail-row" style={{ animationDelay:`${i*0.05}s` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <MapPin size={11} style={{ color:active.color.accent, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:active.color.accent }}>{cnt.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:99, overflow:'hidden', marginLeft:19 }}>
                    <div style={{ height:'100%', width:`${pct*100}%`, background:active.color.accent, borderRadius:99, transition:'width .5s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dot Navigation */}
      <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:20 }}>
        {monate.map((m, i) => (
          <div key={m.key} className="dot-nav"
            onClick={() => { setDirection(i > current ? 'right' : 'left'); setTimeout(()=>setCurrent(i), 0); }}
            style={{ width: i===current ? 22 : 7, height:7, borderRadius:99, background: i===current ? m.color.accent : 'rgba(255,255,255,0.12)', boxShadow: i===current ? `0 0 8px ${m.color.glow}` : 'none' }} />
        ))}
      </div>
    </div>
  );
}

// ── CARD COMPONENT ──
function Card({ m, size, active }: { m: MonatData; size: number; active?: boolean }) {
  return (
    <div style={{ width:size, height:Math.round(size*1.25), borderRadius:24, position:'relative', overflow:'hidden',
      background:m.color.bg, border:`1px solid rgba(255,255,255,${active?0.15:0.07})`,
      boxShadow: active ? `0 0 0 1px ${m.color.accent}30, inset 0 0 80px rgba(0,0,0,0.3)` : 'inset 0 0 60px rgba(0,0,0,0.4)',
      animation: active ? 'float 4s ease-in-out infinite' : 'none',
    }}>
      {/* Top shine */}
      <div style={{ position:'absolute', top:'-30%', left:'-20%', width:'80%', height:'60%',
        background:`radial-gradient(ellipse, ${m.color.accent}25 0%, transparent 70%)`, pointerEvents:'none' }} />
      {/* Bottom orb */}
      <div style={{ position:'absolute', bottom:'-20%', right:'-15%', width:'70%', height:'60%',
        background:`radial-gradient(ellipse, ${m.color.accent}10 0%, transparent 70%)`, pointerEvents:'none' }} />

      {/* Content */}
      <div style={{ position:'relative', zIndex:1, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:24 }}>
        <p style={{ fontSize:active?52:42, fontWeight:900, color:'#fff', letterSpacing:'-.06em', margin:0, lineHeight:1,
          textShadow:`0 0 ${active?60:30}px ${m.color.glow}` }}>
          {MONAT_KURZ[m.monat]}
        </p>
        <p style={{ fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.35)', letterSpacing:'.12em', textTransform:'uppercase', margin:0 }}>2026</p>
        <div style={{ width:40, height:1, background:`rgba(255,255,255,0.1)`, margin:'4px 0' }} />
        <p style={{ fontSize:active?32:24, fontWeight:900, color:m.color.accent, letterSpacing:'-.04em', margin:0,
          textShadow:`0 0 20px ${m.color.glow}` }}>
          {m.count >= 1000 ? (m.count/1000).toFixed(1)+'k' : m.count}
        </p>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', fontWeight:500, textTransform:'uppercase', letterSpacing:'.08em', margin:0 }}>Geräte</p>
      </div>

      {/* Active ring */}
      {active && <div style={{ position:'absolute', inset:-1, borderRadius:25, border:`1px solid ${m.color.accent}50`, pointerEvents:'none' }} />}
    </div>
  );
}
