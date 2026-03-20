import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, BarChart2, Calendar, LogOut, Home, Upload } from 'lucide-react';

const NAV = [
  { to: '/dguv',            icon: Upload,   label: 'Verarbeitung' },
  { to: '/dguv/roadmap',    icon: Calendar, label: 'Roadmap' },
  { to: '/dguv/auswertung', icon: BarChart2, label: 'Auswertung' },
];

const ACCENT = '#f59e0b';
const ACCENT_LIGHT = 'rgba(245,158,11,0.15)';

export default function AppLayoutDGUV({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#f8fafc', fontFamily:"'Inter',system-ui,sans-serif" }}>
      <aside style={{ width:220, background:'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)', display:'flex', flexDirection:'column', flexShrink:0, boxShadow:'4px 0 24px rgba(0,0,0,0.15)', zIndex:10 }}>

        {/* Logo */}
        <div style={{ padding:'18px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:`linear-gradient(135deg,${ACCENT},#d97706)`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px rgba(245,158,11,0.4)` }}>
              <Shield size={17} style={{ color:'#fff' }} />
            </div>
            <div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:13, margin:0 }}>WIDI</p>
              <p style={{ color:'rgba(255,255,255,0.35)', fontSize:10, margin:0 }}>DGUV Prüfung</p>
            </div>
          </div>
          <button onClick={() => navigate('/')}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:500, cursor:'pointer', transition:'all .15s', justifyContent:'center' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.12)';(e.currentTarget as HTMLElement).style.color='#fff';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.5)';}}>
            <Home size={12} /> Startseite
          </button>
        </div>

        <p style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'rgba(255,255,255,0.2)', fontWeight:600, padding:'10px 16px 4px', margin:0 }}>Navigation</p>
        <nav style={{ flex:1, padding:'4px 8px', display:'flex', flexDirection:'column', gap:2 }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <button key={to} onClick={() => navigate(to)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13, fontWeight:500, transition:'all .15s', width:'100%', textAlign:'left', background: active ? ACCENT_LIGHT : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.45)', borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent' }}
                onMouseEnter={e=>{ if(!active){(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.85)';}}}
                onMouseLeave={e=>{ if(!active){(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.45)';}}}
              >
                <Icon size={15} style={{ flexShrink:0 }} /> {label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding:'8px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={signOut}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'none', border:'none', color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:500, cursor:'pointer', borderRadius:10, transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='#fca5a5';(e.currentTarget as HTMLElement).style.background='rgba(239,68,68,0.1)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.3)';(e.currentTarget as HTMLElement).style.background='none';}}>
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      </aside>
      <main style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>{children}</main>
    </div>
  );
}
