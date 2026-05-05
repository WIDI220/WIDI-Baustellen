import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Users, Shield, Activity, Plus, Edit2, Trash2, Eye, EyeOff,
  Check, X, Lock, Unlock, Download, Search,
  Clock, AlertCircle, RefreshCw, UserCheck, UserX, Sliders, AlertTriangle, CheckCheck
} from 'lucide-react';

const BEREICHE = [
  { key: 'dashboard',     label: 'Dashboard',        gruppe: 'Allgemein',   hat_bearbeiten: false },
  { key: 'baustellen',    label: 'Baustellen',        gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'zeiterfassung', label: 'Zeiterfassung',     gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'material',      label: 'Material',          gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'nachtraege',    label: 'Nachtraege',        gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'fotos',         label: 'Fotos',             gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'eskalationen',  label: 'Eskalationen',      gruppe: 'Baustellen',  hat_bearbeiten: true  },
  { key: 'tickets',       label: 'Tickets',           gruppe: 'Tickets',     hat_bearbeiten: true  },
  { key: 'excel_import',  label: 'Excel-Import',      gruppe: 'Tickets',     hat_bearbeiten: true  },
  { key: 'pdf_ruecklauf', label: 'PDF-Ruecklauf',     gruppe: 'Tickets',     hat_bearbeiten: true  },
  { key: 'wochenplanung', label: 'Wochenplanung',     gruppe: 'Planung',     hat_bearbeiten: true  },
  { key: 'auswertung',    label: 'MA-Auswertung',     gruppe: 'Auswertung',  hat_bearbeiten: false },
  { key: 'mitarbeiter',   label: 'Mitarbeiter',       gruppe: 'Auswertung',  hat_bearbeiten: false },
  { key: 'dguv',          label: 'DGUV',              gruppe: 'DGUV',        hat_bearbeiten: true  },
  { key: 'begehungen',    label: 'Begehungen',        gruppe: 'DGUV',        hat_bearbeiten: true  },
  { key: 'interne_std',   label: 'Interne Stunden',   gruppe: 'Sonstiges',   hat_bearbeiten: true  },
];

const GRUPPEN = [...new Set(BEREICHE.map(b => b.gruppe))];

const AKTIONS_FARBEN: Record<string, { bg: string; color: string; label: string }> = {
  login:            { bg: '#f0fdf4', color: '#15803d', label: 'Login'           },
  logout:           { bg: '#f8fafc', color: '#475569', label: 'Logout'          },
  import:           { bg: '#eff6ff', color: '#1d4ed8', label: 'Import'          },
  export:           { bg: '#f0fdf4', color: '#15803d', label: 'Export'          },
  user_angelegt:    { bg: '#f0fdf4', color: '#15803d', label: 'User angelegt'   },
  user_bearbeitet:  { bg: '#fffbeb', color: '#b45309', label: 'Bearbeitet'      },
  user_geloescht:   { bg: '#fef2f2', color: '#dc2626', label: 'Geloescht'       },
  user_gesperrt:    { bg: '#fef2f2', color: '#dc2626', label: 'Gesperrt'        },
  user_aktiviert:   { bg: '#f0fdf4', color: '#15803d', label: 'Aktiviert'       },
  pdf_geparst:      { bg: '#f5f3ff', color: '#7c3aed', label: 'PDF geparst'     },
  stunden_gebucht:  { bg: '#eff6ff', color: '#1d4ed8', label: 'Stunden gebucht' },
  gewerk_geaendert: { bg: '#fffbeb', color: '#b45309', label: 'Gewerk geaendert'},
};

type Tab = 'users' | 'permissions' | 'activity' | 'errors';
// Note: 'users' tab kept for Controlling users only (not Handwerker App users)

const getAktion = (aktion: string) =>
  AKTIONS_FARBEN[aktion] ?? { bg: '#f8fafc', color: '#64748b', label: aktion };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const initials = (name: string) =>
  name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];
