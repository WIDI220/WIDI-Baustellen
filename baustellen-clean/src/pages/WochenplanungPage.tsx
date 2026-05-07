import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

// Feste Breiten — ändern sich NIE
const COL_MA   = 160;  // Mitarbeiter-Spalte, sticky
const COL_TAG  = 140;  // jede Tag-Spalte, fest
const MAX_H    = 8;    // max Stunden pro Tag
const MIN_H    = 0.25;

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

// ── Pool-Item ──────────────────────────────────────────────────────────────
function PoolItemRow({ item, onDragStart, onDragEnd }: {
  item: PoolItem; onDragStart: () => void; onDragEnd: () => void;
}) {
  const aNrMatch = item.label.match(/^\[?(A\d{2}-?\d{4,6})\]?\s*/);
  const aNr  = aNrMatch ? aNrMatch[1] : null;
  const name = aNr ? item.label.replace(/^\[?A\d{2}-?\d{4,6}\]?\s*/, '') : item.label;

  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title={item.label}
      style={{ padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, borderLeft: `3px solid ${item.farbe}`, cursor: 'grab', userSelect: 'none', transition: 'box-shadow .15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 10px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}>
      {aNr && <div style={{ fontSize: 9, fontWeight: 700, color: item.farbe, letterSpacing: '.05em', marginBottom: 1 }}>{aNr}</div>}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', lineHeight: 1.35, wordBreak: 'break-word' }}>{name || item.label}</div>
      {item.sub && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>{item.sub}</div>}
    </div>
  );
}

// ── Einzelner Block (horizontal resize) ───────────────────────────────────
function PlanBlockEl({ block, onDelete, onUpdateStunden, cellW }: {
  block: PlanBlock; onDelete: () => void; onUpdateStunden: (h: number) => void; cellW: number;
}) {
  const farbe = TYP_FARBE[block.typ] ?? '#64748b';
  const resizeRef = useRef<{ startX: number; startH: number } | null>(null);
  const [localH, setLocalH] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const h = localH ?? block.stunden;
  const availW = Math.max(COL_TAG - 8, cellW - 8);
  const blockW = Math.max(28, Math.min(availW, (h / MAX_H) * availW));

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startH: block.stunden };
    const pxPerH = availW / MAX_H;

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      setLocalH(roundH(Math.max(MIN_H, Math.min(MAX_H, resizeRef.current.startH + dx / pxPerH))));
    };
    const onUp = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const newH = roundH(Math.max(MIN_H, Math.min(MAX_H, resizeRef.current.startH + dx / pxPerH)));
      resizeRef.current = null; setLocalH(null);
      onUpdateStunden(newH);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="wp-block"
      style={{ width: blockW, height: 26, background: farbe, borderRadius: 6, marginBottom: 3, position: 'relative', display: 'flex', alignItems: 'center', paddingLeft: 6, paddingRight: 18, boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,.15)', overflow: 'hidden', flexShrink: 0, transition: localH !== null ? 'none' : 'width .08s' }}>

      {/* Label */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={block.bezeichnung}>
        {block.bezeichnung}
      </div>

      {/* Stunden */}
      {editing ? (
        <input autoFocus value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={() => { const v = parseFloat(editVal.replace(',','.')); if (!isNaN(v) && v > 0) onUpdateStunden(Math.min(MAX_H, v)); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', right: 10, width: 30, fontSize: 9, padding: '1px 2px', borderRadius: 3, border: 'none', background: 'rgba(255,255,255,0.3)', color: '#fff', outline: 'none' }} />
      ) : (
        <span onClick={e => { e.stopPropagation(); setEditVal(String(h)); setEditing(true); }}
          style={{ position: 'absolute', right: 10, fontSize: 9, color: 'rgba(255,255,255,0.92)', background: 'rgba(0,0,0,0.18)', padding: '1px 3px', borderRadius: 3, cursor: 'text', whiteSpace: 'nowrap', flexShrink: 0 }}
          title="Klicken zum Bearbeiten">
          {h}h
        </span>
      )}

      {/* Löschen */}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} className="wp-del"
        style={{ position: 'absolute', top: 1, right: 1, width: 12, height: 12, borderRadius: 2, background: 'rgba(0,0,0,0.3)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s', padding: 0 }}>
        <Trash2 size={7} style={{ color: '#fff' }} />
      </button>

      {/* Resize-Griff rechts */}
      <div onMouseDown={onResizeStart} title="Ziehen = Stunden anpassen"
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', background: 'rgba(0,0,0,0.2)', borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1, height: 8, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
      </div>
    </div>
  );
}

// ── Hauptkomponente ────────────────────────────────────────────────────────
export default function WochenplanungPage() {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragging, setDragging]     = useState<{ item: PoolItem } | null>(null);
  const [dragOver, setDragOver]     = useState<string | null>(null);

  const days  = getWeekDays(weekOffset);
  const kw    = getKW(days[0]);
  const today = toISO(new Date());
  const von   = toISO(days[0]);
  const bis   = toISO(days[6]);

  const { data: employees = [] } = useQuery({
    queryKey: ['wp-employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id,name,kuerzel').eq('aktiv', true).order('name'); return data ?? []; },
  });
  const { data: baustellen = [] } = useQuery({
    queryKey: ['wp-baustellen'],
    queryFn: async () => { const { data } = await supabase.from('baustellen').select('id,name,typ,status').in('status', ['offen','in_bearbeitung','nicht_gestartet']).order('name'); return data ?? []; },
  });
  const { data: planBlocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ['wp-blocks', weekOffset],
    queryFn: async () => { const { data } = await supabase.from('wochenplanung').select('*').gte('datum', von).lte('datum', bis); return (data ?? []) as PlanBlock[]; },
  });

  // Pool
  const bs = baustellen as any[];
  const pool: { section: string; items: PoolItem[] }[] = [
    { section: 'Baustellen intern', items: bs.filter(b => b.typ !== 'extern').map(b => ({ id: b.id, label: b.name, sub: b.status === 'nicht_gestartet' ? 'Noch nicht gestartet' : b.status, typ: 'baustelle' as Typ, farbe: b.status === 'nicht_gestartet' ? '#64748b' : '#2563eb', baustelle_id: b.id })) },
    { section: 'Baustellen extern', items: bs.filter(b => b.typ === 'extern').map(b => ({ id: b.id, label: b.name, sub: 'Extern', typ: 'extern' as Typ, farbe: '#e11d48', baustelle_id: b.id })) },
    { section: 'Tätigkeiten', items: [
      { id: 'tickets',  label: 'Tickets',        typ: 'tickets',  farbe: '#10b981' },
      { id: 'intern',   label: 'Interne Stunden', typ: 'intern',   farbe: '#8b5cf6' },
      { id: 'dguv',     label: 'DGUV-Messungen',  typ: 'dguv',     farbe: '#0891b2' },
      { id: 'begehung', label: 'Begehung',         typ: 'begehung', farbe: '#f59e0b' },
    ] as PoolItem[] },
  ];

  const handleDrop = useCallback(async (maId: string, datum: string) => {
    if (!dragging) return;
    const { item } = dragging;
    setDragging(null); setDragOver(null);

    const { data: wp, error } = await supabase.from('wochenplanung').insert({
      mitarbeiter_id: maId, datum, typ: item.typ,
      baustelle_id: item.baustelle_id ?? null,
      bezeichnung: item.label, stunden: 8,
    }).select().single();
    if (error) { toast.error('Fehler beim Speichern'); return; }

    if ((item.typ === 'baustelle' || item.typ === 'extern') && item.baustelle_id) {
      const { data: bse } = await supabase.from('bs_stundeneintraege').insert({
        baustelle_id: item.baustelle_id, mitarbeiter_id: maId, datum, stunden: 8, beschreibung: '[Planung]',
      }).select('id').single();
      if (bse) await supabase.from('wochenplanung').update({ bs_eintrag_id: bse.id }).eq('id', wp.id);
    }
    toast.success(`${item.label} eingeplant`);
    refetchBlocks();
  }, [dragging, refetchBlocks]);

  const updateStunden = useCallback(async (block: PlanBlock, newH: number) => {
    const h = roundH(Math.max(MIN_H, Math.min(MAX_H, newH)));
    await supabase.from('wochenplanung').update({ stunden: h }).eq('id', block.id);
    if (block.bs_eintrag_id) await supabase.from('bs_stundeneintraege').update({ stunden: h }).eq('id', block.bs_eintrag_id);
    refetchBlocks();
  }, [refetchBlocks]);

  const deleteBlock = useCallback(async (block: PlanBlock) => {
    await supabase.from('wochenplanung').delete().eq('id', block.id);
    if (block.bs_eintrag_id) await supabase.from('bs_stundeneintraege').delete().eq('id', block.bs_eintrag_id);
    toast.success('Eintrag gelöscht');
    refetchBlocks();
  }, [refetchBlocks]);

  const emps = employees as any[];
  const gesamtH = (planBlocks as PlanBlock[]).reduce((s, b) => s + Number(b.stunden), 0);
  function maStunden(maId: string) { return (planBlocks as PlanBlock[]).filter(b => b.mitarbeiter_id === maId).reduce((s, b) => s + Number(b.stunden), 0); }
  function auslFarbe(h: number) { return h > 40 ? '#ef4444' : h >= 32 ? '#f59e0b' : '#10b981'; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Inter',system-ui,sans-serif", background: '#f8fafc' }}>
      <style>{`
        .wp-block:hover .wp-del { opacity: 1 !important; }
        @keyframes blockIn { from{opacity:0;transform:scaleX(0.85)} to{opacity:1;transform:scaleX(1)} }
        .wp-block { animation: blockIn .1s ease; transform-origin: left; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>← Startseite</button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
              Wochenplanung <span style={{ color: '#6366f1' }}>KW {kw}</span>
            </h1>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{fmtDate(days[0])} – {fmtDate(days[6])} {days[0].getFullYear()} · {gesamtH.toFixed(1)}h geplant</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Legende */}
          <div style={{ display: 'flex', gap: 8, marginRight: 12, flexWrap: 'wrap' }}>
            {Object.entries(TYP_FARBE).map(([t, f]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: f }} />{TYP_LABEL[t as Typ]}
              </div>
            ))}
          </div>
          <button onClick={() => setWeekOffset(o => o - 1)} style={{ padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b' }}><ChevronLeft size={14} /></button>
          <button onClick={() => setWeekOffset(0)} style={{ padding: '7px 14px', background: weekOffset === 0 ? '#6366f1' : '#f8fafc', border: `1px solid ${weekOffset === 0 ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', color: weekOffset === 0 ? '#fff' : '#64748b', fontSize: 12, fontWeight: 600 }}>Heute</button>
          <button onClick={() => setWeekOffset(o => o + 1)} style={{ padding: '7px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', color: '#64748b' }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Pool */}
        <div style={{ width: 260, flexShrink: 0, background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 10px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px 4px' }}>Ziehen &amp; Ablegen</p>
          {pool.map(section => (
            <div key={section.section} style={{ marginBottom: 18 }}>
              {section.items.length > 0 && (
                <>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 6px 4px' }}>{section.section}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {section.items.map(item => (
                      <PoolItemRow key={item.id} item={item}
                        onDragStart={() => setDragging({ item })}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Kalender — scroll-Container */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: COL_MA + 7 * COL_TAG }}>
            {/* Feste Spaltenbreiten */}
            <colgroup>
              <col style={{ width: COL_MA, minWidth: COL_MA }} />
              {days.map((_, i) => <col key={i} />)}
            </colgroup>

            {/* Header — sticky */}
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#fff', boxShadow: '0 1px 0 #e2e8f0' }}>
                {/* MA-Header sticky links */}
                <th style={{ width: COL_MA, minWidth: COL_MA, maxWidth: COL_MA, padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', background: '#fff', borderRight: '1px solid #e2e8f0', position: 'sticky', left: 0, zIndex: 11 }}>
                  Mitarbeiter
                </th>
                {days.map((d, i) => {
                  const iso = toISO(d);
                  const isToday = iso === today;
                  return (
                    <th key={i} style={{ minWidth: 100, padding: '10px 6px', textAlign: 'center', background: isToday ? 'rgba(99,102,241,0.06)' : '#fff', borderRight: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? '#6366f1' : '#64748b' }}>{DAYS_KURZ[i]}</div>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#6366f1' : '#0f172a' }}>{fmtDate(d)}</div>
                      {isToday && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', margin: '2px auto 0' }} />}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Zeilen — ein Mitarbeiter pro Zeile */}
            <tbody>
              {emps.map((ma: any) => {
                const wH = maStunden(ma.id);
                return (
                  <tr key={ma.id} style={{ borderBottom: '1px solid #f1f5f9' }}>

                    {/* MA-Zelle sticky links — FESTE Breite, kein overflow */}
                    <td style={{
                      width: COL_MA, minWidth: COL_MA, maxWidth: COL_MA,
                      padding: '8px 10px', borderRight: '1px solid #e2e8f0',
                      verticalAlign: 'middle', background: '#fff',
                      position: 'sticky', left: 0, zIndex: 2,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#2563eb', flexShrink: 0 }}>
                          {ma.kuerzel?.slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ma.name.split(' ')[0]}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ma.name.split(' ').slice(1).join(' ')}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: auslFarbe(wH), flexShrink: 0 }}>{wH > 0 ? `${wH}h` : ''}</div>
                      </div>
                    </td>

                    {/* Tag-Zellen — alle exakt COL_TAG breit */}
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
                            minWidth: 100,
                            padding: '4px', verticalAlign: 'top',
                            borderRight: '1px solid #e2e8f0',
                            minHeight: 40,
                            background: isDragOver ? 'rgba(99,102,241,0.08)' : isToday ? 'rgba(99,102,241,0.02)' : 'transparent',
                            outline: isDragOver ? '2px dashed #6366f1' : 'none',
                            outlineOffset: -2,
                            cursor: dragging ? 'copy' : 'default',
                            transition: 'background .1s',
                            overflow: 'hidden', // WICHTIG: nichts dehnt die Zelle
                          }}>
                          {cellBlocks.map(block => (
                            <PlanBlockEl key={block.id} block={block}
                              onDelete={() => deleteBlock(block)}
                              onUpdateStunden={h => updateStunden(block, h)}
                              cellW={COL_TAG} />
                          ))}
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
