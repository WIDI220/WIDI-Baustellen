import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Trash2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Typen ─────────────────────────────────────────────────────────────────
type Typ = 'baustelle' | 'extern' | 'tickets' | 'intern' | 'dguv' | 'begehung';

interface PoolItem {
  id: string;
  label: string;
  sub?: string;
  typ: Typ;
  farbe: string;
  baustelle_id?: string;
}

interface PlanBlock {
  id: string;
  mitarbeiter_id: string;
  datum: string;
  typ: Typ;
  baustelle_id?: string;
  bezeichnung: string;
  stunden: number;
  bs_eintrag_id?: string;
}

// ── Farben ────────────────────────────────────────────────────────────────
const TYP_FARBE: Record<Typ, string> = {
  baustelle: '#2563eb',
  extern:    '#e11d48',
  tickets:   '#10b981',
  intern:    '#8b5cf6',
  dguv:      '#0891b2',
  begehung:  '#f59e0b',
};
const TYP_LABEL: Record<Typ, string> = {
  baustelle: 'Baustelle',
  extern:    'Ext. Ticket',
  tickets:   'Tickets',
  intern:    'Intern',
  dguv:      'DGUV',
  begehung:  'Begehung',
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────
function getMonday(offset: number): Date {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d;
}
function getWeekDays(offset: number): Date[] {
  const mon = getMonday(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}
function getKW(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dn);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(d: Date): string {
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.`;
}
function roundH(h: number): number { return Math.round(h * 4) / 4; }

const DAYS_KURZ = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// ── Hauptkomponente ───────────────────────────────────────────────────────
export default function WochenplanungPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragging, setDragging] = useState<{item: PoolItem} | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [stundenInput, setStundenInput] = useState<Record<string,string>>({});

  const days = getWeekDays(weekOffset);
  const kw   = getKW(days[0]);
  const today = toISO(new Date());

  // ── Queries ───────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ['wp-employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const { data: baustellen = [] } = useQuery({
    queryKey: ['wp-baustellen'],
    queryFn: async () => {
      const { data } = await supabase.from('baustellen')
        .select('id,name,typ,status')
        .in('status', ['offen','in_bearbeitung','nicht_gestartet'])
        .order('name');
      return data ?? [];
    },
  });

  const von = toISO(days[0]);
  const bis = toISO(days[6]);

  const { data: planBlocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ['wp-blocks', weekOffset],
    queryFn: async () => {
      const { data } = await supabase.from('wochenplanung')
        .select('*')
        .gte('datum', von)
        .lte('datum', bis);
      return (data ?? []) as PlanBlock[];
    },
  });

  // ── Pool aufbauen ─────────────────────────────────────────────────────
  const bs = baustellen as any[];
  const pool: { section: string; items: PoolItem[] }[] = [
    {
      section: 'Baustellen intern',
      items: bs.filter(b => b.typ !== 'extern').map(b => ({
        id: b.id, label: b.name, sub: b.status, typ: 'baustelle' as Typ,
        farbe: b.status === 'nicht_gestartet' ? '#64748b' : '#2563eb',
        baustelle_id: b.id,
      })),
    },
    {
      section: 'Baustellen extern',
      items: bs.filter(b => b.typ === 'extern').map(b => ({
        id: b.id, label: b.name, sub: 'Extern', typ: 'extern' as Typ,
        farbe: '#e11d48', baustelle_id: b.id,
      })),
    },
    {
      section: 'Tätigkeiten',
      items: [
        { id: 'tickets',  label: 'Tickets',         typ: 'tickets',  farbe: '#10b981' },
        { id: 'intern',   label: 'Interne Stunden',  typ: 'intern',   farbe: '#8b5cf6' },
        { id: 'dguv',     label: 'DGUV-Messungen',   typ: 'dguv',     farbe: '#0891b2' },
        { id: 'begehung', label: 'Begehung',          typ: 'begehung', farbe: '#f59e0b' },
      ] as PoolItem[],
    },
  ];

  // ── Drop-Handler ─────────────────────────────────────────────────────
  const handleDrop = useCallback(async (maId: string, datum: string) => {
    if (!dragging) return;
    const { item } = dragging;
    setDragging(null);
    setDragOver(null);

    const stunden = 8;

    // In wochenplanung eintragen
    const { data: wp, error: wpErr } = await supabase.from('wochenplanung').insert({
      mitarbeiter_id: maId,
      datum,
      typ: item.typ,
      baustelle_id: item.baustelle_id ?? null,
      bezeichnung: item.label,
      stunden,
    }).select().single();

    if (wpErr) { toast.error('Fehler beim Speichern'); return; }

    // Nur Baustellen schreiben in bs_stundeneintraege
    if ((item.typ === 'baustelle' || item.typ === 'extern') && item.baustelle_id) {
      const { data: bs_entry } = await supabase.from('bs_stundeneintraege').insert({
        baustelle_id: item.baustelle_id,
        mitarbeiter_id: maId,
        datum,
        stunden,
        beschreibung: '[Planung]',
      }).select('id').single();

      if (bs_entry) {
        await supabase.from('wochenplanung').update({ bs_eintrag_id: bs_entry.id }).eq('id', wp.id);
      }
    }

    toast.success(`${item.label} eingeplant`);
    refetchBlocks();
  }, [dragging, refetchBlocks]);

  // ── Stunden ändern ────────────────────────────────────────────────────
  const updateStunden = useCallback(async (block: PlanBlock, newH: number) => {
    const h = roundH(Math.max(0.25, Math.min(24, newH)));
    await supabase.from('wochenplanung').update({ stunden: h }).eq('id', block.id);
    if (block.bs_eintrag_id) {
      await supabase.from('bs_stundeneintraege').update({ stunden: h }).eq('id', block.bs_eintrag_id);
    }
    refetchBlocks();
  }, [refetchBlocks]);

  // ── Block löschen ─────────────────────────────────────────────────────
  const deleteBlock = useCallback(async (block: PlanBlock) => {
    await supabase.from('wochenplanung').delete().eq('id', block.id);
    if (block.bs_eintrag_id) {
      await supabase.from('bs_stundeneintraege').delete().eq('id', block.bs_eintrag_id);
    }
    toast.success('Eintrag gelöscht');
    refetchBlocks();
  }, [refetchBlocks]);

  const emps = employees as any[];

  // ── Auslastung pro MA pro Woche ───────────────────────────────────────
  function maStunden(maId: string): number {
    return (planBlocks as PlanBlock[])
      .filter(b => b.mitarbeiter_id === maId)
      .reduce((s, b) => s + Number(b.stunden), 0);
  }
  function auslastungFarbe(h: number): string {
    if (h > 40) return '#ef4444';
    if (h >= 32) return '#f59e0b';
    return '#10b981';
  }

  const gesamtStunden = (planBlocks as PlanBlock[]).reduce((s, b) => s + Number(b.stunden), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: '#f8fafc' }}>
      <style>{`
        .wp-drag-item { cursor: grab; transition: all .15s; }
        .wp-drag-item:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.1); }
        .wp-drag-item:active { cursor: grabbing; }
        .wp-cell-hover { background: rgba(99,102,241,0.08) !important; }
        .wp-block:hover .wp-del { opacity: 1 !important; }
        @keyframes blockIn { from{opacity:0;transform:scaleY(0.8)} to{opacity:1;transform:scaleY(1)} }
        .wp-block { animation: blockIn .15s ease; transform-origin: top; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            ← Startseite
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
              Wochenplanung <span style={{ color: '#6366f1' }}>KW {kw}</span>
            </h1>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
              {fmtDate(days[0])} – {fmtDate(days[6])} {days[0].getFullYear()} · {gesamtStunden.toFixed(1)}h geplant
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Legende */}
          <div style={{ display: 'flex', gap: 10, marginRight: 12 }}>
            {Object.entries(TYP_FARBE).map(([typ, farbe]) => (
              <div key={typ} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: farbe }} />
                {TYP_LABEL[typ as Typ]}
              </div>
            ))}
          </div>
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 13 }}><ChevronLeft size={14} /></button>
          <button onClick={() => setWeekOffset(0)} style={{ padding: '7px 14px', background: weekOffset === 0 ? '#6366f1' : '#f8fafc', border: `1px solid ${weekOffset === 0 ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', color: weekOffset === 0 ? '#fff' : '#64748b', fontSize: 12, fontWeight: 600 }}>Heute</button>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 13 }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Pool */}
        <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 10px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px 4px' }}>Ziehen & Ablegen</p>
          {pool.map(section => (
            <div key={section.section} style={{ marginBottom: 16 }}>
              {(section.items.length > 0) && (
                <>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 5px 4px' }}>{section.section}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {section.items.map(item => (
                      <div key={item.id} className="wp-drag-item"
                        draggable
                        onDragStart={() => setDragging({ item })}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, borderLeft: `3px solid ${item.farbe}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>{item.label}</div>
                          {item.sub && <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.sub}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Kalender */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#fff', boxShadow: '0 1px 0 #e2e8f0' }}>
                {/* MA Spalte */}
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', width: 130, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
                  Mitarbeiter
                </th>
                <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textAlign: 'center', width: 48, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
                  Wo.
                </th>
                {days.map((d, i) => {
                  const iso = toISO(d);
                  const isToday = iso === today;
                  return (
                    <th key={i} style={{ padding: '10px 6px', textAlign: 'center', background: isToday ? 'rgba(99,102,241,0.06)' : '#fff', borderRight: '1px solid #e2e8f0', minWidth: 110 }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? '#6366f1' : '#64748b' }}>{DAYS_KURZ[i]}</div>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#6366f1' : '#0f172a' }}>{fmtDate(d)}</div>
                      {isToday && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', margin: '3px auto 0' }} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {emps.map((ma: any) => {
                const wH = maStunden(ma.id);
                return (
                  <tr key={ma.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {/* MA Name */}
                    <td style={{ padding: '8px 10px', borderRight: '1px solid #e2e8f0', verticalAlign: 'top', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#2563eb', flexShrink: 0 }}>
                          {ma.kuerzel?.slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ma.name.split(' ')[0]}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ma.name.split(' ').slice(1).join(' ')}</div>
                        </div>
                      </div>
                    </td>
                    {/* Wochenstunden */}
                    <td style={{ padding: '8px 4px', textAlign: 'center', borderRight: '1px solid #e2e8f0', verticalAlign: 'top', background: '#fff' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: auslastungFarbe(wH) }}>{wH > 0 ? `${wH}h` : '–'}</div>
                    </td>
                    {/* Tages-Zellen */}
                    {days.map((d, di) => {
                      const iso = toISO(d);
                      const cellKey = `${ma.id}-${iso}`;
                      const isToday = iso === today;
                      const cellBlocks = (planBlocks as PlanBlock[]).filter(b => b.mitarbeiter_id === ma.id && b.datum === iso);
                      const isDragOver = dragOver === cellKey;
                      return (
                        <td key={di}
                          onDragOver={e => { e.preventDefault(); setDragOver(cellKey); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleDrop(ma.id, iso)}
                          style={{
                            padding: '4px', verticalAlign: 'top', borderRight: '1px solid #e2e8f0',
                            minHeight: 60, background: isDragOver ? 'rgba(99,102,241,0.08)' : isToday ? 'rgba(99,102,241,0.02)' : 'transparent',
                            transition: 'background .1s', cursor: dragging ? 'copy' : 'default',
                            outline: isDragOver ? '2px dashed #6366f1' : 'none', outlineOffset: -2,
                          }}>
                          {cellBlocks.map(block => {
                            const farbe = TYP_FARBE[block.typ] ?? '#64748b';
                            const bKey = block.id;
                            const editing = stundenInput[bKey] !== undefined;
                            return (
                              <div key={block.id} className="wp-block"
                                style={{ background: farbe, borderRadius: 6, padding: '4px 6px', marginBottom: 3, position: 'relative' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 14 }} title={block.bezeichnung}>
                                  {block.bezeichnung}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  {editing ? (
                                    <input
                                      autoFocus
                                      value={stundenInput[bKey]}
                                      onChange={e => setStundenInput(s => ({ ...s, [bKey]: e.target.value }))}
                                      onBlur={() => {
                                        const v = parseFloat(stundenInput[bKey]);
                                        if (!isNaN(v)) updateStunden(block, v);
                                        setStundenInput(s => { const n = { ...s }; delete n[bKey]; return n; });
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setStundenInput(s => { const n = { ...s }; delete n[bKey]; return n; });
                                      }}
                                      style={{ width: 36, fontSize: 10, padding: '1px 3px', borderRadius: 3, border: 'none', background: 'rgba(255,255,255,0.3)', color: '#fff', outline: 'none' }}
                                    />
                                  ) : (
                                    <span
                                      onClick={() => setStundenInput(s => ({ ...s, [bKey]: String(block.stunden) }))}
                                      style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', cursor: 'text', borderBottom: '1px dashed rgba(255,255,255,0.4)', paddingBottom: 1 }}
                                      title="Klicken zum Bearbeiten"
                                    >
                                      {Number(block.stunden).toFixed(1)}h
                                    </span>
                                  )}
                                </div>
                                <button className="wp-del"
                                  onClick={() => deleteBlock(block)}
                                  style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: 3, background: 'rgba(0,0,0,0.2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s', padding: 0 }}>
                                  <Trash2 size={8} style={{ color: '#fff' }} />
                                </button>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
