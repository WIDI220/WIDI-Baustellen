import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, Save, Upload, FileText, Edit3 } from 'lucide-react';
import { parseBaustellenPdf, BaustellenParseResult } from '@/lib/pdf-baustellen-parser';

type Typ = 'intern' | 'extern';
type Gewerk = 'Hochbau' | 'Elektro';
interface FormData {
  a_nummer: string; name: string; kostenstelle: string;
  budget: string; gewerk: Gewerk; typ: Typ; enddatum: string;
}
const leer: FormData = { a_nummer: '', name: '', kostenstelle: '', budget: '', gewerk: 'Elektro', typ: 'intern', enddatum: '' };

export default function AuftragImportPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormData>(leer);
  const [speichernd, setSpeichernd] = useState(false);
  const [lesend, setLesend] = useState(false);
  const [gespeichert, setGespeichert] = useState<string[]>([]);
  const [parseHinweise, setParseHinweise] = useState<string[]>([]);

  const set = (field: keyof FormData, value: string) => setForm(f => ({ ...f, [field]: value }));

  const normalizeANummer = (raw: string): string => {
    const s = raw.trim().toUpperCase().replace(/\s+/g, '');
    const m = s.match(/^A(\d{2})-?(\d{4,6})$/);
    if (m) return `A${m[1]}-${m[2].padStart(5, '0')}`;
    return s;
  };

  // PDF einlesen und Formular vorausfüllen
  const handlePDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLesend(true);
    setParseHinweise([]);
    try {
      const result: BaustellenParseResult = await parseBaustellenPdf(file);
      setForm({
        a_nummer:     result.a_nummer ?? '',
        name:         result.name ?? '',
        kostenstelle: result.kostenstelle ?? '',
        budget:       result.budget ? String(result.budget) : '',
        gewerk:       result.gewerk,
        typ:          'intern',
        enddatum:     '',
      });
      if (result.fehler.length > 0) setParseHinweise(result.fehler);
      toast.success('PDF ausgelesen — bitte Felder prüfen');
    } catch (err: any) {
      toast.error(`PDF-Fehler: ${err.message}`);
    } finally {
      setLesend(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const speichern = async () => {
    const a = normalizeANummer(form.a_nummer);
    if (!a.match(/^A\d{2}-\d{5}$/)) { toast.error('Ungültige A-Nummer (Format: A26-07430)'); return; }
    if (!form.name.trim()) { toast.error('Name/Betreff ist Pflicht'); return; }
    setSpeichernd(true);
    try {
      const { data: existing } = await supabase.from('baustellen').select('id').eq('a_nummer', a).maybeSingle();
      if (existing) { toast.error(`${a} existiert bereits`); setSpeichernd(false); return; }
      const { error } = await supabase.from('baustellen').insert({
        a_nummer: a,
        name: `[${a}] ${form.name.trim()}`,
        status: 'nicht_gestartet',
        typ: form.typ,
        kostenstelle: form.kostenstelle.trim() || null,
        budget: form.budget ? parseFloat(form.budget.replace(',', '.')) : null,
        enddatum: form.enddatum || null,
      });
      if (error) { toast.error(error.message); return; }
      setGespeichert(prev => [a, ...prev]);
      toast.success(`${a} angelegt`);
      setForm(leer);
      setParseHinweise([]);
      qc.invalidateQueries({ queryKey: ['baustellen'] });
    } finally { setSpeichernd(false); }
  };

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '.06em', display: 'block', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
        Auftrag importieren
      </h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>
        PDF hochladen — Felder werden automatisch ausgefüllt und können angepasst werden
      </p>

      {/* PDF Upload */}
      <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, textAlign: 'center' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDF} />
        <FileText size={24} style={{ color: '#2563eb', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>Auftragsschein-PDF hochladen</p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>Felder werden automatisch erkannt und vorausgefüllt</p>
        <button onClick={() => fileInputRef.current?.click()} disabled={lesend}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px', background: lesend ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: lesend ? 'wait' : 'pointer' }}>
          <Upload size={14} /> {lesend ? 'Lese PDF...' : 'PDF auswählen'}
        </button>
      </div>

      {/* Parse-Hinweise */}
      {parseHinweise.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309', marginBottom: 4 }}>⚠ Bitte manuell prüfen:</div>
          {parseHinweise.map((h, i) => <div key={i} style={{ fontSize: 12, color: '#92400e' }}>• {h}</div>)}
        </div>
      )}

      {/* Formular */}
      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Edit3 size={16} style={{ color: '#2563eb' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Felder prüfen und bestätigen</span>
        </div>

        {/* Typ */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['intern', 'extern'] as Typ[]).map(t => (
            <button key={t} onClick={() => set('typ', t)}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: `2px solid ${form.typ === t ? (t === 'intern' ? '#2563eb' : '#e11d48') : '#e2e8f0'}`, background: form.typ === t ? (t === 'intern' ? '#eff6ff' : '#fff1f2') : '#f8fafc', color: form.typ === t ? (t === 'intern' ? '#1d4ed8' : '#be123c') : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}>
              {t === 'intern' ? '🔵 Baustelle (intern)' : '🔴 Externes Ticket'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>A-Nummer *</label>
            <input style={inputStyle} placeholder="A26-07430" value={form.a_nummer}
              onChange={e => set('a_nummer', e.target.value)}
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
          <input style={inputStyle} placeholder="De- und Montage inkl. Installation v. Spiegelleuchten"
            value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
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
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '14px 18px', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle size={15} style={{ color: '#10b981' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>{gespeichert.length} Auftrag{gespeichert.length !== 1 ? 'e' : ''} angelegt</span>
          </div>
          {gespeichert.map(a => <div key={a} style={{ fontSize: 12, color: '#15803d' }}>✓ {a}</div>)}
        </div>
      )}
    </div>
  );
}
