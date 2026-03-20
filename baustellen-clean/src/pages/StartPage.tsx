import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_EMAIL = 'j.paredis@widi-hellersen.de';

export default function StartPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const { data: tickets = [] } = useQuery({
    queryKey: ['start-tickets'],
    queryFn: async () => { const { data } = await supabase.from('tickets').select('status'); return data ?? []; }
  });
  const { data: baustellen = [] } = useQuery({
    queryKey: ['start-baustellen'],
    queryFn: async () => { const { data } = await supabase.from('baustellen').select('status'); return data ?? []; }
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['start-employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id').eq('aktiv', true); return data ?? []; }
  });
  const { data: recentLogs = [] } = useQuery({
    queryKey: ['start-admin-logs'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    }
  });

  const t = tickets as any[];
  const b = baustellen as any[];

  const BEREICHE = [
    {
      path: '/baustellen/dashboard',
      color: '#2563eb',
      colorLight: '#eff6ff',
      colorMid: '#bfdbfe',
      icon: HardHat,
      titel: 'Baustellen',
      sub: 'Controlling & Management',
      stat: b.filter(x => x.status !== 'abgerechnet').length,
      statLabel: 'aktive Projekte',
      punkte: ['Budget & Kosten', 'Zeiterfassung & Material', 'Aufträge importieren', 'Eskalationen'],
    },
    {
      path: '/tickets/dashboard',
      color: '#10b981',
      colorLight: '#f0fdf4',
      colorMid: '#bbf7d0',
      icon: Ticket,
      titel: 'Ticketsystem',
      sub: 'WIDI Controlling',
      stat: t.filter(x => x.status === 'in_bearbeitung').length,
      statLabel: 'Tickets offen',
      punkte: ['Tickets erfassen', 'PDF-Rücklauf OCR', 'Excel-Import', 'Monatsanalyse'],
    },
    {
      path: '/auswertung',
      color: '#8b5cf6',
      colorLight: '#faf5ff',
      colorMid: '#ddd6fe',
      icon: TrendingUp,
      titel: 'MA-Auswertung',
      sub: 'Mitarbeiter & Statistik',
      stat: (employees as any[]).length,
      statLabel: 'Mitarbeiter',
      punkte: ['Stunden & Kosten', 'Monatsvergleich', 'Einzelperson-Analyse', 'Trends'],
    },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

        .s-nav   { animation: fadeIn 0.3s ease forwards; }
        .s-hero  { animation: fadeUp 0.45s ease 0.05s forwards; opacity:0; }
        .s-chip  { animation: fadeUp 0.35s ease forwards; opacity:0; }
        .s-chip:nth-child(1){animation-delay:0.15s}
        .s-chip:nth-child(2){animation-delay:0.22s}
        .s-chip:nth-child(3){animation-delay:0.29s}

        .s-card  { animation: fadeUp 0.5s ease forwards; opacity:0; cursor:pointer; transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .s-card:nth-child(1){animation-delay:0.2s}
        .s-card:nth-child(2){animation-delay:0.3s}
        .s-card:nth-child(3){animation-delay:0.4s}
        .s-card:hover { transform: translateY(-5px); }
        .s-card:hover .s-icon-wrap { transform: scale(1.08); }
        .s-card:hover .s-arrow { transform: translateX(5px); }
        .s-card:hover .s-bar  { width: 100% !important; }

        .s-icon-wrap { transition: transform 0.25s ease; }
        .s-arrow     { transition: transform 0.2s ease; }
        .s-bar       { transition: width 0.4s ease; }

        .admin-card { animation: fadeUp 0.45s ease 0.5s forwards; opacity:0; }
        .pulse-dot  { animation: pulse-dot 2s ease-in-out infinite; }

        .shimmer-btn {
          background: linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #2563eb 100%);
          background-size: 200% auto;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      {/* Nav */}
      <nav className="s-nav" style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 48px', height:62, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <HardHat size={17} style={{ color:'#fff' }} />
          </div>
          <div>
            <p style={{ color:'#0f172a', fontWeight:800, fontSize:14, margin:0, letterSpacing:'-.01em' }}>WIDI Controlling</p>
            <p style={{ color:'#94a3b8', fontSize:10, margin:0 }}>WIDI Hellersen GmbH</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:'4px 12px' }}>
            <div className="pulse-dot" style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} />
            <span style={{ fontSize:11, color:'#065f46', fontWeight:600 }}>System aktiv</span>
          </div>
          {isAdmin && (
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'#faf5ff', border:'1px solid #ddd6fe', borderRadius:20, padding:'4px 12px' }}>
              <Shield size={11} style={{ color:'#8b5cf6' }} />
              <span style={{ fontSize:11, color:'#6d28d9', fontWeight:600 }}>Admin</span>
            </div>
          )}
          <span style={{ fontSize:12, color:'#94a3b8' }}>{user?.email}</span>
          <button onClick={() => signOut()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#64748b', fontSize:12, fontWeight:500, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fef2f2';(e.currentTarget as HTMLElement).style.color='#dc2626';(e.currentTarget as HTMLElement).style.borderColor='#fecaca';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff';(e.currentTarget as HTMLElement).style.color='#64748b';(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0';}}>
            <LogOut size={13} /> Abmelden
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ background:'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)', padding:'52px 48px 44px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:'35%', width:240, height:240, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />

        <div className="s-hero" style={{ maxWidth:960, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:32, flexWrap:'wrap', position:'relative', zIndex:1 }}>
          <div>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:12, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', margin:'0 0 10px' }}>
              {new Date().toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </p>
            <h1 style={{ color:'#fff', fontSize:38, fontWeight:900, margin:'0 0 8px', letterSpacing:'-.04em', lineHeight:1.1 }}>
              Guten Tag 👋
            </h1>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15, margin:0 }}>Wähle einen Bereich und starte in den Tag.</p>
          </div>

          {/* Stats chips */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[
              { icon:Ticket, value:t.filter(x=>x.status==='in_bearbeitung').length, label:'Offen', color:'rgba(255,255,255,0.9)' },
              { icon:CheckCircle, value:t.filter(x=>['erledigt','abgerechnet'].includes(x.status)).length, label:'Erledigt', color:'rgba(255,255,255,0.9)' },
              { icon:AlertCircle, value:b.filter(x=>x.status!=='abgerechnet').length, label:'Baustellen', color:'rgba(255,255,255,0.9)' },
            ].map((s,i) => (
              <div key={i} className="s-chip" style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.12)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:14, padding:'12px 18px', minWidth:110, textAlign:'center', flexDirection:'column' }}>
                <s.icon size={18} style={{ color:'rgba(255,255,255,0.7)' }} />
                <div>
                  <p style={{ color:'#fff', fontSize:22, fontWeight:900, margin:0, letterSpacing:'-.03em' }}>{s.value}</p>
                  <p style={{ color:'rgba(255,255,255,0.5)', fontSize:10, margin:0, fontWeight:500 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ flex:1, padding:'36px 48px 40px', maxWidth:1060, width:'100%', margin:'0 auto', boxSizing:'border-box' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18, marginBottom: isAdmin ? 24 : 0 }}>
          {BEREICHE.map((bereich, i) => (
            <div key={i} className="s-card"
              onClick={() => navigate(bereich.path)}
              style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20, padding:'26px 24px', position:'relative', overflow:'hidden' }}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.boxShadow=`0 16px 48px ${bereich.color}18`;el.style.borderColor=bereich.colorMid;}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.boxShadow='none';el.style.borderColor='#e2e8f0';}}>

              {/* Top accent */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg, ${bereich.color}, ${bereich.color}60)`, borderRadius:'20px 20px 0 0' }} />

              {/* Icon + Stat */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18 }}>
                <div className="s-icon-wrap" style={{ width:50, height:50, borderRadius:15, background:bereich.colorLight, border:`1px solid ${bereich.colorMid}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <bereich.icon size={23} style={{ color:bereich.color }} />
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ color:bereich.color, fontSize:30, fontWeight:900, margin:0, letterSpacing:'-.05em', lineHeight:1 }}>{bereich.stat}</p>
                  <p style={{ color:'#94a3b8', fontSize:10, margin:'2px 0 0', fontWeight:500 }}>{bereich.statLabel}</p>
                </div>
              </div>

              <h2 style={{ color:'#0f172a', fontSize:19, fontWeight:800, margin:'0 0 3px', letterSpacing:'-.02em' }}>{bereich.titel}</h2>
              <p style={{ color:'#94a3b8', fontSize:12, margin:'0 0 18px', fontWeight:500 }}>{bereich.sub}</p>

              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
                {bereich.punkte.map(p => (
                  <div key={p} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:4, height:4, borderRadius:'50%', background:bereich.color, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'#64748b' }}>{p}</span>
                  </div>
                ))}
              </div>

              {/* Animated bottom bar */}
              <div style={{ height:2, background:'#f1f5f9', borderRadius:99, marginBottom:14, overflow:'hidden' }}>
                <div className="s-bar" style={{ height:'100%', width:'25%', background:`linear-gradient(90deg,${bereich.color},${bereich.color}70)`, borderRadius:99 }} />
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:5, color:bereich.color, fontSize:13, fontWeight:700 }}>
                Öffnen <ArrowRight size={13} className="s-arrow" />
              </div>
            </div>
          ))}
        </div>

        {/* Admin-Bereich */}
        {isAdmin && (
          <div className="admin-card" style={{ background:'#fff', borderRadius:18, border:'1px solid #ddd6fe', padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:10, background:'#faf5ff', border:'1px solid #ddd6fe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Shield size={15} style={{ color:'#8b5cf6' }} />
                </div>
                <div>
                  <p style={{ color:'#0f172a', fontWeight:700, fontSize:13, margin:0 }}>Admin — Letzte Aktivitäten</p>
                  <p style={{ color:'#94a3b8', fontSize:11, margin:0 }}>Nur für dich sichtbar</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/log')}
                className="shimmer-btn"
                style={{ padding:'7px 16px', borderRadius:10, border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                Alle anzeigen →
              </button>
            </div>
            {(recentLogs as any[]).length === 0 ? (
              <p style={{ color:'#cbd5e1', fontSize:13, textAlign:'center', padding:'16px 0', margin:0 }}>Noch keine Aktivitäten erfasst</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {(recentLogs as any[]).map((log: any) => (
                  <div key={log.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'#faf5ff', borderRadius:10, fontSize:12 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#8b5cf6', flexShrink:0 }} />
                    <span style={{ color:'#6d28d9', fontWeight:600, flexShrink:0 }}>{log.user_email?.split('@')[0]}</span>
                    <span style={{ color:'#64748b', flex:1 }}>{log.action}</span>
                    <span style={{ color:'#94a3b8', fontFamily:'monospace', fontSize:11 }}>
                      {new Date(log.created_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
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