const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

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
  card: {
    background: '#fff', border: '1px solid #f1f5f9',
    borderRadius: 16, overflow: 'hidden' as const,
  },
};

const btnStyle = (variant: 'primary' | 'ghost' | 'danger' | 'warning' | 'success') => {
  const map: Record<string, object> = {
    primary: { background: '#2563eb', color: '#fff',    border: 'none'                    },
    ghost:   { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0'       },
    danger:  { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca'       },
    warning: { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a'       },
    success: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0'       },
  };
  return { ...map[variant], padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
};

const iconBtnStyle = (variant: 'default' | 'danger' | 'warning' | 'success' | 'active' = 'default') => {
  const colors: Record<string, object> = {
    default: { border: '#e2e8f0', bg: '#f8fafc', color: '#64748b' },
    active:  { border: '#6366f1', bg: '#eff6ff', color: '#6366f1' },
    danger:  { border: '#fecaca', bg: '#fef2f2', color: '#ef4444' },
    warning: { border: '#fde68a', bg: '#fffbeb', color: '#d97706' },
    success: { border: '#bbf7d0', bg: '#f0fdf4', color: '#16a34a' },
  };
  const c = colors[variant] as any;
  return {
    width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.border}`,
    background: c.bg, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: c.color, flexShrink: 0,
  };
};

const Cb = ({ val, onClick, disabled = false }: { val: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={disabled ? undefined : onClick}
    style={{
      width: 20, height: 20, borderRadius: 5,
      border: `2px solid ${disabled ? '#e2e8f0' : val ? '#2563eb' : '#cbd5e1'}`,
      background: disabled ? '#f8fafc' : val ? '#2563eb' : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all .12s',
    }}
  >
    {val && !disabled && <Check size={11} style={{ color: '#fff' }} />}
    {disabled && <span style={{ fontSize: 8, color: '#cbd5e1' }}>-</span>}
  </button>
);

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [editUser, setEditUser]   = useState<any>(null);
  const [showForm, setShowForm]   = useState(false);
  const [showPw, setShowPw]       = useState(false);
  const [formData, setFormData]   = useState({ name: '', email: '', password: '', is_admin: false });
  const [permUser, setPermUser]   = useState<any>(null);
  const [filterUser,   setFilterUser]   = useState('');
  const [filterAktion, setFilterAktion] = useState('');
  const [filterDatum,  setFilterDatum]  = useState('');
  const [actSearch,    setActSearch]    = useState('');

  // Fehlerprotokoll
  const { data: errorLogs = [], refetch: refetchErrors } = useQuery({
    queryKey: ['admin-error-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(200);
      return data ?? [];
    },
    refetchInterval: 15000,
  });
  const ungeleseneErrors = (errorLogs as any[]).filter((e: any) => !e.gelesen).length;
  const markAllRead = useMutation({
    mutationFn: async () => { await supabase.from('error_logs').update({ gelesen: true }).eq('gelesen', false); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-error-logs'] }),
  });
  const [permSearch,   setPermSearch]   = useState('');

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_users').select('*').order('name');
      if (error) { console.error('app_users query error:', error); throw error; }
      return data ?? [];
    },
    retry: 3,
    retryDelay: 1000,
  });

  // Sicherheitsnetz: Admin-Liste manchmal leer nach Deploy/Session-Wechsel
  useEffect(() => {
    if (!usersLoading && users.length === 0) {
      const t = setTimeout(() => refetchUsers(), 1500);
      return () => clearTimeout(t);
    }
  }, [usersLoading, users.length]);

  const { data: allPermissions = [] } = useQuery({
    queryKey: ['admin-all-permissions'],
    queryFn: async () => {
      const { data } = await supabase.from('app_permissions').select('*');
      return data ?? [];
    },
  });

  const { data: singlePerms = [] } = useQuery({
    queryKey: ['admin-permissions', permUser?.id],
    enabled: !!permUser,
    queryFn: async () => {
      const { data } = await supabase.from('app_permissions').select('*').eq('user_id', permUser.id);
      return data ?? [];
    },
  });

  const { data: activityLog = [], isLoading: actLoading, refetch: refetchActivity } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_activity_log').select('*')
        .order('created_at', { ascending: false }).limit(500);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const stats = useMemo(() => ({
    gesamt:   (users as any[]).length,
    aktiv:    (users as any[]).filter((u: any) => u.is_active).length,
    gesperrt: (users as any[]).filter((u: any) => !u.is_active).length,
    admins:   (users as any[]).filter((u: any) => u.is_admin).length,
  }), [users]);

  const filteredLog = useMemo(() => {
    return (activityLog as any[]).filter((log: any) => {
      if (filterUser   && log.user_email !== filterUser)               return false;
      if (filterAktion && log.aktion     !== filterAktion)             return false;
      if (filterDatum  && !log.created_at?.startsWith(filterDatum))   return false;
      if (actSearch) {
        const q = actSearch.toLowerCase();
        if (!log.user_name?.toLowerCase().includes(q) &&
            !log.user_email?.toLowerCase().includes(q) &&
            !log.details?.toLowerCase().includes(q) &&
            !log.aktion?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [activityLog, filterUser, filterAktion, filterDatum, actSearch]);

  const logEmails  = useMemo(() => [...new Set((activityLog as any[]).map((l: any) => l.user_email).filter(Boolean))], [activityLog]);
  const logAktionen = useMemo(() => [...new Set((activityLog as any[]).map((l: any) => l.aktion).filter(Boolean))], [activityLog]);

  const resetForm = () => {
    setFormData({ name: '', email: '', password: '', is_admin: false });
    setEditUser(null); setShowForm(false); setShowPw(false);
  };

  const logActivity = async (aktion: string, details: string) => {
    await supabase.from('app_activity_log').insert({ user_email: 'admin', user_name: 'Admin', aktion, details });
  };

  const saveUser = async () => {
    if (!formData.name || !formData.email) { toast.error('Name und E-Mail erforderlich'); return; }
    if (!editUser && !formData.password)   { toast.error('Passwort erforderlich'); return; }
    if (editUser) {
      const upd: any = { name: formData.name, email: formData.email, is_admin: formData.is_admin, updated_at: new Date().toISOString() };
      if (formData.password) upd.password_hash = formData.password;
      const { error } = await supabase.from('app_users').update(upd).eq('id', editUser.id);
      if (error) { toast.error('Fehler beim Speichern'); return; }
      await logActivity('user_bearbeitet', `${formData.name} (${formData.email})`);
      toast.success('User aktualisiert');
    } else {
      const { data: neu, error } = await supabase.from('app_users')
        .insert({ name: formData.name, email: formData.email, password_hash: formData.password, is_admin: formData.is_admin, is_active: true })
        .select().single();
      if (error || !neu) { toast.error('Fehler beim Anlegen'); return; }
      const defPerms = BEREICHE.map(b => ({ user_id: neu.id, bereich: b.key, kann_sehen: true, kann_bearbeiten: false }));
      await supabase.from('app_permissions').insert(defPerms);
      await logActivity('user_angelegt', `${formData.name} (${formData.email})`);
      toast.success('User angelegt');
    }
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-all-permissions'] });
    refetchActivity();
    resetForm();
  };

  const toggleActive = async (user: any) => {
    await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id);
    await logActivity(user.is_active ? 'user_gesperrt' : 'user_aktiviert', user.name);
    qc.invalidateQueries({ queryKey: ['admin-users'] }); refetchActivity();
    toast.success(user.is_active ? `${user.name} gesperrt` : `${user.name} aktiviert`);
  };

  const deleteUser = async (user: any) => {
    if (!confirm(`${user.name} wirklich loeschen?`)) return;
    await supabase.from('app_permissions').delete().eq('user_id', user.id);
    await supabase.from('app_users').delete().eq('id', user.id);
    await logActivity('user_geloescht', user.name);
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-all-permissions'] });
    refetchActivity();
    if (permUser?.id === user.id) setPermUser(null);
    toast.success('User geloescht');
  };

  const getPerm = (bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    const p = (singlePerms as any[]).find((p: any) => p.bereich === bereichKey);
    return p ? p[typ] : (typ === 'kann_sehen');
  };

  const togglePerm = async (bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    if (!permUser) return;
    const current = getPerm(bereichKey, typ);
    const existing = (singlePerms as any[]).find((p: any) => p.bereich === bereichKey);
    if (existing) {
      await supabase.from('app_permissions').update({ [typ]: !current, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('app_permissions').insert({ user_id: permUser.id, bereich: bereichKey, kann_sehen: typ === 'kann_sehen' ? !current : true, kann_bearbeiten: typ === 'kann_bearbeiten' ? !current : false });
    }
    qc.invalidateQueries({ queryKey: ['admin-permissions', permUser.id] });
    qc.invalidateQueries({ queryKey: ['admin-all-permissions'] });
  };

  const setAllPerms = async (sehen: boolean, bearbeiten: boolean) => {
    if (!permUser) return;
    for (const b of BEREICHE) {
      const existing = (singlePerms as any[]).find((p: any) => p.bereich === b.key);
      const wert = { kann_sehen: sehen, kann_bearbeiten: b.hat_bearbeiten ? bearbeiten : false, updated_at: new Date().toISOString() };
      if (existing) {
        await supabase.from('app_permissions').update(wert).eq('id', existing.id);
      } else {
        await supabase.from('app_permissions').insert({ user_id: permUser.id, bereich: b.key, ...wert });
      }
    }
    qc.invalidateQueries({ queryKey: ['admin-permissions', permUser.id] });
    qc.invalidateQueries({ queryKey: ['admin-all-permissions'] });
    toast.success('Berechtigungen aktualisiert');
  };

  const getPermForUser = (userId: string, bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    const p = (allPermissions as any[]).find((p: any) => p.user_id === userId && p.bereich === bereichKey);
    return p ? p[typ] : (typ === 'kann_sehen');
  };

  const togglePermForUser = async (userId: string, bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    const current  = getPermForUser(userId, bereichKey, typ);
    const existing = (allPermissions as any[]).find((p: any) => p.user_id === userId && p.bereich === bereichKey);
    if (existing) {
      await supabase.from('app_permissions').update({ [typ]: !current, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('app_permissions').insert({ user_id: userId, bereich: bereichKey, kann_sehen: typ === 'kann_sehen' ? !current : true, kann_bearbeiten: typ === 'kann_bearbeiten' ? !current : false });
    }
    qc.invalidateQueries({ queryKey: ['admin-all-permissions'] });
    qc.invalidateQueries({ queryKey: ['admin-permissions'] });
  };

  const exportCsv = () => {
    const rows = [
      ['Zeitpunkt', 'Benutzer', 'E-Mail', 'Aktion', 'Details'],
      ...(filteredLog as any[]).map((l: any) => [fmt(l.created_at), l.user_name ?? '', l.user_email ?? '', l.aktion ?? '', l.details ?? '']),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aktivitaeten_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredPermUsers = useMemo(() =>
    (users as any[]).filter((u: any) =>
      !permSearch || u.name.toLowerCase().includes(permSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(permSearch.toLowerCase())
    ), [users, permSearch]);

  // ════════ RENDER ════════
  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px', fontFamily: "'Inter', system-ui, sans-serif", color: '#0f172a' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={22} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Admin <span style={{ color: '#6366f1' }}>Einstellungen</span>
          </h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Benutzerverwaltung · Berechtigungen · Aktivitaetsprotokoll</p>
        </div>
      </div>

      {/* Statistik */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Benutzer gesamt', value: stats.gesamt,   icon: Users,     color: '#2563eb', bg: '#eff6ff' },
          { label: 'Aktiv',           value: stats.aktiv,    icon: UserCheck, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Gesperrt',        value: stats.gesperrt, icon: UserX,     color: '#dc2626', bg: '#fef2f2' },
          { label: 'Administratoren', value: stats.admins,   icon: Shield,    color: '#7c3aed', bg: '#f5f3ff' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: '#f8fafc', padding: 4, borderRadius: 12, width: 'fit-content', border: '1px solid #f1f5f9' }}>
        {([['users', Users, 'Controlling-Benutzer'], ['permissions', Sliders, 'Berechtigungen'], ['activity', Activity, 'Aktivitaets-Log'], ['errors', AlertTriangle, 'Fehlerprotokoll']] as [Tab, any, string][]).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === key ? '#fff' : 'transparent', color: tab === key ? (key === 'errors' ? '#dc2626' : '#0f172a') : '#94a3b8', boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all .15s', position: 'relative' }}>
            <Icon size={14} style={{ color: key === 'errors' ? (tab === key ? '#dc2626' : '#f87171') : undefined }} />{label}
            {key === 'errors' && ungeleseneErrors > 0 && (
              <span style={{ marginLeft: 4, minWidth: 18, height: 18, background: '#ef4444', borderRadius: 99, fontSize: 10, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {ungeleseneErrors > 9 ? '9+' : ungeleseneErrors}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: USERS ── */}
      {tab === 'users' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                Alle Benutzer
                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>{(users as any[]).length}</span>
              </h2>
              <button onClick={() => { resetForm(); setShowForm(true); }} style={btnStyle('primary') as any}>
                <Plus size={14} /> Neuer Benutzer
              </button>
            </div>

            {showForm && (
              <div style={{ ...S.card, padding: 20, marginBottom: 16, border: '1.5px solid #e0e7ff' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>
                  {editUser ? `Bearbeiten: ${editUser.name}` : 'Neuen Benutzer anlegen'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={S.label}>Name *</label>
                    <input style={S.input} value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Max Mustermann" />
                  </div>
                  <div>
                    <label style={S.label}>E-Mail *</label>
                    <input style={S.input} value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="m.mustermann@widi-hellersen.de" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={S.label}>{editUser ? 'Neues Passwort (leer = unveraendert)' : 'Passwort *'}</label>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...S.input, paddingRight: 36 }} type={showPw ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? 'Leer lassen = unveraendert' : 'Passwort eingeben'} />
                      <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
                    <Cb val={formData.is_admin} onClick={() => setFormData(f => ({ ...f, is_admin: !f.is_admin }))} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Administrator</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Zugriff auf Admin-Bereich</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveUser} style={btnStyle('primary') as any}><Check size={13} />{editUser ? 'Aenderungen speichern' : 'Benutzer anlegen'}</button>
                  <button onClick={resetForm} style={btnStyle('ghost') as any}>Abbrechen</button>
                </div>
              </div>
            )}

            {usersLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Laden...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(users as any[]).map((user: any) => (
                  <div key={user.id} style={{ background: '#fff', border: `1.5px solid ${permUser?.id === user.id ? '#c7d2fe' : user.is_active ? '#f1f5f9' : '#fecaca'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: permUser?.id === user.id ? '0 0 0 3px rgba(99,102,241,.08)' : 'none' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: user.is_admin ? '#ede9fe' : `${avatarColor(user.name)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: user.is_admin ? '#7c3aed' : avatarColor(user.name) }}>
                      {initials(user.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: user.is_active ? '#0f172a' : '#94a3b8' }}>{user.name}</span>
                        {user.is_admin && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed', fontWeight: 700 }}>ADMIN</span>}
                        {!user.is_active && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#fef2f2', color: '#ef4444', fontWeight: 700 }}>GESPERRT</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{user.email}</div>
                      {user.last_login && (
                        <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={9} /> Letzter Login: {fmt(user.last_login)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => setPermUser(permUser?.id === user.id ? null : user)} title="Berechtigungen" style={iconBtnStyle(permUser?.id === user.id ? 'active' : 'default') as any}><Shield size={13} /></button>
                      <button onClick={() => { setEditUser(user); setFormData({ name: user.name, email: user.email, password: '', is_admin: user.is_admin }); setShowForm(true); setPermUser(null); }} title="Bearbeiten" style={iconBtnStyle() as any}><Edit2 size={13} /></button>
                      <button onClick={() => toggleActive(user)} title={user.is_active ? 'Sperren' : 'Entsperren'} style={iconBtnStyle(user.is_active ? 'warning' : 'success') as any}>{user.is_active ? <Lock size={13} /> : <Unlock size={13} />}</button>
                      {!user.is_admin && <button onClick={() => deleteUser(user)} title="Loeschen" style={iconBtnStyle('danger') as any}><Trash2 size={13} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Berechtigungs-Panel */}
          {permUser && (
            <div style={{ width: 360, flexShrink: 0 }}>
              <div style={{ ...S.card, padding: 18, border: '1.5px solid #e0e7ff', position: 'sticky', top: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${avatarColor(permUser.name)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: avatarColor(permUser.name) }}>{initials(permUser.name)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{permUser.name}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{permUser.email}</div>
                    </div>
                  </div>
                  <button onClick={() => setPermUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={15} /></button>
                </div>

                {permUser.is_admin ? (
                  <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={14} /> Administrator hat automatisch alle Rechte
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                      <button onClick={() => setAllPerms(true, true)}   style={{ ...btnStyle('success'), padding: '5px 10px', fontSize: 11 } as any}>Alles erlauben</button>
                      <button onClick={() => setAllPerms(true, false)}  style={{ ...btnStyle('warning'), padding: '5px 10px', fontSize: 11 } as any}>Nur lesen</button>
                      <button onClick={() => setAllPerms(false, false)} style={{ ...btnStyle('ghost'),   padding: '5px 10px', fontSize: 11 } as any}>Alles sperren</button>
                    </div>

                    {GRUPPEN.map(gruppe => {
                      const bereicheInGruppe = BEREICHE.filter(b => b.gruppe === gruppe);
                      return (
                        <div key={gruppe} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, paddingLeft: 2 }}>{gruppe}</div>
                          <div style={{ background: '#f8fafc', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px', padding: '4px 10px', borderBottom: '1px solid #f1f5f9' }}>
                              <span></span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'center', textTransform: 'uppercase' }}>Sehen</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'center', textTransform: 'uppercase' }}>Bearb.</span>
                            </div>
                            {bereicheInGruppe.map((b, i) => (
                              <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px', padding: '8px 10px', alignItems: 'center', borderBottom: i < bereicheInGruppe.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>{b.label}</span>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <Cb val={getPerm(b.key, 'kann_sehen')} onClick={() => togglePerm(b.key, 'kann_sehen')} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  {b.hat_bearbeiten
                                    ? <Cb val={getPerm(b.key, 'kann_bearbeiten')} onClick={() => togglePerm(b.key, 'kann_bearbeiten')} />
                                    : <span style={{ fontSize: 10, color: '#e2e8f0', display: 'block', textAlign: 'center' }}>-</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 4, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                      Aenderungen wirken sofort. Benutzer muss sich neu einloggen damit alle Aenderungen aktiv werden.
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: BERECHTIGUNGEN ── */}
      {tab === 'permissions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>Berechtigungs-Uebersicht</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Alle Benutzer und Bereiche — direkt bearbeitbar</p>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ ...S.input, width: 200, paddingLeft: 30, fontSize: 12 }} placeholder="User suchen..." value={permSearch} onChange={e => setPermSearch(e.target.value)} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {GRUPPEN.map(gruppe => {
              const bereicheInGruppe = BEREICHE.filter(b => b.gruppe === gruppe);
              const regularUsers = (filteredPermUsers as any[]).filter((u: any) => !u.is_admin);
              const adminUsers   = (filteredPermUsers as any[]).filter((u: any) => u.is_admin);
              return (
                <div key={gruppe} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, paddingLeft: 4 }}>{gruppe}</div>
                  <div style={S.card}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #f1f5f9', minWidth: 140 }}>Bereich</th>
                          {regularUsers.map((user: any) => (
                            <th key={user.id} colSpan={2} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #f1f5f9', minWidth: 90 }}>
                              <div>{user.name.split(' ')[0]}</div>
                              <div style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 400 }}>{user.email.split('@')[0]}</div>
                            </th>
                          ))}
                          {adminUsers.map((user: any) => (
                            <th key={user.id} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#7c3aed', borderBottom: '1px solid #f1f5f9', minWidth: 90 }}>
                              <div>{user.name.split(' ')[0]}</div>
                              <div style={{ fontSize: 9, color: '#c4b5fd', fontWeight: 400 }}>ADMIN</div>
                            </th>
                          ))}
                        </tr>
                        {regularUsers.length > 0 && (
                          <tr style={{ background: '#fafafa' }}>
                            <td style={{ padding: '4px 16px', borderBottom: '1px solid #f8fafc' }}></td>
                            {regularUsers.map((user: any) => (
                              <>
                                <td key={`${user.id}-sh`} style={{ padding: '4px 4px', textAlign: 'center', fontSize: 9, color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>Sehen</td>
                                <td key={`${user.id}-bh`} style={{ padding: '4px 4px', textAlign: 'center', fontSize: 9, color: '#94a3b8', borderBottom: '1px solid #f8fafc' }}>Bearb.</td>
                              </>
                            ))}
                            {adminUsers.map((user: any) => (
                              <td key={user.id} style={{ padding: '4px 4px', textAlign: 'center', fontSize: 9, color: '#c4b5fd', borderBottom: '1px solid #f8fafc' }}>Alle</td>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {bereicheInGruppe.map((b, idx) => (
                          <tr key={b.key} style={{ borderBottom: idx < bereicheInGruppe.length - 1 ? '1px solid #f8fafc' : 'none', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#334155', fontSize: 12 }}>{b.label}</td>
                            {regularUsers.map((user: any) => (
                              <>
                                <td key={`${user.id}-s`} style={{ padding: '10px 4px', textAlign: 'center' }}>
                                  <Cb val={getPermForUser(user.id, b.key, 'kann_sehen')} onClick={() => togglePermForUser(user.id, b.key, 'kann_sehen')} />
                                </td>
                                <td key={`${user.id}-b`} style={{ padding: '10px 4px', textAlign: 'center' }}>
                                  {b.hat_bearbeiten
                                    ? <Cb val={getPermForUser(user.id, b.key, 'kann_bearbeiten')} onClick={() => togglePermForUser(user.id, b.key, 'kann_bearbeiten')} />
                                    : <span style={{ color: '#e2e8f0' }}>-</span>}
                                </td>
                              </>
                            ))}
                            {adminUsers.map((user: any) => (
                              <td key={user.id} style={{ padding: '10px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: 12, color: '#c4b5fd' }}>checkmark</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: AKTIVITAETS-LOG ── */}
      {tab === 'activity' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ ...S.input, paddingLeft: 30, fontSize: 12 }} placeholder="Suchen..." value={actSearch} onChange={e => setActSearch(e.target.value)} />
            </div>
            <select style={{ ...S.input, width: 180 }} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="">Alle Benutzer</option>
              {(logEmails as string[]).map((e: string) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select style={{ ...S.input, width: 160 }} value={filterAktion} onChange={e => setFilterAktion(e.target.value)}>
              <option value="">Alle Aktionen</option>
              {(logAktionen as string[]).map((a: string) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" style={{ ...S.input, width: 155 }} value={filterDatum} onChange={e => setFilterDatum(e.target.value)} />
            {(filterUser || filterAktion || filterDatum || actSearch) && (
              <button onClick={() => { setFilterUser(''); setFilterAktion(''); setFilterDatum(''); setActSearch(''); }} style={btnStyle('ghost') as any}>
                <X size={13} /> Zuruecksetzen
              </button>
            )}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button onClick={() => refetchActivity()} style={btnStyle('ghost') as any}><RefreshCw size={13} /> Aktualisieren</button>
              <button onClick={exportCsv} style={btnStyle('ghost') as any}><Download size={13} /> CSV Export</button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            {filteredLog.length} von {(activityLog as any[]).length} Eintraegen
          </div>

          <div style={S.card}>
            {actLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Laden...</div>
            ) : (filteredLog as any[]).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <AlertCircle size={24} style={{ color: '#e2e8f0', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Keine Eintraege gefunden</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Zeitpunkt', 'Benutzer', 'Aktion', 'Details'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(filteredLog as any[]).map((log: any, i: number) => {
                    const a = getAktion(log.aktion);
                    return (
                      <tr key={log.id ?? i} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          <div>{fmtDate(log.created_at)}</div>
                          <div style={{ fontSize: 10, color: '#cbd5e1' }}>{new Date(log.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{log.user_name ?? '-'}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{log.user_email ?? ''}</div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: a.bg, color: a.color }}>{a.label}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#64748b' }}>{log.details ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {tab === 'errors' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <AlertTriangle size={18} style={{ color:'#ef4444' }} />
              <div>
                <h2 style={{ fontSize:14, fontWeight:700, margin:0 }}>
                  Fehlerprotokoll
                  {ungeleseneErrors > 0 && <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:99, background:'#fef2f2', color:'#dc2626', fontWeight:700 }}>{ungeleseneErrors} neu</span>}
                </h2>
                <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>Automatisch erfasste Fehler aller Benutzer · aktualisiert alle 15s</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {ungeleseneErrors > 0 && (
                <button onClick={() => markAllRead.mutate()} style={btnStyle('ghost') as any}>
                  <CheckCheck size={13} /> Alle gelesen
                </button>
              )}
              <button onClick={() => refetchErrors()} style={btnStyle('ghost') as any}>
                <RefreshCw size={13} /> Aktualisieren
              </button>
            </div>
          </div>

          {(errorLogs as any[]).length === 0 ? (
            <div style={{ ...S.card, textAlign:'center', padding:'64px 0' }}>
              <div style={{ width:48, height:48, background:'#f0fdf4', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <CheckCheck size={22} style={{ color:'#10b981' }} />
              </div>
              <p style={{ color:'#64748b', fontSize:15, fontWeight:600, margin:'0 0 4px' }}>Keine Fehler vorhanden</p>
              <p style={{ color:'#94a3b8', fontSize:13 }}>Alle Systeme laufen fehlerfrei</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(errorLogs as any[]).map((err: any) => (
                <div key={err.id} style={{ ...S.card, padding:'14px 18px', borderLeft:`4px solid ${err.gelesen ? '#e2e8f0' : '#ef4444'}`, background: err.gelesen ? '#f8fafc' : '#fff' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                        {!err.gelesen && <span style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', flexShrink:0, display:'inline-block' }} />}
                        <p style={{ fontSize:13, fontWeight:700, color:'#dc2626', margin:0, wordBreak:'break-word' }}>{err.message}</p>
                      </div>
                      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: err.stack ? 6 : 0 }}>
                        <span style={{ fontSize:11, color:'#64748b' }}>👤 {err.user_email ?? '–'}</span>
                        <span style={{ fontSize:11, color:'#64748b' }}>📍 {err.route ?? '–'}</span>
                        {err.component && <span style={{ fontSize:11, color:'#64748b' }}>🔧 {err.component}</span>}
                      </div>
                      {err.stack && (
                        <details style={{ marginTop:4 }}>
                          <summary style={{ fontSize:11, color:'#94a3b8', cursor:'pointer', userSelect:'none' }}>Stack-Trace anzeigen</summary>
                          <pre style={{ fontSize:10, color:'#64748b', background:'#f8fafc', borderRadius:8, padding:'8px 10px', marginTop:4, overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{err.stack}</pre>
                        </details>
                      )}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:12, color:'#64748b', margin:'0 0 2px', fontWeight:600 }}>
                        {new Date(err.created_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}
                      </p>
                      <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>
                        {new Date(err.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
