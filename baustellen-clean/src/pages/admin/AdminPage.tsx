import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Shield, Activity, Plus, Edit2, Trash2, Eye, EyeOff, Check, X, Lock, Unlock } from 'lucide-react';

const BEREICHE = [
  { key: 'dashboard',     label: 'Dashboard',        hat_bearbeiten: false },
  { key: 'tickets',       label: 'Tickets',           hat_bearbeiten: true  },
  { key: 'excel_import',  label: 'Excel-Import',      hat_bearbeiten: true  },
  { key: 'pdf_ruecklauf', label: 'PDF-Rücklauf',      hat_bearbeiten: true  },
  { key: 'baustellen',    label: 'Baustellen',        hat_bearbeiten: true  },
  { key: 'wochenplanung', label: 'Wochenplanung',     hat_bearbeiten: true  },
  { key: 'mitarbeiter',   label: 'Mitarbeiter',       hat_bearbeiten: false },
  { key: 'analyse',       label: 'MA-Auswertung',     hat_bearbeiten: false },
  { key: 'begehungen',    label: 'Begehungen',        hat_bearbeiten: true  },
  { key: 'interne_std',   label: 'Interne Stunden',   hat_bearbeiten: true  },
];

type Tab = 'users' | 'activity';

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [editUser, setEditUser] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', is_admin: false });
  const [showPw, setShowPw] = useState(false);
  const [permUser, setPermUser] = useState<any>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase.from('app_users').select('*').order('name');
      return data ?? [];
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['admin-permissions', permUser?.id],
    enabled: !!permUser,
    queryFn: async () => {
      const { data } = await supabase.from('app_permissions').select('*').eq('user_id', permUser.id);
      return data ?? [];
    },
  });

  const { data: activityLog = [] } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async () => {
      const { data } = await supabase.from('app_activity_log').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const resetForm = () => { setFormData({ name: '', email: '', password: '', is_admin: false }); setEditUser(null); setShowForm(false); };

  const saveUser = async () => {
    if (!formData.name || !formData.email || (!editUser && !formData.password)) { toast.error('Alle Felder ausfüllen'); return; }
    if (editUser) {
      const update: any = { name: formData.name, email: formData.email, is_admin: formData.is_admin, updated_at: new Date().toISOString() };
      if (formData.password) update.password_hash = formData.password;
      await supabase.from('app_users').update(update).eq('id', editUser.id);
      await supabase.from('app_activity_log').insert({ user_email: 'admin', user_name: 'Admin', aktion: 'user_bearbeitet', details: `${formData.name} (${formData.email})` });
      toast.success('User aktualisiert');
    } else {
      const { data: neu } = await supabase.from('app_users').insert({ name: formData.name, email: formData.email, password_hash: formData.password, is_admin: formData.is_admin }).select().single();
      if (neu) {
        // Standard-Berechtigungen anlegen (alles sehen, nichts bearbeiten)
        const defPerms = BEREICHE.map(b => ({ user_id: neu.id, bereich: b.key, kann_sehen: true, kann_bearbeiten: false }));
        await supabase.from('app_permissions').insert(defPerms);
      }
      await supabase.from('app_activity_log').insert({ user_email: 'admin', user_name: 'Admin', aktion: 'user_angelegt', details: `${formData.name} (${formData.email})` });
      toast.success('User angelegt');
    }
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    resetForm();
  };

  const toggleActive = async (user: any) => {
    await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id);
    await supabase.from('app_activity_log').insert({ user_email: 'admin', user_name: 'Admin', aktion: user.is_active ? 'user_gesperrt' : 'user_aktiviert', details: user.name });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    toast.success(user.is_active ? `${user.name} gesperrt` : `${user.name} aktiviert`);
  };

  const deleteUser = async (user: any) => {
    if (!confirm(`${user.name} wirklich löschen?`)) return;
    await supabase.from('app_users').delete().eq('id', user.id);
    await supabase.from('app_activity_log').insert({ user_email: 'admin', user_name: 'Admin', aktion: 'user_geloescht', details: user.name });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    toast.success('User gelöscht');
  };

  const getPerm = (bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    const p = (permissions as any[]).find(p => p.bereich === bereichKey);
    return p ? p[typ] : (typ === 'kann_sehen' ? true : false);
  };

  const togglePerm = async (bereichKey: string, typ: 'kann_sehen' | 'kann_bearbeiten') => {
    if (!permUser) return;
    const current = getPerm(bereichKey, typ);
    const existing = (permissions as any[]).find(p => p.bereich === bereichKey);
    if (existing) {
      await supabase.from('app_permissions').update({ [typ]: !current, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('app_permissions').insert({ user_id: permUser.id, bereich: bereichKey, kann_sehen: typ === 'kann_sehen' ? !current : true, kann_bearbeiten: typ === 'kann_bearbeiten' ? !current : false });
    }
    qc.invalidateQueries({ queryKey: ['admin-permissions', permUser.id] });
  };

  const cb = (val: boolean, onClick: () => void) => (
    <button onClick={onClick}
      style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${val ? '#2563eb' : '#e2e8f0'}`, background: val ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .15s' }}>
      {val && <Check size={12} style={{ color: '#fff' }} />}
    </button>
  );

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '.06em', display: 'block', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-.03em' }}>
          Admin <span style={{ color: '#6366f1' }}>Einstellungen</span>
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Nur für Administratoren sichtbar</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: '#f8fafc', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        {([['users', Users, 'Benutzerverwaltung'], ['activity', Activity, 'Aktivitäts-Log']] as any[]).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: tab === key ? '#fff' : 'transparent', color: tab === key ? '#0f172a' : '#64748b', fontWeight: tab === key ? 700 : 500, fontSize: 13, cursor: 'pointer', boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,.08)' : 'none' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* User-Liste */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Benutzer ({(users as any[]).length})</h2>
              <button onClick={() => { resetForm(); setShowForm(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={14} /> Neuer User
              </button>
            </div>

            {/* User anlegen/bearbeiten Form */}
            {showForm && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>{editUser ? 'User bearbeiten' : 'Neuer User'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={labelStyle}>Name *</label><input style={inputStyle} value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Max Mustermann" /></div>
                  <div><label style={labelStyle}>E-Mail *</label><input style={inputStyle} value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="m.mustermann@widi-hellersen.de" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Passwort {editUser ? '(leer = unveändert)' : '*'}</label>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inputStyle, paddingRight: 36 }} type={showPw ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} placeholder="Passwort" />
                      <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                    {cb(formData.is_admin, () => setFormData(f => ({ ...f, is_admin: !f.is_admin })))}
                    <label style={{ fontSize: 13, color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}>Administrator</label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveUser} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {editUser ? 'Speichern' : 'Anlegen'}
                  </button>
                  <button onClick={resetForm} style={{ padding: '9px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: '#64748b', cursor: 'pointer' }}>Abbrechen</button>
                </div>
              </div>
            )}

            {/* User-Karten */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(users as any[]).map((user: any) => (
                <div key={user.id} style={{ background: '#fff', border: `1px solid ${user.is_active ? '#f1f5f9' : '#fecaca'}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: user.is_admin ? '#ede9fe' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: user.is_admin ? '#7c3aed' : '#2563eb', flexShrink: 0 }}>
                    {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: user.is_active ? '#0f172a' : '#94a3b8' }}>{user.name}</span>
                      {user.is_admin && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed', fontWeight: 700 }}>ADMIN</span>}
                      {!user.is_active && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fef2f2', color: '#ef4444', fontWeight: 700 }}>GESPERRT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{user.email}</div>
                    {user.last_login && <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 1 }}>Letzter Login: {new Date(user.last_login).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setPermUser(permUser?.id === user.id ? null : user)} title="Berechtigungen"
                      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${permUser?.id === user.id ? '#6366f1' : '#e2e8f0'}`, background: permUser?.id === user.id ? '#eff6ff' : '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: permUser?.id === user.id ? '#6366f1' : '#64748b' }}>
                      <Shield size={13} />
                    </button>
                    <button onClick={() => { setEditUser(user); setFormData({ name: user.name, email: user.email, password: '', is_admin: user.is_admin }); setShowForm(true); }} title="Bearbeiten"
                      style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => toggleActive(user)} title={user.is_active ? 'Sperren' : 'Aktivieren'}
                      style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: user.is_active ? '#f59e0b' : '#10b981' }}>
                      {user.is_active ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    {!user.is_admin && (
                      <button onClick={() => deleteUser(user)} title="Löschen"
                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Berechtigungs-Panel */}
          {permUser && (
            <div style={{ width: 340, flexShrink: 0 }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Berechtigungen</h3>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{permUser.name}</p>
                  </div>
                  <button onClick={() => setPermUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
                </div>
                {permUser.is_admin ? (
                  <div style={{ background: '#ede9fe', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                    ✓ Administrator — hat automatisch alle Berechtigungen
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Bereich</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sehen</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Bearb.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BEREICHE.map(b => (
                        <tr key={b.key} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '8px 8px', fontWeight: 500, color: '#0f172a' }}>{b.label}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            {cb(getPerm(b.key, 'kann_sehen'), () => togglePerm(b.key, 'kann_sehen'))}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            {b.hat_bearbeiten
                              ? cb(getPerm(b.key, 'kann_bearbeiten'), () => togglePerm(b.key, 'kann_bearbeiten'))
                              : <span style={{ color: '#e2e8f0', fontSize: 10 }}>–</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#94a3b8' }}>
                  Änderungen werden sofort gespeichert. User muss sich neu einloggen damit sie aktiv werden.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Log Tab */}
      {tab === 'activity' && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                {['Zeitpunkt', 'Benutzer', 'Aktion', 'Details'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(activityLog as any[]).map((log: any) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a' }}>{log.user_name ?? log.user_email?.split('@')[0]}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: log.aktion === 'login' ? '#f0fdf4' : log.aktion?.includes('geloescht') ? '#fef2f2' : log.aktion?.includes('gesperrt') ? '#fffbeb' : '#eff6ff',
                      color: log.aktion === 'login' ? '#15803d' : log.aktion?.includes('geloescht') ? '#dc2626' : log.aktion?.includes('gesperrt') ? '#b45309' : '#1d4ed8' }}>
                      {log.aktion}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#64748b' }}>{log.details ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
