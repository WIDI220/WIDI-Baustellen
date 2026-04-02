import { useState } from 'react';
import emailjs from '@emailjs/browser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, Trash2, Pencil, Clock, Plus, AlertTriangle, Mail, Send, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { logActivity } from '@/lib/activityLog';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg: 'bg-blue-100', text: 'text-blue-700' },
  { value: 'erledigt', label: 'Erledigt', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { value: 'zur_unterschrift', label: 'Zur Unterschrift', bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'abrechenbar', label: 'Abrechenbar', bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg: 'bg-gray-100', text: 'text-gray-600' },
];

const PAGE_SIZE = 50;

const EMAILJS_SERVICE = 'service_bhia75n';
const EMAILJS_TEMPLATE = 'template_s043jzj';
const EMAILJS_KEY = 'y7g5YcPgorv_NmH0y';

export default function TicketsPage() {
  const { user } = useAuth();
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [showNeu, setShowNeu] = useState(false);
  const [neuForm, setNeuForm] = useState({ a_nummer: '', gewerk: 'Hochbau', eingangsdatum: new Date().toISOString().split('T')[0] });
  const [neuLoading, setNeuLoading] = useState(false);

  async function exportTicketsExcel() {
    try {
      const [expYear, expMonth] = activeMonth.split('-').map(Number);
      const lastDay = new Date(expYear, expMonth, 0).getDate();
      const expFrom = `${activeMonth}-01`;
      const expTo   = `${activeMonth}-${String(lastDay).padStart(2,'0')}`;

      const STATUS_LABELS: Record<string,string> = {
        in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt',
        zur_unterschrift: 'Zur Unterschrift', abrechenbar: 'Abrechenbar', abgerechnet: 'Abgerechnet',
      };
      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '-';

      // Schritt 1: Alle Worklogs des Monats nach leistungsdatum
      // Erfasst auch Vormonat-Tickets die im Monat erledigt wurden
      const { data: wlData, error: wlErr } = await supabase
        .from('ticket_worklogs')
        .select('id, stunden, leistungsdatum, ticket_id, employees(name, kuerzel)')
        .gte('leistungsdatum', expFrom)
        .lte('leistungsdatum', expTo);
      if (wlErr) throw wlErr;

      // Schritt 2: Alle betroffenen Tickets laden
      const wlTicketIds = [...new Set((wlData ?? []).map((w: any) => w.ticket_id as string))];

      const { data: ticketsFromMonth, error: tErr1 } = await supabase
        .from('tickets').select('id, a_nummer, gewerk, status, eingangsdatum')
        .gte('eingangsdatum', expFrom).lte('eingangsdatum', expTo);
      if (tErr1) throw tErr1;

      const { data: ticketsFromWL, error: tErr2 } = wlTicketIds.length > 0
        ? await supabase.from('tickets').select('id, a_nummer, gewerk, status, eingangsdatum').in('id', wlTicketIds)
        : { data: [], error: null };
      if (tErr2) throw tErr2;

      // Zusammenführen + deduplizieren
      const ticketMap: Record<string, any> = {};
      for (const t of [...(ticketsFromMonth ?? []), ...(ticketsFromWL ?? [])]) {
        ticketMap[t.id] = t;
      }

      // Worklogs zu Tickets zuordnen
      const wlByTicket: Record<string, any[]> = {};
      for (const wl of (wlData ?? [])) {
        if (!wlByTicket[wl.ticket_id]) wlByTicket[wl.ticket_id] = [];
        wlByTicket[wl.ticket_id].push(wl);
      }

      const allTickets = Object.values(ticketMap)
        .map((t: any) => ({ ...t, ticket_worklogs: wlByTicket[t.id] ?? [] }))
        .sort((a: any, b: any) => (a.a_nummer || '').localeCompare(b.a_nummer || ''));

      if (allTickets.length === 0) {
        toast.error('Keine Tickets fuer ' + activeMonth);
        return;
      }

      // Header-Zeile
      const header = ['A-Nummer','Gewerk','Eingangsdatum','Status','Mitarbeiter (Kürzel)','Mitarbeiter (Name)','Stunden MA','Gesamt Stunden','Leistungsdatum','Anzahl MA'];
      
      // Zeilen + Metadaten für Formatierung sammeln
      type RowMeta = { data: any[]; isHeader: boolean; isFirst: boolean; hasMultiMA: boolean; colorGroup: number; };
      const rowsMeta: RowMeta[] = [{ data: header, isHeader: true, isFirst: false, hasMultiMA: false, colorGroup: 0 }];

      let colorGroup = 0;

      for (const t of allTickets) {
        const worklogs = (t.ticket_worklogs as any[]) || [];
        const gesamtH  = Math.round(worklogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0) * 4) / 4;
        const eingang  = fmtDate(t.eingangsdatum);
        const status   = STATUS_LABELS[t.status] ?? t.status ?? '–';
        const hasMulti = worklogs.length > 1;

        if (worklogs.length === 0) {
          rowsMeta.push({ data: [t.a_nummer, t.gewerk, eingang, status, '–', '–', '–', gesamtH || '–', '–', 0], isHeader: false, isFirst: true, hasMultiMA: false, colorGroup });
        } else {
          worklogs.forEach((w: any, idx: number) => {
            const kuerzel = w.employees?.kuerzel ?? '–';
            const name    = w.employees?.name    ?? '–';
            const stunden = Math.round(Number(w.stunden ?? 0) * 4) / 4;
            if (idx === 0) {
              rowsMeta.push({
                data: [t.a_nummer, t.gewerk, eingang, status, kuerzel, name, stunden, gesamtH, fmtDate(w.leistungsdatum), worklogs.length > 1 ? worklogs.length : ''],
                isHeader: false, isFirst: true, hasMultiMA: hasMulti, colorGroup,
              });
            } else {
              rowsMeta.push({
                data: ['', '', '', '', `  ↳ ${kuerzel}`, `  ${name}`, stunden, '', fmtDate(w.leistungsdatum), ''],
                isHeader: false, isFirst: false, hasMultiMA: hasMulti, colorGroup,
              });
            }
          });
        }
        colorGroup++;
      }

      // Workbook erstellen
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rowsMeta.map(r => r.data));

      // Spaltenbreiten
      ws['!cols'] = [
        { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 18 },
        { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
      ];

      // Zellen formatieren
      const COLORS = {
        header:    { bg: '1E3A5F', fg: 'FFFFFF' },
        multiEven: { bg: 'DBEAFE' }, // hellblau — gerade Gruppe mit mehreren MA
        multiOdd:  { bg: 'EFF6FF' }, // noch heller blau
        singleEven:{ bg: 'FFFFFF' },
        singleOdd: { bg: 'F8FAFC' },
        subRow:    { fg: '64748B' }, // grau für Folgezeilen
      };

      rowsMeta.forEach((row, rowIdx) => {
        const numCols = row.data.length;
        for (let col = 0; col < numCols; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: col });
          if (!ws[cellAddr]) ws[cellAddr] = { t: 's', v: '' };

          const isEven = row.colorGroup % 2 === 0;

          if (row.isHeader) {
            ws[cellAddr].s = {
              font: { bold: true, color: { rgb: COLORS.header.fg }, sz: 11 },
              fill: { patternType: 'solid', fgColor: { rgb: COLORS.header.bg } },
              alignment: { horizontal: 'center', vertical: 'center' },
            };
          } else if (row.hasMultiMA) {
            // Tickets mit mehreren MA — farbig hervorheben
            const bgColor = isEven ? COLORS.multiEven.bg : COLORS.multiOdd.bg;
            ws[cellAddr].s = {
              font: {
                bold: row.isFirst && col < 4,
                color: { rgb: row.isFirst ? '1E3A5F' : COLORS.subRow.fg },
                sz: 10,
              },
              fill: { patternType: 'solid', fgColor: { rgb: bgColor } },
              border: {
                top:    row.isFirst ? { style: 'thin', color: { rgb: 'BFDBFE' } } : undefined,
                bottom: { style: 'hair', color: { rgb: 'DBEAFE' } },
                left:   col === 0 ? { style: 'medium', color: { rgb: '3B82F6' } } : undefined,
              },
            };
          } else {
            // Normale Zeilen — abwechselnd weiß / sehr hell
            const bgColor = isEven ? COLORS.singleEven.bg : COLORS.singleOdd.bg;
            ws[cellAddr].s = {
              font: { bold: col < 2 && row.isFirst, sz: 10 },
              fill: { patternType: 'solid', fgColor: { rgb: bgColor } },
              border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
            };
          }
        }
      });

      // Erste Zeile höher
      ws['!rows'] = [{ hpt: 20 }];

      XLSX.utils.book_append_sheet(wb, ws, `Tickets ${activeMonth}`);
      XLSX.writeFile(wb, `Tickets_${activeMonth}.xlsx`);
      toast.success(`${allTickets.length} Tickets exportiert`);
    } catch(e: any) {
      toast.error('Export fehlgeschlagen: ' + e.message);
    }
  }

  async function ticketManuellAnlegen() {
    if (!neuForm.a_nummer.trim()) { toast.error('A-Nummer erforderlich'); return; }
    setNeuLoading(true);
    try {
      let a = neuForm.a_nummer.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^A\d{2}-\d{4,6}$/.test(a)) {
        const num = a.replace(/^A?\d{0,2}-?/, '');
        const year = new Date().getFullYear().toString().slice(-2);
        a = `A${year}-${num.padStart(5, '0')}`;
      }
      const { data: existing } = await supabase.from('tickets').select('id').eq('a_nummer', a).maybeSingle();
      if (existing) { toast.error(`${a} existiert bereits`); setNeuLoading(false); return; }
      const { error } = await supabase.from('tickets').insert({
        a_nummer: a, gewerk: neuForm.gewerk, status: 'in_bearbeitung',
        eingangsdatum: neuForm.eingangsdatum || null,
      });
      if (error) throw error;
      toast.success(`✅ ${a} angelegt`);
      setShowNeu(false);
      setNeuForm(f => ({ a_nummer: '', gewerk: f.gewerk, eingangsdatum: new Date().toISOString().split('T')[0] }));
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setNeuLoading(false);
    }
  }
  const [statusFilter, setStatusFilter] = useState('all');
  const [gewerkFilter, setGewerkFilter] = useState('all');
  const [stundenFilter, setStundenFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [monthFilter, setMonthFilter] = useState<'month'|'all'>('month');
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets-list', search, statusFilter, gewerkFilter, page, activeMonth, monthFilter],
    queryFn: async () => {
      let query = supabase.from('tickets')
        .select('*, ticket_worklogs(stunden, employees(name, kuerzel))', { count: 'exact' })
        .order('eingangsdatum', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (search) query = query.ilike('a_nummer', `%${search}%`);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (gewerkFilter !== 'all') query = query.eq('gewerk', gewerkFilter);
      if (monthFilter === 'month') {
        const [y, m] = activeMonth.split('-');
        const from = `${y}-${m}-01`;
        const to = `${y}-${m}-${String(new Date(parseInt(y), parseInt(m), 0).getDate()).padStart(2,'0')}`;
        query = query.gte('eingangsdatum', from).lte('eingangsdatum', to);
      }
      const { data, count, error } = await query;
      if (error) throw error;
      return { tickets: data ?? [], total: count ?? 0 };
    },
  });

  const tickets = (data?.tickets ?? []).filter((t: any) => {
    const wl = t.ticket_worklogs ?? [];
    const totalH = wl.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
    const hasMa = wl.some((w: any) => w.employees?.kuerzel);
    if (stundenFilter === 'mit_stunden') return totalH > 0 || hasMa;
    if (stundenFilter === 'ohne_stunden') return totalH === 0 && !hasMa;
    if (stundenFilter === 'erledigt_ohne') return (t.status === 'erledigt' || t.status === 'abrechenbar' || t.status === 'abgerechnet') && totalH === 0;
    return true;
  });
  const totalCount = stundenFilter === 'all' ? (data?.total ?? 0) : tickets.length;
  const totalPages = Math.ceil((stundenFilter === 'all' ? (data?.total ?? 0) : tickets.length) / PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('tickets').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_: any, ids: string[]) => {
      toast.success(`${ids.length} Ticket(s) gelöscht`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Alle Tickets gelöscht');
      setShowDeleteAll(false);
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const allSelected = tickets.length > 0 && tickets.every((t: any) => selected.has(t.id));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(tickets.map((t: any) => t.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleSendEmail = async () => {
    if (!emailTo) { toast.error('Bitte Empfänger-E-Mail eingeben'); return; }
    setSendingEmail(true);
    try {
      const STATUS_LABELS: Record<string,string> = {
        'in_bearbeitung': 'In Bearbeitung', 'erledigt': 'Erledigt',
        'zur_unterschrift': 'Zur Unterschrift', 'abrechenbar': 'Abrechenbar', 'abgerechnet': 'Abgerechnet',
      };
      const selectedTickets = tickets.filter((t: any) => selected.has(t.id));
      const ticketLines = selectedTickets.map((t: any) =>
        `• ${t.a_nummer} | ${t.gewerk ?? '–'} | ${STATUS_LABELS[t.status] ?? t.status} | Eingang: ${t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}`
      ).join('\n');
      const content = `${emailNote ? 'Anliegen:\n' + emailNote + '\n\n' : ''}Betroffene Tickets (${selectedTickets.length}):\n${ticketLines}\n\n---\nGesendet von WIDI Controlling System\n${new Date().toLocaleDateString('de-DE')}`;

      emailjs.init(EMAILJS_KEY);
      await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
        to_email: emailTo,
        to_name: emailTo,
        subject: emailSubject || `Rückmeldung zu ${selectedTickets.length} Ticket(s)`,
        content,
      });

      setEmailSent(true);
      toast.success('E-Mail erfolgreich gesendet!');
      setTimeout(() => {
        setShowEmail(false); setEmailSent(false);
        setEmailTo(''); setEmailNote(''); setEmailSubject('');
      }, 2000);
    } catch (e: any) {
      toast.error('E-Mail Fehler: ' + (e?.text ?? e?.message ?? 'Unbekannt'));
    } finally {
      setSendingEmail(false);
    }
  };

  const STATUS_COLORS: Record<string,{color:string;bg:string}> = {
    in_bearbeitung: {color:'#2563eb',bg:'#eff6ff'},
    erledigt:       {color:'#10b981',bg:'#f0fdf4'},
    zur_unterschrift:{color:'#f59e0b',bg:'#fffbeb'},
    abrechenbar:    {color:'#f97316',bg:'#fff7ed'},
    abgerechnet:    {color:'#6b7280',bg:'#f9fafb'},
  };



  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .tickets-header { animation: fadeUp 0.3s ease forwards; }
        .ticket-row:hover { background: #f8fafc !important; }
        .ticket-row.selected { background: #eff6ff !important; }
      `}</style>

      {/* Header */}
      <div className="tickets-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Tickets <span style={{ color:'#10b981' }}>{totalCount > 0 && `(${totalCount})`}</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>{totalCount} Tickets gefunden</p>
        </div>
        <button onClick={exportTicketsExcel}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, color:'#10b981', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .15s' }}>
          <FileDown size={14}/> Excel Export
        </button>
        <button onClick={() => setShowNeu(!showNeu)}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', background:'#10b981', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(16,185,129,.3)', transition:'all .15s' }}>
          <Plus className="h-4 w-4" /> Ticket anlegen
        </button>
      </div>

      {/* Manuelles Formular */}
      {showNeu && (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:16, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'#065f46', margin:0 }}>Neues Ticket manuell anlegen</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>A-Nummer *</label>
              <input
                type="text" placeholder="z.B. A26-01234"
                value={neuForm.a_nummer}
                onChange={e => setNeuForm(f => ({ ...f, a_nummer: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && ticketManuellAnlegen()}
                style={{ width:'100%', padding:'8px 12px', border:'1px solid #bbf7d0', borderRadius:10, fontSize:13, background:'#fff', color:'#0f172a' }}
              />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Gewerk</label>
              <select value={neuForm.gewerk} onChange={e => setNeuForm(f => ({ ...f, gewerk: e.target.value }))}
                style={{ width:'100%', padding:'8px 12px', border:'1px solid #bbf7d0', borderRadius:10, fontSize:13, background:'#fff', color:'#0f172a', appearance:'none' }}>
                <option value="Hochbau">Hochbau</option>
                <option value="Elektro">Elektro</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Eingangsdatum</label>
              <input type="date" value={neuForm.eingangsdatum} onChange={e => setNeuForm(f => ({ ...f, eingangsdatum: e.target.value }))}
                style={{ width:'100%', padding:'8px 12px', border:'1px solid #bbf7d0', borderRadius:10, fontSize:13, background:'#fff', color:'#0f172a' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={ticketManuellAnlegen} disabled={neuLoading}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', background:'#10b981', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', opacity: neuLoading ? 0.6 : 1 }}>
              {neuLoading ? '...' : <><Plus className="h-4 w-4" /> Anlegen</>}
            </button>
            <button onClick={() => setShowNeu(false)}
              style={{ padding:'9px 16px', background:'#fff', border:'1px solid #bbf7d0', borderRadius:10, fontSize:13, color:'#64748b', cursor:'pointer' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #f1f5f9', padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="A-Nummer suchen..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9 border-gray-200 rounded-xl" />
        </div>
        <Select value={monthFilter} onValueChange={(v: any) => { setMonthFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="month">Monat: {activeMonth}</SelectItem><SelectItem value="all">Alle Monate</SelectItem></SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Status</SelectItem>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={gewerkFilter} onValueChange={v => { setGewerkFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-9 rounded-xl border-gray-200"><SelectValue placeholder="Gewerk" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle</SelectItem><SelectItem value="Hochbau">Hochbau</SelectItem><SelectItem value="Elektro">Elektro</SelectItem></SelectContent>
        </Select>
        <Select value={stundenFilter} onValueChange={v => { setStundenFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[190px] h-9 rounded-xl border-gray-200"><SelectValue placeholder="Stunden" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Tickets</SelectItem>
            <SelectItem value="mit_stunden">✅ Mit Stunden / Mitarbeiter</SelectItem>
            <SelectItem value="ohne_stunden">⬜ Ohne Stunden / Mitarbeiter</SelectItem>
            <SelectItem value="erledigt_ohne">⚠️ Erledigt ohne Stunden</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (<>
          <Button variant="outline" size="sm" className="h-9 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
            onClick={() => { setEmailSubject(`Rückmeldung zu ${selected.size} Ticket(s)`); setShowEmail(true); }}>
            <Mail className="h-4 w-4 mr-1" />{selected.size} per E-Mail
          </Button>
          <Button variant="danger" size="sm" className="h-9 rounded-xl"
            onClick={() => { if (confirm(`${selected.size} löschen?`)) deleteMutation.mutate(Array.from(selected)); }}
            disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />{selected.size} löschen
          </Button>
        </>)}
        <Button variant="outline" size="sm" className="h-9 rounded-xl text-red-500 border-red-200 hover:bg-red-50 ml-auto"
          onClick={() => setShowDeleteAll(true)}>
          <Trash2 className="h-4 w-4 mr-1" />Alle löschen
        </Button>
      </div>

      {/* Tabelle */}
      <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #f1f5f9', background:'#fafafa' }}>
                <th style={{ padding:'12px 16px', width:40 }}><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>A-Nummer</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Gewerk</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Status</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Eingang</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Mitarbeiter</th>
                <th style={{ textAlign:'right', padding:'12px 16px', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Stunden</th>
                <th style={{ width:40 }}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} style={{ padding:'48px', textAlign:'center', color:'#cbd5e1' }}>Lädt...</td></tr>}
              {tickets.map((t: any) => {
                const wl = t.ticket_worklogs ?? [];
                const totalH = wl.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
                const ma = [...new Set(wl.map((w: any) => w.employees?.kuerzel).filter(Boolean))].join(', ');
                const st = STATUS_OPTIONS.find(s => s.value === t.status);
                const sc = STATUS_COLORS[t.status] ?? {color:'#94a3b8',bg:'#f1f5f9'};
                const isSelected = selected.has(t.id);
                return (
                  <tr key={t.id}
                    className={`ticket-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedTicket(t)}
                    style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', transition:'background .1s', background: isSelected ? '#eff6ff' : 'transparent' }}>
                    <td style={{ padding:'11px 16px' }} onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(t.id)} />
                    </td>
                    <td style={{ padding:'11px 16px', fontFamily:'monospace', fontWeight:800, color:'#0f172a', fontSize:13 }}>{t.a_nummer}</td>
                    <td style={{ padding:'11px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20,
                        background: t.gewerk==='Hochbau'?'#eff6ff':'#f0fdf4',
                        color: t.gewerk==='Hochbau'?'#1d4ed8':'#065f46' }}>
                        {t.gewerk}
                      </span>
                    </td>
                    <td style={{ padding:'11px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color }}>
                        {st?.label}
                      </span>
                    </td>
                    <td style={{ padding:'11px 16px', color:'#64748b', fontSize:12 }}>{t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}</td>
                    <td style={{ padding:'11px 16px' }}>
                      {ma
                        ? <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, background:'#f1f5f9', padding:'3px 8px', borderRadius:6, color:'#374151' }}>{ma}</span>
                        : <span style={{ color:'#e2e8f0' }}>–</span>}
                    </td>
                    <td style={{ padding:'11px 16px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: totalH>0?'#0f172a':'#e2e8f0' }}>
                      {totalH > 0 ? `${totalH}h` : '–'}
                    </td>
                    <td style={{ padding:'11px 16px' }} onClick={e => e.stopPropagation()}>
                      <button style={{ padding:'6px', borderRadius:8, border:'none', background:'transparent', cursor:'pointer', color:'#cbd5e1', transition:'all .15s' }}
                        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#f1f5f9';(e.currentTarget as HTMLElement).style.color='#374151';}}
                        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color='#cbd5e1';}}
                        onClick={() => setSelectedTicket(t)}>
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && !isLoading && (
                <tr><td colSpan={8} style={{ padding:'48px', textAlign:'center', color:'#cbd5e1', fontSize:14 }}>Keine Tickets gefunden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <button style={{ padding:'8px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', transition:'all .15s', opacity: page===0?0.4:1 }}
            disabled={page === 0} onClick={() => setPage(p => p - 1)}
            onMouseEnter={e=>{if(page>0)(e.currentTarget as HTMLElement).style.background='#f8fafc';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff';}}>
            <ChevronLeft size={16} style={{ color:'#374151' }} />
          </button>
          <span style={{ fontSize:13, color:'#64748b', padding:'0 8px' }}>Seite {page + 1} von {totalPages}</span>
          <button style={{ padding:'8px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', transition:'all .15s', opacity: page>=totalPages-1?0.4:1 }}
            disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            onMouseEnter={e=>{if(page<totalPages-1)(e.currentTarget as HTMLElement).style.background='#f8fafc';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#fff';}}>
            <ChevronRight size={16} style={{ color:'#374151' }} />
          </button>
        </div>
      )}

      {/* Alle löschen Dialog */}
      <Dialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" />Alle Tickets löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Diese Aktion löscht alle Tickets unwiderruflich!</p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteAll(false)}>Abbrechen</Button>
            <Button variant="danger" className="flex-1" onClick={() => deleteAllMutation.mutate()} disabled={deleteAllMutation.isPending}>
              {deleteAllMutation.isPending ? 'Löscht...' : 'Ja, alle löschen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* E-Mail Rückmeldung Dialog */}
      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />Rückmeldung per E-Mail
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Empfänger E-Mail</Label>
              <Input placeholder="empfaenger@beispiel.de" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Betreff</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Begründung / Anliegen</Label>
              <Textarea placeholder="Beschreiben Sie Ihr Anliegen zu den markierten Tickets..." value={emailNote} onChange={e => setEmailNote(e.target.value)} className="rounded-xl min-h-[100px]" />
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">Markierte Tickets ({selected.size}):</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {tickets.filter((t: any) => selected.has(t.id)).map((t: any) => {
                  const st = STATUS_OPTIONS.find(s => s.value === t.status);
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-mono font-bold text-[#1e3a5f]">{t.a_nummer}</span>
                      <span className="text-gray-400">{t.gewerk}</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
                      {t.eingangsdatum && <span className="text-gray-400 ml-auto">{new Date(t.eingangsdatum).toLocaleDateString('de-DE')}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowEmail(false)}>Abbrechen</Button>
              <Button className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700" onClick={handleSendEmail} disabled={sendingEmail || emailSent}>
                {sendingEmail ? 'Sendet...' : emailSent ? '✅ Gesendet!' : <><Send className="h-4 w-4 mr-1" />E-Mail senden</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => { setSelectedTicket(null); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); }}
          userId={user?.id}
        />
      )}
    </div>
  );
}

function TicketDetail({ ticket, onClose, userId }: { ticket: any; onClose: () => void; userId?: string }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [showStunden, setShowStunden] = useState(false);
  const [stundenForm, setStundenForm] = useState({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; } });
  const { data: notes = [] } = useQuery({ queryKey: ['ticket-notes', ticket.id], queryFn: async () => { const { data } = await supabase.from('ticket_notes').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false }); return data ?? []; } });
  const { data: worklogs = [], refetch: refetchWorklogs } = useQuery({ queryKey: ['ticket-worklogs', ticket.id], queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(name, kuerzel)').eq('ticket_id', ticket.id).order('leistungsdatum', { ascending: false }); return data ?? []; } });

  const totalHours = (worklogs as any[]).reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const st = STATUS_OPTIONS.find(s => s.value === ticket.status);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      await supabase.from('status_history').insert({ ticket_id: ticket.id, old_status: ticket.status, new_status: newStatus, changed_by: userId });
      const { error } = await supabase.from('tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, `Status geändert: ${ticket.a_nummer} → ${newStatus}`, 'ticket', ticket.id, { a_nummer: ticket.a_nummer, old_status: ticket.status, new_status: newStatus });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); toast.success('Status aktualisiert'); onClose(); },
  });

  const deleteTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tickets').delete().eq('id', ticket.id);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await logActivity(userData.user?.email, `Ticket gelöscht: ${ticket.a_nummer}`, 'ticket', ticket.id, { a_nummer: ticket.a_nummer });
    },
    onSuccess: () => { toast.success('Ticket gelöscht'); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); onClose(); },
  });

  const addNote = useMutation({
    mutationFn: async () => { if (!newNote.trim()) return; await supabase.from('ticket_notes').insert({ ticket_id: ticket.id, note: newNote.trim(), created_by: userId }); },
    onSuccess: () => { setNewNote(''); queryClient.invalidateQueries({ queryKey: ['ticket-notes', ticket.id] }); },
  });

  const addStunden = useMutation({
    mutationFn: async () => {
      if (!stundenForm.employee_id || !stundenForm.stunden) throw new Error('Mitarbeiter und Stunden erforderlich');
      const stunden = parseFloat(stundenForm.stunden.replace(',', '.'));
      if (isNaN(stunden) || stunden <= 0) throw new Error('Ungültige Stunden');
      const { error } = await supabase.from('ticket_worklogs').insert({ ticket_id: ticket.id, employee_id: stundenForm.employee_id, stunden, leistungsdatum: stundenForm.leistungsdatum });
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      const emp = (employees as any[]).find((e: any) => e.id === stundenForm.employee_id);
      await logActivity(userData.user?.email, `Stunden eingetragen: ${ticket.a_nummer} · ${emp?.name ?? '?'} · ${stunden}h`, 'ticket_worklog', ticket.id, { a_nummer: ticket.a_nummer, mitarbeiter: emp?.name, stunden, datum: stundenForm.leistungsdatum });
    },
    onSuccess: () => { toast.success('Stunden eingetragen'); setStundenForm({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] }); setShowStunden(false); refetchWorklogs(); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg flex items-center gap-3">
            {ticket.a_nummer}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 text-sm">
            <div><span className="text-gray-400">Gewerk:</span> <strong className="text-gray-700">{ticket.gewerk}</strong></div>
            <div><span className="text-gray-400">Eingang:</span> <strong className="text-gray-700">{ticket.eingangsdatum ? new Date(ticket.eingangsdatum).toLocaleDateString('de-DE') : '–'}</strong></div>
            <div><span className="text-gray-400">Stunden:</span> <strong className="text-[#1e3a5f]">{totalHours}h</strong></div>
            <div><span className="text-gray-400">Mitarbeiter:</span> <strong className="text-gray-700">{[...new Set((worklogs as any[]).map((w: any) => w.employees?.name).filter(Boolean))].join(', ') || '–'}</strong></div>
          </div>
          <div>
            <Label className="text-xs text-gray-400 mb-2 block uppercase tracking-wide">Status ändern</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter(s => s.value !== ticket.status).map(s => (
                <button key={s.value} onClick={() => updateStatus.mutate(s.value)} disabled={updateStatus.isPending}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-all ${s.bg} ${s.text} border-transparent hover:opacity-80`}>
                  → {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="h-4 w-4" />Stunden ({totalHours}h)</h4>
              <button onClick={() => setShowStunden(!showStunden)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors">
                <Plus className="h-3.5 w-3.5" />Eintragen
              </button>
            </div>
            {showStunden && (
              <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Mitarbeiter</Label>
                  <Select value={stundenForm.employee_id} onValueChange={v => setStundenForm(f => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>{(employees as any[]).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Stunden</Label>
                  <Input className="h-8 text-xs rounded-lg" placeholder="1.5" value={stundenForm.stunden} onChange={e => setStundenForm(f => ({ ...f, stunden: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Datum</Label>
                  <Input type="date" className="h-8 text-xs rounded-lg" value={stundenForm.leistungsdatum} onChange={e => setStundenForm(f => ({ ...f, leistungsdatum: e.target.value }))} />
                </div>
                <Button size="sm" className="col-span-3 rounded-xl" onClick={() => addStunden.mutate()} disabled={addStunden.isPending}>Speichern</Button>
              </div>
            )}
            {(worklogs as any[]).length > 0 && (
              <div className="space-y-1">
                {(worklogs as any[]).map((w: any) => (
                  <div key={w.id} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span><strong className="font-mono text-gray-700">{w.employees?.kuerzel}</strong> <span className="text-gray-500">– {w.employees?.name}</span></span>
                    <span className="font-mono text-gray-600">{w.stunden}h · {w.leistungsdatum ? new Date(w.leistungsdatum).toLocaleDateString('de-DE') : '–'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notizen</h4>
            <div className="flex gap-2">
              <Input placeholder="Notiz hinzufügen..." value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote.mutate()} className="h-9 text-sm rounded-xl" />
              <Button size="sm" className="h-9 rounded-xl" onClick={() => addNote.mutate()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 space-y-1">
              {(notes as any[]).map((n: any) => (
                <div key={n.id} className="text-sm bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-gray-700">{n.note}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString('de-DE')}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <Button variant="danger" size="sm" className="rounded-xl"
              onClick={() => { if (confirm('Ticket löschen?')) deleteTicket.mutate(); }}
              disabled={deleteTicket.isPending}>
              <Trash2 className="h-4 w-4 mr-1" />Ticket löschen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
