import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Upload, Download, RefreshCw, Info, CheckCircle, AlertTriangle, BarChart2, Calendar, X } from 'lucide-react';

// ═══════════════════════════════════════
// BEZEICHNUNGS-MAPPING (aus Vorlage gelernt)
// ═══════════════════════════════════════
const BEZ_MAP: Record<string, string> = {
  'netzteil': 'Steckernetzteil','anschlussleitung': 'Anschlusskabel',
  'schreibtischleuchte': 'Schreibtischlampe','radio': 'CD / Radio / Kassettenrekorder',
  'prüfgerät': 'Steckernetzteil','usv': 'USV (Unterbrechungsfreie Stromversorgung)',
  'verlängerung 240v': 'Verlängerung 230V','verlängerung-230v': 'Verlängerung 230V',
  '230v-verlängerung': 'Verlängerung 230V','230v verlängerung': 'Verlängerung 230V',
  'verlängerungskabel 240 v': 'Verlängerung 230V',
  'schreibtisch höhenverstellbar': 'Tisch (elektrisch)',
  'elektrisch verstellbarer tisch': 'Tisch (elektrisch)',
  'elektrisch höhenverstellbarer tisch': 'Tisch (elektrisch)',
  'el. verstellbarer tisch': 'Tisch (elektrisch)','tisch elektrisch': 'Tisch (elektrisch)',
  'staubsauger': 'Staub/Nasssauger','standventilator': 'Ventilator',
  'batterieladegerät': 'Steckernetzteil','ladegerät': 'Steckernetzteil',
  'ladestation': 'Steckernetzteil','poweradapter': 'Steckernetzteil',
  'telefon': 'Steckernetzteil','leuchte': 'Schreibtischlampe',
  'schreibtischlame': 'Schreibtischlampe','dekolampe': 'Dekobeleuchtung',
  'dekoleuchte': 'Dekobeleuchtung','dekolicht': 'Dekobeleuchtung',
  'deckenleuchte': 'Deckenfluter','weihnachtslichterbogen': 'Dekobeleuchtung',
  'dosiergerät': 'Desinfektionsmittelmischgerät',
  'desinfiktionsmittelnischer': 'Desinfektionsmittelmischgerät',
  'mehrfachteckdose': 'Mehrfachsteckdose','mehrfacksteckdose': 'Mehrfachsteckdose',
  'mehrfaachsteckdose': 'Mehrfachsteckdose','mehrfacchsteckdose': 'Mehrfachsteckdose',
  'mahrfachsteckdose': 'Mehrfachsteckdose','mehrfachstckdose': 'Mehrfachsteckdose',
  'steckdosenleiste': 'Mehrfachsteckdose','aluminium steckdosenleiste': 'Mehrfachsteckdose',
  'mehrfachsteckdosenzuleitung': 'Anschlusskabel','anchlusskabel': 'Anschlusskabel',
  'anshlussleitung': 'Anschlusskabel','zuleitung': 'Anschlusskabel',
  'kaltgerätestecker': 'Kaltgeräteanschlussleitung',
  'kaltgeräteanchlussleitung': 'Kaltgeräteanschlussleitung',
  'kaltgeräteanschlssleitung': 'Kaltgeräteanschlussleitung',
  'kaltgeräteaanschlussleitung': 'Kaltgeräteanschlussleitung',
  'kaltgeräteanschlusleitung': 'Kaltgeräteanschlussleitung',
  'kaltgeräteaschlussleitung': 'Kaltgeräteanschlussleitung',
  'kaltgerääteanschlussleitung': 'Kaltgeräteanschlussleitung',
  'kaltegeräteanschlussleitung': 'Kaltgeräteanschlussleitung',
  'kaltgeräteanschuzssleitung': 'Kaltgeräteanschlussleitung',
  'drucker/scanner/kopierer': 'Drucker','multifunktionsgerät': 'Drucker',
  'multifunktionsgeräz': 'Drucker','klimagerät': 'mobiles Klimagerät',
  'not-hand-leuchte': 'Handnotleuchte','hand-not-leuchte': 'Handnotleuchte',
  'notbeleuchtung': 'Handnotleuchte','heißluftföhn': 'Heißluftfön','föhn': 'Fön',
  'kaffemaschine': 'Kaffeemaschine','overheadprojektor': 'Overhead Projektor',
  'tageslichtprojektor': 'Overhead Projektor','laminiergrät': 'Laminiergerät',
  'steckeernetzteil': 'Steckernetzteil','stecckernetzteil': 'Steckernetzteil',
  'hifi gerät': 'CD / Radio / Kassettenrekorder',
  'hi-fi anlage': 'CD / Radio / Kassettenrekorder',
  'radio / cd-player': 'CD / Radio / Kassettenrekorder',
  'vhs-viderecorder': 'Videorekorder','dvd player': 'Blu-ray / DVD Player',
  'bluray / dvd-spieler': 'Blu-ray / DVD Player','philips fernseher': 'Fernseher',
  'siemens kaffevollautomat': 'Kaffeevollautomat','el. heizung': 'Heizung (elektrisch)',
  'monitot': 'Monitor','kühschrank': 'Kühlschrank',
  'netzteil für schreibtischlampe': 'Steckernetzteil',
};

