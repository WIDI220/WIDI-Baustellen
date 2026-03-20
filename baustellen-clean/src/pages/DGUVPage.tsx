import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Upload, CheckCircle, AlertTriangle, Download, FileText, Users, Calendar, BarChart2, ArrowRight, RefreshCw, X, Info } from 'lucide-react';

// ═══════════════════════════════════════════════════════
// NORMBEZEICHNUNGEN (aus Tabelle2)
// ═══════════════════════════════════════════════════════
const NORMBEZ: string[] = ["Airhockeytisch","Aktenvernichter","Anschlusskabel","Apple TV","Aquariumzubehör","Babyphone","Barcode / QR-Codescanner","Batterietester","Beamer","Beistellmodul (Telefon)","Beschriftungsgerät","Bettbeleuchtung","Bildimporter","Blaulichtlampe","Blu-ray / DVD Player","Bohrmaschine","Bratpfanne","Brutschrank","Bügelbrett","Bügeleisen","CD / Radio / Kassettenrekorder","Crêpes-Eisen","Dartscheibe (elektrisch)","Deckenfluter","Dekobeleuchtung","Desinfektionsmittelmischgerät","Digitaler Fotorahmen","Diktiergerät","Docking Station","Dosieranlage","Dreiwalzwerk","Drucker","Duftlampe","Dunstabzugshaube","Durchlauferhitzer","Eierkocher","Einkochautomat","Einschaltstrombegrenzer","Elektroherd","Elektronische Wetterstation","Entsafter","Etikettendrucker","Falschgelddetektor","Faltmaschine","Fango-Ofen","Faxgerät","Fernseher","Flaschenwärmer","Fleischwolf (elektrisch)","Fliegenfalle (elektrisch)","Fritteuse","Fräsmaschine","Fußschalter","Fußwärmer","Fön","Gefrierschrank","Geldzähler","Globus (elektrisch)","Glühweinkocher","Graviergerät","Grill (elektrisch)","Haarschneidemaschine","Haartrockner","Handlampe","Handmixer","Handnotleuchte","Handstaubsauger","Headset","Heizbad","Heizdecke","Heizkissen","Heizlüfter","Heizung (elektrisch)","Heißgeräteanschlussleitung","Heißklebepistole","Heißluftfön","Infrarotlampe","Kabeltrommel","Kaffeemaschine","Kaffeemühle","Kaffeevollautomat","Kalender (digital)","Kaltgeräteanschlussleitung","Kamin (elektrisch)","Kartenlesegerät","Kartenzahlungsgerät","Keyboard","Kiesbad","Kochplatte","Konferenztelefon","Konvektor","Körperwaage","Küchenmaschine","Küchenwaage","Kühl- und Gefrierkombination","Kühlschrank","Kühltruhe","LED Treiber","Labeldrucker","Ladegerät / Ladestation","Laminiergerät","Lasergerät","Lautsprecher","Lesehilfe","Lichterbogen","Lichterkette","Liege (elektrisch)","Lockenstab","Luft-Kompressor","Luftfilteranlage","Lötkolben","Lüfter","Massagegerät (Infrarot)","Mehrfachsteckdose","Mikrofon","Mikrowelle","Milchaufschäumer","Milchwaage","Mischpult","Modem","Monitor","Multifunktionsgerät (Drucker&Scanner)","Nachtlicht","Nähmaschine","Overhead Projektor","PC","PC (mobil)","PC Arbeitsplatz","Parafinbad","Parkscheinentwerter","Partytopf","Patchmaschine","Pendelleuchte","Popcornmaschine","Pumpe (elektrisch)","Rasierer","Receiver","Rechenmaschine","Router/Switch","Sandwichmaker","Scanner","Scheinwerfer","Schleifmaschine","Schließfach","Schneidemaschine","Schokoladenbrunnen","Schranklampe","Schreibmaschine (elektrisch)","Schreibtischlampe","Schwarzlichtlampe","Sessel (elektrisch)","Spielekonsole","Sportgerät (elektrisch)","Spülmaschine","Stabmixer","Standbohrmaschine","Standlampe","Standmixer","Staub/Nasssauger","Steckdose mit Schalter","Steckernetzteil","Stift","Stromverteiler 400V","Säge","Tacker (elektrisch)","Tafelsteuerung","Tauchpumpe","Teekocher","Teigknetmaschine","Tellerwärmer","Temperaturfühler","Tiefkühltruhe","Tisch (elektrisch)","Tischfräse","Toaster","Topf (elektrisch)","Trockner","USV (Unterbrechungsfreie Stromversorgung)","Uhr","Ultraschallreinigungsgerät","Untertischgerät","VGA Switch","Ventilator","Verlängerung 230V","Verlängerung 400V","Vernebler","Verstärker","Videokamera","Videokonferenzanlage","Videorekorder","Waffeleisen","Waschmaschine","Wasserbett","Wasserbrunnen","Wasserkocher","Wasserspender","Wecker","Whiteboard","Wok (elektrisch)","Wärmematte","Wärmeplatte","Wärmeschrank","Wärmestrahler","Wärmewagen","Zahnbürste (elektrisch)","Zeichentisch","Zeitschaltuhr (elektrisch)","Zigarettenstopfgerät","Zimmerantenne","iPad","mobiles Klimagerät","Überspannungsschutz Feinschutz Typ 3"];

