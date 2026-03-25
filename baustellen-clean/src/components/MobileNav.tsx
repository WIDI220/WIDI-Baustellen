import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Ticket, HardHat, Shield, Users } from 'lucide-react';

const NAV = [
  { path: '/',                    icon: LayoutDashboard, label: 'Start' },
  { path: '/tickets/liste',       icon: Ticket,          label: 'Tickets' },
  { path: '/baustellen/liste',    icon: HardHat,         label: 'Baustellen' },
  { path: '/dguv/roadmap',        icon: Shield,          label: 'DGUV' },
  { path: '/auswertung',          icon: Users,           label: 'Personal' },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path.split('/')[1] === '' ? '/' : '/' + path.split('/')[1]);
  };

  return (
    <nav className="mobile-bottom-nav">
      {NAV.map(({ path, icon: Icon, label }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className={isActive(path) ? 'active' : ''}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
