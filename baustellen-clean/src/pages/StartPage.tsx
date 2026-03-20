import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function StartPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

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

  const t = tickets as any[];
  const b = baustellen as any[];

  const BEREICHE = [
    {
      path: '/baustellen/dashboard',
      color: '#2563eb',
      border: 'rgba(37,99,235,0.25)',
      glow: 'rgba(37,99,235,0.08)',
      icon: HardHat,
      titel: 'Baustellen',
      sub: 'Controlling & Management',
      stat: b.filter(x => x.status !== 'abgerechnet').length,
      statLabel: 'aktive Projekte',
      punkte: ['Budget & Kosten', 'Zeiterfassung & Material', 'Aufträge importieren', 'Eskalationen & Fotos'],
    },
    {
      path: '/tickets/dashboard',
      color: '#10b981',
      border: 'rgba(16,185,129,0.25)',
      glow: 'rgba(16,185,129,0.08)',
      icon: Ticket,
      titel: 'Ticketsystem',
      sub: 'WIDI Controlling',
      stat: t.filter(x => x.status === 'in_bearbeitung').length,
      statLabel: 'Tickets offen',
      punkte: ['Tickets erfassen & verwalten', 'PDF-Rücklauf mit OCR', 'Excel-Import', 'Monatsauswertungen'],
    },
    {
      path: '/auswertung',
      color: '#8b5cf6',
      border: 'rgba(139,92,246,0.25)',
      glow: 'rgba(139,92,246,0.08)',
      icon: TrendingUp,
      titel: 'MA-Auswertung',
      sub: 'Mitarbeiter & Statistik',
      stat: (employees as any[]).length,
      statLabel: 'Mitarbeiter',
      punkte: ['Stunden & Personalkosten', 'Tickets + Baustellen kombiniert', 'Monatsvergleich & Trends', 'Einzelperson-Analyse'],
    },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .s-nav  { animation:fadeIn 0.35s ease forwards; }
        .s-hero { animation:fadeUp 0.45s ease 0.05s forwards; opacity:0; }
        .s-card { animation:fadeUp 0.45s ease forwards; opacity:0; transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .s-card:nth-child(1){animation-delay:0.15s}
        .s-card:nth-child(2){animation-delay:0.22s}
        .s-card:nth-child(3){animation-delay:0.29s}
        .s-card:hover { transform:translateY(-4px); }
        .s-arrow { transition:transform 0.2s ease; }
        .s-card:hover .s-arrow { transform:translateX(4px); }
      `}</style>

      {/* Nav */}
      <nav className="s-nav" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 48px', height:60, borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <HardHat size={16} style={{ color:'#fff' }} />
          </div>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14, letterSpacing:'-.01em' }}>WIDI Controlling</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} />
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:500 }}>{user?.email}</span>
          </div>
          <button onClick={() => signOut()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 13px', background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'rgba(255,255,255,0.4)', fontSize:12, fontWeight:500, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(239,68,68,0.4)';(e.currentTarget as HTMLElement).style.color='#fca5a5';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.4)';}}>
            <LogOut size={12} /> Abmelden
          </button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'52px 48px' }}>

        {/* Hero */}
        <div className="s-hero" style={{ textAlign:'center', marginBottom:56, maxWidth:600 }}>
          <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:600, letterSpacing:'.12em', textTransform:'uppercase', margin:'0 0 18px' }}>
            {new Date().toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
          <h1 style={{ color:'#fff', fontSize:48, fontWeight:900, margin:'0 0 16px', letterSpacing:'-.05em', lineHeight:1.05 }}>
            Willkommen zurück
          </h1>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:16, margin:0, lineHeight:1.6 }}>
            Wähle einen Bereich und starte in den Tag.
          </p>

          {/* Quick Stats */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, marginTop:28 }}>
            {[
              { icon:Ticket, value:t.filter(x=>x.status==='in_bearbeitung').length, label:'Offen', color:'#3b82f6' },
              { icon:CheckCircle, value:t.filter(x=>['erledigt','abgerechnet'].includes(x.status)).length, label:'Erledigt', color:'#10b981' },
              { icon:HardHat, value:b.filter(x=>x.status!=='abgerechnet').length, label:'Baustellen aktiv', color:'#f59e0b' },
            ].map((s,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10 }}>
                <s.icon size={13} style={{ color:s.color }} />
                <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{s.value}</span>
                <span style={{ color:'rgba(255,255,255,0.35)', fontSize:11 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, width:'100%', maxWidth:960 }}>
          {BEREICHE.map((b, i) => (
            <div key={i} className="s-card"
              onClick={() => navigate(b.path)}
              style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${b.border}`, borderRadius:20, padding:'26px 24px', cursor:'pointer', position:'relative', overflow:'hidden' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow=`0 20px 50px ${b.glow}, 0 0 0 1px ${b.color}40`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow='none';}}>

              {/* Subtle top accent */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`linear-gradient(90deg, ${b.color}80, transparent)` }} />

              {/* Header */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ width:46, height:46, borderRadius:14, background:`${b.color}18`, border:`1px solid ${b.color}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <b.icon size={22} style={{ color:b.color }} />
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ color:b.color, fontSize:28, fontWeight:900, margin:0, letterSpacing:'-.04em', lineHeight:1 }}>{b.stat}</p>
                  <p style={{ color:'rgba(255,255,255,0.25)', fontSize:10, margin:'2px 0 0', fontWeight:500 }}>{b.statLabel}</p>
                </div>
              </div>

              <h2 style={{ color:'#fff', fontSize:18, fontWeight:800, margin:'0 0 3px', letterSpacing:'-.02em' }}>{b.titel}</h2>
              <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, margin:'0 0 18px', fontWeight:500 }}>{b.sub}</p>

              <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:20 }}>
                {b.punkte.map(p => (
                  <div key={p} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:3, height:3, borderRadius:'50%', background:b.color, opacity:0.6, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{p}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:5, color:b.color, fontSize:13, fontWeight:600 }}>
                Öffnen <ArrowRight size={13} className="s-arrow" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
