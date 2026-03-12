import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, FileUp, Users, Building2, Archive } from 'lucide-react';

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/baustellen',  icon: HardHat,         label: 'Baustellen' },
  { to: '/zeiterfassung',icon: Clock,           label: 'Zeiterfassung' },
  { to: '/material',    icon: Package,          label: 'Material' },
  { to: '/nachtraege',  icon: FileText,         label: 'Nachträge' },
  { to: '/fotos',       icon: Camera,           label: 'Fotos' },
  { to: '/eskalationen',icon: AlertTriangle,    label: 'Eskalationen' },
  { to: '/mitarbeiter', icon: Users,            label: 'Mitarbeiter' },
  { to: '/import',      icon: FileUp,           label: 'Import' },
];

function NavItem({ to, icon: Icon, label, collapsed }: { to: string; icon: any; label: string; collapsed: boolean }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(to + '/');
  return (
    <NavLink to={to}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '9px 0' : '9px 12px',
        borderRadius: 12, fontSize: 13, fontWeight: 500,
        textDecoration: 'none', transition: 'all .15s',
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: active ? 'rgba(255,255,255,.10)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,.42)',
        boxShadow: active ? 'inset 1px 0 0 rgba(255,255,255,.15)' : 'none',
      })}
      title={collapsed ? label : undefined}
    >
      <Icon style={{width:15,height:15,flexShrink:0,opacity:active?1:.75}}/>
      {!collapsed && <span style={{letterSpacing:'.01em'}}>{label}</span>}
      {!collapsed && active && <div style={{marginLeft:'auto',width:4,height:4,borderRadius:99,background:'#60a5fa'}}/>}
    </NavLink>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#f4f6fa'}}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 60 : 220,
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        transition: 'width .25s cubic-bezier(.4,0,.2,1)',
        background: 'linear-gradient(180deg, #0b1830 0%, #0f2345 60%, #0d1e3b 100%)',
        borderRight: '1px solid rgba(255,255,255,.06)',
        boxShadow: '2px 0 20px rgba(0,0,0,.25)',
      }}>

        {/* Logo */}
        <div style={{
          display:'flex', alignItems:'center', gap:10,
          padding: collapsed ? '18px 0' : '18px 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          flexShrink: 0,
        }}>
          <div style={{
            width:34, height:34, borderRadius:11, flexShrink:0,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: '0 3px 10px rgba(59,130,246,.5)',
          }}>
            <Building2 style={{width:17,height:17,color:'#fff'}}/>
          </div>
          {!collapsed && (
            <div>
              <p style={{color:'#fff',fontWeight:800,fontSize:14,lineHeight:1,fontFamily:'DM Sans',letterSpacing:'.02em'}}>WIDI</p>
              <p style={{color:'rgba(255,255,255,.3)',fontSize:10,marginTop:2,letterSpacing:'.12em',fontWeight:600}}>BAUSTELLEN</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{flex:1, padding:'10px 8px', overflowY:'auto', display:'flex', flexDirection:'column', gap:2}}>
          {NAV.map(item => <NavItem key={item.to} {...item} collapsed={collapsed}/>)}
        </nav>

        {/* Archiv */}
        <div style={{padding:'0 8px', borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:8}}>
          {!collapsed && (
            <p style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,.18)',letterSpacing:'.14em',padding:'8px 12px 4px'}}>ABSCHLUSS</p>
          )}
          {collapsed && <div style={{height:12}}/>}
          <NavItem to="/archiv" icon={Archive} label="Archiv" collapsed={collapsed}/>
          <div style={{height:8}}/>
        </div>

        {/* Bottom Buttons */}
        <div style={{padding:'8px',borderTop:'1px solid rgba(255,255,255,.06)',display:'flex',flexDirection:'column',gap:2}}>
          <button onClick={()=>setCollapsed(!collapsed)} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding: collapsed ? '9px 0' : '9px 12px',
            borderRadius:11, fontSize:12, cursor:'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background:'transparent', border:'none', color:'rgba(255,255,255,.28)',
            transition:'color .15s',
          }}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.28)')}>
            {collapsed?<ChevronRight style={{width:14,height:14}}/>:<><ChevronLeft style={{width:14,height:14}}/><span>Einklappen</span></>}
          </button>
          <button onClick={signOut} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding: collapsed ? '9px 0' : '9px 12px',
            borderRadius:11, fontSize:12, cursor:'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background:'transparent', border:'none', color:'rgba(255,255,255,.28)',
            transition:'color .15s',
          }}
          onMouseEnter={e=>(e.currentTarget.style.color='#fca5a5')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.28)')}>
            <LogOut style={{width:14,height:14,flexShrink:0}}/>
            {!collapsed && <span>Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{flex:1, overflowY:'auto', background:'#f4f6fa'}}>
        <div style={{maxWidth:1400, margin:'0 auto', padding:'28px 32px'}}>
          {children}
        </div>
      </main>
    </div>
  );
}
