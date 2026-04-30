// ─────────────────────────────────────────────────────────────
// HandwerkerVerwaltungPage.tsx
// Verwaltung der Handwerker-App Logins – getrennt von app_users
// ─────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Edit2, Trash2, Eye, EyeOff,
  Check, X, Lock, Unlock, HardHat, Search, RefreshCw
} from 'lucide-react';

const S = {
  input: {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontSize: 13, color: '#0f172a', outline: 'none',
    background: '#fff', boxSizing: 'border-box' as const,
  },
  label: {
    fontSize: 11, fontWeight: 700 as const, color: '#64748b',
    textTransform: 'uppercase' as const, letterSpacing: '.06em',
    display: 'block', marginBottom: 5,
  },
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#e67e22', '#27ae60'];
const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const btnStyle = (variant: 'primary' | 'ghost' | 'danger' | 'success') => {
  const map: Record<string, object> = {
    primary: { background: '#d4612a', color: '#fff', border: 'none' },
    ghost:   { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
    danger:  { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' },
    success: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  };
  return { ...map[variant], padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' };
};

export default function HandwerkerVerwaltungPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState<any>(null);
  const [showPw, setShowPw]       = useState(false);
  const [search, setSearch]       = useState('');
  const [formData, setFormData]   = useState({ name: '', benutzername: '', passwort: '', employee_id: '' });
  const [saving, setSaving]       = useState(false);

  // Handwerker-Logins laden
  const { data: logins = [], isLoading, refetch } = useQuery({
    queryKey: ['handwerker-logins'],
    queryFn: async () => {
      const { data } = await supabase.from('handwerker_logins').select('*').order('name');
      return data ?? [];
    },
  });

  // Employees für Dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-aktiv'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const gefiltert = useMemo(() =>
    (logins as any[]).filter((l: any) =>
      !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.benutzername.toLowerCase().includes(search.toLowerCase())
    ), [logins, search]);

  const stats = {
    gesamt: (logins as any[]).length,
    aktiv:  (logins as any[]).filter((l: any) => l.aktiv).length,
    inaktiv:(logins as any[]).filter((l: any) => !l.aktiv).length,
  };

  const resetForm = () => {
    setFormData({ name: '', benutzername: '', passwort: '', employee_id: '' });
    setEditUser(null); setShowForm(false); setShowPw(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim())        { toast.error('Name erforderlich'); return; }
    if (!formData.benutzername.trim()){ toast.error('Benutzername erforderlich'); return; }
    if (!editUser && !formData.passwort){ toast.error('Passwort erforderlich'); return; }
    setSaving(true);
    try {
      if (editUser) {
        const upd: any = {
          name: formData.name,
          benutzername: formData.benutzername,
          employee_id: formData.employee_id || null,
          updated_at: new Date().toISOString(),
        };
        if (formData.passwort) upd.passwort = formData.passwort;
        const { error } = await supabase.from('handwerker_logins').update(upd).eq('id', editUser.id);
        if (error) throw new Error(error.message);
        toast.success('Aktualisiert ✓');
      } else {
        const { error } = await supabase.from('handwerker_logins').insert({
          name: formData.name,
          benutzername: formData.benutzername,
          passwort: formData.passwort,
          employee_id: formData.employee_id || null,
          aktiv: true,
        });
        if (error) throw new Error(error.message);
        toast.success('Login angelegt ✓');
      }
      qc.invalidateQueries({ queryKey: ['handwerker-logins'] });
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAktiv = async (login: any) => {
    await supabase.from('handwerker_logins').update({ aktiv: !login.aktiv }).eq('id', login.id);
    qc.invalidateQueries({ queryKey: ['handwerker-logins'] });
    toast.success(login.aktiv ? `${login.name} deaktiviert` : `${login.name} aktiviert`);
  };

  const handleDelete = async (login: any) => {
    if (!confirm(`${login.name} wirklich löschen?`)) return;
    await supabase.from('handwerker_logins').delete().eq('id', login.id);
    qc.invalidateQueries({ queryKey: ['handwerker-logins'] });
    toast.success('Gelöscht');
  };

  const startEdit = (login: any) => {
    setEditUser(login);
    setFormData({ name: login.name, benutzername: login.benutzername, passwort: '', employee_id: login.employee_id || '' });
    setShowForm(true);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e2e8f0', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <ArrowLeft size={14} /> Zurück
        </button>
        <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#d4612a,#e67e22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HardHat size={16} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#0f172a', letterSpacing: '-0.02em' }}>Handwerker-App Logins</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Zugänge für die Zeiterfassungs-App verwalten</p>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => refetch()} style={{ ...btnStyle('ghost'), fontSize: 12 } as any}><RefreshCw size={13} /> Aktualisieren</button>
          <button onClick={() => { resetForm(); setShowForm(true); }} style={btnStyle('primary') as any}><Plus size={14} /> Neuer Login</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Logins gesamt', value: stats.gesamt, color: '#d4612a', bg: '#fff7f0' },
            { label: 'Aktiv',         value: stats.aktiv,  color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Deaktiviert',   value: stats.inaktiv,color: '#dc2626', bg: '#fef2f2' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <HardHat size={18} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Formular */}
        {showForm && (
          <div style={{ background: '#fff', border: '1.5px solid #fed7aa', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {editUser ? `Bearbeiten: ${editUser.name}` : 'Neuen Handwerker-Login anlegen'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Name (Anzeigename) *</label>
                <input style={S.input} value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Max Mustermann" />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Muss exakt mit dem Namen in Employees übereinstimmen</p>
              </div>
              <div>
                <label style={S.label}>Benutzername * (zum Einloggen)</label>
                <input style={S.input} value={formData.benutzername} onChange={e => setFormData(f => ({ ...f, benutzername: e.target.value }))} placeholder="z.B. max.mustermann oder MaxM" autoCapitalize="off" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={S.label}>{editUser ? 'Neues Passwort (leer = unverändert)' : 'Passwort *'}</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...S.input, paddingRight: 36 }} type={showPw ? 'text' : 'password'} value={formData.passwort} onChange={e => setFormData(f => ({ ...f, passwort: e.target.value }))} placeholder={editUser ? 'Leer = unverändert' : 'Passwort vergeben'} />
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={S.label}>Mitarbeiter verknüpfen (optional)</label>
                <select style={S.input} value={formData.employee_id} onChange={e => setFormData(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">-- Mitarbeiter wählen --</option>
                  {(employees as any[]).map((emp: any) => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.kuerzel})</option>
                  ))}
                </select>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Für korrekte Stunden-Zuordnung im Controlling</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...btnStyle('primary'), opacity: saving ? 0.6 : 1 } as any}>
                <Check size={13} />{saving ? 'Speichern...' : editUser ? 'Änderungen speichern' : 'Login anlegen'}
              </button>
              <button onClick={resetForm} style={btnStyle('ghost') as any}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* Suche */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ ...S.input, paddingLeft: 34, borderRadius: 12 }} placeholder="Suchen nach Name oder Benutzername..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Liste */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Laden...</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <HardHat size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
            <p style={{ margin: 0 }}>Noch keine Logins angelegt</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(gefiltert as any[]).map((login: any) => (
              <div key={login.id} style={{ background: '#fff', border: `1.5px solid ${login.aktiv ? '#f1f5f9' : '#fecaca'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: login.aktiv ? `${avatarColor(login.name)}18` : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: login.aktiv ? avatarColor(login.name) : '#dc2626', flexShrink: 0 }}>
                  {initials(login.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: login.aktiv ? '#0f172a' : '#94a3b8' }}>{login.name}</span>
                    {!login.aktiv && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#fef2f2', color: '#ef4444', fontWeight: 700 }}>DEAKTIVIERT</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    Benutzername: <span style={{ fontWeight: 600, color: '#475569', fontFamily: 'monospace' }}>{login.benutzername}</span>
                    {login.employee_id && <span style={{ marginLeft: 10, color: '#10b981' }}>✓ Mitarbeiter verknüpft</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => startEdit(login)} title="Bearbeiten"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => toggleAktiv(login)} title={login.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                    style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${login.aktiv ? '#fde68a' : '#bbf7d0'}`, background: login.aktiv ? '#fffbeb' : '#f0fdf4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: login.aktiv ? '#d97706' : '#16a34a' }}>
                    {login.aktiv ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button onClick={() => handleDelete(login)} title="Löschen"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
