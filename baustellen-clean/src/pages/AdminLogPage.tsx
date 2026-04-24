import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shield, RefreshCw, ChevronLeft, Monitor, MousePointer, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLocalSession, clearLocalSession } from '@/pages/AuthPage';

const ADMIN_EMAIL = 'j.paredis@widi-hellersen.de';

const TYPE_CFG: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  page_visit:     { bg: '#f0f9ff', color: '#0284c7', label: 'Seitenbesuch', icon: '👁' },
  ticket:         { bg: '#eff6ff', color: '#2563eb', label: 'Ticket',        icon: '🎫' },
  ticket_worklog: { bg: '#f0fdf4', color: '#10b981', label: 'Stunden',       icon: '⏱' },
  baustelle:      { bg: '#fffbeb', color: '#f59e0b', label: 'Baustelle',     icon: '🏗' },
  pdf_ruecklauf:  { bg: '#faf5ff', color: '#8b5cf6', label: 'PDF-Import',    icon: '📄' },
  excel_import:   { bg: '#f0fdf4', color: '#059669', label: 'Excel-Import',  icon: '📊' },
};

export default function AdminLogPage() {
  const navigate = useNavigate();
  const user = getLocalSession();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showPageVisits, setShowPageVisits] = useState(false);

  if (user?.email !== ADMIN_EMAIL) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
        <div style={{ textAlign:'center' }}>
          <Shield size={48} style={{ color:'#e2e8f0', marginBottom:16 }} />
          <p style={{ color:'#94a3b8', fontSize:16 }}>Kein Zugriff</p>
        </div>
      </div>
    );
  }

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const allLogs = logs as any[];

  // Unique Users
  const users = [...new Set(allLogs.map(l => l.user_email))];

  // Aktionen für ausgewählten User
  const userLogs = selectedUser
    ? allLogs.filter(l => l.user_email === selectedUser && (showPageVisits || l.entity_type !== 'page_visit'))
    : [];

  // Letzte Aktivität pro User
  const lastActivity = (email: string) => {
    const log = allLogs.find(l => l.user_email === email);
    return log ? new Date(log.created_at) : null;
  };

  const actionCount = (email: string) => allLogs.filter(l => l.user_email === email && l.entity_type !== 'page_visit').length;
  const pageCount = (email: string) => allLogs.filter(l => l.user_email === email && l.entity_type === 'page_visit').length;

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 40px', height:62, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => navigate('/')}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, color:'#64748b', fontSize:12, fontWeight:500, cursor:'pointer' }}>
            <ChevronLeft size={13} /> Startseite
          </button>
          <div style={{ width:1, height:20, background:'#e2e8f0' }} />
          <div style={{ width:32, height:32, borderRadius:9, background:'#faf5ff', border:'1px solid #ddd6fe', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Shield size={15} style={{ color:'#8b5cf6' }} />
          </div>
          <div>
            <p style={{ color:'#0f172a', fontWeight:800, fontSize:14, margin:0 }}>Admin — Nutzeraktivität</p>
            <p style={{ color:'#94a3b8', fontSize:11, margin:0 }}>{allLogs.length} Einträge · {users.length} Nutzer</p>
          </div>
        </div>
        <button onClick={() => refetch()}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, color:'#64748b', fontSize:12, cursor:'pointer' }}>
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:0, height:'calc(100vh - 62px)' }}>

        {/* Linke Spalte — Nutzer */}
        <div style={{ background:'#fff', borderRight:'1px solid #e2e8f0', overflowY:'auto', padding:'16px' }}>
          <p style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', margin:'0 0 12px 4px' }}>Nutzer</p>

          {isLoading && <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'24px 0' }}>Lädt...</p>}

          {users.length === 0 && !isLoading && (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <Monitor size={32} style={{ color:'#e2e8f0', marginBottom:8 }} />
              <p style={{ color:'#94a3b8', fontSize:13 }}>Noch keine Aktivitäten</p>
            </div>
          )}

          {users.map(email => {
            const last = lastActivity(email);
            const actions = actionCount(email);
            const pages = pageCount(email);
            const isSelected = selectedUser === email;
            const initials = email.split('@')[0].split('.').map((n: string) => n[0]?.toUpperCase()).join('').slice(0,2);

            return (
              <div key={email}
                onClick={() => setSelectedUser(isSelected ? null : email)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, cursor:'pointer', marginBottom:4, transition:'all .15s', background: isSelected ? '#faf5ff' : 'transparent', border: isSelected ? '1px solid #ddd6fe' : '1px solid transparent' }}
                onMouseEnter={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.background='#f8fafc'; }}
                onMouseLeave={e=>{ if(!isSelected)(e.currentTarget as HTMLElement).style.background='transparent'; }}>
                {/* Avatar */}
                <div style={{ width:38, height:38, borderRadius:12, background: isSelected ? '#8b5cf6' : '#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:13, fontWeight:800, color: isSelected ? '#fff' : '#64748b' }}>{initials}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:'#0f172a', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <p style={{ fontSize:10, color:'#94a3b8', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email}</p>
                  <div style={{ display:'flex', gap:8, marginTop:3 }}>
                    <span style={{ fontSize:10, color:'#8b5cf6' }}>{actions} Aktionen</span>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>{pages} Seiten</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rechte Spalte — Aktivitäten */}
        <div style={{ overflowY:'auto', padding:'24px 32px' }}>
          {!selectedUser ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#94a3b8', textAlign:'center' }}>
              <MousePointer size={40} style={{ color:'#e2e8f0', marginBottom:12 }} />
              <p style={{ fontSize:15, fontWeight:600, color:'#64748b', margin:'0 0 4px' }}>Nutzer auswählen</p>
              <p style={{ fontSize:13, margin:0 }}>Klicke links auf einen Namen um die Aktivitäten zu sehen</p>
            </div>
          ) : (
            <>
              {/* User Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:14, background:'#8b5cf6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
                      {selectedUser.split('@')[0].split('.').map((n: string) => n[0]?.toUpperCase()).join('').slice(0,2)}
                    </span>
                  </div>
                  <div>
                    <p style={{ fontSize:17, fontWeight:800, color:'#0f172a', margin:0 }}>
                      {selectedUser.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>{selectedUser}</p>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {/* Toggle Seitenbesuche */}
                  <button
                    onClick={() => setShowPageVisits(!showPageVisits)}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background: showPageVisits ? '#eff6ff' : '#f8fafc', border: showPageVisits ? '1px solid #bfdbfe' : '1px solid #e2e8f0', borderRadius:10, color: showPageVisits ? '#2563eb' : '#64748b', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s' }}>
                    <FileText size={13} />
                    {showPageVisits ? 'Seitenbesuche ausblenden' : 'Seitenbesuche anzeigen'}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
                {[
                  { label:'Aktionen', value:actionCount(selectedUser), color:'#8b5cf6' },
                  { label:'Seiten besucht', value:pageCount(selectedUser), color:'#2563eb' },
                  { label:'Letzte Aktivität', value:lastActivity(selectedUser)?.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) ?? '–', color:'#10b981' },
                ].map((s,i) => (
                  <div key={i} style={{ background:'#fff', borderRadius:14, border:'1px solid #f1f5f9', padding:'14px 16px' }}>
                    <p style={{ fontSize:11, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', margin:'0 0 6px' }}>{s.label}</p>
                    <p style={{ fontSize:20, fontWeight:800, color:s.color, margin:0, letterSpacing:'-.02em' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Aktivitäten-Liste */}
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#0f172a', margin:0 }}>
                    Chronologische Aktivitäten
                    <span style={{ color:'#94a3b8', fontWeight:400, marginLeft:8, fontSize:12 }}>({userLogs.length} Einträge)</span>
                  </p>
                </div>
                {userLogs.length === 0 ? (
                  <p style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'32px 0' }}>Keine Aktivitäten gefunden</p>
                ) : (
                  <div style={{ maxHeight:'calc(100vh - 380px)', overflowY:'auto' }}>
                    {userLogs.map((log: any) => {
                      const cfg = TYPE_CFG[log.entity_type ?? ''] ?? { bg:'#f8fafc', color:'#64748b', label:'Sonstiges', icon:'•' };
                      return (
                        <div key={log.id} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'12px 20px', borderBottom:'1px solid #f8fafc', transition:'background .1s' }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#fafafa';}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}>
                          {/* Icon */}
                          <div style={{ width:32, height:32, borderRadius:9, background:cfg.bg, border:`1px solid ${cfg.color}20`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>
                            {cfg.icon}
                          </div>
                          {/* Content */}
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, color:'#0f172a', margin:'0 0 3px', fontWeight:500 }}>{log.action}</p>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:11, fontWeight:600, padding:'1px 7px', borderRadius:6, background:cfg.bg, color:cfg.color }}>{cfg.label}</span>
                              {log.details?.url && (
                                <span style={{ fontSize:11, color:'#94a3b8', fontFamily:'monospace' }}>{log.details.url}</span>
                              )}
                            </div>
                          </div>
                          {/* Zeit */}
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            <p style={{ fontSize:12, color:'#64748b', margin:'0 0 2px', fontWeight:600 }}>
                              {new Date(log.created_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}
                            </p>
                            <p style={{ fontSize:10, color:'#94a3b8', margin:0 }}>
                              {new Date(log.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
