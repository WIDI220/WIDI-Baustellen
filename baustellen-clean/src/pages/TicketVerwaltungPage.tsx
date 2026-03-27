import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Search, TrendingDown, Calendar, Layers } from 'lucide-react';

function fmt(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
}

function ageDays(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function ageColor(days: number) {
  if (days <= 7)  return '#64748b';
  if (days <= 14) return '#f59e0b';
  if (days <= 30) return '#ef4444';
  return '#b91c1c';
}

function getKW(dateStr: string) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

const GW: Record<string, { bg: string; text: string }> = {
  Hochbau: { bg: '#dcfce7', text: '#15803d' },
  Elektro: { bg: '#dbeafe', text: '#1d4ed8' },
};

function MonatBlock({ ym, tickets, onErledige, loading }: {
  ym: string; tickets: any[];
  onErledige: (ids: string[]) => void; loading: boolean;
}) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState('');
  const [gewerk, setGewerk]       = useState('all');
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const filtered = useMemo(() =>
    tickets.filter(t =>
      (!search || t.a_nummer.toLowerCase().includes(search.toLowerCase())) &&
      (gewerk === 'all' || t.gewerk === gewerk)
    ), [tickets, search, gewerk]);

  const overdue = tickets.filter(t => ageDays(t.eingangsdatum) > 14).length;
  const oldest  = tickets.reduce((a: any, t: any) => !a || t.eingangsdatum < a.eingangsdatum ? t : a, null);
  const urgency = overdue > 10 ? '#ef4444' : overdue > 3 ? '#f59e0b' : '#e2e8f0';

  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((t: any) => t.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function doErledige(ids: string[]) { onErledige(ids); setSelected(new Set()); }

  return (
    <div style={{ background: '#fff', border: `1px solid ${open ? urgency : '#f1f5f9'}`, borderLeft: `4px solid ${urgency}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .2s' }}>

      {/* Kopfzeile */}
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px 80px 80px 130px', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ color: '#94a3b8' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{monthLabel(ym)}</p>
          {oldest && <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Ältestes: {fmt(oldest.eingangsdatum)} · {ageDays(oldest.eingangsdatum)} Tage offen</p>}
        </div>
        {[
          { val: tickets.length, label: 'Offen', color: '#3b82f6' },
          { val: tickets.filter((t:any) => t.gewerk === 'Hochbau').length, label: 'Hochbau', color: '#15803d' },
          { val: tickets.filter((t:any) => t.gewerk === 'Elektro').length, label: 'Elektro', color: '#1d4ed8' },
          { val: overdue, label: '>14 Tage', color: overdue > 0 ? '#ef4444' : '#94a3b8' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
          </div>
        ))}
        <div onClick={e => e.stopPropagation()}>
          <button
            onClick={() => doErledige(tickets.map((t:any) => t.id))}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 10, color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#10b981'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#059669'; }}
          >
            <CheckCircle size={13} /> Alle erledigen
          </button>
        </div>
      </div>

      {/* Detail */}
      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: '#f8fafc', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="A-Nummer..." style={{ width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <select value={gewerk} onChange={e => setGewerk(e.target.value)} style={{ fontSize: 12, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
              <option value="all">Alle Gewerke</option>
              <option value="Hochbau">Hochbau</option>
              <option value="Elektro">Elektro</option>
            </select>
            {selected.size > 0 && (
              <button onClick={() => doErledige([...selected])} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <CheckCircle size={13} /> {selected.size} erledigen
              </button>
            )}
          </div>

          {/* Tabellen-Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 150px 90px 110px 70px 60px 1fr', gap: 0, padding: '8px 20px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid #f1f5f9' }}>
            <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></div>
            <div>A-Nummer</div><div>Gewerk</div><div>Eingang</div><div>Alter</div><div>KW</div><div>Aktion</div>
          </div>

          {/* Zeilen */}
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Keine Tickets gefunden</div>
          ) : filtered.map((t: any, i: number) => {
            const days = ageDays(t.eingangsdatum);
            const col  = ageColor(days);
            const gw   = GW[t.gewerk] ?? { bg: '#f1f5f9', text: '#475569' };
            const sel  = selected.has(t.id);
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '32px 150px 90px 110px 70px 60px 1fr', alignItems: 'center', gap: 0, padding: '9px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none', background: sel ? '#f0fdf4' : days > 14 ? '#fff7f7' : '#fff' }}>
                <div><input type="checkbox" checked={sel} onChange={() => toggleOne(t.id)} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{t.a_nummer}</div>
                <div><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: gw.bg, color: gw.text }}>{t.gewerk}</span></div>
                <div style={{ fontSize: 12, color: '#374151' }}>{fmt(t.eingangsdatum)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{days}T</span>
                  {days > 14 && <AlertTriangle size={11} color="#ef4444" />}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>KW{getKW(t.eingangsdatum)}</div>
                <div>
                  <button onClick={() => doErledige([t.id])} style={{ fontSize: 11, padding: '4px 12px', border: '1px solid #d1fae5', borderRadius: 7, background: '#f0fdf4', color: '#059669', cursor: 'pointer', fontWeight: 600 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#10b981'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#059669'; }}>
                    ✓ Erledigt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TicketVerwaltungPage() {
  const qc = useQueryClient();
  const [globalSearch, setGlobalSearch] = useState('');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['verwaltung-alle'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').eq('status', 'in_bearbeitung').order('eingangsdatum', { ascending: true });
      return data ?? [];
    },
  });

  const erledigeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from('tickets').update({ status: 'erledigt' }).in('id', ids);
    },
    onSuccess: (_: any, ids: string[]) => {
      toast.success(`${ids.length} Ticket${ids.length > 1 ? 's' : ''} erledigt`);
      qc.invalidateQueries({ queryKey: ['verwaltung-alle'] });
      qc.invalidateQueries({ queryKey: ['open-ticket-count'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const byMonth = useMemo(() => {
    const f = globalSearch ? tickets.filter((t: any) => t.a_nummer.toLowerCase().includes(globalSearch.toLowerCase())) : tickets;
    const map: Record<string, any[]> = {};
    for (const t of f) {
      const ym = (t.eingangsdatum as string).slice(0, 7);
      if (!map[ym]) map[ym] = [];
      map[ym].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [tickets, globalSearch]);

  const total   = tickets.length;
  const overdue = tickets.filter((t: any) => ageDays(t.eingangsdatum) > 14).length;
  const oldest  = tickets[0];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Ticket-Verwaltung</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Alle offenen Tickets · nach Monat gruppiert · aufklappen zum Bearbeiten</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Offen gesamt',     val: total,                                    color: '#3b82f6', icon: <Layers size={16} /> },
          { label: 'Monate betroffen', val: byMonth.length,                           color: '#8b5cf6', icon: <Calendar size={16} /> },
          { label: 'Überfällig >14T',  val: overdue,                                  color: '#ef4444', icon: <AlertTriangle size={16} /> },
          { label: 'Älteste KW',       val: oldest ? `KW${getKW(oldest.eingangsdatum)}` : '–', color: '#f59e0b', icon: <TrendingDown size={16} /> },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 1px', fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Globale Suche */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="Alle Monate durchsuchen nach A-Nummer..." style={{ width: '100%', paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Monats-Blöcke */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Laden…</div>
      ) : byMonth.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9' }}>
          <CheckCircle size={40} color="#10b981" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>Alles erledigt!</p>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Keine offenen Tickets vorhanden.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byMonth.map(([ym, tix]) => (
            <MonatBlock key={ym} ym={ym} tickets={tix} onErledige={ids => erledigeMutation.mutate(ids)} loading={erledigeMutation.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}