// ═══════════════════════════════════════════════════════
// FUZZY MATCH
// ═══════════════════════════════════════════════════════
function fuzzyScore(a: string, b: string): number {
  const s = a.toLowerCase().trim();
  const t = b.toLowerCase().trim();
  if (s === t) return 1;
  if (t.includes(s) || s.includes(t)) return 0.85;
  let matches = 0;
  const longer = s.length > t.length ? s : t;
  const shorter = s.length > t.length ? t : s;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

function findBestMatch(bez: string): { match: string; score: number } | null {
  if (!bez) return null;
  const trimmed = bez.trim();
  const exact = NORMBEZ.find(n => n.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { match: exact, score: 1 };
  let best = { match: '', score: 0 };
  for (const norm of NORMBEZ) {
    const score = fuzzyScore(trimmed, norm);
    if (score > best.score) best = { match: norm, score };
  }
  return best.score > 0.55 ? best : null;
}

// ═══════════════════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════════════════
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => r['ID'] || r['BEZEICHNUNG']);
}

// ═══════════════════════════════════════════════════════
// VERARBEITUNG
// ═══════════════════════════════════════════════════════
interface Aenderung {
  id: string;
  feld: string;
  vorher: string;
  nachher: string;
  grund: string;
  typ: 'auto' | 'vorschlag' | 'neu';
}

interface VerarbeitungsErgebnis {
  zeilen: Record<string, string>[];
  aenderungen: Aenderung[];
  neuePrueoflinge: Record<string, string>[];
}

