// ─────────────────────────────────────────────────────────────────────────────
// StundenAnfragenPage.tsx
// Zeigt alle Anfragen aus der Handwerker-App.
// NUR LESEN aus App-Supabase + SCHREIBEN in Controlling nach Bestätigung.
// Bestehende Controlling-Tabellen werden NIE direkt beschrieben ohne Modal.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, XCircle, Clock, HardHat, Ticket, Shield, Package, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

// ── Handwerker-App Supabase (NUR für Anfragen lesen + Status schreiben) ──────
const APP_URL = 'https://syhjjuewkjjihxwiexmz.supabase.co';
const APP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aGpqdWV3a2pqaWh4d2lleG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTk2NDYsImV4cCI6MjA5MzA5NTY0Nn0.9A-GrkU72IZ3uxkypX5GttN4EXNv46aX4uOY4wUmfaE';

const appFetch = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(`${APP_URL}/rest/v1/${path}`, {
    headers: {
      apikey: APP_KEY,
      Authorization: `Bearer ${APP_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers as Record<string, string> || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).message || 'Fehler beim Laden');
  }
  if (res.status === 204) return null;
  return res.json();
};

// ── Typen ─────────────────────────────────────────────────────────────────────
interface Anfrage {
  id: string;
  controlling_employee_id: string;
  mitarbeiter_name: string;
  controlling_baustelle_id: string | null;
  datum: string;
  typ: 'baustelle' | 'ticket' | 'dguv' | 'sonstiges';
  beschreibung: string | null;
  stunden: number;
  material: string | null;
  material_kosten: number | null;
  foto_vorher: string | null;
  foto_nachher: string | null;
  status: 'offen' | 'genehmigt' | 'abgelehnt' | 'verbucht';
  admin_kommentar: string | null;
  erstellt_am: string;
}

// ── Konfig ────────────────────────────────────────────────────────────────────
const TYP_CFG = {
  baustelle: { label: 'Baustelle',  icon: HardHat,  color: '#2563eb', bg: 'rgba(37,99,235,0.1)'   },
  ticket:    { label: 'Ticket',     icon: Ticket,   color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  dguv:      { label: 'DGUV',       icon: Shield,   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  sonstiges: { label: 'Sonstiges',  icon: Package,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
};

const STATUS_CFG = {
  offen:     { label: 'Offen',       bg: '#fefce8', color: '#854d0e', border: '#fde047' },
  genehmigt: { label: 'Genehmigt',   bg: '#f0fdf4', color: '#14532d', border: '#86efac' },
  abgelehnt: { label: 'Abgelehnt',   bg: '#fef2f2', color: '#7f1d1d', border: '#fca5a5' },
  verbucht:  { label: 'Verbucht ✓',  bg: '#eff6ff', color: '#1e3a8a', border: '#93c5fd' },
};

// ── Verbuchen Modal ───────────────────────────────────────────────────────────
function VerbuchenModal({ anfrage, baustellenName, onConfirm, onCancel, loading, error }: {
  anfrage: Anfrage; baustellenName: string; onConfirm: () => void;
  onCancel: () => void; loading: boolean; error: string;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, maxWidth: 460, width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} style={{ color: '#d97706' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Ins Controlling verbuchen?</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Diese Aktion kann nicht rückgängig gemacht werden</p>
          </div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{anfrage.mitarbeiter_name}</div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            {new Date(anfrage.datum).toLocaleDateString('de-DE')} · {TYP_CFG[anfrage.typ]?.label} · <strong>{anfrage.stunden}h</strong>
          </div>
          {baustellenName && <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>📍 {baustellenName}</div>}
          {anfrage.beschreibung && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>{anfrage.beschreibung}</div>}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#94a3b8' }}>
            {anfrage.typ === 'baustelle' && '→ Schreibt in: bs_stundeneintraege' + (anfrage.foto_vorher || anfrage.foto_nachher ? ' + bs_fotos' : '')}
            {anfrage.typ === 'dguv' && '→ Schreibt in: interne_stunden'}
            {anfrage.typ === 'sonstiges' && '→ Schreibt in: interne_stunden'}
            {anfrage.typ === 'ticket' && '→ Schreibt in: interne_stunden (Ticket-Referenz in Beschreibung)'}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
            Abbrechen
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ flex: 1, padding: '12px', background: loading ? '#94a3b8' : '#2563eb', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', color: '#fff' }}>
            {loading ? 'Wird verbucht...' : 'Jetzt verbuchen ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Einzelne Anfrage Karte ────────────────────────────────────────────────────
function AnfrageKarte({ anfrage, baustellenMap, onAblehnen, onGenehmigen, onVerbuchen }: {
  anfrage: Anfrage;
  baustellenMap: Record<string, string>;
  onAblehnen: (id: string, kommentar: string) => void;
  onGenehmigen: (id: string, kommentar: string) => void;
  onVerbuchen: (anfrage: Anfrage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [kommentar, setKommentar] = useState('');
  const cfg = TYP_CFG[anfrage.typ];
  const stCfg = STATUS_CFG[anfrage.status];
  const Icon = cfg?.icon ?? Package;
  const baustelleName = anfrage.controlling_baustelle_id ? (baustellenMap[anfrage.controlling_baustelle_id] || 'Unbekannte Baustelle') : '';

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={20} style={{ color: cfg?.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{anfrage.mitarbeiter_name}</span>
            <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: stCfg?.bg, color: stCfg?.color, border: `1px solid ${stCfg?.border}`, fontWeight: 600 }}>
              {stCfg?.label}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{new Date(anfrage.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <span>·</span>
            <span style={{ color: cfg?.color, fontWeight: 600 }}>{cfg?.label}</span>
            {baustelleName && <><span>·</span><span>📍 {baustelleName}</span></>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: cfg?.color, letterSpacing: '-0.05em' }}>{anfrage.stunden}h</div>
          {expanded ? <ChevronUp size={14} style={{ color: '#94a3b8' }} /> : <ChevronDown size={14} style={{ color: '#94a3b8' }} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', background: '#fafafa' }}>
          {anfrage.beschreibung && (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{anfrage.beschreibung}</p>
          )}
          {anfrage.material && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>📦 {anfrage.material}{anfrage.material_kosten ? ` — ${anfrage.material_kosten}€` : ''}</p>
          )}
          {anfrage.admin_kommentar && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6d28d9', fontStyle: 'italic' }}>💬 {anfrage.admin_kommentar}</p>
          )}

          {/* Vorher/Nachher Fotos */}
          {(anfrage.foto_vorher || anfrage.foto_nachher) && (
            <div style={{ display: 'grid', gridTemplateColumns: anfrage.foto_vorher && anfrage.foto_nachher ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
              {anfrage.foto_vorher && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vorher</div>
                  <img src={anfrage.foto_vorher} alt="Vorher" style={{ width: '100%', borderRadius: 10, height: 160, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                </div>
              )}
              {anfrage.foto_nachher && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nachher</div>
                  <img src={anfrage.foto_nachher} alt="Nachher" style={{ width: '100%', borderRadius: 10, height: 160, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                </div>
              )}
            </div>
          )}

          {/* Aktionen */}
          {anfrage.status === 'offen' && (
            <div>
              <input
                placeholder="Kommentar (optional)..."
                value={kommentar}
                onChange={e => setKommentar(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onGenehmigen(anfrage.id, kommentar)}
                  style={{ flex: 1, padding: '11px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <CheckCircle size={15} /> Genehmigen
                </button>
                <button onClick={() => onAblehnen(anfrage.id, kommentar)}
                  style={{ flex: 1, padding: '11px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <XCircle size={15} /> Ablehnen
                </button>
              </div>
            </div>
          )}

          {/* Verbuchen Button (nur nach Genehmigung) */}
          {anfrage.status === 'genehmigt' && (
            <button onClick={() => onVerbuchen(anfrage)}
              style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              📤 Ins Controlling verbuchen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function StundenAnfragenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'offen' | 'genehmigt' | 'abgelehnt' | 'verbucht'>('offen');
  const [verbuchenAnfrage, setVerbuchenAnfrage] = useState<Anfrage | null>(null);
  const [verbuchenLoading, setVerbuchenLoading] = useState(false);
  const [verbuchenError, setVerbuchenError] = useState('');
  const [baustellenMap, setBaustellenMap] = useState<Record<string, string>>({});

  // Baustellen aus Controlling laden (nur Namen für Anzeige)
  useEffect(() => {
    supabase.from('baustellen').select('id,name').then(({ data }) => {
      if (data) setBaustellenMap(Object.fromEntries(data.map((b: any) => [b.id, b.name])));
    });
  }, []);

  // Anfragen aus Handwerker-App laden
  const { data: anfragen = [], isLoading, refetch } = useQuery<Anfrage[]>({
    queryKey: ['stunden-anfragen'],
    queryFn: () => appFetch('zeiteintraege?order=erstellt_am.desc&limit=300'),
    refetchInterval: 30000, // alle 30s aktualisieren
  });

  const counts = {
    offen:     anfragen.filter(a => a.status === 'offen').length,
    genehmigt: anfragen.filter(a => a.status === 'genehmigt').length,
    abgelehnt: anfragen.filter(a => a.status === 'abgelehnt').length,
    verbucht:  anfragen.filter(a => a.status === 'verbucht').length,
  };

  const gefiltert = anfragen.filter(a => a.status === filter);

  const handleGenehmigen = async (id: string, kommentar: string) => {
    await appFetch(`zeiteintraege?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'genehmigt', admin_kommentar: kommentar || null, bearbeitet_am: new Date().toISOString() }),
    });
    toast.success('Genehmigt ✓');
    refetch();
  };

  const handleAblehnen = async (id: string, kommentar: string) => {
    await appFetch(`zeiteintraege?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'abgelehnt', admin_kommentar: kommentar || null, bearbeitet_am: new Date().toISOString() }),
    });
    toast.error('Abgelehnt');
    refetch();
  };

  // ── VERBUCHEN: schreibt ins Controlling (nur nach Modal-Bestätigung) ────────
  const handleVerbuchenBestaetigt = async () => {
    if (!verbuchenAnfrage) return;
    const a = verbuchenAnfrage;
    setVerbuchenLoading(true);
    setVerbuchenError('');

    try {
      if (a.typ === 'baustelle' && a.controlling_baustelle_id) {
        // → bs_stundeneintraege
        const { error: e1 } = await supabase.from('bs_stundeneintraege').insert({
          baustelle_id: a.controlling_baustelle_id,
          mitarbeiter_id: a.controlling_employee_id,
          datum: a.datum,
          stunden: a.stunden,
          beschreibung: a.beschreibung || `App-Eintrag: ${a.mitarbeiter_name}`,
        });
        if (e1) throw new Error(e1.message);

        // → bs_fotos (Vorher)
        if (a.foto_vorher) {
          const { error: e2 } = await supabase.from('bs_fotos').insert({
            baustelle_id: a.controlling_baustelle_id,
            url: a.foto_vorher,
            kategorie: 'vorher',
            datum: a.datum,
            hochgeladen_von: a.controlling_employee_id,
            beschreibung: `Vorher – ${a.mitarbeiter_name}`,
          });
          if (e2) throw new Error(e2.message);
        }

        // → bs_fotos (Nachher)
        if (a.foto_nachher) {
          const { error: e3 } = await supabase.from('bs_fotos').insert({
            baustelle_id: a.controlling_baustelle_id,
            url: a.foto_nachher,
            kategorie: 'nachher',
            datum: a.datum,
            hochgeladen_von: a.controlling_employee_id,
            beschreibung: `Nachher – ${a.mitarbeiter_name}`,
          });
          if (e3) throw new Error(e3.message);
        }
      } else {
        // Ticket / DGUV / Sonstiges → interne_stunden
        const prefix = a.typ === 'ticket' ? 'Ticket' : a.typ === 'dguv' ? 'DGUV' : 'Sonstiges';
        const { error: e4 } = await supabase.from('interne_stunden').insert({
          employee_id: a.controlling_employee_id,
          datum: a.datum,
          stunden: a.stunden,
          beschreibung: `${prefix} – ${a.beschreibung || a.mitarbeiter_name}`,
        });
        if (e4) throw new Error(e4.message);
      }

      // Status in Handwerker-App auf verbucht setzen
      await appFetch(`zeiteintraege?id=eq.${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verbucht', bearbeitet_am: new Date().toISOString() }),
      });

      toast.success('Erfolgreich ins Controlling verbucht ✓');
      setVerbuchenAnfrage(null);
      refetch();
    } catch (err: any) {
      setVerbuchenError(err.message || 'Unbekannter Fehler');
    } finally {
      setVerbuchenLoading(false);
    }
  };

  const TABS: Array<{ key: typeof filter; label: string; color: string }> = [
    { key: 'offen',     label: 'Offen',     color: '#d97706' },
    { key: 'genehmigt', label: 'Genehmigt', color: '#059669' },
    { key: 'verbucht',  label: 'Verbucht',  color: '#2563eb' },
    { key: 'abgelehnt', label: 'Abgelehnt', color: '#dc2626' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>
      {/* Verbuchen Modal */}
      {verbuchenAnfrage && (
        <VerbuchenModal
          anfrage={verbuchenAnfrage}
          baustellenName={verbuchenAnfrage.controlling_baustelle_id ? (baustellenMap[verbuchenAnfrage.controlling_baustelle_id] || '') : ''}
          onConfirm={handleVerbuchenBestaetigt}
          onCancel={() => { setVerbuchenAnfrage(null); setVerbuchenError(''); }}
          loading={verbuchenLoading}
          error={verbuchenError}
        />
      )}

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.8)', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(255,255,255,0.9)', border: '1px solid #e2e8f0', borderRadius: 10, color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Zurück
        </button>
        <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={16} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#0f172a', letterSpacing: '-0.02em' }}>Stunden-Anfragen</p>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Handwerker-App · Genehmigung & Verbuchung</p>
          </div>
        </div>
        {counts.offen > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', border: '1px solid #fde047', borderRadius: 20, padding: '5px 14px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706', boxShadow: '0 0 6px #d97706' }} />
            <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>{counts.offen} offen</span>
          </div>
        )}
        <button onClick={() => refetch()}
          style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.9)', border: '1px solid #e2e8f0', borderRadius: 10, color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ↻ Aktualisieren
        </button>
      </div>

      {/* Inhalt */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              style={{
                padding: '10px 20px', border: filter === tab.key ? `2px solid ${tab.color}` : '2px solid #e2e8f0',
                borderRadius: 12, background: filter === tab.key ? tab.color + '12' : '#fff',
                color: filter === tab.key ? tab.color : '#64748b', fontSize: 14, fontWeight: filter === tab.key ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
              }}>
              {tab.label}
              {counts[tab.key] > 0 && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: tab.color, color: '#fff', fontWeight: 700 }}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 15 }}>Lade Anfragen...</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <Clock size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 15, margin: 0 }}>Keine {filter}en Anfragen</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {gefiltert.map(a => (
              <AnfrageKarte
                key={a.id}
                anfrage={a}
                baustellenMap={baustellenMap}
                onGenehmigen={handleGenehmigen}
                onAblehnen={handleAblehnen}
                onVerbuchen={setVerbuchenAnfrage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
