import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Search, CalendarDays, Clock, Trash2 } from 'lucide-react';

// ── Farben ────────────────────────────────────────────────────────────────
const STATUS_FARBE: Record<string, string> = {
  in_bearbeitung: '#2563eb',
  offen:          '#2563eb',
  nicht_gestartet:'#64748b',
};
const TYP_FARBE: Record<string, string> = {
  extern: '#e11d48',
  intern: '#2563eb',
};
function bsFarbe(bs: any): string {
  if (bs.typ === 'extern') return '#e11d48';
  if (bs.status === 'nicht_gestartet') return '#64748b';
  return '#2563eb';
}

const DAYS_KURZ = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const DAYS_LANG = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];

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
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}
function getKW(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dn);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - ys.getTime()) / 86400000) + 1) / 7);
}
function fmtDate(d: Date): string {
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.`;
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function roundH(h: number): number {
  return Math.round(h * 4) / 4;
}

// ── Typen ─────────────────────────────────────────────────────────────────
interface PlanBlock {
  id: string;          // lokale ID oder DB-ID
  ma_id: string;
  ma_kuerzel: string;
  dayIdx: number;      // 0=Mo .. 6=So
  datum: string;       // YYYY-MM-DD
  baustelle_id: string;
  bs_name: string;
  bs_farbe: string;
  stunden: number;
  db_id?: string;      // bs_stundeneintraege.id wenn gespeichert
}

// ── Hauptkomponente ───────────────────────────────────────────────────────
export default function WochenplanerPage() {
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<any>(null);
  const [blocks, setBlocks] = useState<PlanBlock[]>([]);
  const [status, setStatus] = useState('Baustelle auf Mitarbeiter ziehen · Balken-Rand zum Anpassen');
  const resizingRef = useRef<{ block: PlanBlock; startX: number; startH: number; cellW: number } | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const [, forceUpdate] = useState(0);

  const days = getWeekDays(weekOffset);
  const today = new Date(); today.setHours(0,0,0,0);

  // ── Daten laden ──────────────────────────────────────────────────────────
  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ['employees-planer'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name, kuerzel').eq('aktiv', true).order('name');
      return data ?? [];
    }
  });

  const { data: baustellen = [] } = useQuery({
    queryKey: ['baustellen-planer'],
    queryFn: async () => {
      const { data } = await supabase.from('baustellen')
        .select('id, name, status, typ, gewerk')
        .in('status', ['offen', 'in_bearbeitung', 'nicht_gestartet'])
        .order('name');
      return data ?? [];
    }
  });

  // Vorhandene Stunden für aktuelle Woche laden
  const vonStr = toISO(days[0]);
  const bisStr = toISO(days[6]);

  const { data: vorhandeneStunden = [] } = useQuery({
    queryKey: ['planer-stunden', vonStr, bisStr],
    queryFn: async () => {
      const { data } = await supabase.from('bs_stundeneintraege')
        .select('id, baustelle_id, mitarbeiter_id, datum, stunden, beschreibung, baustellen(name, status, typ), employees(kuerzel)')
        .gte('datum', vonStr).lte('datum', bisStr)
        .not('beschreibung', 'like', '%[manuell]%');
      return data ?? [];
    },
    staleTime: 0,
  });

  // Vorhandene Stunden → blocks synchronisieren
  useEffect(() => {
    const dbBlocks: PlanBlock[] = (vorhandeneStunden as any[]).map((s: any) => {
      const datum = s.datum;
      const d = new Date(datum + 'T00:00:00');
      const mon = getMonday(weekOffset);
      const dayIdx = Math.round((d.getTime() - mon.getTime()) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) return null;
      const bs = s.baustellen;
      return {
        id: 'db_' + s.id,
        db_id: s.id,
        ma_id: s.mitarbeiter_id,
        ma_kuerzel: s.employees?.kuerzel ?? '?',
        dayIdx,
        datum,
        baustelle_id: s.baustelle_id,
        bs_name: bs?.name ?? '?',
        bs_farbe: bsFarbe(bs ?? {}),
        stunden: Number(s.stunden),
      } as PlanBlock;
    }).filter(Boolean) as PlanBlock[];
    setBlocks(dbBlocks);
  }, [vorhandeneStunden, weekOffset]);

  // ── Block speichern ───────────────────────────────────────────────────────
  const saveBlock = useCallback(async (block: PlanBlock) => {
    if (block.db_id) {
      // Update
      await supabase.from('bs_stundeneintraege')
        .update({ stunden: roundH(block.stunden) })
        .eq('id', block.db_id);
    } else {
      // Insert
      const { data, error } = await supabase.from('bs_stundeneintraege').insert({
        baustelle_id: block.baustelle_id,
        mitarbeiter_id: block.ma_id,
        datum: block.datum,
        stunden: roundH(block.stunden),
        beschreibung: '[Planung]',
      }).select('id').single();
      if (error) throw error;
      if (data) {
        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, db_id: data.id, id: 'db_' + data.id } : b));
      }
    }
    qc.invalidateQueries({ queryKey: ['planer-stunden'] });
  }, [qc]);

  const deleteBlock = useCallback(async (block: PlanBlock) => {
    if (block.db_id) {
      await supabase.from('bs_stundeneintraege').delete().eq('id', block.db_id);
    }
    setBlocks(prev => prev.filter(b => b.id !== block.id));
    qc.invalidateQueries({ queryKey: ['planer-stunden'] });
    setStatus(`Eintrag entfernt`);
  }, [qc]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (ma: any, dayIdx: number) => {
    if (!dragging) return;
    const datum = toISO(days[dayIdx]);
    const existing = blocks.filter(b => b.ma_id === ma.id && b.dayIdx === dayIdx);
    const usedH = existing.reduce((s, b) => s + b.stunden, 0);
    if (usedH >= 8) { setStatus(`⚠ ${ma.kuerzel} ist an diesem Tag bereits voll (8h)`); return; }
    const addH = Math.min(2, 8 - usedH);
    const bs = dragging;
    const newBlock: PlanBlock = {
      id: 'new_' + Date.now(),
      ma_id: ma.id,
      ma_kuerzel: ma.kuerzel,
      dayIdx,
      datum,
      baustelle_id: bs.id,
      bs_name: bs.name,
      bs_farbe: bsFarbe(bs),
      stunden: addH,
    };
    setBlocks(prev => [...prev, newBlock]);
    setStatus(`${bs.name} → ${ma.kuerzel} · ${DAYS_LANG[dayIdx]} · ${addH}h — Rand ziehen zum Anpassen`);
    try {
      await saveBlock(newBlock);
      toast.success(`${addH}h auf ${bs.name} gebucht`);
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
      setBlocks(prev => prev.filter(b => b.id !== newBlock.id));
    }
  }, [dragging, blocks, days, saveBlock]);

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { block, startX, startH, cellW } = resizingRef.current;
      const dx = e.clientX - startX;
      const dh = dx / cellW * 8;
      const newH = Math.max(0.5, Math.min(8, roundH(startH + dh)));
      setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, stunden: newH } : b));
    };
    const onUp = async () => {
      if (!resizingRef.current) return;
      const block = resizingRef.current.block;
      const current = blocks.find(b => b.id === block.id);
      resizingRef.current = null;
      if (current) {
        setStatus(`${current.bs_name} · ${current.stunden}h gespeichert`);
        try { await saveBlock(current); } catch {}
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [blocks, saveBlock]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredBS = (baustellen as any[]).filter(bs => {
    if (!search) return true;
    const q = search.toLowerCase();
    return bs.name?.toLowerCase().includes(q) || bs.id?.toLowerCase().includes(q);
  });

  const mas = mitarbeiter as any[];
  const totalH = blocks.reduce((s, b) => s + b.stunden, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', fontFamily:"'Inter',system-ui,sans-serif", gap:0 }}>
      <style>{`
        .pl-ticket{cursor:grab;transition:transform .12s,box-shadow .12s;border-radius:10px;padding:9px 11px;}
        .pl-ticket:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.1);}
        .pl-ticket:active{cursor:grabbing;transform:scale(.97);}
        .pl-slot{transition:background .1s;}
        .pl-slot.over{outline:2px dashed #2563eb!important;outline-offset:-2px;background:#eff6ff!important;}
        .pl-block{border-radius:6px;position:relative;overflow:hidden;display:flex;align-items:center;gap:3px;padding:0 5px 0 6px;transition:box-shadow .12s;}
        .pl-block:hover{box-shadow:0 2px 8px rgba(0,0,0,.25);}
        .pl-resize{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.12);}
        .pl-resize:hover{background:rgba(255,255,255,.35);}
        .pl-del{opacity:0;transition:opacity .12s;cursor:pointer;color:rgba(255,255,255,.7);font-size:12px;padding:0 2px;flex-shrink:0;}
        .pl-block:hover .pl-del{opacity:1;}
        .pl-del:hover{color:#fff;}
        .wk-nav{border:0.5px solid #e2e8f0;border-radius:8px;padding:5px 12px;background:transparent;cursor:pointer;font-size:12px;color:#64748b;transition:background .1s;}
        .wk-nav:hover{background:#f1f5f9;}
      `}</style>

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #f1f5f9', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.02em' }}>
            Wochenplanung <span style={{ color:'#2563eb' }}>KW {getKW(days[0])}</span>
          </h1>
          <p style={{ fontSize:12, color:'#94a3b8', margin:'2px 0 0' }}>
            {fmtDate(days[0])} – {fmtDate(days[6])} {days[0].getFullYear()} · {totalH.toFixed(1)}h geplant
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className="wk-nav" onClick={() => setWeekOffset(w => w-1)}><ChevronLeft size={14} style={{ display:'inline', marginRight:2 }}/>Zurück</button>
          <button className="wk-nav" onClick={() => setWeekOffset(0)} style={{ fontWeight:600, color:'#0f172a' }}>Heute</button>
          <button className="wk-nav" onClick={() => setWeekOffset(w => w+1)}>Vor<ChevronRight size={14} style={{ display:'inline', marginLeft:2 }}/></button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Pool */}
        <div style={{ width:210, flexShrink:0, background:'#fff', borderRight:'1px solid #f1f5f9', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 12px 8px', borderBottom:'0.5px solid #f1f5f9' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:7 }}>Baustellen</div>
            <div style={{ position:'relative' }}>
              <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
                style={{ width:'100%', padding:'6px 8px 6px 24px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, background:'#f8fafc', outline:'none', fontFamily:'inherit' }}/>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:10, display:'flex', flexDirection:'column', gap:6 }}>
            {filteredBS.map((bs: any) => {
              const farbe = bsFarbe(bs);
              const wochH = blocks.filter(b => b.baustelle_id === bs.id).reduce((s, b) => s + b.stunden, 0);
              return (
                <div key={bs.id} className="pl-ticket"
                  style={{ background: farbe + '12', border:`1.5px solid ${farbe}45` }}
                  draggable
                  onDragStart={() => setDragging(bs)}
                  onDragEnd={() => setDragging(null)}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:9, fontWeight:700, color: farbe, fontFamily:'monospace', background: farbe+'18', padding:'1px 5px', borderRadius:3 }}>
                      {bs.status === 'nicht_gestartet' ? 'NOCH NICHT' : bs.typ === 'extern' ? 'EXTERN' : 'INTERN'}
                    </span>
                    <span style={{ fontSize:9, color:'#94a3b8' }}>{bs.gewerk?.[0]}</span>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom: wochH > 0 ? 4 : 0 }}>{bs.name}</div>
                  {wochH > 0 && (
                    <>
                      <div style={{ height:3, background:'#f1f5f9', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(wochH/40*100,100)}%`, background:farbe, borderRadius:2 }}/>
                      </div>
                      <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>{wochH}h diese Woche</div>
                    </>
                  )}
                </div>
              );
            })}
            {filteredBS.length === 0 && (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#94a3b8', fontSize:12 }}>Keine Baustellen</div>
            )}
          </div>

          {/* Farb-Legende */}
          <div style={{ padding:'10px 12px', borderTop:'0.5px solid #f1f5f9' }}>
            <div style={{ fontSize:10, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Legende</div>
            {[['#2563eb','Baustelle (intern)'],['#e11d48','Externes Ticket'],['#64748b','Noch nicht gestartet']].map(([c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, fontSize:11, color:'#64748b' }}>
                <div style={{ width:14, height:14, borderRadius:3, background:c, flexShrink:0 }}/>
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Kalender */}
        <div style={{ flex:1, overflow:'auto' }}>
          <table style={{ borderCollapse:'collapse', width:'100%', minWidth:700, tableLayout:'fixed' }}>
            <thead>
              <tr>
                <th style={{ width:72, padding:'10px 8px', textAlign:'left', borderBottom:'1px solid #f1f5f9', background:'#fafafa', position:'sticky', top:0, zIndex:2 }}>
                  <span style={{ fontSize:11, fontWeight:500, color:'#94a3b8' }}>MA</span>
                </th>
                {days.map((d, i) => {
                  const isToday = d.getTime() === today.getTime();
                  const isWE = i >= 5;
                  return (
                    <th key={i} style={{ padding:'10px 6px', textAlign:'center', borderBottom:'1px solid #f1f5f9', borderLeft:'0.5px solid #f1f5f9', background: isToday ? '#eff6ff' : isWE ? '#fafafa' : '#fafafa', position:'sticky', top:0, zIndex:2 }}>
                      <div style={{ fontSize:13, fontWeight: isToday ? 700 : 500, color: isToday ? '#2563eb' : isWE ? '#94a3b8' : '#374151' }}>{DAYS_KURZ[i]}</div>
                      <div style={{ fontSize:11, color: isToday ? '#3b82f6' : '#94a3b8' }}>{fmtDate(d)}</div>
                      {isToday && <div style={{ width:6, height:6, borderRadius:'50%', background:'#2563eb', margin:'3px auto 0' }}/>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mas.map((ma: any, mai: number) => (
                <tr key={ma.id} style={{ background: mai % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {/* MA Zelle */}
                  <td style={{ padding:'6px 8px', borderBottom:'0.5px solid #f1f5f9', verticalAlign:'middle' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {ma.kuerzel}
                      </div>
                      <div style={{ fontSize:11, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {ma.name.split(' ')[0]}
                      </div>
                    </div>
                  </td>

                  {/* Tag-Zellen */}
                  {days.map((d, di) => {
                    const isToday = d.getTime() === today.getTime();
                    const isWE = di >= 5;
                    const dayBlocks = blocks.filter(b => b.ma_id === ma.id && b.dayIdx === di);
                    const usedH = dayBlocks.reduce((s, b) => s + b.stunden, 0);
                    const slotKey = `${ma.id}_${di}`;

                    return (
                      <td key={di} className="pl-slot"
                        style={{ height:60, padding:4, borderBottom:'0.5px solid #f1f5f9', borderLeft:'0.5px solid #f1f5f9', verticalAlign:'top', position:'relative', background: isToday ? '#f8faff' : isWE ? '#fdfcfc' : 'transparent', cursor:'default' }}
                        onDragOver={e => { e.preventDefault(); if (dragOverRef.current !== slotKey) { dragOverRef.current = slotKey; forceUpdate(n => n+1); } }}
                        onDragLeave={() => { if (dragOverRef.current === slotKey) { dragOverRef.current = null; forceUpdate(n => n+1); } }}
                        onDrop={e => { e.preventDefault(); dragOverRef.current = null; forceUpdate(n => n+1); handleDrop(ma, di); }}
                        data-key={slotKey}>

                        {/* Highlight */}
                        {dragOverRef.current === slotKey && (
                          <div style={{ position:'absolute', inset:0, outline:'2px dashed #2563eb', outlineOffset:-2, background:'#eff6ff', borderRadius:2, pointerEvents:'none', zIndex:1 }}/>
                        )}

                        {/* Blöcke */}
                        <div style={{ display:'flex', flexWrap:'wrap', gap:2, marginBottom:6 }}>
                          {dayBlocks.map(blk => {
                            const pct = Math.max(Math.round(blk.stunden / 8 * 100), 14);
                            return (
                              <div key={blk.id} className="pl-block"
                                style={{ background: blk.bs_farbe, height:26, width:`${pct}%`, maxWidth:'100%', cursor:'default' }}>
                                <span style={{ fontSize:9, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, fontFamily:'monospace' }}>
                                  {blk.bs_name.length > 14 ? blk.bs_name.slice(0,13)+'…' : blk.bs_name}
                                </span>
                                <span style={{ fontSize:9, color:'rgba(255,255,255,.8)', flexShrink:0 }}>{blk.stunden}h</span>
                                <span className="pl-del" onClick={() => deleteBlock(blk)}>×</span>
                                <div className="pl-resize"
                                  onMouseDown={e => {
                                    e.stopPropagation(); e.preventDefault();
                                    const td = (e.currentTarget as HTMLElement).closest('td');
                                    resizingRef.current = { block: blk, startX: e.clientX, startH: blk.stunden, cellW: td?.offsetWidth ?? 120 };
                                  }}/>
                              </div>
                            );
                          })}
                        </div>

                        {/* Auslastungsbalken */}
                        <div style={{ position:'absolute', bottom:3, left:4, right:4, height:4, background:'#f1f5f9', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.min(usedH/8*100,100)}%`, background: usedH > 8 ? '#ef4444' : usedH >= 6 ? '#f59e0b' : '#10b981', borderRadius:2, transition:'width .3s' }}/>
                        </div>
                        {usedH > 0 && (
                          <div style={{ position:'absolute', bottom:5, right:5, fontSize:9, fontWeight:700, color: usedH > 8 ? '#ef4444' : usedH >= 6 ? '#f59e0b' : '#94a3b8' }}>
                            {usedH}h
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Bar */}
      <div style={{ background:'#fff', borderTop:'1px solid #f1f5f9', padding:'7px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <CalendarDays size={13} style={{ color:'#94a3b8' }}/>
        <span style={{ fontSize:11, color:'#64748b' }}>{status}</span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#94a3b8' }}>
            <div style={{ width:8, height:8, borderRadius:2, background:'#10b981' }}/> &lt;6h
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#94a3b8' }}>
            <div style={{ width:8, height:8, borderRadius:2, background:'#f59e0b' }}/> 6–8h
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#94a3b8' }}>
            <div style={{ width:8, height:8, borderRadius:2, background:'#ef4444' }}/> &gt;8h
          </div>
          <span style={{ fontSize:11, fontWeight:600, color:'#374151', borderLeft:'1px solid #f1f5f9', paddingLeft:12 }}>
            {totalH.toFixed(1)}h KW{getKW(days[0])}
          </span>
        </div>
      </div>
    </div>
  );
}
