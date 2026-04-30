import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getLocalSession, clearLocalSession } from '@/pages/AuthPage';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, CheckCircle, AlertCircle, Shield, CalendarDays, Clock, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Handwerker-App: offene Anfragen zählen (nur lesend) ──────────────────────
const APP_URL = 'https://syhjjuewkjjihxwiexmz.supabase.co';
const APP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aGpqdWV3a2pqaWh4d2lleG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTk2NDYsImV4cCI6MjA5MzA5NTY0Nn0.9A-GrkU72IZ3uxkypX5GttN4EXNv46aX4uOY4wUmfaE';

async function fetchOffeneAnfragenCount(): Promise<number> {
  try {
    const res = await fetch(`${APP_URL}/rest/v1/zeiteintraege?status=eq.offen&select=id`, {
      headers: { apikey: APP_KEY, Authorization: `Bearer ${APP_KEY}`, Prefer: 'count=exact' },
    });
    const count = res.headers.get('content-range');
    if (count) return parseInt(count.split('/')[1] || '0', 10);
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

const ADMIN_EMAIL = 'j.paredis@widi-hellersen.de';

export default function StartPage() {
  const navigate = useNavigate();
  const signOut = () => { clearLocalSession(); window.location.href = '/'; };
  const user = getLocalSession();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const { data: tickets = [] } = useQuery({ queryKey: ['start-tickets'], queryFn: async () => { const { data } = await supabase.from('tickets').select('status'); return data ?? []; } });
  const { data: baustellen = [] } = useQuery({ queryKey: ['start-baustellen'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('status'); return data ?? []; } });
  const { data: employees = [] } = useQuery({ queryKey: ['start-employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('id').eq('aktiv', true); return data ?? []; } });
  const { data: recentLogs = [] } = useQuery({ queryKey: ['start-admin-logs'], enabled: isAdmin, queryFn: async () => { const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(5); return data ?? []; } });

  // Wochenplanung: Anzahl Einträge diese Woche
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - dayOfWeek + 1); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const vonW = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
  const bisW = `${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`;
  const dt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dn = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - dn);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  const { data: wpEintraege = [] } = useQuery({ queryKey: ['start-wp', vonW], queryFn: async () => { const { data } = await supabase.from('wochenplanung').select('mitarbeiter_id,stunden').gte('datum', vonW).lte('datum', bisW); return data ?? []; } });

  const t = tickets as any[];
  const b = baustellen as any[];
  const wp = wpEintraege as any[];
  const wpMaCount = new Set(wp.map((e:any) => e.mitarbeiter_id)).size;
  const wpStunden = wp.reduce((s:number, e:any) => s + Number(e.stunden ?? 0), 0);

  // ── Offene Stunden-Anfragen aus Handwerker-App ───────────────────────────
  const { data: offeneAnfragenCount = 0 } = useQuery({
    queryKey: ['offene-anfragen-count'],
    queryFn: fetchOffeneAnfragenCount,
    refetchInterval: 30000,
  });
  const [modalGeschlossen, setModalGeschlossen] = useState(false);
  const zeigeModal = offeneAnfragenCount > 0 && !modalGeschlossen;

  const BEREICHE = [
    { path: '/baustellen/dashboard', color: '#2563eb', colorRgb: '37,99,235', icon: HardHat, titel: 'Baustellen', sub: 'Controlling & Management', stat: b.filter(x => x.status !== 'abgerechnet').length, statLabel: 'aktive Projekte', punkte: ['Budget & Kosten', 'Zeiterfassung', 'Aufträge importieren', 'Eskalationen'] },
    { path: '/tickets/dashboard', color: '#10b981', colorRgb: '16,185,129', icon: Ticket, titel: 'Ticketsystem', sub: 'WIDI Controlling', stat: t.filter(x => x.status === 'in_bearbeitung').length, statLabel: 'Tickets offen', punkte: ['Tickets erfassen', 'PDF-Rücklauf OCR', 'Excel-Import', 'Monatsanalyse'] },
    { path: '/auswertung', color: '#8b5cf6', colorRgb: '139,92,246', icon: TrendingUp, titel: 'MA-Auswertung', sub: 'Mitarbeiter & Statistik', stat: (employees as any[]).length, statLabel: 'Mitarbeiter', punkte: ['Stunden & Kosten', 'Einzelperson', 'Monatsabschluss'] },
    { path: '/dguv', color: '#f59e0b', colorRgb: '245,158,11', icon: Shield, titel: 'DGUV Prüfung', sub: 'Geräteprüfung & Roadmap', stat: 23352, statLabel: 'Prüflinge gesamt', punkte: ['Rohdaten verarbeiten', 'Roadmap 2025/2026', 'Prüfer-Auswertung', 'Neue Prüflinge'] },
    { path: '/planung', color: '#6366f1', colorRgb: '99,102,241', icon: CalendarDays, titel: 'Wochenplanung', sub: `KW ${kw} · Personalplanung`, stat: wpMaCount, statLabel: 'MA eingeplant', punkte: ['Baustellen planen', 'Tickets & DGUV', 'Begehungen', 'Interne Stunden'] },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* ── Stunden-Anfragen Modal ──────────────────────────────────────────── */}
      {zeigeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 36, maxWidth: 440, width: '100%', boxShadow: '0 30px 80px rgba(0,0,0,0.25)', position: 'relative', animation: 'floatUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}>
            <button onClick={() => setModalGeschlossen(true)}
              style={{ position: 'absolute', top: 16, right: 16, background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              <X size={16} />
            </button>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 20px rgba(245,158,11,0.35)' }}>
              <Clock size={26} style={{ color: '#fff' }} />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.04em' }}>
              {offeneAnfragenCount} neue Stunden-{offeneAnfragenCount === 1 ? 'Anfrage' : 'Anfragen'}
            </h2>
            <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 15, lineHeight: 1.6 }}>
              Deine Handwerker haben Stunden eingereicht die auf deine Genehmigung warten.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalGeschlossen(true)}
                style={{ flex: 1, padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#475569', fontFamily: 'inherit' }}>
                Später
              </button>
              <button onClick={() => { setModalGeschlossen(true); navigate('/stunden-anfragen'); }}
                style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(245,158,11,0.4)' }}>
                <Clock size={15} /> Jetzt prüfen →
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=DM+Mono:wght@400;500&display=swap');

        @keyframes gradientShift {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes floatUp {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes orb1 {
          0%,100% { transform:translate(0,0) scale(1); }
          33%     { transform:translate(60px,-40px) scale(1.1); }
          66%     { transform:translate(-30px,50px) scale(0.95); }
        }
        @keyframes orb2 {
          0%,100% { transform:translate(0,0) scale(1); }
          33%     { transform:translate(-50px,60px) scale(1.08); }
          66%     { transform:translate(40px,-30px) scale(1.02); }
        }
        @keyframes orb3 {
          0%,100% { transform:translate(0,0) scale(1); }
          50%     { transform:translate(30px,40px) scale(1.06); }
        }
        @keyframes cardEntrance {
          from { opacity:0; transform:translateY(32px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes shimLine {
          from { transform:translateX(-100%); }
          to   { transform:translateX(400%); }
        }
        @keyframes countUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }

        .s-nav { animation: fadeIn 0.4s ease forwards; }
        .s-hero { animation: floatUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards; opacity:0; }
        .s-chips { animation: floatUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s forwards; opacity:0; }

        .s-card { opacity:0; animation: cardEntrance 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
        .s-card:nth-child(1) { animation-delay: 0.3s; }
        .s-card:nth-child(2) { animation-delay: 0.42s; }
        .s-card:nth-child(3) { animation-delay: 0.54s; }

        .s-card:hover { transform: translateY(-8px) scale(1.01) !important; }
        .s-card:hover .card-arrow { transform: translateX(5px); opacity:1 !important; }
        .s-card:hover .card-bar { width: 100% !important; }
        .s-card:hover .card-shine { animation: shimLine 0.6s ease forwards; }

        .card-arrow { transition: transform 0.25s ease, opacity 0.25s ease; }
        .card-bar   { transition: width 0.5s cubic-bezier(0.16,1,0.3,1); }
        .s-card     { transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease; }

        .admin-section { animation: floatUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.65s forwards; opacity:0; }

        .chip { transition: all 0.2s ease; }
        .chip:hover { transform: translateY(-2px); }
      `}</style>

      {/* Animated background orbs */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-10%', left:'-5%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)', animation:'orb1 18s ease-in-out infinite' }} />
        <div style={{ position:'absolute', bottom:'-15%', right:'-8%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)', animation:'orb2 22s ease-in-out infinite' }} />
        <div style={{ position:'absolute', top:'40%', left:'40%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', animation:'orb3 15s ease-in-out infinite' }} />
        {/* Subtle grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px)', backgroundSize:'48px 48px' }} />
      </div>

      {/* Nav */}
      <nav className="s-nav" style={{ position:'relative', zIndex:10, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 48px', height:64, background:'rgba(255,255,255,0.7)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.8)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:11, background:'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(37,99,235,0.35)' }}>
            <HardHat size={18} style={{ color:'#fff' }} />
          </div>
          <div>
            <p style={{ color:'#0f172a', fontWeight:900, fontSize:15, margin:0, letterSpacing:'-.02em' }}>WIDI Controlling</p>
            <p style={{ color:'#94a3b8', fontSize:10, margin:0, fontWeight:500 }}>WIDI Hellersen GmbH</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:'4px 12px' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#10b981', boxShadow:'0 0 6px #10b981' }} />
            <span style={{ fontSize:11, color:'#065f46', fontWeight:700 }}>System aktiv</span>
          </div>
          {isAdmin && (
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'#faf5ff', border:'1px solid #ddd6fe', borderRadius:20, padding:'4px 12px' }}>
              <Shield size={11} style={{ color:'#8b5cf6' }} />
              <span style={{ fontSize:11, color:'#6d28d9', fontWeight:700 }}>Admin</span>
            </div>
          )}
          <span style={{ fontSize:12, color:'#94a3b8' }}>{user?.email}</span>
          <button onClick={() => signOut()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', background:'rgba(255,255,255,0.9)', border:'1px solid #e2e8f0', borderRadius:10, color:'#64748b', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .2s', backdropFilter:'blur(10px)' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef2f2';(e.currentTarget as HTMLElement).style.color='#dc2626';(e.currentTarget as HTMLElement).style.borderColor='#fecaca';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.9)';(e.currentTarget as HTMLElement).style.color='#64748b';(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0';}}>
            <LogOut size={13} /> Abmelden
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 48px 40px', position:'relative', zIndex:1 }}>

        {/* Hero */}
        <div className="s-hero" style={{ textAlign:'center', marginBottom:40, maxWidth:640 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(37,99,235,0.08)', border:'1px solid rgba(37,99,235,0.15)', borderRadius:100, padding:'6px 18px', marginBottom:20 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#2563eb', boxShadow:'0 0 8px rgba(37,99,235,0.6)' }} />
            <span style={{ fontSize:12, color:'#2563eb', fontWeight:700, letterSpacing:'.04em' }}>
              {new Date().toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' })}
            </span>
          </div>
          <h1 style={{ fontSize:54, fontWeight:900, margin:'0 0 14px', letterSpacing:'-.05em', lineHeight:1, color:'#0f172a' }}>
            Guten Tag
            <span style={{ display:'block', background:'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #10b981 100%)', backgroundSize:'200% 200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradientShift 4s ease infinite' }}>
              {user?.email?.split('@')[0].split('.')[0].charAt(0).toUpperCase()}{user?.email?.split('@')[0].split('.')[0].slice(1)} 👋
            </span>
          </h1>
          <p style={{ color:'#64748b', fontSize:16, margin:0, lineHeight:1.6, fontWeight:400 }}>
            Wähle einen Bereich und starte in den Tag.
          </p>
        </div>

        {/* Stats chips */}
        <div className="s-chips" style={{ display:'flex', gap:10, marginBottom:44, flexWrap:'wrap', justifyContent:'center' }}>
          {[
            { icon:Ticket, value:t.filter(x=>x.status==='in_bearbeitung').length, label:'Offen', color:'#2563eb', bg:'rgba(37,99,235,0.08)', border:'rgba(37,99,235,0.2)' },
            { icon:CheckCircle, value:t.filter(x=>['erledigt','abgerechnet'].includes(x.status)).length, label:'Erledigt', color:'#10b981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)' },
            { icon:AlertCircle, value:b.filter(x=>x.status!=='abgerechnet').length, label:'Baustellen aktiv', color:'#f59e0b', bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)' },
          ].map((s,i) => (
            <div key={i} className="chip" style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', background:s.bg, border:`1px solid ${s.border}`, borderRadius:14, backdropFilter:'blur(10px)' }}>
              <s.icon size={15} style={{ color:s.color }} />
              <span style={{ color:s.color, fontSize:20, fontWeight:900, letterSpacing:'-.03em' }}>{s.value}</span>
              <span style={{ color:'#64748b', fontSize:12, fontWeight:600 }}>{s.label}</span>
            </div>
          ))}
          {/* Stunden-Anfragen Chip */}
          <div className="chip" onClick={() => navigate('/stunden-anfragen')}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', background: offeneAnfragenCount > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.08)', border:`1px solid ${offeneAnfragenCount > 0 ? 'rgba(245,158,11,0.35)' : 'rgba(148,163,184,0.2)'}`, borderRadius:14, backdropFilter:'blur(10px)', cursor:'pointer', position:'relative' }}>
            <Clock size={15} style={{ color: offeneAnfragenCount > 0 ? '#d97706' : '#94a3b8' }} />
            <span style={{ color: offeneAnfragenCount > 0 ? '#d97706' : '#94a3b8', fontSize:20, fontWeight:900, letterSpacing:'-.03em' }}>{offeneAnfragenCount}</span>
            <span style={{ color:'#64748b', fontSize:12, fontWeight:600 }}>Stunden-Anfragen</span>
            {offeneAnfragenCount > 0 && <div style={{ position:'absolute', top:6, right:8, width:8, height:8, borderRadius:'50%', background:'#d97706', boxShadow:'0 0 6px #d97706' }} />}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:16, width:'100%', maxWidth:1400, marginBottom: isAdmin ? 24 : 0 }}>
          {BEREICHE.map((bereich, i) => (
            <div key={i} className="s-card"
              onClick={() => navigate(bereich.path)}
              style={{ background:'rgba(255,255,255,0.85)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.9)', borderRadius:24, padding:'28px 26px', cursor:'pointer', position:'relative', overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow=`0 20px 60px rgba(${bereich.colorRgb},0.2), 0 4px 20px rgba(0,0,0,0.08)`;(e.currentTarget as HTMLElement).style.borderColor=`rgba(${bereich.colorRgb},0.3)`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow='0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.9)';}}>

              {/* Shine effect on hover */}
              <div className="card-shine" style={{ position:'absolute', top:0, left:0, width:'30%', height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents:'none', transform:'translateX(-100%)' }} />

              {/* Top gradient line */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg, ${bereich.color}, ${bereich.color}44)`, borderRadius:'24px 24px 0 0' }} />

              {/* Icon + Stat */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ width:52, height:52, borderRadius:16, background:`rgba(${bereich.colorRgb},0.1)`, border:`1.5px solid rgba(${bereich.colorRgb},0.2)`, display:'flex', alignItems:'center', justifyContent:'center', transition:'transform 0.3s ease' }}>
                  <bereich.icon size={24} style={{ color:bereich.color }} />
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ color:bereich.color, fontSize:34, fontWeight:900, margin:0, letterSpacing:'-.05em', lineHeight:1, animation:'countUp 0.5s ease forwards' }}>{bereich.stat}</p>
                  <p style={{ color:'#94a3b8', fontSize:10, margin:'3px 0 0', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{bereich.statLabel}</p>
                </div>
              </div>

              <h2 style={{ color:'#0f172a', fontSize:20, fontWeight:900, margin:'0 0 3px', letterSpacing:'-.03em' }}>{bereich.titel}</h2>
              <p style={{ color:'#94a3b8', fontSize:12, margin:'0 0 18px', fontWeight:500 }}>{bereich.sub}</p>

              <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:22 }}>
                {bereich.punkte.map(p => (
                  <div key={p} style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:bereich.color, flexShrink:0, opacity:0.6 }} />
                    <span style={{ fontSize:12, color:'#64748b', fontWeight:500 }}>{p}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ height:2, background:'rgba(0,0,0,0.06)', borderRadius:99, marginBottom:16, overflow:'hidden' }}>
                <div className="card-bar" style={{ height:'100%', width:'20%', background:`linear-gradient(90deg,${bereich.color},${bereich.color}88)`, borderRadius:99 }} />
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:6, color:bereich.color, fontSize:13, fontWeight:700 }}>
                Öffnen
                <ArrowRight size={14} className="card-arrow" style={{ opacity:0.7 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Admin-Bereich */}
        {isAdmin && (
          <div className="admin-section" style={{ width:'100%', maxWidth:1020, background:'rgba(255,255,255,0.85)', backdropFilter:'blur(20px)', borderRadius:20, border:'1px solid rgba(139,92,246,0.2)', padding:'18px 24px', boxShadow:'0 4px 20px rgba(139,92,246,0.08)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: (recentLogs as any[]).length > 0 ? 14 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:30, height:30, borderRadius:9, background:'#faf5ff', border:'1px solid #ddd6fe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Shield size={14} style={{ color:'#8b5cf6' }} />
                </div>
                <div>
                  <p style={{ color:'#0f172a', fontWeight:700, fontSize:13, margin:0 }}>Admin — Letzte Aktivitäten</p>
                  <p style={{ color:'#94a3b8', fontSize:11, margin:0 }}>Nur für dich sichtbar</p>
                </div>
              </div>
              <button onClick={() => navigate('/admin')}
                style={{ padding:'7px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#8b5cf6,#7c3aed)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(139,92,246,0.3)', transition:'all .2s' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-1px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 20px rgba(139,92,246,0.4)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 12px rgba(139,92,246,0.3)';}}>
                Alle anzeigen →
              </button>
            </div>
            {(recentLogs as any[]).length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {(recentLogs as any[]).map((log: any) => (
                  <div key={log.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'7px 12px', background:'rgba(139,92,246,0.04)', borderRadius:10, fontSize:12 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:'#8b5cf6', flexShrink:0 }} />
                    <span style={{ color:'#6d28d9', fontWeight:700, flexShrink:0, minWidth:80 }}>{log.user_email?.split('@')[0].replace('.',' ')}</span>
                    <span style={{ color:'#64748b', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.action}</span>
                    <span style={{ color:'#94a3b8', fontFamily:'DM Mono, monospace', fontSize:11, flexShrink:0 }}>
                      {new Date(log.created_at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