function normalizeBez(bez: string): string {
  if (!bez) return bez;
  return BEZ_MAP[bez.toLowerCase().trim()] ?? bez;
}

// ═══════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════
function parseCSV(text: string): Record<string, string>[] {
  // Normalisiere Zeilenenden
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';

  // Header: Umlaute normieren (latin-1 falsch gelesen → trotzdem matchen)
  const rawHeaders = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  // Normierungsfunktion für Spaltennamen
  const norm = (s: string) => s.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]/g,'');

  // Mapping: normierter Name → originaler Header
  const headerMap: Record<string, string> = {};
  rawHeaders.forEach(h => { headerMap[norm(h)] = h; });

  // Gesuchte Spalten mit Fallbacks
  const findCol = (names: string[]) => {
    for (const n of names) {
      const found = headerMap[norm(n)];
      if (found) return found;
    }
    return names[0];
  };

  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    // Aliases für Umlauts-Probleme
    const aliases: Record<string, string[]> = {
      'GEBÄUDE':          ['GEBÄUDE','GEB\u00c4UDE','GEB?UDE','GEBAEUDE'],
      'NÄCHSTE PRÜFUNG':  ['N?CHSTE PR?FUNG','NACHSTE PRUFUNG','NÄCHSTE PRÜFUNG'],
      'LETZTE PRÜFUNG':   ['LETZTE PR?FUNG','LETZTE PRUFUNG'],
      'LETZTER PRÜFER':   ['LETZTER PR?FER','LETZTER PRUFER'],
      'PRÜFSEQUENZ':      ['PR?FSEQUENZ','PRUFSEQUENZ'],
    };
    for (const [correct, variants] of Object.entries(aliases)) {
      if (!row[correct] || row[correct] === undefined) {
        for (const v of variants) {
          if (row[v] !== undefined) { row[correct] = row[v]; break; }
        }
        // Fallback: suche nach ähnlichem Schlüssel
        if (!row[correct]) {
          const normCorrect = norm(correct);
          for (const key of Object.keys(row)) {
            if (norm(key) === normCorrect) { row[correct] = row[key]; break; }
          }
        }
      }
    }
    return row;
  }).filter(r => r['ID'] || r['BEZEICHNUNG']);
}

// ═══════════════════════════════════════
// VERARBEITUNG — exakt wie Abrechnung
// ═══════════════════════════════════════
interface Aenderung {
  id: string;
  feld: string;
  vorher: string;
  nachher: string;
}

