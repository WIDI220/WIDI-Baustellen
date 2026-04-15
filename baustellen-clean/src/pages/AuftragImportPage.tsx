import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, Plus, Trash2, Save } from 'lucide-react';

type Typ = 'intern' | 'extern';
type Gewerk = 'Hochbau' | 'Elektro';

interface FormData {
  a_nummer: string;
  name: string;
  kostenstelle: string;
  budget: string;
  gewerk: Gewerk;
  typ: Typ;
  enddatum: string;
}

const leer: FormData = { a_nummer: '', name: '', kostenstelle: '', budget: '', gewerk: 'Elektro', typ: 'intern', enddatum: '' };

export default function AuftragImportPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormData>(leer);
  const [speichernd, setSpeichernd] = useState(false);
  const [gespeichert, setGespeichert] = useState<string[]>([]);

  const set = (field: keyof FormData, value: string) => setForm(f => ({ ...f, [field]: value }));

  const normalizeANummer = (raw: string): string => {
    const s = raw.trim().toUpperCase().replace(/\s+/g, '');
    const m = s.match(/^A(\d{2})-?(\d{4,6})$/);
    if (m) return `A${m[1]}-${m[2].padStart(5, '0')}`;
    return s;
  };

  const speichern = async () => {
    const a = normalizeANummer(form.a_nummer);
    if (!a.match(/^A\d{2}-\d{5}$/)) { toast.error('Ungültige A-Nummer (Format: A26-07430)'); return; }
    if (!form.name.trim()) { toast.error('Name/Betreff ist Pflicht'); return; }

    setSpeichernd(true);
    try {
      const { data: existing } = await supabase.from('baustellen').select('id').eq('a_nummer', a).maybeSingle();
      if (existing) { toast.error(`${a} existiert bereits`); setSpeichernd(false); return; }

      const payload: any = {
        a_nummer: a,
        name: `[${a}] ${form.name.trim()}`,
        status: 'nicht_gestartet',
        typ: form.typ,
        gewerk: form.gewerk,
        kostenstelle: form.kostenstelle.trim() || null,
        budget: form.budget ? parseFloat(form.budget.replace(',', '.')) : null,
        enddatum: form.enddatum || null,
      };

      const { error } = await supabase.from('baustellen').insert(payload);
      if (error) { toast.error(error.message); return; }

      setGespeichert(prev => [a, ...prev]);
      toast.success(`${a} — ${form.name.trim()} angelegt`);
      setForm(leer);
      qc.invalidateQueries({ queryKey: ['baustellen'] });
    } finally { setSpeichernd(false); }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' as const,
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '.06em', display: 'block', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
        Auftrag importieren
      </h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 28px' }}>
        Neue Baustelle oder externes Ticket aus Auftragsschein anlegen
      </p>

      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px', marginBottom: 20 }}>

        {/* Typ-Auswahl */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['intern', 'extern'] as Typ[]).map(t => (
            <button key={t} onClick={() => set('typ', t)}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: `2px solid ${form.typ === t ? (t === 'intern' ? '#2563eb' : '#e11d48') : '#e2e8f0'}`, background: form.typ === t ? (t === 'intern' ? '#eff6ff' : '#fff1f2') : '#f8fafc', color: form.typ === t ? (t === 'intern' ? '#1d4ed8' : '#be123c') : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}>
              {t === 'intern' ? '🔵 Baustelle (intern)' : '🔴 Externes Ticket'}
            </button>
          ))}
        </div>

        {/* Felder */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>A-Nummer *</label>
            <input style={inputStyle} placeholder="A26-07430" value={form.a_nummer} onChange={e => set('a_nummer', e.target.value)}
              onBlur={e => set('a_nummer', normalizeANummer(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Gewerk *</label>
            <select style={inputStyle} value={form.gewerk} onChange={e => set('gewerk', e.target.value as Gewerk)}>
              <option value="Elektro">Elektro</option>
              <option value="Hochbau">Hochbau</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Betreff / Name *</label>
          <input style={inputStyle} placeholder="De- und Montage inkl. Installation v. Spiegelleuchten" value={form.name} onChange={e => set('name', e.target.value)} />
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Direkt aus dem Auftragsschein "Betreff" übernehmen</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Kostenstelle</label>
            <input style={inputStyle} placeholder="930240" value={form.kostenstelle} onChange={e => set('kostenstelle', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Budget (€)</label>
            <input style={inputStyle} placeholder="9394.65" type="number" step="0.01" value={form.budget} onChange={e => set('budget', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Enddatum</label>
            <input style={inputStyle} type="date" value={form.enddatum} onChange={e => set('enddatum', e.target.value)} />
          </div>
        </div>

        <button onClick={speichern} disabled={speichernd}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: speichernd ? '#94a3b8' : 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: speichernd ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.25)' }}>
          <Save size={15} /> {speichernd ? 'Speichert...' : 'Auftrag anlegen'}
        </button>
      </div>

      {gespeichert.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <CheckCircle size={16} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>{gespeichert.length} Auftrag{gespeichert.length !== 1 ? 'e'  : ''} angelegt</span>
          </div>
          {gespeichert.map(a => (
            <div key={a} style={{ fontSize: 12, color: '#15803d', padding: '2px 0' }}>✓ {a}</div>
          ))}
        </div>
      )}
    </div>
  );
}