function verarbeite(rohdaten: Record<string, string>[], gesamtIds: Set<string>): VerarbeitungsErgebnis {
  const aenderungen: Aenderung[] = [];
  const neuePrueoflinge: Record<string, string>[] = [];

  const zeilen = rohdaten.map(row => {
    const neu = { ...row };
    const id = String(row['ID'] ?? '').trim();

    // 1. RAUM aus ABTEILUNG extrahieren
    const abteilung = row['ABTEILUNG'] ?? '';
    const raumMatch = abteilung.match(/R(\d{3,4})/);
    if (raumMatch && !row['RAUM']) {
      neu['RAUM'] = raumMatch[0].replace('R', 'R');
      aenderungen.push({ id, feld: 'RAUM', vorher: '', nachher: raumMatch[0], grund: `Aus ABTEILUNG extrahiert: ${abteilung}`, typ: 'auto' });
    }

    // 2. KUNDENBEZEICHNUNG kürzen
    const kundenbez = row['KUNDENBEZEICHNUNG'] ?? '';
    if (kundenbez.match(/^\d+ - /)) {
      const kurz = kundenbez.replace(/^\d+ - /, '').replace(/,.*$/, '').trim();
      if (kurz !== kundenbez) {
        neu['KUNDENBEZEICHNUNG'] = kurz;
        aenderungen.push({ id, feld: 'KUNDENBEZEICHNUNG', vorher: kundenbez, nachher: kurz, grund: 'Präfix und Standortangabe entfernt', typ: 'auto' });
      }
    }

    // 3. Neu? markieren
    const bemerkung = (row['BEMERKUNG'] ?? '').toLowerCase().trim();
    if (bemerkung === 'neu' || bemerkung === 'neru' || bemerkung.startsWith('neu,') || bemerkung.startsWith('neu ')) {
      if (!neu['Neu?']) {
        neu['Neu?'] = 'NEU';
        if (bemerkung !== 'neu') {
          aenderungen.push({ id, feld: 'BEMERKUNG', vorher: row['BEMERKUNG'], nachher: 'NEU', grund: 'Schreibweise normalisiert', typ: 'auto' });
        }
      }
    }

    // 4. Bezeichnung prüfen
    const bez = row['BEZEICHNUNG'] ?? '';
    if (bez) {
      const match = findBestMatch(bez);
      if (match && match.score === 1) {
        // Exakt — ok
      } else if (match && match.score > 0.8) {
        neu['BEZEICHNUNG'] = match.match;
        aenderungen.push({ id, feld: 'BEZEICHNUNG', vorher: bez, nachher: match.match, grund: `Bezeichnung normiert (${Math.round(match.score * 100)}% Übereinstimmung)`, typ: 'auto' });
      } else if (match && match.score > 0.55) {
        aenderungen.push({ id, feld: 'BEZEICHNUNG', vorher: bez, nachher: match.match, grund: `Vorschlag (${Math.round(match.score * 100)}% Übereinstimmung) — bitte prüfen`, typ: 'vorschlag' });
      }
    }

    // 5. Neue Prüflinge erkennen
    if (id && !gesamtIds.has(id)) {
      neuePrueoflinge.push(row);
      neu['Neu?'] = 'NEU PRÜFLING';
      aenderungen.push({ id, feld: 'STATUS', vorher: '', nachher: 'Neuer Prüfling', grund: `ID ${id} nicht in Gesamtliste`, typ: 'neu' });
    }

    return neu;
  });

  return { zeilen, aenderungen, neuePrueoflinge };
}

