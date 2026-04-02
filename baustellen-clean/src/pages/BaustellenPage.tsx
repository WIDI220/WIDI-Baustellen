import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, HardHat, ArrowRight, Pencil, Trash2, Calendar, AlertTriangle, Lightbulb, Zap, Building2, PauseCircle } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { fmtEur, fmtDate } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';
import { erkenneBudget } from '@/lib/budgetErkennung';

const STATUS_OPTIONS = [
  { value:'nicht_gestartet', label:'Nicht gestartet', dot:'#eab308', bg:'rgba(234,179,8,0.12)',   border:'rgba(234,179,8,0.25)',   text:'#854d0e', badgeBg:'#fef9c3', badgeText:'#713f12' },
  { value:'offen',           label:'Offen',           dot:'#94a3b8', bg:'rgba(148,163,184,0.08)', border:'rgba(148,163,184,0.18)', text:'#475569', badgeBg:'#f1f5f9', badgeText:'#475569' },
  { value:'in_bearbeitung',  label:'In Bearbeitung',  dot:'#3b82f6', bg:'rgba(37,99,235,0.07)',   border:'rgba(37,99,235,0.2)',    text:'#1d4ed8', badgeBg:'#dbeafe', badgeText:'#1e40af' },
  { value:'pausiert',        label:'Pausiert',        dot:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.22)',  text:'#b45309', badgeBg:'#fef3c7', badgeText:'#92400e' },
  { value:'abgeschlossen',   label:'Abgeschlossen',   dot:'#10b981', bg:'rgba(16,185,129,0.07)',  border:'rgba(16,185,129,0.2)',   text:'#065f46', badgeBg:'#d1fae5', badgeText:'#065f46' },
  { value:'abgerechnet',     label:'Abgerechnet',     dot:'#8b5cf6', bg:'rgba(139,92,246,0.07)',  border:'rgba(139,92,246,0.2)',   text:'#5b21b6', badgeBg:'#ede9fe', badgeText:'#5b21b6' },
];

const STATUS_ORDER: Record<string, number> = {
  in_bearbeitung: 0, pausiert: 1, offen: 2, nicht_gestartet: 3, abgeschlossen: 4, abgerechnet: 5,
};

const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const EMPTY = { name:'', adresse:'', auftraggeber:'', startdatum:'', enddatum:'', status:'offen', gewerk:'Hochbau', projektleiter:'', beschreibung:'', budgetInput:'' };

function extractANummer(name: string): string {
  const m = name.match(/^\[A(\w+)\]/);
  return m ? m[1] : '';
}

