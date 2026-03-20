import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, Users, BarChart3, CheckCircle, Clock } from 'lucide-react';
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
  const { data: worklogs = [] } = useQuery({
    queryKey: ['start-worklogs'],
    queryFn: async () => {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const { data } = await supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', from);
      return data ?? [];
    }
  });

  const t = tickets as any[];
  const b = baustellen as any[];
  const w = worklogs as any[];
  const totalH = w.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);

  const BEREICHE = [
    {
      path: '/baustellen/dashboard',
      color: '#2563eb',
      darkColor: '#1d4ed8',
      lightColor: '#eff6ff',
      icon: HardHat,
      titel: 'Baustellen',
      sub: 'Controlling & Management',
      stat: b.filter(x => x.status !== 'abgerechnet').length,
      statLabel: 'aktive Projekte',
      punkte: ['Budget & Kosten', 'Zeiterfassung', 'Aufträge importieren', 'Eskalationen'],
    },
    {
      path: '/tickets/dashboard',
      color: '#10b981',
      darkColor: '#059669',
      lightColor: '#f0fdf4',
      icon: Ticket,
      titel: 'Ticketsystem',
      sub: 'WIDI Controlling',
      stat: t.filter(x => x.status === 'in_bearbeitung').length,
      statLabel: 'offen',
      punkte: ['Tickets erfassen', 'PDF-Rücklauf OCR', 'Excel-Import', 'Monatsanalyse'],
    },
    {
      path: '/auswertung',
      color: '#8b5cf6',
      darkColor: '#7c3aed',
      lightColor: '#faf5ff',
      icon: TrendingUp,
      titel: 'MA-Auswertung',
      sub: 'Mitarbeiter & Statistik',
      stat: (employees as any[]).length,
      statLabel: 'Mitarbeiter',
      punkte: ['Stunden & Kosten', 'Monatsvergleich', 'Tickets + Baustellen', 'Trends'],
    },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', fontFamily:"'Inter',system-ui,sans-serif", display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .start-nav { animation: fadeIn 0.4s ease forwards; }
        .start-hero { animation: fadeUp 0.5s ease 0.1s forwards; opacity:0; }
        .start-stat { animation: fadeUp 0.4s ease forwards; opacity:0; }
        .start-stat:nth-child(1){animation-delay:0.2s}
        .start-stat:nth-child(2){animation-delay:0.28s}
        .start-stat:nth-child(3){animation-delay:0.36s}
        .start-stat:nth-child(4){animation-delay:0.44s}
        .bereich-card { animation: fadeUp 0.5s ease forwards; opacity:0; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .bereich-card:nth-child(1){animation-delay:0.35s}
        .bereich-card:nth-child(2){animation-delay:0.45s}
        .bereich-card:nth-child(3){animation-delay:0.55s}
        .bereich-card:hover { transform: translateY(-6px) !important; }
        .float-icon { animation: float 4s ease-in-out infinite; }
        .arrow-icon { transition: transform 0.2s ease; }
        .bereich-card:hover .arrow-icon { transform: translateX(4px); }
      `}</style>

      {/* Nav */}
      <nav className="start-nav" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 40px', height:64, borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#2563eb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <HardHat size={17} style={{ color:'#fff' }} />
          </div>
          <div>
            <p style={{ color:'#fff', fontWeight:800, fontSize:13, margin:0, letterSpacing:'-.01em' }}>WIDI Controlling</p>
            <p style={{ color:'rgba(255,255,255,0.3)', fontSize:10, margin:0 }}>WIDI Hellersen GmbH</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:20, padding:'4px 12px' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} />
            <span style={{ fontSize:11, color:'#10b981', fontWeight:600 }}>Online</span>
          </div>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>{user?.email}</span>
          <button onClick={() => signOut()} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'rgba(255,255,255,0.5)', fontSize:12, fontWeight:500, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(239,68,68,0.15)';(e.currentTarget as HTMLElement).style.color='#fca5a5';(e.currentTarget as HTMLElement).style.borderColor='rgba(239,68,68,0.3)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.5)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.1)';}}>
            <LogOut size={13} /> Abmelden
          </button>
        </div>
      </nav>

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 40px' }}>

        {/* Hero Text */}
        <div className="start-hero" style={{ textAlign:'center', marginBottom:52 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:100, padding:'6px 16px', marginBottom:22, fontSize:12, color:'rgba(255,255,255,0.5)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981' }} />
            {new Date().toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
          <h1 style={{ color:'#fff', fontSize:52, fontWeight:900, margin:'0 0 14px', letterSpacing:'-.05em', lineHeight:1.05 }}>
            Alles im{' '}
            <span style={{ background:'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 50%,#10b981 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              Griff.
            </span>
          </h1>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:17, margin:0, fontWeight:400, maxWidth:440 }}>
            Wähle einen Bereich und starte deinen Arbeitstag.
          </p>
        </div>

        {/* Live Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:48, width:'100%', maxWidth:860 }}>
          {[
            { icon:Ticket, label:'Offen', value:t.filter(x=>x.status==='in_bearbeitung').length, color:'#3b82f6' },
            { icon:CheckCircle, label:'Erledigt', value:t.filter(x=>['erledigt','abgerechnet'].includes(x.status)).length, color:'#10b981' },
            { icon:HardHat, label:'Baustellen', value:b.filter(x=>x.status!=='abgerechnet').length, color:'#f59e0b' },
            { icon:Clock, label:'Stunden (Monat)', value:`${totalH.toFixed(1)}h`, color:'#8b5cf6' },
          ].map((s,i) => (
            <div key={i} className="start-stat" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:38, height:38, borderRadius:11, background:`${s.color}20`, border:`1px solid ${s.color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <s.icon size={17} style={{ color:s.color }} />
              </div>
              <div>
                <p style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0, letterSpacing:'-.03em' }}>{s.value}</p>
                <p style={{ color:'rgba(255,255,255,0.35)', fontSize:11, margin:0, fontWeight:500 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bereichs-Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18, width:'100%', maxWidth:980 }}>
          {BEREICHE.map((bereich, i) => (
            <div key={i} className="bereich-card"
              onClick={() => navigate(bereich.path)}
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:22, padding:'28px 26px', cursor:'pointer', position:'relative', overflow:'hidden' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.07)';(e.currentTarget as HTMLElement).style.borderColor=`${bereich.color}50`;(e.currentTarget as HTMLElement).style.boxShadow=`0 24px 60px ${bereich.color}25`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.08)';(e.currentTarget as HTMLElement).style.boxShadow='none';}}>

              {/* Glow */}
              <div style={{ position:'absolute', top:-60, right:-60, width:180, height:180, borderRadius:'50%', background:`radial-gradient(circle, ${bereich.color}18 0%, transparent 70%)`, pointerEvents:'none' }} />

              {/* Top */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                <div className="float-icon" style={{ animationDelay:`${i*1.3}s`, width:52, height:52, borderRadius:16, background:`${bereich.color}20`, border:`1px solid ${bereich.color}35`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <bereich.icon size={24} style={{ color:bereich.color }} />
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ color:bereich.color, fontSize:26, fontWeight:900, margin:0, letterSpacing:'-.04em' }}>{bereich.stat}</p>
                  <p style={{ color:'rgba(255,255,255,0.3)', fontSize:10, margin:0, fontWeight:500 }}>{bereich.statLabel}</p>
                </div>
              </div>

              {/* Title */}
              <h2 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:'0 0 4px', letterSpacing:'-.03em' }}>{bereich.titel}</h2>
              <p style={{ color:'rgba(255,255,255,0.35)', fontSize:12, margin:'0 0 20px', fontWeight:500 }}>{bereich.sub}</p>

              {/* Feature list */}
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:22 }}>
                {bereich.punkte.map(p => (
                  <div key={p} style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <div style={{ width:4, height:4, borderRadius:'50%', background:bereich.color, flexShrink:0, opacity:0.7 }} />
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{p}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{ display:'flex', alignItems:'center', gap:6, color:bereich.color, fontSize:13, fontWeight:700 }}>
                Öffnen <ArrowRight size={14} className="arrow-icon" />
              </div>

              {/* Bottom accent line */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${bereich.color}, transparent)`, opacity:0.5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
