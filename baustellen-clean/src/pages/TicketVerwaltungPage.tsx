import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Search, TrendingDown, Calendar, Layers, Building2,
  Zap, StickyNote, X, FileDown, Filter
} from 'lucide-react';

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────
function fmt(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
}
function ageDays(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function ageColor(days: number) {
  if (days <= 7)  return '#64748b';
  if (days <= 14) return '#f59e0b';
  if (days <= 30) return '#ef4444';
  return '#b91c1c';
}
function getKW(dateStr: string) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

const GW: Record<string, { bg: string; text: string; border: string }> = {
  Hochbau: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  Elektro: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
};

// ─── Notiz-Modal ─────────────────────────────────────────────────────────────
function NoteModal({ ticket, existingNote, onClose, onSave }: {
  ticket: any; existingNote: string; onClose: () => void; onSave: (note: string) => void;
}) {
  const [val, setVal] = useState(existingNote);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Begründung / Notiz</p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{ticket.a_nummer}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#64748b' }}>
            <X size={14} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
          z.B. „Warte auf Lieferung", „Termin KW16", „Liegt beim Kunden zur Unterschrift"
        </p>
        <textarea
          value={val}
          onChange={e => setVal(e.target.value)}
          rows={4}
          placeholder="Begründung eingeben..."
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 10, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#0f172a' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>
            Abbrechen
          </button>
          <button onClick={() => { onSave(val); onClose(); }} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#0f172a', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Monatsblock ─────────────────────────────────────────────────────────────
function MonatBlock({ ym, tickets, notes, onErledige, onNoteOpen, loading, gewerkFilter }: {
  ym: string; tickets: any[]; notes: Record<string, string>;
  onErledige: (ids: string[]) => void;
  onNoteOpen: (ticket: any) => void;
  loading: boolean; gewerkFilter: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() =>
    tickets.filter(t =>
      (!search || t.a_nummer.toLowerCase().includes(search.toLowerCase())) &&
      (gewerkFilter === 'all' || t.gewerk === gewerkFilter)
    ), [tickets, search, gewerkFilter]);

  const overdue = tickets.filter(t => ageDays(t.eingangsdatum) > 14).length;
  const hbCount = tickets.filter(t => t.gewerk === 'Hochbau').length;
  const elCount = tickets.filter(t => t.gewerk === 'Elektro').length;
  const withNote = tickets.filter(t => notes[t.id]).length;
  const urgency = overdue > 10 ? '#ef4444' : overdue > 3 ? '#f59e0b' : '#e2e8f0';
  const oldest = tickets.reduce((a: any, t: any) => !a || t.eingangsdatum < a.eingangsdatum ? t : a, null);

  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((t: any) => t.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function doErledige(ids: string[]) { onErledige(ids); setSelected(new Set()); }

  return (
    <div style={{ background: '#fff', border: `1px solid ${open ? urgency : '#f1f5f9'}`, borderLeft: `4px solid ${urgency}`, borderRadius: 14, overflow: 'hidden', transition: 'all .2s', boxShadow: open ? '0 4px 20px rgba(0,0,0,0.06)' : 'none' }}>

      {/* Kopfzeile */}
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 70px 70px 70px 140px', alignItems: 'center', gap: 10, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ color: '#94a3b8' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{monthLabel(ym)}</p>
          {oldest && <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Ältestes: {fmt(oldest.eingangsdatum)} · {ageDays(oldest.eingangsdatum)} Tage</p>}
        </div>
        {[
          { val: tickets.length, label: 'Offen',    color: '#3b82f6' },
          { val: hbCount,        label: 'Hochbau',  color: '#15803d' },
          { val: elCount,        label: 'Elektro',  color: '#1d4ed8' },
          { val: overdue,        label: '>14 Tage', color: overdue > 0 ? '#ef4444' : '#94a3b8' },
          { val: withNote,       label: 'mit Notiz', color: withNote > 0 ? '#8b5cf6' : '#94a3b8' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
            <p style={{ fontSize: 9, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</p>
          </div>
        ))}
        <div onClick={e => e.stopPropagation()}>
          <button
            onClick={() => doErledige(tickets.map((t: any) => t.id))}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 10, color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#10b981'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#059669'; }}
          >
            <CheckCircle size={13} /> Alle erledigen
          </button>
        </div>
      </div>

      {/* Detail */}
      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: '#f8fafc', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="A-Nummer suchen..." style={{ width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            {selected.size > 0 && (
              <button onClick={() => doErledige([...selected])} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <CheckCircle size={13} /> {selected.size} erledigen
              </button>
            )}
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 150px 90px 110px 60px 50px 1fr 36px', gap: 0, padding: '8px 20px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid #f1f5f9' }}>
            <div><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></div>
            <div>A-Nummer</div><div>Gewerk</div><div>Eingang</div><div>Alter</div><div>KW</div><div>Begründung / Notiz</div><div></div>
          </div>

          {/* Zeilen */}
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Keine Tickets gefunden</div>
          ) : filtered.map((t: any, i: number) => {
            const days = ageDays(t.eingangsdatum);
            const col  = ageColor(days);
            const gw   = GW[t.gewerk] ?? { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
            const sel  = selected.has(t.id);
            const note = notes[t.id] ?? '';
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '32px 150px 90px 110px 60px 50px 1fr 36px', alignItems: 'center', gap: 0, padding: '9px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none', background: sel ? '#f0fdf4' : days > 14 ? '#fff7f7' : '#fff' }}>
                <div><input type="checkbox" checked={sel} onChange={() => toggleOne(t.id)} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{t.a_nummer}</div>
                <div><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: gw.bg, color: gw.text, border: `1px solid ${gw.border}` }}>{t.gewerk}</span></div>
                <div style={{ fontSize: 12, color: '#374151' }}>{fmt(t.eingangsdatum)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{days}T</span>
                  {days > 14 && <AlertTriangle size={11} color="#ef4444" />}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>KW{getKW(t.eingangsdatum)}</div>
                {/* Notiz-Feld */}
                <div style={{ fontSize: 11, color: note ? '#7c3aed' : '#cbd5e1', fontStyle: note ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {note || '— keine Begründung hinterlegt'}
                </div>
                {/* Notiz bearbeiten + Erledigt */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => onNoteOpen(t)}
                    title="Notiz bearbeiten"
                    style={{ padding: '4px 6px', border: `1px solid ${note ? '#ddd6fe' : '#e2e8f0'}`, borderRadius: 6, background: note ? '#f5f3ff' : '#f8fafc', color: note ? '#7c3aed' : '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#7c3aed'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = note ? '#f5f3ff' : '#f8fafc'; (e.currentTarget as HTMLElement).style.color = note ? '#7c3aed' : '#94a3b8'; }}
                  >
                    <StickyNote size={11} />
                  </button>
                  <button
                    onClick={() => doErledige([t.id])}
                    title="Erledigt"
                    style={{ padding: '4px 6px', border: '1px solid #d1fae5', borderRadius: 6, background: '#f0fdf4', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#10b981'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#059669'; }}
                  >
                    <CheckCircle size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportVerwaltungPDF(
  tickets: any[],
  notes: Record<string, string>,
  gewerkFilter: string
) {
  const C = {
    navy:   [15, 31, 61]    as [number,number,number],
    accent: [59, 130, 246]  as [number,number,number],
    green:  [21, 128, 61]   as [number,number,number],
    greenL: [220, 252, 231] as [number,number,number],
    blue:   [29, 78, 216]   as [number,number,number],
    blueL:  [219, 234, 254] as [number,number,number],
    red:    [220, 38, 38]   as [number,number,number],
    amber:  [217, 119, 6]   as [number,number,number],
    purple: [124, 58, 237]  as [number,number,number],
    white:  [255, 255, 255] as [number,number,number],
    light:  [248, 250, 252] as [number,number,number],
    border: [226, 232, 240] as [number,number,number],
    gray:   [100, 116, 139] as [number,number,number],
    text:   [51,  65,  85]  as [number,number,number],
  };

  const filtered = gewerkFilter === 'all'
    ? tickets
    : tickets.filter(t => t.gewerk === gewerkFilter);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  function addHeader(subtitle: string) {
    doc.setFillColor(...C.navy); doc.rect(0, 0, 210, 14, 'F');
    doc.setFillColor(...C.accent); doc.rect(0, 14, 210, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text('WIDI · TICKET-VERWALTUNG · KLINIKUM', 14, 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(subtitle, 14, 11);
    doc.text(`${dateStr}  ·  ${timeStr} Uhr`, 196, 6, { align: 'right' });
    const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.text(`Seite ${pg}`, 196, 11, { align: 'right' });
  }

  function addFooter() {
    doc.setDrawColor(...C.border); doc.line(14, 284, 196, 284);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text('Vertraulich · Nur für interne Verwendung', 14, 288);
    doc.text('WIDI Baustellen-Management', 196, 288, { align: 'right' });
  }

  function ageDays(dateStr: string) {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }
  function fmt(d: string) {
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  }
  function getKW(dateStr: string) {
    const d = new Date(dateStr);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  }
  function monthLabel(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  }

  // ── Kennzahlen berechnen ──
  const total   = filtered.length;
  const hbCount = filtered.filter(t => t.gewerk === 'Hochbau').length;
  const elCount = filtered.filter(t => t.gewerk === 'Elektro').length;
  const overdue = filtered.filter(t => ageDays(t.eingangsdatum) > 14).length;
  const withNoteCount = filtered.filter(t => notes[t.id]).length;

  // ── SEITE 1: Übersicht ────────────────────────────────────────────────────
  addHeader(gewerkFilter === 'all' ? 'Alle Gewerke' : `Gewerk: ${gewerkFilter}`);

  let y = 22;

  // Titel-Block
  doc.setFillColor(...C.navy);
  doc.roundedRect(14, y, 182, 24, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.setTextColor(...C.white);
  doc.text('Ticket-Rückstandsbericht', 20, y + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(`Klinikum · Stand: ${dateStr}  ·  ${gewerkFilter === 'all' ? 'Alle Gewerke' : 'Gewerk: ' + gewerkFilter}`, 20, y + 17);
  y += 30;

  // KPI-Kacheln
  const kpis = [
    { label: 'Offen gesamt',    val: String(total),    color: C.accent },
    { label: 'Hochbau offen',   val: String(hbCount),  color: C.green },
    { label: 'Elektro offen',   val: String(elCount),  color: C.blue },
    { label: 'Überfällig >14T', val: String(overdue),  color: overdue > 0 ? C.red : C.gray },
    { label: 'Mit Begründung',  val: String(withNoteCount), color: C.purple },
  ];
  const kpiW = 182 / kpis.length;
  kpis.forEach((k, i) => {
    const x = 14 + i * kpiW;
    doc.setFillColor(...C.light); doc.roundedRect(x + (i > 0 ? 1.5 : 0), y, kpiW - (i > 0 ? 3 : 1.5), 18, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.gray);
    doc.text(k.label, x + (i > 0 ? 4 : 2.5), y + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...k.color);
    doc.text(k.val, x + (i > 0 ? 4 : 2.5), y + 14);
  });
  y += 24;

  // Fortschrittsbalken Hochbau / Elektro
  if (total > 0) {
    [
      { label: 'Hochbau', count: hbCount, color: C.green, bg: C.greenL },
      { label: 'Elektro', count: elCount, color: C.blue,  bg: C.blueL },
    ].forEach(g => {
      const pct = Math.round((g.count / total) * 100);
      const barW = 130;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...g.color);
      doc.text(`${g.label}  `, 14, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
      doc.text(`${g.count} Tickets · ${pct}% der Rückstände`, 38, y + 4);
      doc.setFillColor(...C.border); doc.roundedRect(14, y + 6, barW, 5, 1, 1, 'F');
      if (pct > 0) { doc.setFillColor(...g.bg); doc.roundedRect(14, y + 6, barW * pct / 100, 5, 1, 1, 'F'); }
      y += 14;
    });
  }
  y += 4;

  // ── Monatstabelle Übersicht ──
  doc.setFillColor(...C.light); doc.rect(14, y, 182, 7, 'F');
  doc.setFillColor(...C.accent); doc.rect(14, y, 3, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C.navy);
  doc.text('Übersicht nach Monat', 20, y + 5);
  y += 11;

  const byMonth: Record<string, any[]> = {};
  for (const t of filtered) {
    const ym = (t.eingangsdatum as string).slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = [];
    byMonth[ym].push(t);
  }
  const sortedMonths = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));

  autoTable(doc, {
    startY: y,
    head: [['Monat', 'Gesamt offen', 'Hochbau', 'Elektro', 'davon >14 Tage', 'mit Begründung']],
    body: sortedMonths.map(([ym, tix]) => {
      const hb = tix.filter(t => t.gewerk === 'Hochbau').length;
      const el = tix.filter(t => t.gewerk === 'Elektro').length;
      const od = tix.filter(t => ageDays(t.eingangsdatum) > 14).length;
      const wn = tix.filter(t => notes[t.id]).length;
      return [monthLabel(ym), String(tix.length), String(hb), String(el), String(od), String(wn)];
    }),
    foot: [['Gesamt', String(total), String(hbCount), String(elCount), String(overdue), String(withNoteCount)]],
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: C.text },
    footStyles: { fillColor: C.light, textColor: C.navy, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.light },
    columnStyles: {
      1: { halign: 'center', fontStyle: 'bold' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const v = parseInt(String(data.cell.raw));
        if (v > 10) data.cell.styles.textColor = C.red;
        else if (v > 0) data.cell.styles.textColor = C.amber;
      }
    },
    margin: { left: 14, right: 14 },
  });

  addFooter();

  // ── SEITE 2+: Detail-Tabellen pro Monat ──────────────────────────────────
  for (const [ym, tix] of sortedMonths) {
    doc.addPage();
    addHeader(`${monthLabel(ym)} · ${tix.length} offene Tickets`);

    let dy = 22;

    // Monat-Header
    doc.setFillColor(...C.navy); doc.roundedRect(14, dy, 182, 12, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.white);
    doc.text(monthLabel(ym), 20, dy + 8);
    const hbM = tix.filter(t => t.gewerk === 'Hochbau').length;
    const elM = tix.filter(t => t.gewerk === 'Elektro').length;
    const odM = tix.filter(t => ageDays(t.eingangsdatum) > 14).length;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`${tix.length} offen  ·  Hochbau: ${hbM}  ·  Elektro: ${elM}  ·  Überfällig >14T: ${odM}`, 196, dy + 8, { align: 'right' });
    dy += 16;

    autoTable(doc, {
      startY: dy,
      head: [['A-Nummer', 'Gewerk', 'Eingang', 'Alter', 'KW', 'Begründung / Notiz']],
      body: tix.map(t => {
        const days = ageDays(t.eingangsdatum);
        return [
          t.a_nummer,
          t.gewerk,
          fmt(t.eingangsdatum),
          `${days} Tage`,
          `KW${getKW(t.eingangsdatum)}`,
          notes[t.id] || '—',
        ];
      }),
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: C.text },
      alternateRowStyles: { fillColor: C.light },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 22 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 'auto', textColor: C.purple as [number,number,number] },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index === 1) {
            const v = String(data.cell.raw);
            data.cell.styles.textColor = v === 'Hochbau' ? C.green : C.blue;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 3) {
            const days = parseInt(String(data.cell.raw));
            if (days > 30) data.cell.styles.textColor = C.red;
            else if (days > 14) data.cell.styles.textColor = C.amber;
          }
          if (data.column.index === 5 && String(data.cell.raw) !== '—') {
            data.cell.styles.textColor = C.purple;
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    addFooter();
  }

  const filterSuffix = gewerkFilter === 'all' ? 'Alle' : gewerkFilter;
  const dateSuffix = now.toISOString().slice(0, 10);
  doc.save(`Ticket-Rueckstand_${filterSuffix}_${dateSuffix}.pdf`);
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function TicketVerwaltungPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [globalSearch, setGlobalSearch] = useState('');
  const [gewerkFilter, setGewerkFilter] = useState('all');
  const [noteModal, setNoteModal] = useState<{ ticket: any; note: string } | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['verwaltung-alle'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').eq('status', 'in_bearbeitung').order('eingangsdatum', { ascending: true });
      return data ?? [];
    },
  });

  const { data: notesRaw = [] } = useQuery({
    queryKey: ['ticket-notes-alle'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_notes').select('ticket_id, note').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  // Neueste Notiz pro Ticket
  const notes: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of notesRaw as any[]) {
      if (!map[n.ticket_id]) map[n.ticket_id] = n.note;
    }
    return map;
  }, [notesRaw]);

  const erledigeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from('tickets').update({ status: 'erledigt' }).in('id', ids);
    },
    onSuccess: (_: any, ids: string[]) => {
      toast.success(`${ids.length} Ticket${ids.length > 1 ? 's' : ''} erledigt`);
      qc.invalidateQueries({ queryKey: ['verwaltung-alle'] });
      qc.invalidateQueries({ queryKey: ['open-ticket-count'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const savNoteMutation = useMutation({
    mutationFn: async ({ ticketId, note }: { ticketId: string; note: string }) => {
      // Alte Notiz löschen, neue einfügen
      await supabase.from('ticket_notes').delete().eq('ticket_id', ticketId);
      if (note.trim()) {
        await supabase.from('ticket_notes').insert({
          ticket_id: ticketId,
          note: note.trim(),
          created_by: user?.id,
        });
      }
    },
    onSuccess: () => {
      toast.success('Notiz gespeichert');
      qc.invalidateQueries({ queryKey: ['ticket-notes-alle'] });
    },
  });

  const byMonth = useMemo(() => {
    const f = tickets.filter((t: any) =>
      (!globalSearch || t.a_nummer.toLowerCase().includes(globalSearch.toLowerCase())) &&
      (gewerkFilter === 'all' || t.gewerk === gewerkFilter)
    );
    const map: Record<string, any[]> = {};
    // Für Monatsblöcke immer ALLE Tickets des Monats zeigen (Filter nur innerhalb)
    for (const t of tickets as any[]) {
      const ym = (t.eingangsdatum as string).slice(0, 7);
      if (!map[ym]) map[ym] = [];
      map[ym].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [tickets, globalSearch, gewerkFilter]);

  // KPI-Zahlen
  const total    = tickets.length;
  const hbTotal  = tickets.filter((t: any) => t.gewerk === 'Hochbau').length;
  const elTotal  = tickets.filter((t: any) => t.gewerk === 'Elektro').length;
  const overdue  = tickets.filter((t: any) => ageDays(t.eingangsdatum) > 14).length;
  const withNote = Object.keys(notes).length;
  const oldest   = tickets[0] as any;

  const openNoteModal = useCallback((ticket: any) => {
    setNoteModal({ ticket, note: notes[ticket.id] ?? '' });
  }, [notes]);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1200 }}>

      {/* Titel */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Ticket-Verwaltung</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Offene Tickets · nach Monat gruppiert · Begründungen hinterlegbar</p>
      </div>

      {/* KPI-Kacheln */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Offen gesamt',    val: total,    color: '#3b82f6', bg: '#eff6ff', icon: <Layers size={16} /> },
          { label: 'Hochbau offen',   val: hbTotal,  color: '#15803d', bg: '#f0fdf4', icon: <Building2 size={16} /> },
          { label: 'Elektro offen',   val: elTotal,  color: '#1d4ed8', bg: '#eff6ff', icon: <Zap size={16} /> },
          { label: 'Überfällig >14T', val: overdue,  color: '#ef4444', bg: '#fff1f2', icon: <AlertTriangle size={16} /> },
          { label: 'Mit Begründung',  val: withNote, color: '#7c3aed', bg: '#faf5ff', icon: <StickyNote size={16} /> },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Fortschrittsbalken Hochbau / Elektro */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Hochbau', offen: hbTotal, color: '#15803d', bg: '#dcfce7', track: '#f0fdf4' },
          { label: 'Elektro', offen: elTotal, color: '#1d4ed8', bg: '#93c5fd', track: '#eff6ff' },
        ].map(g => {
          const pct = total > 0 ? Math.round((g.offen / total) * 100) : 0;
          return (
            <div key={g.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{g.offen} offen · {pct}% der Gesamtrückstände</span>
              </div>
              <div style={{ height: 8, background: g.track, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: g.bg, borderRadius: 99, border: `1px solid ${g.color}30`, transition: 'width .5s' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Suche + Filter + Export */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Alle Monate nach A-Nummer durchsuchen..."
            style={{ width: '100%', paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Gewerk-Filter Buttons */}
        <div style={{ display: 'flex', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 4 }}>
          {[
            { val: 'all',     label: 'Alle',    color: '#0f172a' },
            { val: 'Hochbau', label: 'Hochbau', color: '#15803d' },
            { val: 'Elektro', label: 'Elektro', color: '#1d4ed8' },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => setGewerkFilter(opt.val)}
              style={{
                padding: '6px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                background: gewerkFilter === opt.val ? '#fff' : 'transparent',
                color: gewerkFilter === opt.val ? opt.color : '#94a3b8',
                boxShadow: gewerkFilter === opt.val ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* PDF Export Button */}
        <button
          onClick={() => exportVerwaltungPDF(tickets, notes, gewerkFilter)}
          disabled={tickets.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12,
            fontSize: 13, fontWeight: 600, cursor: tickets.length === 0 ? 'not-allowed' : 'pointer',
            opacity: tickets.length === 0 ? 0.5 : 1, whiteSpace: 'nowrap', transition: 'all .15s',
          }}
          onMouseEnter={e => { if (tickets.length > 0) (e.currentTarget as HTMLElement).style.background = '#1e293b'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}
        >
          <FileDown size={15} /> PDF exportieren
        </button>
      </div>

      {/* Monats-Blöcke */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Laden…</div>
      ) : byMonth.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9' }}>
          <CheckCircle size={40} color="#10b981" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>Alles erledigt!</p>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Keine offenen Tickets vorhanden.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byMonth.map(([ym, tix]) => (
            <MonatBlock
              key={ym}
              ym={ym}
              tickets={tix}
              notes={notes}
              onErledige={ids => erledigeMutation.mutate(ids)}
              onNoteOpen={openNoteModal}
              loading={erledigeMutation.isPending}
              gewerkFilter={gewerkFilter}
            />
          ))}
        </div>
      )}

      {/* Notiz-Modal */}
      {noteModal && (
        <NoteModal
          ticket={noteModal.ticket}
          existingNote={noteModal.note}
          onClose={() => setNoteModal(null)}
          onSave={note => savNoteMutation.mutate({ ticketId: noteModal.ticket.id, note })}
        />
      )}
    </div>
  );
}
