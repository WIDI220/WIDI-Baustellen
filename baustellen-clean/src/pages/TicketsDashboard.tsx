import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Ticket, Clock, CheckCircle, TrendingUp } from 'lucide-react';

export default function TicketsDashboard() {
  const navigate = useNavigate();
  const now = new Date();
  const von = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const bis = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*, ticket_worklogs(stunden)').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-dash-monat'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs').select('stunden, leistungsdatum').gte('leistungsdatum', von).lte('leistungsdatum', bis);
      return data ?? [];
    },
  });

  const t = tickets as any[];
  const offen       = t.filter(x => x.status === 'in_bearbeitung').length;
  const erledigt    = t.filter(x => x.status === 'erledigt').length;
  const abrechenbar = t.filter(x => x.status === 'abrechenbar').length;
  const stundenMonat = (worklogs as any[]).reduce((s, w) => s + Number(w.stunden ?? 0), 0);

  const kpis = [
    { label: 'In Bearbeitung', value: offen,                       icon: Ticket,      farbe: '#2563eb' },
    { label: 'Erledigt',       value: erledigt,                    icon: CheckCircle, farbe: '#059669' },
    { label: 'Abrechenbar',    value: abrechenbar,                 icon: TrendingUp,  farbe: '#ea580c' },
    { label: 'Stunden (Monat)',value: `${stundenMonat.toFixed(1)}h`, icon: Clock,     farbe: '#107A57' },
  ];

  const neueste = t.slice(0, 8);

  const STATUS_LABEL: Record<string, string> = {
    in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt',
    zur_unterschrift: 'Zur Unterschrift', abrechenbar: 'Abrechenbar', abgerechnet: 'Abgerechnet',
  };
  const STATUS_FARBE: Record<string, { bg: string; text: string }> = {
    in_bearbeitung:  { bg: 'rgba(59,130,246,.1)',  text: '#2563eb' },
    erledigt:        { bg: 'rgba(16,185,129,.1)',  text: '#059669' },
    zur_unterschrift:{ bg: 'rgba(245,158,11,.1)',  text: '#d97706' },
    abrechenbar:     { bg: 'rgba(249,115,22,.1)',  text: '#ea580c' },
    abgerechnet:     { bg: 'rgba(107,114,128,.1)', text: '#6b7280' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
      <div>
        <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#0f1f3d', margin:'0 0 4px', letterSpacing:'-.02em' }}>Ticket-Dashboard</h1>
        <p style={{ fontSize:'13px', color:'#9ca3af', margin:0 }}>{now.toLocaleDateString('de-DE',{ month:'long', year:'numeric' })}</p>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:'#fff', borderRadius:'14px', padding:'18px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:'11px', color:'#9ca3af', marginBottom:'8px' }}>{k.label}</div>
            <div style={{ fontSize:'26px', fontWeight:'700', color:k.farbe }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Neueste Tickets */}
      <div style={{ background:'#fff', borderRadius:'16px', padding:'20px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#6b7a99', textTransform:'uppercase', letterSpacing:'.06em' }}>Neueste Tickets</div>
          <button onClick={() => navigate('/tickets/liste')} style={{ fontSize:'12px', color:'#107A57', background:'none', border:'none', cursor:'pointer', fontWeight:'500' }}>Alle anzeigen →</button>
        </div>
        {neueste.map((ticket: any) => {
          const st = STATUS_FARBE[ticket.status] ?? { bg:'#f0f0f0', text:'#666' };
          const totalH = (ticket.ticket_worklogs ?? []).reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
          return (
            <div key={ticket.id} onClick={() => navigate('/tickets/liste')}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f5f5f5', cursor:'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8faff'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', color:'#0f1f3d', fontWeight:'500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {ticket.a_nummer ? `T-${ticket.a_nummer} · ` : ''}{ticket.beschreibung || ticket.gewerk || '–'}
                </div>
                <div style={{ fontSize:'11px', color:'#9ca3af', marginTop:'2px' }}>{ticket.auftraggeber || '–'}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0, marginLeft:'12px' }}>
                {totalH > 0 && <span style={{ fontSize:'11px', color:'#6b7a99' }}>{totalH.toFixed(1)}h</span>}
                <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'20px', background:st.bg, color:st.text, fontWeight:'500' }}>
                  {STATUS_LABEL[ticket.status] ?? ticket.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