interface VerarbResult {
  rows: Record<string, string>[];
  aenderungen: Aenderung[];
  zeilen?: Record<string, string>[];
  neuePrueoflinge?: Record<string, string>[];
  stats?: { gesamt: number; auto: number; bezeichnung: number; raum: number; kunde: number; neu: number; };
}

function verarbeite(rohdaten: Record<string, string>[]): VerarbResult {
  const aenderungen: Aenderung[] = [];
  const rows = rohdaten.map(row => {
    const neu = { ...row };
    const id = row['ID'] ?? '';

    // BEZEICHNUNG normieren
    const bez = row['BEZEICHNUNG'] ?? '';
    const bezNorm = normalizeBez(bez);
    if (bezNorm !== bez && bez) {
      aenderungen.push({ id, feld: 'BEZEICHNUNG', vorher: bez, nachher: bezNorm });
      neu['BEZEICHNUNG'] = bezNorm;
    }

    // BEMERKUNG normieren (NEU/neu/Neu → NEU)
    const bem = (row['BEMERKUNG'] ?? '').trim();
    if (bem && bem.toUpperCase().startsWith('NEU') && bem !== 'NEU') {
      aenderungen.push({ id, feld: 'BEMERKUNG', vorher: bem, nachher: 'NEU' });
      neu['BEMERKUNG'] = 'NEU';
    }

    // Neu? Spalte setzen
    const bemFinal = neu['BEMERKUNG'] ?? '';
    neu['Neu?'] = bemFinal === 'NEU' ? 'NEU' : '';

    return neu;
  });

  return { rows, aenderungen };
}

