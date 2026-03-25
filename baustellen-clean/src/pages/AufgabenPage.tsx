import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, ChevronLeft, ChevronRight, Trash2, Zap, Droplets, Clock, User, FileText, CheckCircle } from 'lucide-react';

// ─── Hilfsfunktionen ───────────────────────────────────────────────
function getKW(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(kw).padStart(2, '0')}`;
}

function kwLabel(kw: string): string {
  const [year, week] = kw.replace('-W','|').split('|');
  const d = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);
  const mo = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  d.setDate(d.getDate() + 6);
  const bi = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  return `KW ${week} · ${mo}–${bi} ${year}`;
}

function prevKW(kw: string): string {
  const [year, week] = kw.replace('-W','|').split('|').map(Number);
  const d = new Date(year, 0, 1 + (week - 1) * 7);
  d.setDate(d.getDate() - 7);
  return getKW(d);
}

function nextKW(kw: string): string {
  const [year, week] = kw.replace('-W','|').split('|').map(Number);
  const d = new Date(year, 0, 1 + (week - 1) * 7);
  d.setDate(d.getDate() + 7);
  return getKW(d);
}

// ─── Typen ─────────────────────────────────────────────────────────
type BegehungTyp = 'sicherheitsbeleuchtung' | 'osmose';

interface Eintrag {
  id: string;
  typ: BegehungTyp;
  kw: string;
  datum_von: string;
  datum_bis: string;
  mitarbeiter: string;
  stunden: number | null;
  bemerkung: string | null;
  created_at: string;
}

const TABS: { key: BegehungTyp; label: string; icon: typeof Zap; color: string; colorLight: string }[] = [
  { key: 'sicherheitsbeleuchtung', label: 'Sicherheitsbeleuchtung', icon: Zap, color: '#f59e0b', colorLight: '#fffbeb' },
  { key: 'osmose', label: 'Osmose-Anlage', icon: Droplets, color: '#3b82f6', colorLight: '#eff6ff' },
];

// ─── Hauptkomponente ────────────────────────────────────────────────
export default function AufgabenPage() {
  const qc = useQueryClient();
  const [aktTyp, setAktTyp] = useState<BegehungTyp>('sicherheitsbeleuchtung');
  const [aktKW, setAktKW] = useState(getKW(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ datum_von: '', datum_bis: '', mitarbeiter: '', stunden: '', bemerkung: '' });

  const aktTab = TABS.find(t => t.key === aktTyp)!;

  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const { data: eintraege = [], isLoading } = useQuery({
    queryKey: ['begehungen', aktTyp, aktKW],
    queryFn: async () => {
      const { data } = await supabase
        .from('begehungen')
        .select('*')
        .eq('typ', aktTyp)
        .eq('kw', aktKW)
        .order('created_at', { ascending: false });
      return (data ?? []) as Eintrag[];
    },
  });

  const { data: jahresStats = [] } = useQuery({
    queryKey: ['begehungen-stats', aktTyp],
    queryFn: async () => {
      const year = aktKW.split('-')[0];
      const { data } = await supabase
        .from('begehungen')
        .select('kw, stunden, mitarbeiter')
        .eq('typ', aktTyp)
        .like('kw', `${year}-%`);
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.datum_von || !form.mitarbeiter) throw new Error('Datum und Mitarbeiter erforderlich');
      const { error } = await supabase.from('begehungen').insert({
        typ: aktTyp,
        kw: aktKW,
        datum_von: form.datum_von,
        datum_bis: form.datum_bis || form.datum_von,
        mitarbeiter: form.mitarbeiter,
        stunden: form.stunden ? parseFloat(form.stunden.replace(',', '.')) : null,
        bemerkung: form.bemerkung || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['begehungen'] });
      qc.invalidateQueries({ queryKey: ['begehungen-stats'] });
      toast.success('Eintrag gespeichert');
      setShowForm(false);
      setForm({ datum_von: '', datum_bis: '', mitarbeiter: '', stunden: '', bemerkung: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('begehungen').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['begehungen'] }); toast.success('Gelöscht'); },
  });

  const gesamtStunden = (jahresStats as any[]).reduce((s: number, r: any) => s + (r.stunden ?? 0), 0);
  const anzahlBegehungen = (jahresStats as any[]).length;

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .eintrag-row:hover { background: #f8fafc !important; }
        .eintrag-row:hover .del-btn { opacity: 1 !important; }
        .del-btn { opacity: 0; transition: opacity .15s; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Begehungen
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '3px 0 0' }}>
            Sicherheitsbeleuchtung & Osmose-Anlage · KW-basierte Erfassung
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setAktTyp(tab.key); setShowForm(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all .15s',
              background: aktTyp === tab.key ? tab.color : '#f1f5f9',
              color: aktTyp === tab.key ? '#fff' : '#64748b',
              boxShadow: aktTyp === tab.key ? `0 4px 14px ${tab.color}40` : 'none' }}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: `Begehungen ${aktKW.split('-')[0]}`, value: anzahlBegehungen, color: aktTab.color },
          { label: 'Stunden gesamt', value: `${gesamtStunden.toFixed(1)}h`, color: aktTab.color },
          { label: 'Diese KW', value: eintraege.length, color: aktTab.color },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, border: `1px solid ${s.color}20`, padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
            <p style={{ fontSize: 24, fontWeight: 900, color: s.color, margin: '0 0 2px', letterSpacing: '-.04em' }}>{s.value}</p>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* KW Navigation */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setAktKW(prevKW(aktKW))}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>{kwLabel(aktKW)}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
            {eintraege.length > 0 ? `${eintraege.length} Eintrag${eintraege.length > 1 ? 'e' : ''}` : 'Keine Einträge'}
          </p>
        </div>
        <button onClick={() => setAktKW(nextKW(aktKW))}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Eintrags-Liste + Formular */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: aktTab.colorLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <aktTab.icon size={15} style={{ color: aktTab.color }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{aktTab.label}</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: aktTab.color, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 12px ${aktTab.color}40`, transition: 'all .15s' }}>
            <Plus size={14} /> Neuer Eintrag
          </button>
        </div>

        {/* Formular */}
        {showForm && (
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', background: aktTab.colorLight, animation: 'fadeUp .2s ease both' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Von *</label>
                <input type="date" value={form.datum_von} onChange={e => setForm(f => ({ ...f, datum_von: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: '#fff', color: '#0f172a' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Bis</label>
                <input type="date" value={form.datum_bis} onChange={e => setForm(f => ({ ...f, datum_bis: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: '#fff', color: '#0f172a' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Stunden</label>
                <input type="text" placeholder="z.B. 2,5" value={form.stunden} onChange={e => setForm(f => ({ ...f, stunden: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: '#fff', color: '#0f172a' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Mitarbeiter *</label>
                <select value={form.mitarbeiter} onChange={e => setForm(f => ({ ...f, mitarbeiter: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: '#fff', color: '#0f172a', appearance: 'none' }}>
                  <option value="">Auswählen...</option>
                  {(mitarbeiter as any[]).map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>Bemerkung</label>
                <input type="text" placeholder="Freitext..." value={form.bemerkung} onChange={e => setForm(f => ({ ...f, bemerkung: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, background: '#fff', color: '#0f172a' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => addMutation.mutate()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: aktTab.color, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <CheckCircle size={14} /> Speichern
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '9px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Einträge */}
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Lädt...</div>
        ) : eintraege.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <aktTab.icon size={36} style={{ color: '#e2e8f0', marginBottom: 12 }} />
            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0, fontWeight: 600 }}>Keine Einträge für {kwLabel(aktKW)}</p>
            <p style={{ color: '#cbd5e1', fontSize: 13, margin: '4px 0 0' }}>Klicke auf "Neuer Eintrag" um die Begehung zu erfassen</p>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 120px 80px 1fr 40px', gap: 12, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              {['Zeitraum', 'KW', 'Mitarbeiter', 'Stunden', 'Bemerkung', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
              ))}
            </div>
            {eintraege.map((e, i) => (
              <div key={e.id} className="eintrag-row" style={{ display: 'grid', gridTemplateColumns: '120px 140px 120px 80px 1fr 40px', gap: 12, padding: '13px 20px', borderBottom: '1px solid #f8fafc', alignItems: 'center', background: 'transparent', transition: 'background .1s', animation: `fadeUp .3s ease ${i*.05}s both` }}>
                <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 500 }}>
                  {new Date(e.datum_von).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })}
                  {e.datum_bis && e.datum_bis !== e.datum_von && ` – ${new Date(e.datum_bis).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })}`}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', background: `${aktTab.color}15`, padding: '2px 8px', borderRadius: 6, display: 'inline-block', fontWeight: 600 }}>
                  {kwLabel(e.kw)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: `${aktTab.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={11} style={{ color: aktTab.color }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.mitarbeiter}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {e.stunden ? <>
                    <Clock size={11} style={{ color: '#94a3b8' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: aktTab.color }}>{e.stunden}h</span>
                  </> : <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>}
                </div>
                <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.bemerkung || <span style={{ color: '#e2e8f0' }}>—</span>}
                </span>
                <button className="del-btn" onClick={() => deleteMutation.mutate(e.id)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