function sortBS(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const ao = STATUS_ORDER[a.status] ?? 99;
    const bo = STATUS_ORDER[b.status] ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function BaustelleKarte({ b, sw, mat, nach, onEdit, onDelete, navigate }: any) {
  const st = STATUS_OPTIONS.find(s => s.value === b.status) ?? STATUS_OPTIONS[1];
  const k = berechneKosten(b.id, sw, mat, nach, Number(b.budget ?? 0));
  const daysLeft = b.enddatum ? Math.round((new Date(b.enddatum).getTime() - Date.now()) / 86400000) : null;
  const fristAlert = b.status !== 'nicht_gestartet' && daysLeft !== null && daysLeft <= 7;
  const barColor = k.overBudget ? '#ef4444' : k.pct > 80 ? '#f59e0b' : st.dot;
  const isElektro = b.gewerk === 'Elektro';

  return (
    <div
      style={{
        background: st.bg,
        borderRadius: 16,
        border: `1.5px solid ${st.border}`,
        padding: '16px 18px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow .2s, transform .2s, border-color .15s',
      }}
      onClick={() => navigate(`/baustellen/liste/${b.id}`)}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px ${st.dot}22`;
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.borderColor = st.dot;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.borderColor = st.border;
      }}
    >
      {/* Farbiger Top-Streifen */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: st.dot, borderRadius: '16px 16px 0 0', opacity: 0.8 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4 }}>
        {/* Icon */}
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: `${st.dot}20`,
          border: `1px solid ${st.dot}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isElektro
            ? <Zap size={18} style={{ color: st.dot }} />
            : <HardHat size={18} style={{ color: st.dot }} />}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Titel + Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{b.name}</span>
            {/* Status Badge */}
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
              background: st.badgeBg, color: st.badgeText,
              border: `1px solid ${st.dot}30`,
            }}>
              {st.label}
            </span>
            {/* Deadline Warning */}
            {fristAlert && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={10} />
                {(daysLeft ?? 0) < 0 ? `${Math.abs(daysLeft ?? 0)}d überfällig` : `${daysLeft}d`}
              </span>
            )}
          </div>

          {/* Meta */}
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.auftraggeber || '–'}
            {b.adresse ? ` · ${b.adresse}` : ''}
            {b.enddatum && (
              <span style={{ marginLeft: 8 }}>
                <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                {fmtDate(b.enddatum)}
              </span>
            )}
          </p>

          {/* Budget */}
          {k.effektivBudget > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
                <span style={{ color: k.overBudget ? '#dc2626' : '#64748b' }}>
                  {fmtEur(k.gesamtkosten)}
                  {k.nachtragGenehmigt > 0 && <span style={{ color: '#10b981', marginLeft: 6 }}>+{fmtEur(k.nachtragGenehmigt)}</span>}
                  <span style={{ color: '#94a3b8', marginLeft: 4 }}>/ {fmtEur(k.effektivBudget)}</span>
                </span>
                <span style={{ fontWeight: 700, color: barColor }}>{k.pct}%</span>
              </div>
              {/* Fortschrittsbalken */}
              <div style={{ height: 6, background: `${st.dot}20`, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(k.pct, 100)}%`, background: barColor, borderRadius: 99, transition: 'width .6s ease' }} />
              </div>
              {/* Kostenaufschlüsselung */}
              {(k.personalkosten > 0 || k.materialkosten > 0) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                  {k.personalkosten > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${st.dot}15`, color: st.text, fontWeight: 500 }}>
                      Personal {fmtEur(k.personalkosten)}
                    </span>
                  )}
                  {k.materialkosten > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(234,88,12,0.1)', color: '#c2410c', fontWeight: 500 }}>
                      Material {fmtEur(k.materialkosten)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={e => onEdit(b, e)}
            style={{ padding: '7px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', transition: 'all .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${st.dot}20`; (e.currentTarget as HTMLElement).style.color = st.dot; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}>
            <Pencil size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); if (confirm(`"${b.name}" löschen?`)) onDelete(b.id); }}
            style={{ padding: '7px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', color: '#fca5a5', transition: 'all .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; (e.currentTarget as HTMLElement).style.color = '#dc2626'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}>
            <Trash2 size={14} />
          </button>
          <ArrowRight size={14} style={{ color: st.dot, opacity: 0.5, marginLeft: 4 }} />
        </div>
      </div>
    </div>
  );
}

function SektionHeader({ icon, label, count, color, bg, textColor }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: bg, borderRadius: 12, marginBottom: 10, border: `1px solid ${color}25` }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
        {icon}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: textColor ?? '#0f172a' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: `${color}15`, color, border: `1px solid ${color}25` }}>{count} aktiv</span>
    </div>
  );
}

