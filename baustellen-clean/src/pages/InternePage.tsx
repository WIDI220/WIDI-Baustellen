import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, User, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

function fmt025(n: number) {
  const r = Math.round(n * 4) / 4;
  const s = r % 1 === 0 ? r.toFixed(0) : r % 0.5 === 0 ? r.toFixed(1) : r.toFixed(2);
  return s.replace('.', ',');
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export default function InternePage() {
  const { activeMonth, setActiveMonth } = useMonth();
  const qc = useQueryClient();
  const [year, month] = activeMonth.split('-').map(Number);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employee_id: '', datum: '', stunden: '', beschreibung: '' });
  const [deleting, setDeleting] = useState<string | null>(null);

  const from = `${activeMonth}-01`;
  const to = `${activeMonth}-${new Date(year, month, 0).getDate()}`;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const { data: eintraege = [], isLoading } = useQuery({
    queryKey: ['interne-stunden', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('interne_stunden')
        .select('*, employees(name, kuerzel)')
        .gte('datum', from)
        .lte('datum', to)
        .order('datum', { ascending: false });
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.employee_id || !form.datum || !form.stunden) throw new Error('Alle Felder ausfüllen');
      const std = Math.round(parseFloat(form.stunden.replace(',', '.')) * 4) / 4;
      if (isNaN(std) || std <= 0) throw new Error('Ungültige Stunden');
      const { error } = await supabase.from('interne_stunden').insert({
        employee_id: form.employee_id,
        datum: form.datum,
        stunden: std,
        beschreibung: form.beschreibung || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Eintrag gespeichert');
      setForm({ employee_id: '', datum: '', stunden: '', beschreibung: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['interne-stunden'] });
      qc.invalidateQueries({ queryKey: ['interne-stunden-ma'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interne_stunden').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gelöscht');
      qc.invalidateQueries({ queryKey: ['interne-stunden'] });
      qc.invalidateQueries({ queryKey: ['interne-stunden-ma'] });
      setDeleting(null);
    },
  });

  // Summen pro Mitarbeiter
  const perMA = useMemo(() => {
    const map: Record<string, { name: string; kuerzel: string; stunden: number }> = {};
    for (const e of eintraege as any[]) {
      const id = e.employee_id;
      if (!map[id]) map[id] = { name: e.employees?.name ?? '?', kuerzel: e.employees?.kuerzel ?? '?', stunden: 0 };
      map[id].stunden += Number(e.stunden ?? 0);
    }
    return Object.values(map).sort((a, b) => b.stunden - a.stunden);
  }, [eintraege]);

  const totalH = (eintraege as any[]).reduce((s, e) => s + Number(e.stunden ?? 0), 0);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Interne Stunden</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Verwaltung, Besprechungen & unabgerechnete Tätigkeiten</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={15} /> Eintrag hinzufügen
        </button>
      </div>

      {/* Monats-Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '10px 16px', width: 'fit-content' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', minWidth: 160, textAlign: 'center' }}>{monthLabel}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><ChevronRight size={16} /></button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Stunden gesamt', val: `${fmt025(totalH)}h`, color: '#8b5cf6' },
          { label: 'Einträge', val: (eintraege as any[]).length, color: '#3b82f6' },
          { label: 'Mitarbeiter', val: perMA.length, color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px', fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Formular */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Neuer Eintrag</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Mitarbeiter</label>
              <select
                value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#f8fafc' }}
              >
                <option value="">Mitarbeiter wählen...</option>
                {(employees as any[]).map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.kuerzel})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Datum</label>
              <input
                type="date"
                value={form.datum}
                onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Stunden</label>
              <input
                type="text"
                placeholder="z.B. 1,5"
                value={form.stunden}
                onChange={e => setForm(f => ({ ...f, stunden: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 4 }}>Beschreibung (optional)</label>
            <input
              type="text"
              placeholder="z.B. Verwaltungsaufgaben, Besprechung Quartalsplanung..."
              value={form.beschreibung}
              onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
              style={{ padding: '8px 18px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {addMutation.isPending ? 'Speichern...' : 'Speichern'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 14px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Übersicht pro MA */}
      {perMA.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Zusammenfassung</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {perMA.map(ma => (
              <div key={ma.kuerzel} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{ma.kuerzel}</span>
                <span style={{ fontSize: 12, color: '#6d28d9' }}>{fmt025(ma.stunden)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eintrags-Liste */}
      <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 1fr 44px', gap: 0, padding: '9px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          <div>Datum</div><div>Mitarbeiter</div><div>Stunden</div><div>Beschreibung</div><div></div>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Laden...</div>
        ) : (eintraege as any[]).length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Keine internen Stunden für {monthLabel}
          </div>
        ) : (
          (eintraege as any[]).map((e: any, i: number) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 1fr 44px', alignItems: 'center', gap: 0, padding: '10px 16px', borderBottom: i < (eintraege as any[]).length - 1 ? '1px solid #f8fafc' : 'none', background: deleting === e.id ? '#fef2f2' : '#fff' }}>
              <div style={{ fontSize: 12, color: '#374151' }}>{fmtDate(e.datum)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#7c3aed', flexShrink: 0 }}>
                  {e.employees?.kuerzel ?? '?'}
                </div>
                <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{e.employees?.name ?? '?'}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6' }}>{fmt025(Number(e.stunden))}h</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{e.beschreibung ?? '–'}</div>
              <div>
                {deleting === e.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => deleteMutation.mutate(e.id)} style={{ fontSize: 10, padding: '3px 7px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => setDeleting(null)} style={{ fontSize: 10, padding: '3px 7px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 5, cursor: 'pointer' }}>✗</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleting(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {(eintraege as any[]).length > 0 && (
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>{(eintraege as any[]).length} Einträge</span>
            <span style={{ fontWeight: 700, color: '#8b5cf6' }}>Gesamt: {fmt025(totalH)}h</span>
          </div>
        )}
      </div>
    </div>
  );
}