// ═══════════════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════════════
function exportCSV(zeilen: Record<string, string>[], dateiname: string) {
  if (!zeilen.length) return;
  const headers = Object.keys(zeilen[0]);
  const rows = zeilen.map(z => headers.map(h => `"${(z[h] ?? '').replace(/"/g, '""')}"`).join(';'));
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = dateiname; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════
// ROADMAP DATEN
// ═══════════════════════════════════════════════════════
const ROADMAP_DATA = [
  { monat: 'Jan 25', count: 16, color: '#ef4444' },
  { monat: 'Jul 25', count: 88, color: '#f59e0b' },
  { monat: 'Aug 25', count: 198, color: '#f59e0b' },
  { monat: 'Sep 25', count: 337, color: '#f59e0b' },
  { monat: 'Okt 25', count: 167, color: '#f59e0b' },
  { monat: 'Nov 25', count: 218, color: '#f59e0b' },
  { monat: 'Dez 25', count: 200, color: '#f59e0b' },
  { monat: 'Jan 26', count: 971, color: '#10b981' },
  { monat: 'Feb 26', count: 294, color: '#10b981' },
  { monat: 'Mär 26', count: 1617, color: '#10b981' },
  { monat: 'Apr 26', count: 160, color: '#10b981' },
  { monat: 'Mai 26', count: 1683, color: '#10b981' },
  { monat: 'Jun 26', count: 2421, color: '#2563eb' },
  { monat: 'Jul 26', count: 2340, color: '#2563eb' },
  { monat: 'Aug 26', count: 4797, color: '#2563eb' },
  { monat: 'Sep 26', count: 3169, color: '#2563eb' },
  { monat: 'Okt 26', count: 1701, color: '#2563eb' },
  { monat: 'Nov 26', count: 1451, color: '#2563eb' },
  { monat: 'Dez 26', count: 1064, color: '#2563eb' },
];

// ═══════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════
const TABS = ['Verarbeitung', 'Roadmap', 'Auswertung'] as const;
type Tab = typeof TABS[number];

// ═══════════════════════════════════════════════════════
// HAUPTKOMPONENTE
// ═══════════════════════════════════════════════════════
export default function DGUVPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Verarbeitung');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ergebnis, setErgebnis] = useState<VerarbeitungsErgebnis | null>(null);
  const [dateiname, setDateiname] = useState('');
  const [filterTyp, setFilterTyp] = useState<'alle' | 'auto' | 'vorschlag' | 'neu'>('alle');
  const [showNurNeu, setShowNurNeu] = useState(false);

  // Gesamtliste IDs aus Supabase laden (falls gespeichert) oder direkt aus CSV
  // Für jetzt nutzen wir die bekannte Anzahl
  const GESAMT_IDS_COUNT = 23352;

  async function handleFile(file: File) {
    setIsProcessing(true);
    setErgebnis(null);
    setDateiname(file.name);

    try {
      const text = await file.text();
      let rohdaten: Record<string, string>[] = [];

      if (file.name.endsWith('.csv')) {
        rohdaten = parseCSV(text);
      } else {
        alert('Bitte eine CSV-Datei hochladen');
        setIsProcessing(false);
        return;
      }

      // Gesamtliste IDs — hier nutzen wir einen leeren Set da wir die Gesamtliste nicht im Browser haben
      // Neue Prüflinge werden anhand BEMERKUNG='NEU' erkannt
      const gesamtIds = new Set<string>(); // In Produktion: aus Supabase laden

      const result = verarbeite(rohdaten, gesamtIds);
      setErgebnis(result);

      // In Supabase loggen
      await supabase.from('dguv_uploads').insert({
        dateiname: file.name,
        monat: new Date().toISOString().slice(0, 7),
        anzahl_gesamt: rohdaten.length,
        anzahl_neu: result.neuePrueoflinge.length,
        anzahl_korrekturen: result.aenderungen.filter(a => a.typ === 'auto').length,
        user_email: user?.email,
      });

    } catch (e: any) {
      alert('Fehler beim Verarbeiten: ' + e.message);
    }
    setIsProcessing(false);
  }

  const gefilterteAenderungen = ergebnis?.aenderungen.filter(a =>
    filterTyp === 'alle' ? true : a.typ === filterTyp
  ) ?? [];

  const autoCount = ergebnis?.aenderungen.filter(a => a.typ === 'auto').length ?? 0;
  const vorschlagCount = ergebnis?.aenderungen.filter(a => a.typ === 'vorschlag').length ?? 0;
  const neuCount = ergebnis?.aenderungen.filter(a => a.typ === 'neu').length ?? 0;

  // Prüfer-Auswertung aus den verarbeiteten Daten
  const prueferStats = ergebnis ? (() => {
    const stats: Record<string, number> = {};
    ergebnis.zeilen.forEach(z => {
      const p = z['LETZTER PRÜFER'] ?? 'Unbekannt';
      stats[p] = (stats[p] ?? 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  })() : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .dguv-card { animation: fadeUp 0.4s ease forwards; opacity:0; }
        .aend-row:hover { background: #f8fafc !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.03em' }}>
            DGUV <span style={{ color: '#f59e0b' }}>Prüfmanagement</span>
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Rohdaten verarbeiten · Roadmap · Auswertung</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 14, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '8px 22px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#0f172a' : '#94a3b8',
            boxShadow: activeTab === t ? '0 2px 8px rgba(0,0,0,.07)' : 'none',
          }}>{t}</button>
        ))}
      </div>

      {/* ═══ TAB: VERARBEITUNG ═══ */}
      {activeTab === 'Verarbeitung' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Upload */}
          {!ergebnis && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0', padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'; (e.currentTarget as HTMLElement).style.background = '#fffbeb'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Upload size={24} style={{ color: '#f59e0b' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Rohdaten CSV hochladen</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Gossen-Metrawatt Export · wird automatisch bereinigt</p>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            </div>
          )}

          {isProcessing && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #fde68a', padding: '24px', textAlign: 'center' }}>
              <RefreshCw size={28} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <p style={{ color: '#92400e', fontWeight: 600, margin: 0 }}>Verarbeite Daten...</p>
            </div>
          )}

          {ergebnis && (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {[
                  { label: 'Geräte gesamt', value: ergebnis.zeilen.length, color: '#2563eb', border: '#bfdbfe' },
                  { label: 'Auto-Korrekturen', value: autoCount, color: '#10b981', border: '#bbf7d0' },
                  { label: 'Vorschläge', value: vorschlagCount, color: '#f59e0b', border: '#fde68a' },
                  { label: 'Neue Prüflinge', value: neuCount, color: '#8b5cf6', border: '#ddd6fe' },
                ].map((s, i) => (
                  <div key={i} className="dguv-card" style={{ animationDelay: `${i * 0.08}s`, background: '#fff', borderRadius: 16, border: `1px solid ${s.border}`, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: '16px 16px 0 0' }} />
                    <p style={{ fontSize: 28, fontWeight: 900, color: s.color, margin: '0 0 2px', letterSpacing: '-.04em' }}>{s.value}</p>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontWeight: 600 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Aktionen */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={() => exportCSV(ergebnis.zeilen, `Abrechnung_${dateiname.replace('.csv', '')}_bereinigt.csv`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                  <Download size={15} /> Excel herunterladen
                </button>
                <button onClick={() => { setErgebnis(null); setDateiname(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Upload size={14} /> Neue Datei
                </button>
                <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>📄 {dateiname}</span>
              </div>

              {/* Änderungsprotokoll */}
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>Änderungsprotokoll</p>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{ergebnis.aenderungen.length} Änderungen · {dateiname}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['alle', 'Alle', '#64748b'], ['auto', `Auto (${autoCount})`, '#10b981'], ['vorschlag', `Vorschläge (${vorschlagCount})`, '#f59e0b'], ['neu', `Neu (${neuCount})`, '#8b5cf6']] as const).map(([key, label, color]) => (
                      <button key={key} onClick={() => setFilterTyp(key as any)}
                        style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${filterTyp === key ? color : '#e2e8f0'}`, background: filterTyp === key ? `${color}15` : '#fff', color: filterTyp === key ? color : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {gefilterteAenderungen.length === 0 && (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>Keine Einträge</p>
                  )}
                  {gefilterteAenderungen.map((a, i) => (
                    <div key={i} className="aend-row" style={{ display: 'grid', gridTemplateColumns: '80px 120px 1fr 1fr 1fr', gap: 12, padding: '11px 20px', borderBottom: '1px solid #f8fafc', fontSize: 12, alignItems: 'center', background: 'transparent', transition: 'background .1s' }}>
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 11 }}>#{a.id}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, textAlign: 'center',
                        background: a.typ === 'auto' ? '#f0fdf4' : a.typ === 'vorschlag' ? '#fffbeb' : '#faf5ff',
                        color: a.typ === 'auto' ? '#10b981' : a.typ === 'vorschlag' ? '#f59e0b' : '#8b5cf6' }}>
                        {a.feld}
                      </span>
                      <span style={{ color: '#ef4444', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.vorher || '–'}</span>
                      <span style={{ color: '#10b981', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nachher}</span>
                      <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.grund}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Neue Prüflinge */}
              {ergebnis.neuePrueoflinge.length > 0 && (
                <div style={{ background: '#faf5ff', borderRadius: 16, border: '1px solid #ddd6fe', padding: '16px 20px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Info size={15} /> {ergebnis.neuePrueoflinge.length} neue Prüflinge erkannt
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ergebnis.neuePrueoflinge.slice(0, 10).map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '6px 10px', background: 'rgba(139,92,246,0.06)', borderRadius: 8 }}>
                        <span style={{ fontFamily: 'monospace', color: '#6d28d9', fontWeight: 700 }}>#{p['ID']}</span>
                        <span style={{ color: '#374151' }}>{p['BEZEICHNUNG']}</span>
                        <span style={{ color: '#94a3b8' }}>{p['ABTEILUNG']}</span>
                        <span style={{ color: '#94a3b8' }}>{p['LETZTER PRÜFER']}</span>
                      </div>
                    ))}
                    {ergebnis.neuePrueoflinge.length > 10 && <p style={{ color: '#8b5cf6', fontSize: 12, margin: '4px 0 0' }}>+ {ergebnis.neuePrueoflinge.length - 10} weitere</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: ROADMAP ═══ */}
      {activeTab === 'Roadmap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { label: 'Geräte gesamt', value: '23.352', sub: 'in der Gesamtliste', color: '#2563eb', border: '#bfdbfe' },
              { label: 'Fällig 2026', value: '20.670', sub: 'nächste 12 Monate', color: '#f59e0b', border: '#fde68a' },
              { label: 'Kritisch Aug 26', value: '4.797', sub: 'größter Monat', color: '#ef4444', border: '#fecaca' },
            ].map((s, i) => (
              <div key={i} className="dguv-card" style={{ animationDelay: `${i * 0.08}s`, background: '#fff', borderRadius: 16, border: `1px solid ${s.border}`, padding: '18px 22px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
                <p style={{ fontSize: 28, fontWeight: 900, color: s.color, margin: '0 0 2px', letterSpacing: '-.04em' }}>{s.value}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 2px' }}>{s.label}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Fälligkeits-Roadmap</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>Anzahl Geräte die geprüft werden müssen · aus Gesamtliste26</p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11 }}>
              {[['#ef4444','Überfällig'], ['#f59e0b','2025'], ['#10b981','Frühjahr 26'], ['#2563eb','Sommer/Herbst 26']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                  <span style={{ color: '#64748b' }}>{l}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ROADMAP_DATA} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                <XAxis dataKey="monat" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [`${v.toLocaleString('de-DE')} Geräte`, 'Fällig']}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                  {ROADMAP_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monats-Tabelle */}
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Detailübersicht nach Monat</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Monat', 'Anzahl Geräte', 'Priorität', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROADMAP_DATA.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: '#0f172a' }}>{d.monat}</td>
                      <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontWeight: 700, color: d.color, fontSize: 14 }}>
                        {d.count.toLocaleString('de-DE')}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, width: 120, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min((d.count / 4797) * 100, 100)}%`, background: d.color, borderRadius: 99 }} />
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 6,
                          background: d.color === '#ef4444' ? '#fef2f2' : d.color === '#f59e0b' ? '#fffbeb' : d.color === '#10b981' ? '#f0fdf4' : '#eff6ff',
                          color: d.color }}>
                          {d.color === '#ef4444' ? 'Überfällig' : d.color === '#f59e0b' ? 'Dieses Jahr' : d.color === '#10b981' ? 'Frühjahr 26' : 'Sommer 26'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: AUSWERTUNG ═══ */}
      {activeTab === 'Auswertung' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!ergebnis ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', padding: '48px 24px', textAlign: 'center' }}>
              <BarChart2 size={36} style={{ color: '#e2e8f0', marginBottom: 12 }} />
              <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Lade erst eine CSV-Datei im Tab "Verarbeitung" um die Auswertung zu sehen</p>
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1f5f9', padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Messungen pro Prüfer</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>{dateiname}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={prueferStats} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [`${v} Geräte`, 'Geprüft']}
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                      {prueferStats.map((_, i) => <Cell key={i} fill={['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][i % 5]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                {prueferStats.map((p, i) => {
                  const farbe = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][i % 5];
                  const pct = Math.round((p.count / ergebnis.zeilen.length) * 100);
                  return (
                    <div key={p.name} className="dguv-card" style={{ animationDelay: `${i * 0.06}s`, background: '#fff', borderRadius: 16, border: `1px solid ${farbe}20`, padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: `${farbe}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: farbe }}>{p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{p.name}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{pct}% aller Messungen</p>
                        </div>
                      </div>
                      <p style={{ fontSize: 26, fontWeight: 900, color: farbe, margin: '0 0 8px', letterSpacing: '-.04em' }}>{p.count}</p>
                      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: farbe, borderRadius: 99 }} />
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