export default function BaustellenPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: baustellen = [] } = useQuery({ queryKey: ['baustellen-list'], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').order('created_at', { ascending: false }); return data ?? []; } });
  const { data: stunden = [] }    = useQuery({ queryKey: ['bs-stunden-list'], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('baustelle_id,stunden,employees(stundensatz)'); return data ?? []; } });
  const { data: materialien = [] }= useQuery({ queryKey: ['bs-mat-list'],     queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('baustelle_id,gesamtpreis'); return data ?? []; } });
  const { data: nachtraege = [] } = useQuery({ queryKey: ['bs-nach-list'],    queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('baustelle_id,betrag,status'); return data ?? []; } });

  const save = useMutation({
    mutationFn: async () => {
      const erkannt = erkenneBudget(form.budgetInput);
      const payload = {
        name: form.name, adresse: form.adresse || null, auftraggeber: form.auftraggeber || null,
        startdatum: form.startdatum || null, enddatum: form.enddatum || null,
        status: form.status, gewerk: form.gewerk, projektleiter: form.projektleiter || null,
        beschreibung: form.beschreibung || null,
        budget: erkannt?.budget ?? 0, budget_typ: erkannt?.typ ?? 'festpreis', budget_menge: erkannt?.menge ?? 0, fortschritt: 0,
      };
      if (editItem) { const { error } = await supabase.from('baustellen').update(payload).eq('id', editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from('baustellen').insert(payload); if (error) throw error; }
    },
    onSuccess: async () => {
      toast.success(editItem ? 'Aktualisiert' : 'Baustelle angelegt');
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, editItem ? `Baustelle bearbeitet: ${form.name}` : `Baustelle angelegt: ${form.name}`, 'baustelle', editItem?.id, { name: form.name, status: form.status });
      setDialog(false); setEditItem(null); setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      queryClient.invalidateQueries({ queryKey: ['bs-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-baustellen'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('baustellen').delete().eq('id', id); if (error) throw error; },
    onSuccess: async (_: any, id: string) => {
      toast.success('Gelöscht');
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, `Baustelle gelöscht`, 'baustelle', id);
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-baustellen'] });
    },
  });

  const bs = baustellen as any[], sw = stunden as any[], mat = materialien as any[], nach = nachtraege as any[];
  const aktiveBS = bs.filter(b => b.status !== 'abgeschlossen' && b.status !== 'abgerechnet');

  const filtered = aktiveBS.filter(b => {
    if (!search) return true;
    return b.name.toLowerCase().includes(search.toLowerCase()) || (b.auftraggeber || '').toLowerCase().includes(search.toLowerCase());
  });

  const hochbauBS        = sortBS(filtered.filter(b => (b.gewerk === 'Hochbau' || b.gewerk === 'Beides') && b.status !== 'nicht_gestartet'));
  const elektroBS        = sortBS(filtered.filter(b => (b.gewerk === 'Elektro'  || b.gewerk === 'Beides') && b.status !== 'nicht_gestartet'));
  const nichtGestartetBS = filtered.filter(b => b.status === 'nicht_gestartet');

  const openEdit = (b: any, e: React.MouseEvent) => {
    e.stopPropagation();
    let budgetInput = String(b.budget || '');
    if (b.budget_typ === 'stunden' && b.budget_menge) budgetInput = `${b.budget_menge}h`;
    else if (b.budget_typ === 'stueckzahl' && b.budget_menge) budgetInput = `${b.budget_menge}stk`;
    setForm({ name: b.name, adresse: b.adresse || '', auftraggeber: b.auftraggeber || '', startdatum: b.startdatum || '', enddatum: b.enddatum || '', status: b.status, gewerk: b.gewerk || 'Hochbau', projektleiter: b.projektleiter || '', beschreibung: b.beschreibung || '', budgetInput });
    setEditItem(b);
    setDialog(true);
  };

  const erkannt = erkenneBudget(form.budgetInput);
  const erkennungHinweis: Record<string, string> = {
    festpreis: '💰 Festpreis erkannt', stunden: '⏱ Stundenbudget erkannt', stueckzahl: '📦 Stückzahl erkannt',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 32, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            Baustellen <span style={{ color: '#2563eb' }}>({aktiveBS.length})</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
            {hochbauBS.length + elektroBS.length} aktive · {nichtGestartetBS.length} nicht gestartet
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setEditItem(null); setDialog(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.3)', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(37,99,235,0.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(37,99,235,0.3)'; }}>
          <Plus size={15} /> Neue Baustelle
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          placeholder="Name oder Auftraggeber suchen..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s' }}
          onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
        />
      </div>

      {filtered.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: '56px 24px', textAlign: 'center' }}>
          <HardHat size={36} style={{ color: '#e2e8f0', marginBottom: 12 }} />
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>Keine Baustellen gefunden</p>
          <button onClick={() => { setForm(EMPTY); setDialog(true); }}
            style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Erste anlegen
          </button>
        </div>
      )}

      {/* ── HOCHBAU ── */}
      {hochbauBS.length > 0 && (
        <div>
          <SektionHeader icon={<Building2 size={14} />} label="Hochbau" count={hochbauBS.length} color="#2563eb" bg="#eff6ff" textColor="#1e3a8a" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hochbauBS.map(b => (
              <BaustelleKarte key={b.id} b={b} sw={sw} mat={mat} nach={nach} onEdit={openEdit} onDelete={(id: string) => del.mutate(id)} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* ── ELEKTRO ── */}
      {elektroBS.length > 0 && (
        <div>
          <SektionHeader icon={<Zap size={14} />} label="Elektro" count={elektroBS.length} color="#059669" bg="#f0fdf4" textColor="#064e3b" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {elektroBS.map(b => (
              <BaustelleKarte key={b.id} b={b} sw={sw} mat={mat} nach={nach} onEdit={openEdit} onDelete={(id: string) => del.mutate(id)} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* ── NICHT GESTARTET ── */}
      {nichtGestartetBS.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: '#fefce8', borderRadius: 12, marginBottom: 10, border: '1px solid rgba(234,179,8,0.25)' }}>
            <PauseCircle size={14} style={{ color: '#ca8a04' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#713f12' }}>Nicht gestartet</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.25)' }}>{nichtGestartetBS.length}</span>
            <span style={{ fontSize: 11, color: '#a16207', marginLeft: 4 }}>— keine Deadline-Warnungen aktiv</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.85 }}>
            {nichtGestartetBS.map(b => (
              <BaustelleKarte key={b.id} b={b} sw={sw} mat={mat} nach={nach} onEdit={openEdit} onDelete={(id: string) => del.mutate(id)} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialog} onOpenChange={v => { setDialog(v); if (!v) { setEditItem(null); setForm(EMPTY); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? 'Baustelle bearbeiten' : 'Neue Baustelle'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} autoFocus placeholder="z.B. Klinikum – Station 3" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Auftraggeber</Label><Input value={form.auftraggeber} onChange={e => setForm((f: any) => ({ ...f, auftraggeber: e.target.value }))} /></div>
              <div><Label>Adresse / Ort</Label><Input value={form.adresse} onChange={e => setForm((f: any) => ({ ...f, adresse: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Budget</Label>
              <Input value={form.budgetInput} onChange={e => setForm((f: any) => ({ ...f, budgetInput: e.target.value }))} placeholder="z.B.  5000  oder  120h  oder  50stk" />
              {form.budgetInput && (
                <div className="mt-1.5 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
                  style={erkannt ? { background: 'rgba(16,185,129,.08)', color: '#065f46', border: '1px solid rgba(16,185,129,.2)' } : { background: 'rgba(239,68,68,.08)', color: '#991b1b', border: '1px solid rgba(239,68,68,.2)' }}>
                  {erkannt
                    ? <><Lightbulb className="h-3.5 w-3.5 flex-shrink-0" /><span><strong>{erkennungHinweis[erkannt.typ]}</strong> – {erkannt.anzeige}</span></>
                    : <><span>❓ Nicht erkannt. Beispiele: </span><code className="font-mono">5000</code><span>, </span><code className="font-mono">120h</code></>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Gewerk</Label><Select value={form.gewerk} onValueChange={v => setForm((f: any) => ({ ...f, gewerk: v }))}>{GEWERK_OPTIONS.map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)}</Select></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>{STATUS_OPTIONS.map(s => <SelectOption key={s.value} value={s.value}>{s.label}</SelectOption>)}</Select></div>
              <div><Label>Projektleiter</Label><Input value={form.projektleiter} onChange={e => setForm((f: any) => ({ ...f, projektleiter: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><Input type="date" value={form.startdatum} onChange={e => setForm((f: any) => ({ ...f, startdatum: e.target.value }))} /></div>
              <div><Label>Frist</Label><Input type="date" value={form.enddatum} onChange={e => setForm((f: any) => ({ ...f, enddatum: e.target.value }))} /></div>
            </div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e => setForm((f: any) => ({ ...f, beschreibung: e.target.value }))} className="min-h-[70px]" /></div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || !form.name}>{save.isPending ? 'Speichert...' : 'Speichern'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
