import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { toast } from 'sonner';
import { Search, AlertTriangle, Clock, CheckCircle, ChevronUp, ChevronDown, Filter } from 'lucide-react';

const GEWERK_COLORS: Record<string, { bg: string; text: string }> = {
  Hochbau:  { bg: '#dcfce7', text: '#15803d' },
  Elektro:  { bg: '#dbeafe', text: '#1d4ed8' },
  Sanitär:  { bg: '#fef9c3', text: '#a16207' },
};

function ageLabel(dateStr: string): { label: string; color: string } {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 7)  return { label: `${days}T`,  color: '#64748b' };
  if (days <= 14) return { label: `${days}T`,  color: '#f59e0b' };
  if (days <= 30) return { label: `${days}T`,  color: '#ef4444' };
  return           { label: `${days}T`,  color: '#b91c1c' };
}

function fmt(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

type SortKey = 'eingangsdatum' | 'a_nummer' | 'gewerk' | 'alter';
type SortDir = 'asc' | 'desc';

export default function TicketVerwaltungPage() {
  const { activeMonth } = useMonth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [gewerkFilter, setGewerkFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('eingangsdatum');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const [year, month] = activeMonth.split('-').map(Number);
  const from = `${activeMonth}-01`;
  const to   = `${activeMonth}-${new Date(year, month, 0).getDate()}`;

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['verwaltung-tickets', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .eq('status', 'in_bearbeitung')
        .order('eingangsdatum', { ascending: true });
      return data ?? [];
    },
  });

  const monthTickets = useMemo(() =>
    showAll ? tickets : tickets.filter((t: any) => t.eingangsdatum >= from && t.eingangsdatum <= to),
    [tickets, showAll, from, to]
  );

  const filtered = useMemo(() => {
    let r = monthTickets.filter((t: any) => {
      const matchSearch = !search || t.a_nummer.toLowerCase().includes(search.toLowerCase());
      const matchGewerk = gewerkFilter === 'all' || t.gewerk === gewerkFilter;
      return matchSearch && matchGewerk;
    });
    r = [...r].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (sortKey === 'eingangsdatum' || sortKey === 'alter') {
        av = a.eingangsdatum; bv = b.eingangsdatum;
      } else if (sortKey === 'a_nummer') {
        av = a.a_nummer; bv = b.a_nummer;
      } else {
        av = a.gewerk; bv = b.gewerk;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [monthTickets, search, gewerkFilter, sortKey, sortDir]);

  const erledigeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('tickets').update({ status: 'erledigt' }).in('id', ids);
    },
    onSuccess: () => {
      toast.success('Tickets als erledigt markiert');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['verwaltung-tickets'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((t: any) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  // Statistiken
  const altUeber14 = filtered.filter((t: any) => {
    const days = Math.floor((Date.now() - new Date(t.eingangsdatum).getTime()) / 86400000);
    return days > 14;
  }).length;
  const hochbauCount = filtered.filter((t: any) => t.gewerk === 'Hochbau').length;
  const elektroCount = filtered.filter((t: any) => t.gewerk === 'Elektro').length;

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      : <span style={{ opacity: .3 }}><ChevronUp size={12} /></span>;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
          Offene Tickets
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          {showAll ? 'Alle Monate' : monthLabel} · {filtered.length} offen
          {altUeber14 > 0 && (
            <span style={{ marginLeft: 10, color: '#ef4444', fontWeight: 600 }}>
              ⚠ {altUeber14} überfällig (&gt;14 Tage)
            </span>
          )}
        </p>
      </div>

      {/* Stat-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Offen gesamt', val: filtered.length, color: '#3b82f6', icon: <Clock size={16} /> },
          { label: 'Hochbau', val: hochbauCount, color: '#15803d', icon: <Filter size={16} /> },
          { label: 'Elektro', val: elektroCount, color: '#1d4ed8', icon: <Filter size={16} /> },
          { label: 'Überfällig >14T', val: altUeber14, color: '#ef4444', icon: <AlertTriangle size={16} /> },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              {s.icon}
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 1px', fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter-Leiste */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="A-Nummer suchen..."
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 10, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={gewerkFilter}
          onChange={e => setGewerkFilter(e.target.value)}
          style={{ fontSize: 13, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}
        >
          <option value="all">Alle Gewerke</option>
          <option value="Hochbau">Hochbau</option>
          <option value="Elektro">Elektro</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Alle Monate
        </label>
        {selected.size > 0 && (
          <button
            onClick={() => erledigeMutation.mutate([...selected])}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <CheckCircle size={14} />
            {selected.size} erledigen
          </button>
        )}
      </div>

      {/* Tabelle */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden' }}>
        {/* Tabellen-Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '36px 140px 110px 90px 90px 90px 1fr', gap: 0, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          <div>
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
          </div>
          <div onClick={() => toggleSort('a_nummer')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            A-Nummer <SortIcon k="a_nummer" />
          </div>
          <div onClick={() => toggleSort('gewerk')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            Gewerk <SortIcon k="gewerk" />
          </div>
          <div onClick={() => toggleSort('eingangsdatum')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            Eingang <SortIcon k="eingangsdatum" />
          </div>
          <div onClick={() => toggleSort('alter')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            Alter <SortIcon k="alter" />
          </div>
          <div>Woche</div>
          <div>Aktion</div>
        </div>

        {/* Zeilen */}
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Laden...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Keine offenen Tickets gefunden</div>
        ) : (
          filtered.map((t: any, i: number) => {
            const age = ageLabel(t.eingangsdatum);
            const days = Math.floor((Date.now() - new Date(t.eingangsdatum).getTime()) / 86400000);
            const week = Math.ceil((new Date(t.eingangsdatum).getDate()) / 7);
            const gewerk = GEWERK_COLORS[t.gewerk] ?? { bg: '#f1f5f9', text: '#475569' };
            const isSelected = selected.has(t.id);
            const isOverdue = days > 14;

            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 140px 110px 90px 90px 90px 1fr',
                  alignItems: 'center',
                  gap: 0,
                  padding: '10px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none',
                  background: isSelected ? '#f0fdf4' : isOverdue ? '#fff7f7' : '#fff',
                  transition: 'background .1s',
                }}
              >
                <div>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(t.id)} />
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                  {t.a_nummer}
                </div>

                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: gewerk.bg, color: gewerk.text }}>
                    {t.gewerk}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#374151' }}>
                  {fmt(t.eingangsdatum)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: age.color }}>{age.label}</span>
                  {isOverdue && <AlertTriangle size={12} color="#ef4444" />}
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  KW {getKW(t.eingangsdatum)}
                </div>

                <div>
                  <button
                    onClick={() => erledigeMutation.mutate([t.id])}
                    style={{ fontSize: 11, padding: '5px 12px', border: '1px solid #d1fae5', borderRadius: 8, background: '#f0fdf4', color: '#059669', cursor: 'pointer', fontWeight: 600, transition: 'all .1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#10b981'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#059669'; }}
                  >
                    ✓ Erledigt
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>{filtered.length} Tickets · {selected.size} ausgewählt</span>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{altUeber14} überfällig</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getKW(dateStr: string): number {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}
