// TicketMitarbeiterPage.tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function TicketMitarbeiterPage() {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-ma'],
    queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('employee_id, stunden'); return data ?? []; },
  });

  const emps = employees as any[];
  const wl = worklogs as any[];

  const stats = emps.map(e => {
    const h = wl.filter(w => w.employee_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    return { ...e, stunden: Math.round(h * 10) / 10 };
  }).sort((a, b) => b.stunden - a.stunden);

  const GEWERK_FARBE: Record<string, string> = { Hochbau: '#3B8BD4', Elektro: '#f59e0b', Beides: '#8b5cf6' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>Mitarbeiter</h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Übersicht aller aktiven Mitarbeiter</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {stats.map(e => {
          const initials = e.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase();
          const gFarbe = GEWERK_FARBE[e.gewerk] ?? '#6b7a99';
          return (
            <div key={e.id} style={{ background: '#fff', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(16,122,87,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#107A57', flexShrink: 0 }}>{initials}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f1f3d' }}>{e.name}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{e.kuerzel} · {e.stundensatz ?? 38.08}€/h</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: `${gFarbe}18`, color: gFarbe, fontWeight: '500' }}>{e.gewerk ?? '–'}</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#107A57' }}>{e.stunden}h</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