// ═══════════════════════════════════════
// EXCEL EXPORT mit SheetJS
// ═══════════════════════════════════════
async function exportExcel(rows: Record<string, string>[], dateiname: string) {
  // SheetJS laden
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs' as any);

  // Spaltenreihenfolge exakt wie Abrechnung
  const COLS = [
    'OBJEKTTYP','ID','BEZEICHNUNG','TYP','SERIENNUMMER','HERSTELLER','STATUS',
    'INTERVALL (MONATE)','LETZTE PRÜFUNG','LETZTER PRÜFER','STATUS TERMIN',
    'ERGEBNIS DER LETZTEN PRÜFUNG','NÄCHSTE PRÜFUNG','ABTEILUNG','KOSTENSTELLE',
    'DOKUMENTE','PRÜFSEQUENZ','AKTIV','ERFASST AM','GEÄNDERT AM','ERFASST VON',
    'BEMERKUNG','KUNDENBEZEICHNUNG','KUNDEN-ID','LIEGENSCHAFT','LIEGENSCHAFTS-ID',
    'GEBÄUDE','GEBÄUDE-ID','EBENE','EBENEN-ID','RAUM','RAUM-ID','Neu?'
  ];

  const wb = XLSX.utils.book_new();

  // Tabelle1 — Hauptdaten
  const wsData = [COLS, ...rows.map(row => COLS.map(col => row[col] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Spaltenbreiten exakt wie Original
  const colWidths = [
    {wch:12},{wch:7},{wch:42},{wch:18},{wch:25},{wch:16},{wch:10},
    {wch:20},{wch:18},{wch:17},{wch:16},{wch:31},{wch:19},{wch:23},
    {wch:15},{wch:14},{wch:15},{wch:7},{wch:13},{wch:15},{wch:14},
    {wch:13},{wch:76},{wch:19},{wch:15},{wch:18},{wch:10},{wch:13},
    {wch:8},{wch:12},{wch:8},{wch:10},{wch:13}
  ];
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Tabelle1');

  // Download
  XLSX.writeFile(wb, dateiname.replace('.csv', '_Abrechnung.xlsx'));
}

// ═══════════════════════════════════════
// ROADMAP FARBE
// ═══════════════════════════════════════
function roadmapColor(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMonths = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
  if (diffMonths < 0) return '#ef4444';
  if (diffMonths < 6) return '#f59e0b';
  if (diffMonths < 12) return '#10b981';
  return '#2563eb';
}

// ═══════════════════════════════════════
// GESAMTLISTE IMPORT
// ═══════════════════════════════════════
function GesamtlisteImport({ onImported }: { onImported: () => void }) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'done'|'error'>('idle');
  const [count, setCount] = useState(0);
  const [gesamtCount, setGesamtCount] = useState(0);

  useEffect(() => {
    supabase.from('dguv_geraete').select('id', { count: 'exact', head: true }).then(({ count }) => {
      if (count !== null) setGesamtCount(count);
    });
  }, [status]);

  async function handleImport(file: File) {
    setStatus('loading');
    try {
      // latin-1 lesen wegen Umlauten in der CSV
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string ?? '');
        reader.onerror = reject;
        reader.readAsText(file, 'ISO-8859-1');
      });
      const rows = parseCSV(text);
      let imported = 0;
      const batchSize = 200;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map(r => {
          const parseD = (v: string) => {
            if (!v) return null;
            const m = v.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
            if (m) {
              const y = m[3].length === 2 ? `20${m[3]}` : m[3];
              return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
            }
            return null;
          };
          return {
            id: r['ID']?.trim(),
            bezeichnung: r['BEZEICHNUNG'] || null,
            intervall_monate: r['INTERVALL (MONATE)'] ? parseInt(r['INTERVALL (MONATE)']) || null : null,
            letzte_pruefung: parseD(r['LETZTE PRÜFUNG']),
            letzter_pruefer: r['LETZTER PRÜFER'] || null,
            naechste_pruefung: parseD(r['NÄCHSTE PRÜFUNG']),
            abteilung: r['ABTEILUNG'] || null,
            kostenstelle: r['KOSTENSTELLE'] || null,
            gebaeude: r['GEBÄUDE'] || null,
            ebene: r['EBENE'] || null,
            liegenschaft: r['LIEGENSCHAFT'] || null,
            kundenbezeichnung: r['KUNDENBEZEICHNUNG'] || null,
            aktiv: true,
          };
        }).filter(r => r.id);
        const { error: upsertError } = await supabase.from('dguv_geraete').upsert(batch, { onConflict: 'id' });
        if (upsertError) console.error('Batch Fehler:', upsertError.message);
        imported += batch.length;
        setCount(imported);
      }
      setStatus('done');
      onImported();
    } catch { setStatus('error'); }
  }

  if (gesamtCount > 0 && (status === 'idle' || status === 'done')) return (
    <div style={{ background:'#f0fdf4', borderRadius:12, border:'1px solid #bbf7d0', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
      <CheckCircle size={14} style={{ color:'#10b981', flexShrink:0 }} />
      <span style={{ fontSize:12, color:'#065f46', fontWeight:600 }}>Gesamtliste: {gesamtCount.toLocaleString('de-DE')} Geräte ✓</span>
      <button onClick={() => fileInputRef.current?.click()} style={{ marginLeft:'auto', fontSize:11, color:'#059669', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Aktualisieren</button>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
    </div>
  );

  return (
    <div style={{ background:'#fffbeb', borderRadius:12, border:'1px solid #fde68a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <AlertTriangle size={15} style={{ color:'#f59e0b', flexShrink:0 }} />
        <div>
          <p style={{ fontSize:13, fontWeight:700, color:'#92400e', margin:0 }}>Gesamtliste noch nicht importiert</p>
          <p style={{ fontSize:11, color:'#b45309', margin:'2px 0 0' }}>Einmalig Gesamtliste26.csv hochladen für Roadmap und Prüflings-Erkennung</p>
        </div>
      </div>
      {status === 'loading' ? (
        <div style={{ display:'flex', alignItems:'center', gap:6, color:'#f59e0b', fontSize:12, fontWeight:600 }}>
          <RefreshCw size={13} className="animate-spin" /> {count.toLocaleString('de-DE')}...
        </div>
      ) : (
        <button onClick={() => fileInputRef.current?.click()}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
          <Upload size={12} /> Gesamtliste26.csv
        </button>
      )}
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
    </div>
  );
}

// ═══════════════════════════════════════
// TABS
// ═══════════════════════════════════════
const TABS = ['Verarbeitung', 'Roadmap', 'Auswertung'] as const;
type Tab = typeof TABS[number];

// ═══════════════════════════════════════
// HAUPTKOMPONENTE
// ═══════════════════════════════════════
export default function DGUVPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const activeTab: Tab = location.pathname.includes('roadmap') ? 'Roadmap' : location.pathname.includes('auswertung') ? 'Auswertung' : 'Verarbeitung';
  const [isProcessing, setIsProcessing] = useState(false);
  const [ergebnis, setErgebnis] = useState<VerarbResult | null>(null);
  const [dateiname, setDateiname] = useState('');
  const [filterTyp, setFilterTyp] = useState<'alle'|'bezeichnung'|'bemerkung'>('alle');

  // Roadmap aus Supabase
  const { data: roadmapRaw = [] } = useQuery({
    queryKey: ['dguv-roadmap'],
    queryFn: async () => {
      // Alle Zeilen laden via Pagination (Supabase limit 1000 pro Request)
      const allData: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('dguv_geraete')
          .select('naechste_pruefung, gebaeude, liegenschaft')
          .not('naechste_pruefung', 'is', null)
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData;
    },
  });

  const roadmapData = (() => {
    const counts: Record<string, number> = {};
    (roadmapRaw as any[]).forEach((r: any) => {
      if (!r.naechste_pruefung) return;
      const key = r.naechste_pruefung.slice(0, 7);
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({
        monat: new Date(key + '-15').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
        count, color: roadmapColor(key + '-15'), key,
      })).filter(d => d.count > 5);
  })();

  const totalGeraete = (roadmapRaw as any[]).length;
  const maxMonat = roadmapData.reduce((m, d) => d.count > (m?.count ?? 0) ? d : m, roadmapData[0]);

  // Roadmap nach Standort: WO + BIS WANN + WIE VIEL
  const roadmapByLocation = (() => {
    const grouped: Record<string, { gebaeude: string; liegenschaft: string; count: number; deadline: string; color: string }> = {};
    (roadmapRaw as any[]).forEach((r: any) => {
      if (!r.naechste_pruefung || !r.gebaeude) return;
      const key = `${r.gebaeude}__${r.naechste_pruefung.slice(0,7)}`;
      if (!grouped[key]) {
        grouped[key] = { gebaeude: r.gebaeude, liegenschaft: r.liegenschaft ?? '', count: 0, deadline: r.naechste_pruefung.slice(0,7) + '-01', color: roadmapColor(r.naechste_pruefung) };
      }
      grouped[key].count++;
    });
    return Object.values(grouped).sort((a, b) => a.deadline.localeCompare(b.deadline));
  })();

  // Prüfer-Stats
  const prueferStats = ergebnis ? (() => {
    const stats: Record<string, number> = {};
    ergebnis.rows.forEach(r => {
      const p = r['LETZTER PRÜFER'] || 'Unbekannt';
      stats[p] = (stats[p] ?? 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  })() : [];

  async function handleFile(file: File) {
    setIsProcessing(true);
    setErgebnis(null);
    setDateiname(file.name);

    try {
      const text = await file.text();
      if (!file.name.endsWith('.csv')) {
        alert('Bitte eine CSV-Datei hochladen');
        setIsProcessing(false);
        return;
      }

      const response = await fetch('/api/dguv-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Fehler');

      // Excel sofort herunterladen
      const bytes = Uint8Array.from(atob(data.excel_b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const monat = new Date().toISOString().slice(0, 7);
      a.href = url;
      a.download = `Abrechnung_${file.name.replace('.csv','')}_${monat}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setErgebnis({
        rows: [],
        zeilen: [],
        aenderungen: data.aenderungen ?? [],
        neuePrueoflinge: [],
        stats: data.stats,
      });

      await supabase.from('dguv_uploads').insert({
        dateiname: file.name,
        monat: monat,
        anzahl_gesamt: data.stats?.gesamt ?? 0,
        anzahl_neu: 0,
        anzahl_korrekturen: data.stats?.auto ?? 0,
        user_email: user?.email,
      });

    } catch (e: any) {
      alert('Fehler beim Verarbeiten: ' + e.message);
    }
    setIsProcessing(false);
  }

  const gefilterteAenderungen = ergebnis?.aenderungen.filter(a =>
    filterTyp === 'alle' ? true : a.feld.toLowerCase().includes(filterTyp)
  ) ?? [];

  const bezCount = ergebnis?.aenderungen.filter(a => a.feld === 'BEZEICHNUNG').length ?? 0;
  const bemCount = ergebnis?.aenderungen.filter(a => a.feld === 'BEMERKUNG').length ?? 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:40, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .dg-card { animation:fadeUp 0.4s ease forwards; opacity:0; }
        .aend-row:hover { background:#f8fafc !important; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .animate-spin { animation:spin 1s linear infinite; }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            DGUV <span style={{ color:'#f59e0b' }}>Prüfmanagement</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>Rohdaten verarbeiten · Roadmap · Auswertung</p>
        </div>
      </div>


      {/* ═══ VERARBEITUNG ═══ */}
      {activeTab === 'Verarbeitung' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Upload */}
          {!ergebnis && !isProcessing && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ background:'#fff', borderRadius:20, border:'2px dashed #e2e8f0', padding:'48px 24px', textAlign:'center', cursor:'pointer', transition:'all .2s' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#f59e0b';(e.currentTarget as HTMLElement).style.background='#fffbeb';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLElement).style.background='#fff';}}>
              <div style={{ width:52, height:52, borderRadius:16, background:'#fffbeb', border:'1px solid #fde68a', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Upload size={24} style={{ color:'#f59e0b' }} />
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 6px' }}>Rohdaten CSV hochladen</p>
              <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Gossen-Metrawatt Export · CSV oder Excel</p>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display:'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            </div>
          )}

          {isProcessing && (
            <div style={{ background:'#fff', borderRadius:16, border:'1px solid #fde68a', padding:'32px', textAlign:'center' }}>
              <RefreshCw size={28} style={{ color:'#f59e0b', animation:'spin 1s linear infinite', marginBottom:12 }} />
              <p style={{ color:'#92400e', fontWeight:600, margin:0 }}>Verarbeite Daten...</p>
            </div>
          )}

          {ergebnis && (
            <>
              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                {[
                  { label:'Geräte gesamt', value:ergebnis.rows.length, color:'#2563eb', border:'#bfdbfe' },
                  { label:'Korrekturen gesamt', value:ergebnis.aenderungen.length, color:'#10b981', border:'#bbf7d0' },
                  { label:'Bezeichnungen', value:bezCount, color:'#f59e0b', border:'#fde68a' },
                  { label:'NEU markiert', value:ergebnis.rows.filter(r=>r['Neu?']==='NEU').length, color:'#8b5cf6', border:'#ddd6fe' },
                ].map((s,i) => (
                  <div key={i} className="dg-card" style={{ animationDelay:`${i*.08}s`, background:'#fff', borderRadius:16, border:`1px solid ${s.border}`, padding:'16px 20px', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:s.color }} />
                    <p style={{ fontSize:28, fontWeight:900, color:s.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{s.value}</p>
                    <p style={{ fontSize:12, color:'#64748b', margin:0, fontWeight:600 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Aktionen */}
              <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <button onClick={() => exportExcel(ergebnis.rows, dateiname)}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 20px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(16,185,129,0.3)' }}>
                  <Download size={15} /> Als Excel herunterladen
                </button>
                <button onClick={() => { setErgebnis(null); setDateiname(''); }}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', background:'#f8fafc', border:'1px solid #e2e8f0', color:'#64748b', borderRadius:12, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  <Upload size={14} /> Neue Datei
                </button>
                <span style={{ fontSize:12, color:'#94a3b8' }}>📄 {dateiname}</span>
              </div>

              {/* Änderungsprotokoll */}
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 2px' }}>Änderungsprotokoll</p>
                    <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>{ergebnis.aenderungen.length} Änderungen · {dateiname}</p>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {([
                      ['alle', `Alle (${ergebnis.aenderungen.length})`, '#64748b'],
                      ['bezeichnung', `Bezeichnungen (${bezCount})`, '#f59e0b'],
                      ['bemerkung', `Bemerkung (${bemCount})`, '#8b5cf6'],
                    ] as const).map(([key, label, color]) => (
                      <button key={key} onClick={() => setFilterTyp(key as any)}
                        style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${filterTyp===key?color:'#e2e8f0'}`, background:filterTyp===key?`${color}15`:'#fff', color:filterTyp===key?color:'#64748b', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ maxHeight:400, overflowY:'auto' }}>
                  {/* Tabellen-Header */}
                  <div style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 1fr', gap:12, padding:'8px 20px', background:'#f8fafc', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em' }}>
                    <span>ID</span><span>Feld</span><span>Vorher</span><span>Nachher</span>
                  </div>
                  {gefilterteAenderungen.length === 0 && (
                    <p style={{ color:'#94a3b8', textAlign:'center', padding:'28px 0', fontSize:13 }}>Keine Einträge</p>
                  )}
                  {gefilterteAenderungen.map((a, i) => (
                    <div key={i} className="aend-row" style={{ display:'grid', gridTemplateColumns:'80px 120px 1fr 1fr', gap:12, padding:'10px 20px', borderBottom:'1px solid #f8fafc', fontSize:12, alignItems:'center', background:'transparent', transition:'background .1s' }}>
                      <span style={{ fontFamily:'monospace', color:'#94a3b8', fontSize:11 }}>{a.id}</span>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:6, textAlign:'center', background: a.feld==='BEZEICHNUNG'?'#fffbeb':'#faf5ff', color: a.feld==='BEZEICHNUNG'?'#f59e0b':'#8b5cf6' }}>{a.feld}</span>
                      <span style={{ color:'#ef4444', textDecoration:'line-through', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.vorher || '–'}</span>
                      <span style={{ color:'#10b981', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nachher}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ ROADMAP ═══ */}
      {activeTab === 'Roadmap' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
            {[
              { label:'Geräte gesamt', value: totalGeraete > 0 ? totalGeraete.toLocaleString('de-DE') : '–', sub:'in der Gesamtliste', color:'#2563eb', border:'#bfdbfe' },
              { label:'Fällig 2026', value: roadmapData.filter(d=>d.key?.startsWith('2026')).reduce((s,d)=>s+d.count,0).toLocaleString('de-DE'), sub:'nächste 12 Monate', color:'#f59e0b', border:'#fde68a' },
              { label:`Peak: ${maxMonat?.monat??'–'}`, value: maxMonat?.count.toLocaleString('de-DE')??'–', sub:'größter Monat', color:'#ef4444', border:'#fecaca' },
            ].map((s,i) => (
              <div key={i} className="dg-card" style={{ animationDelay:`${i*.08}s`, background:'#fff', borderRadius:16, border:`1px solid ${s.border}`, padding:'18px 22px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:s.color }} />
                <p style={{ fontSize:28, fontWeight:900, color:s.color, margin:'0 0 2px', letterSpacing:'-.04em' }}>{s.value}</p>
                <p style={{ fontSize:12, fontWeight:600, color:'#64748b', margin:'0 0 2px' }}>{s.label}</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{s.sub}</p>
              </div>
            ))}
          </div>
          <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
              <div>
                <p style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Prüfstandorte — Wo · bis Wann · Wie viele</p>
                <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>Sortiert nach Deadline · live aus Gesamtliste26</p>
              </div>
              <div style={{ display:'flex', gap:8, fontSize:11 }}>
                {[['#ef4444','Überfällig'],['#f59e0b','Bald'],['#10b981','Geplant'],['#2563eb','2026+']].map(([c,l]) => (
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:c }} />
                    <span style={{ color:'#64748b' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            {roadmapByLocation.length === 0 ? (
              <div style={{ padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                Gesamtliste noch nicht importiert — lade Gesamtliste26.csv hoch
              </div>
            ) : (
              <div style={{ maxHeight:560, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead style={{ position:'sticky', top:0, zIndex:1, background:'#f8fafc' }}>
                    <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                      {['Deadline','Gebäude / Standort','Liegenschaft','Geräte','Umfang'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign: h==='Geräte' ? 'right' : 'left', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roadmapByLocation.map((d:any, i:number) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f8fafc', transition:'background .1s' }}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'}
                        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                        <td style={{ padding:'10px 16px', fontWeight:700, color:d.color, whiteSpace:'nowrap' }}>
                          {new Date(d.deadline).toLocaleDateString('de-DE',{month:'short',year:'numeric'})}
                        </td>
                        <td style={{ padding:'10px 16px', fontWeight:600, color:'#0f172a' }}>{d.gebaeude}</td>
                        <td style={{ padding:'10px 16px', color:'#64748b', fontSize:12 }}>{d.liegenschaft}</td>
                        <td style={{ padding:'10px 16px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:d.color }}>{d.count.toLocaleString('de-DE')}</td>
                        <td style={{ padding:'10px 16px', width:120 }}>
                          <div style={{ height:5, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${Math.min((d.count/(maxMonat?.count??1))*100,100)}%`, background:d.color, borderRadius:99 }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ AUSWERTUNG ═══ */}
      {activeTab === 'Auswertung' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {!ergebnis ? (
            <div style={{ background:'#fff', borderRadius:16, border:'1px solid #f1f5f9', padding:'48px 24px', textAlign:'center' }}>
              <BarChart2 size={36} style={{ color:'#e2e8f0', marginBottom:12 }} />
              <p style={{ color:'#94a3b8', fontSize:14, margin:0 }}>Erst CSV im Tab "Verarbeitung" hochladen</p>
            </div>
          ) : (
            <>
              <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:24 }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:'0 0 4px' }}>Messungen pro Prüfer</h3>
                <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 20px' }}>{dateiname}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={prueferStats} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v:any) => [`${v} Geräte`,'Geprüft']} contentStyle={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12 }} />
                    <Bar dataKey="count" radius={[5,5,0,0]}>
                      {prueferStats.map((_,i) => <Cell key={i} fill={['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444'][i%5]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                {prueferStats.map((p,i) => {
                  const farbe = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444'][i%5];
                  const pct = Math.round((p.count/ergebnis.rows.length)*100);
                  return (
                    <div key={p.name} className="dg-card" style={{ animationDelay:`${i*.06}s`, background:'#fff', borderRadius:16, border:`1px solid ${farbe}20`, padding:'16px 18px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                        <div style={{ width:36, height:36, borderRadius:11, background:`${farbe}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <span style={{ fontSize:12, fontWeight:800, color:farbe }}>{p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>
                        </div>
                        <div>
                          <p style={{ fontSize:13, fontWeight:700, color:'#0f172a', margin:0 }}>{p.name}</p>
                          <p style={{ fontSize:11, color:'#94a3b8', margin:0 }}>{pct}% aller Messungen</p>
                        </div>
                      </div>
                      <p style={{ fontSize:26, fontWeight:900, color:farbe, margin:'0 0 8px', letterSpacing:'-.04em' }}>{p.count}</p>
                      <div style={{ height:4, background:'#f1f5f9', borderRadius:99 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:farbe, borderRadius:99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
