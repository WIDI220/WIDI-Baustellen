import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { toast } from 'sonner';
import { Upload, CheckCircle, XCircle, AlertCircle, RotateCcw, RefreshCw, Plus, Trash2, ChevronLeft, ChevronRight, FileText, Scan, Zap, Info } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OCR_URL = 'https://widi-220-ticketflow-control.vercel.app/api/ocr';
const MAX_AUTO_STUNDEN = 5.0;

function roundTo025(val: number): number {
  return Math.round(val * 4) / 4;
}
function isValid025(val: number): boolean {
  return val > 0 && val <= MAX_AUTO_STUNDEN && Math.abs(val - roundTo025(val)) < 0.001;
}
function calcVonBis(von: string | null | undefined, bis: string | null | undefined): number | null {
  if (!von || !bis) return null;
  try {
    const [vonH, vonM] = von.split(':').map(Number);
    const [bisH, bisM] = bis.split(':').map(Number);
    const diffMin = (bisH * 60 + bisM) - (vonH * 60 + vonM);
    if (diffMin > 0 && diffMin <= 480) return Math.round((diffMin / 60) * 4) / 4;
    return null;
  } catch { return null; }
}

interface LogEntry {
  page: number;
  type: 'info' | 'ok' | 'warn' | 'error';
  message: string;
}

interface OcrPageResult {
  page: number;
  fileName: string;
  status: 'pending' | 'processing' | 'ok' | 'error' | 'no_match';
  a_nummer?: string | null;
  ticket_id?: string | null;
  mitarbeiter_namen?: string[];
  mitarbeiter_ids?: (string | null)[];
  stunden_raw?: number | null;
  stunden_valid?: number | null;
  arbeitszeit_von?: string | null;
  arbeitszeit_bis?: string | null;
  vonbis_stunden?: number | null;
  leistungsdatum?: string | null;
  konfidenz?: number;
  needsReview: boolean;
  reviewReasons: string[];
  error?: string;
  imageBase64?: string;
}

// Verifizierungs-Item: alle Seiten die importiert werden können
interface VerifyItem extends OcrPageResult {
  stunden_edit: string;
  datum_edit: string;
  mitarbeiter_edit: { id: string; name: string }[];
  confirmed: boolean; // wurde vom User bestätigt
}

export default function PdfRuecklauf() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'verifying' | 'done'>('idle');
  const [verifyItems, setVerifyItems] = useState<VerifyItem[]>([]);
  const [verifyIndex, setVerifyIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [liveLog, setLiveLog] = useState<LogEntry[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [scanField, setScanField] = useState<string | null>(null); // welches Feld gerade gelesen wird
  const [scanResult, setScanResult] = useState<{a_nummer:string|null, mitarbeiter:string|null, stunden:string|null, datum:string|null}>({a_nummer:null,mitarbeiter:null,stunden:null,datum:null});

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  function addLog(page: number, type: LogEntry['type'], message: string) {
    setLiveLog(prev => [...prev.slice(-49), { page, type, message }]);
  }

  function findEmployee(name: string | null): string | null {
    if (!name) return null;
    const input = name.toLowerCase().trim();
    if (!input) return null;
    for (const emp of employees as any[]) {
      if (input === (emp.kuerzel ?? '').toLowerCase()) return emp.id;
    }
    for (const emp of employees as any[]) {
      if (input === emp.name.toLowerCase()) return emp.id;
    }
    for (const emp of employees as any[]) {
      if (input.includes(emp.name.toLowerCase())) return emp.id;
    }
    for (const emp of employees as any[]) {
      const parts = emp.name.toLowerCase().split(' ').filter((p: string) => p.length > 2);
      if (parts.length > 0 && parts.every((p: string) => input.includes(p))) return emp.id;
    }
    for (const emp of employees as any[]) {
      const parts = emp.name.toLowerCase().split(' ').filter((p: string) => p.length >= 4);
      if (parts.some((p: string) => input.includes(p) || p.includes(input))) return emp.id;
    }
    for (const emp of employees as any[]) {
      const kuerzel = (emp.kuerzel ?? '').toLowerCase();
      if (kuerzel.length >= 2 && new RegExp('\\b' + kuerzel + '\\b').test(input)) return emp.id;
    }
    return null;
  }

  function parseEmployees(names: string[]): { ids: (string | null)[]; allFound: boolean } {
    const ids = names.map(n => findEmployee(n));
    return { ids, allFound: ids.every(id => id !== null) };
  }

  async function processFile(file: File) {
    if (isProcessing) return;
    setIsProcessing(true);
    setPhase('scanning');
    setPages([]);
    setCurrentPage(0);
    setFileName(file.name);
    setLiveLog([]);
    setCurrentImage(null);
    setScanField(null);
    setScanResult({a_nummer:null,mitarbeiter:null,stunden:null,datum:null});
    const results: OcrPageResult[] = [];

    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setTotalPages(count);
      setPages(Array.from({ length: count }, (_, i) => ({ page: i + 1, fileName: file.name, status: 'pending', needsReview: false, reviewReasons: [] })));
      addLog(0, 'info', `${file.name} — ${count} Seiten`);

      for (let i = 0; i < count; i++) {
        setCurrentPage(i + 1);
        setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'processing' } : p));
        addLog(i + 1, 'info', `Seite ${i + 1}/${count} wird analysiert...`);

        const result: OcrPageResult = { page: i + 1, fileName: file.name, status: 'pending', needsReview: false, reviewReasons: [] };

        try {
          const imageBase64 = await renderPdfPageToBase64(buffer, i);
          result.imageBase64 = imageBase64;
          setCurrentImage(imageBase64);
          setScanResult({a_nummer:null,mitarbeiter:null,stunden:null,datum:null});
          setScanField('a_nummer');

          const ocrResult = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', OCR_URL, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = 30000;
            xhr.ontimeout = () => reject(new Error(`Timeout Seite ${i + 1}`));
            xhr.onerror = () => reject(new Error(`Netzwerkfehler Seite ${i + 1}`));
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch { reject(new Error(`Antwort-Fehler Seite ${i + 1}`)); }
              } else { reject(new Error(`Server-Fehler ${xhr.status}`)); }
            };
            const now = new Date();
            const uploadMonth = String(now.getMonth() + 1).padStart(2, '0');
            const uploadYear = String(now.getFullYear());
            xhr.send(JSON.stringify({
              imageBase64, fileName: file.name, pageNumber: i + 1,
              employees: (employees as any[]).map((e: any) => ({ name: e.name, kuerzel: e.kuerzel })),
              uploadMonth, uploadYear
            }));
          });

          if (!ocrResult.success) {
            result.status = 'error';
            result.error = ocrResult.error ?? 'OCR fehlgeschlagen';
            result.needsReview = true;
            result.reviewReasons.push('OCR fehlgeschlagen');
            addLog(i + 1, 'error', `Seite ${i + 1} — ${ocrResult.error?.slice(0, 50)}`);
          } else {
            const ocr = ocrResult.result;
            result.konfidenz = ocr.konfidenz;
            result.arbeitszeit_von = ocr.arbeitszeit_von ?? null;
            result.arbeitszeit_bis = ocr.arbeitszeit_bis ?? null;
            result.vonbis_stunden = calcVonBis(ocr.arbeitszeit_von, ocr.arbeitszeit_bis);

            if (!ocr.a_nummer) {
              result.status = 'error';
              result.error = 'Keine A-Nummer erkannt';
              result.needsReview = true;
              result.reviewReasons.push('Keine A-Nummer erkannt');
              addLog(i + 1, 'error', `Seite ${i + 1} — Keine A-Nummer`);
            } else {
              result.a_nummer = ocr.a_nummer;
              setScanResult(prev => ({...prev, a_nummer: ocr.a_nummer}));
              setScanField('mitarbeiter');
              const { data: ticket } = await supabase.from('tickets').select('id, a_nummer, status').eq('a_nummer', ocr.a_nummer).maybeSingle();

              if (!ticket) {
                result.status = 'no_match';
                result.error = `${ocr.a_nummer} nicht in Datenbank`;
                result.needsReview = true;
                result.reviewReasons.push('Ticket nicht in Datenbank');
                addLog(i + 1, 'warn', `Seite ${i + 1} — ${ocr.a_nummer} nicht gefunden`);
              } else {
                result.ticket_id = ticket.id;
                const namen: string[] = [];
                if (ocr.mitarbeiter_name) namen.push(ocr.mitarbeiter_name);
                if (ocr.mitarbeiter_namen && Array.isArray(ocr.mitarbeiter_namen)) namen.push(...ocr.mitarbeiter_namen);
                const splitNamen: string[] = [];
                for (const n of namen) splitNamen.push(...n.split(/[,\/&+]/).map((s: string) => s.trim()).filter(Boolean));
                const uniqueNamen = [...new Set(splitNamen.filter(Boolean))];
                // Bekannte Korrekturen anwenden
                const { data: maKorrekturen } = await supabase
                  .from('ocr_korrekturen')
                  .select('ocr_gelesen, korrigiert_zu, haeufigkeit')
                  .eq('typ', 'mitarbeiter')
                  .order('haeufigkeit', { ascending: false });

                const korrigierteNamen = uniqueNamen.map(name => {
                  // Nur anwenden wenn Name lang genug ist (kein Kürzel)
                  if (name.length <= 5) return name;
                  const korr = (maKorrekturen ?? []).find(k =>
                    k.ocr_gelesen.toLowerCase() === name.toLowerCase() &&
                    k.haeufigkeit >= 2 // Mindestens 2x korrigiert für Sicherheit
                  );
                  return korr ? korr.korrigiert_zu : name;
                });

                result.mitarbeiter_namen = korrigierteNamen;
                setScanResult(prev => ({...prev, mitarbeiter: korrigierteNamen.join(', ') || null}));
                setScanField('stunden');
                const { ids, allFound } = parseEmployees(korrigierteNamen);
                result.mitarbeiter_ids = ids;

                if (!allFound || uniqueNamen.length === 0) {
                  result.needsReview = true;
                  result.reviewReasons.push(uniqueNamen.length === 0 ? 'Kein Mitarbeiter erkannt' : `Mitarbeiter nicht zugeordnet (${uniqueNamen.join(', ')})`);
                }

                let stundenRaw = Number(ocr.stunden_gesamt ?? 0);
                if ((stundenRaw === 0 || stundenRaw > 8) && result.vonbis_stunden) {
                  stundenRaw = result.vonbis_stunden;
                }

                // Bekannte Stunden-Korrekturen anwenden
                const { data: stdKorrekturen } = await supabase
                  .from('ocr_korrekturen')
                  .select('ocr_gelesen, korrigiert_zu, haeufigkeit')
                  .eq('typ', 'stunden')
                  .order('haeufigkeit', { ascending: false });

                const stdStr = String(stundenRaw);
                const stdKorr = (stdKorrekturen ?? []).find(k => k.ocr_gelesen === stdStr);
                if (stdKorr) {
                  const korrigiertStd = parseFloat(stdKorr.korrigiert_zu.replace(',', '.'));
                  if (!isNaN(korrigiertStd)) stundenRaw = korrigiertStd;
                }

                result.stunden_raw = stundenRaw;

                if (!isValid025(stundenRaw)) {
                  result.needsReview = true;
                  result.reviewReasons.push(stundenRaw > MAX_AUTO_STUNDEN ? `Stunden ${stundenRaw}h > ${MAX_AUTO_STUNDEN}h` : `Stunden ${stundenRaw}h unklar`);
                  result.stunden_valid = roundTo025(Math.min(stundenRaw, MAX_AUTO_STUNDEN)) || 0.25;
                } else {
                  result.stunden_valid = stundenRaw;
                }

                result.leistungsdatum = ocr.leistungsdatum ?? new Date().toISOString().split('T')[0];
                setScanResult(prev => ({...prev, datum: result.leistungsdatum ?? null}));
                setScanField(null);
                result.status = 'ok';

                const empNames = ids.map(id => (employees as any[]).find((e: any) => e.id === id)?.name ?? '?').join(', ') || uniqueNamen.join(', ');
                addLog(i + 1, result.needsReview ? 'warn' : 'ok', `Seite ${i + 1} — ${ocr.a_nummer} · ${empNames} · ${result.stunden_valid ?? stundenRaw}h`);
              }
            }
          }
        } catch (err: any) {
          result.status = 'error';
          result.error = err.message?.slice(0, 80);
          result.needsReview = true;
          result.reviewReasons.push(err.message?.slice(0, 60) ?? 'Fehler');
          addLog(i + 1, 'error', `Seite ${i + 1} — ${err.message?.slice(0, 50)}`);
        }

        results.push(result);
        setPages(prev => prev.map(p => p.page === i + 1 ? result : p));
        await new Promise(r => setTimeout(r, 150));
      }

      // Alle Seiten mit ticket_id in Verifizierung schicken
      const toVerify = results.filter(r => r.ticket_id);
      setVerifyItems(toVerify.map(r => ({
        ...r,
        stunden_edit: String(r.stunden_valid ?? r.stunden_raw ?? ''),
        datum_edit: r.leistungsdatum ?? new Date().toISOString().split('T')[0],
        mitarbeiter_edit: (r.mitarbeiter_ids ?? []).map((id, i) => ({
          id: id ?? '',
          name: r.mitarbeiter_namen?.[i] ?? '',
        })).filter(m => m.id),
        confirmed: false,
      })));

      setPhase('verifying');
      setVerifyIndex(0);
      setCurrentImage(null);

      const errors = results.filter(r => !r.ticket_id).length;
      if (errors > 0) addLog(0, 'warn', `${errors} Seiten ohne Ticket-Treffer — werden übersprungen`);
      addLog(0, 'ok', `Scan fertig — ${toVerify.length} Seiten zur Bestätigung`);

    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  // Korrektur speichern damit System lernt
  async function saveKorrektur(ocrGelesen: string, korrigiertZu: string, typ: 'mitarbeiter' | 'stunden') {
    if (!ocrGelesen || !korrigiertZu || ocrGelesen.trim() === korrigiertZu.trim()) return;
    try {
      const { data: existing } = await supabase
        .from('ocr_korrekturen')
        .select('id, haeufigkeit')
        .eq('ocr_gelesen', ocrGelesen.trim())
        .eq('korrigiert_zu', korrigiertZu.trim())
        .eq('typ', typ)
        .maybeSingle();

      if (existing) {
        await supabase.from('ocr_korrekturen').update({
          haeufigkeit: existing.haeufigkeit + 1,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
      } else {
        await supabase.from('ocr_korrekturen').insert({
          ocr_gelesen: ocrGelesen.trim(),
          korrigiert_zu: korrigiertZu.trim(),
          typ
        });
      }
    } catch { /* ignorieren */ }
  }

  async function importAll() {
    setImporting(true);
    let saved = 0, skipped = 0;

    for (const item of verifyItems) {
      if (!item.ticket_id) { skipped++; continue; }
      const stunden = parseFloat(item.stunden_edit.replace(',', '.'));
      if (isNaN(stunden) || stunden <= 0) { skipped++; continue; }
      const empIds = item.mitarbeiter_edit.map(m => m.id).filter(Boolean);
      if (empIds.length === 0) { skipped++; continue; }

      // Korrekturen speichern wenn Stunden geändert wurden
      const stundenOriginal = String(item.stunden_raw ?? '');
      const stundenKorrigiert = item.stunden_edit;
      if (stundenOriginal && stundenKorrigiert && stundenOriginal !== stundenKorrigiert) {
        await saveKorrektur(stundenOriginal, stundenKorrigiert, 'stunden');
      }

      // Korrekturen speichern wenn Mitarbeiter geändert wurden
      // NUR bei langen Namen (>5 Zeichen) — Kürzel wie "SB", "SG" sind zu mehrdeutig
      const originalNamen = item.mitarbeiter_namen ?? [];
      const korrigiertNamen = item.mitarbeiter_edit.map(m => m.name).filter(Boolean);
      for (let i = 0; i < originalNamen.length; i++) {
        const orig = originalNamen[i];
        const korr = korrigiertNamen[i];
        if (korr && orig !== korr && orig.length > 5) {
          // Nur speichern wenn OCR-Name lang genug ist um eindeutig zu sein
          await saveKorrektur(orig, korr, 'mitarbeiter');
        }
      }

      try {
        for (const empId of empIds) {
          await supabase.from('ticket_worklogs').insert({
            ticket_id: item.ticket_id,
            employee_id: empId,
            stunden: roundTo025(stunden),
            leistungsdatum: item.datum_edit,
          });
        }
        await supabase.from('tickets').update({ status: 'erledigt', updated_at: new Date().toISOString() }).eq('id', item.ticket_id);
        saved++;
      } catch { skipped++; }
    }

    queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
    const { data: userData } = await supabase.auth.getUser();
    await logActivity(userData.user?.email, `PDF-Rücklauf importiert: ${saved} Tickets · ${skipped} übersprungen`, 'pdf_ruecklauf', undefined, { datei: fileName, importiert: saved, uebersprungen: skipped });
    toast.success(`✅ ${saved} importiert · ⏭ ${skipped} übersprungen`);
    setPhase('done');
    setImporting(false);
  }

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const currentVerify = verifyItems[verifyIndex];
  const confirmedCount = verifyItems.filter(v => v.confirmed).length;
  const problemCount = verifyItems.filter(v => v.needsReview).length;

  // Von/Bis Warnung
  function vonBisWarning(item: VerifyItem): string | null {
    if (!item.vonbis_stunden) return null;
    const std = parseFloat(item.stunden_edit.replace(',', '.'));
    if (isNaN(std)) return null;
    const diff = Math.abs(std - item.vonbis_stunden);
    if (diff > 0.25) return `Von/Bis ergibt ${item.vonbis_stunden}h`;
    return null;
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.2s ease forwards; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PDF-Rücklauf</h1>
          <p className="text-sm text-gray-400 mt-0.5">Scan · Prüfung · Import</p>
        </div>
        {(phase === 'done' || phase === 'verifying') && (
          <button onClick={() => { setPages([]); setPhase('idle'); setFileName(''); setLiveLog([]); setVerifyItems([]); }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Upload className="h-3.5 w-3.5" /> Neue Datei
          </button>
        )}
      </div>

      {/* IDLE — Upload */}
      {phase === 'idle' && (
        <div onClick={() => fileInputRef.current?.click()}
          className="group relative border border-gray-200 rounded-2xl bg-white cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all duration-200 overflow-hidden">
          <div className="px-8 py-14 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-blue-50 border border-gray-100 mx-auto mb-4 flex items-center justify-center transition-colors">
              <Upload className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">PDF hochladen</p>
            <p className="text-xs text-gray-400">Alle Seiten werden einzeln zur Bestätigung angezeigt</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
        </div>
      )}

      {/* SCANNING */}
      {phase === 'scanning' && (
        <div className="grid grid-cols-5 gap-4" style={{ height: '500px' }}>

          {/* Links 3/5 — Ticket mit Fokus-Ring */}
          <div className="col-span-3 relative bg-gray-950 rounded-2xl overflow-hidden flex items-center justify-center" style={{ height: '500px' }}>
            {currentImage ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  key={currentPage}
                  src={`data:image/png;base64,${currentImage}`}
                  alt="Ticket"
                  id="scanTicketImg"
                  className="object-contain"
                  style={{ maxWidth: '85%', maxHeight: '460px', opacity: 0.92, display: 'block' }}
                />
                {/* Fokus-Ring: zeigt welches Feld gerade gelesen wird */}
                {scanField && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      border: '1.5px solid rgba(96,165,250,0.95)',
                      borderRadius: '3px',
                      boxShadow: '0 0 0 3px rgba(96,165,250,0.15)',
                      transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
                      ...(scanField === 'a_nummer'   ? { top: '8%',  left: '10%', width: '35%', height: '5%' } :
                          scanField === 'mitarbeiter' ? { top: '68%', left: '30%', width: '55%', height: '6%' } :
                          scanField === 'stunden'     ? { top: '75%', left: '45%', width: '15%', height: '5%' } :
                          scanField === 'datum'       ? { top: '75%', left: '5%',  width: '25%', height: '5%' } :
                          { opacity: 0 })
                    }}
                  />
                )}
                {/* KI-Punkte unten im Bild */}
                {scanField && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
                        style={{ animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <RefreshCw className="h-7 w-7 text-blue-400/60 animate-spin" />
                <p className="text-gray-600 text-xs">Lade Seite...</p>
              </div>
            )}
            {/* Top badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1.5 bg-black/55 text-white/85 text-xs px-2.5 py-1 rounded-lg font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {scanField ? {
                  a_nummer: 'A-Nummer lesen...',
                  mitarbeiter: 'Mitarbeiter erkennen...',
                  stunden: 'Stunden lesen...',
                  datum: 'Datum lesen...'
                }[scanField] : 'Analysiere...'}
              </div>
              <span className="bg-black/55 text-white/60 text-xs px-2.5 py-1 rounded-lg font-mono">
                {currentPage} / {totalPages}
              </span>
            </div>
            {/* Progress */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Rechts 2/5 */}
          <div className="col-span-2 flex flex-col gap-3" style={{ height: '500px' }}>

            {/* Aktuell erkannte Felder */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Erkannt</p>
              <div className="space-y-2.5">
                {[
                  { label: 'A-Nummer', value: scanResult.a_nummer, field: 'a_nummer' },
                  { label: 'Mitarbeiter', value: scanResult.mitarbeiter, field: 'mitarbeiter' },
                  { label: 'Stunden', value: scanResult.stunden, field: 'stunden' },
                  { label: 'Datum', value: scanResult.datum, field: 'datum' },
                ].map(row => (
                  <div key={row.field} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{row.label}</span>
                    <span className={`text-xs font-mono font-medium transition-all duration-300
                      ${scanField === row.field ? 'text-blue-500' :
                        row.value ? 'text-gray-900' : 'text-gray-300'}`}>
                      {scanField === row.field ? (
                        <span className="flex gap-0.5">
                          {[0,1,2].map(i => (
                            <span key={i} className="inline-block w-1 h-1 rounded-full bg-blue-400"
                              style={{ animation: `dotPulse 1s ease-in-out ${i*0.15}s infinite` }} />
                          ))}
                        </span>
                      ) : (row.value ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fortschritt */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fortschritt</span>
                <span className="text-xs font-mono text-gray-400">{progress}%</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5 mb-3">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="grid grid-cols-3 text-center gap-0">
                <div>
                  <p className="text-lg font-semibold text-emerald-600">{pages.filter(p => p.status === 'ok' && !p.needsReview).length}</p>
                  <p className="text-[10px] text-gray-400">OK</p>
                </div>
                <div className="border-x border-gray-100">
                  <p className="text-lg font-semibold text-amber-500">{pages.filter(p => p.needsReview && p.ticket_id).length}</p>
                  <p className="text-[10px] text-gray-400">Prüfung</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-red-400">{pages.filter(p => !p.ticket_id && p.status !== 'pending' && p.status !== 'processing').length}</p>
                  <p className="text-[10px] text-gray-400">Fehler</p>
                </div>
              </div>
            </div>

            {/* Log — wächst nach oben, feste Höhe */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-50 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Verlauf</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 flex flex-col-reverse gap-1 min-h-0">
                {isProcessing && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-blue-400 flex-shrink-0">
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                    <span>Seite {currentPage}...</span>
                  </div>
                )}
                {[...liveLog].map((log, i) => (
                  <div key={i} className={`flex items-baseline gap-2 px-2.5 py-1.5 rounded-lg text-xs flex-shrink-0
                    ${log.type === 'ok'    ? 'text-emerald-600' :
                      log.type === 'warn'  ? 'text-amber-600'  :
                      log.type === 'error' ? 'text-red-500'    : 'text-gray-400'}`}>
                    <span className="font-semibold shrink-0">
                      {log.type === 'ok' ? '✓' : log.type === 'warn' ? '!' : log.type === 'error' ? '✕' : '·'}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VERIFYING: Split-View alle Seiten */}
      {phase === 'verifying' && currentVerify && (
        <div className="space-y-4">
          {/* Progress Header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Seite {verifyIndex + 1} von {verifyItems.length} prüfen
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {confirmedCount} bestätigt · {problemCount} mit Hinweisen
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setVerifyIndex(i => Math.max(0, i - 1))} disabled={verifyIndex === 0}
                  className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-mono text-gray-400 min-w-[60px] text-center">{verifyIndex + 1} / {verifyItems.length}</span>
                <button onClick={() => setVerifyIndex(i => Math.min(verifyItems.length - 1, i + 1))} disabled={verifyIndex === verifyItems.length - 1}
                  className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Fortschrittsbalken */}
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(confirmedCount / verifyItems.length) * 100}%` }} />
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {verifyItems.map((v, i) => (
                <button key={i} onClick={() => setVerifyIndex(i)}
                  className={`w-6 h-6 rounded-md text-xs font-mono transition-colors
                    ${i === verifyIndex ? 'bg-[#1e3a5f] text-white' :
                      v.confirmed ? 'bg-emerald-100 text-emerald-700' :
                      v.needsReview ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Split-View */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ minHeight: '580px' }}>
            <div className="grid grid-cols-2 h-full" style={{ minHeight: '580px' }}>
              {/* Links: Original */}
              <div className="bg-gray-950 flex flex-col">
                <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">ORIGINAL — Seite {currentVerify.page}</span>
                  {currentVerify.needsReview && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Prüfung empfohlen</span>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center p-3">
                  {currentVerify.imageBase64 ? (
                    <img key={verifyIndex} src={`data:image/png;base64,${currentVerify.imageBase64}`}
                      alt={`Seite ${currentVerify.page}`}
                      className="w-full h-full object-contain fade-up rounded-lg" style={{ maxHeight: '520px' }} />
                  ) : (
                    <div className="text-gray-500 text-sm">Kein Bild</div>
                  )}
                </div>
              </div>

              {/* Rechts: Daten */}
              <div className="flex flex-col overflow-y-auto border-l border-gray-100">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#1e3a5f] text-xl">{currentVerify.a_nummer}</span>
                    {currentVerify.confirmed && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Bestätigt</span>}
                    {currentVerify.needsReview && !currentVerify.confirmed && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Bitte prüfen</span>
                    )}
                  </div>
                  {currentVerify.reviewReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {currentVerify.reviewReasons.map((r, i) => (
                        <span key={i} className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">{r}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 p-6 space-y-5">
                  {/* Stunden */}
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Stunden</Label>
                    <Input
                      value={currentVerify.stunden_edit}
                      onChange={e => setVerifyItems(prev => prev.map((v, i) => i === verifyIndex ? { ...v, stunden_edit: e.target.value, confirmed: false } : v))}
                      className="h-11 rounded-xl font-mono text-lg font-semibold"
                      placeholder="z.B. 1.5"
                    />
                    {/* Von/Bis Info */}
                    {currentVerify.vonbis_stunden !== null && (
                      <div className={`flex items-center gap-2 mt-2 text-xs px-3 py-2 rounded-lg
                        ${vonBisWarning(currentVerify) ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-500'}`}>
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Von/Bis ({currentVerify.arbeitszeit_von} – {currentVerify.arbeitszeit_bis}) ergibt <strong>{currentVerify.vonbis_stunden}h</strong>
                          {vonBisWarning(currentVerify) && ' — Abweichung!'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Datum */}
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Leistungsdatum</Label>
                    <Input
                      type="date"
                      value={currentVerify.datum_edit}
                      onChange={e => setVerifyItems(prev => prev.map((v, i) => i === verifyIndex ? { ...v, datum_edit: e.target.value, confirmed: false } : v))}
                      className="h-11 rounded-xl"
                    />
                  </div>

                  {/* Mitarbeiter */}
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Mitarbeiter</Label>
                    <div className="space-y-2">
                      {currentVerify.mitarbeiter_edit.map((m, mIdx) => (
                        <div key={mIdx} className="flex gap-2">
                          <Select value={m.id} onValueChange={v => setVerifyItems(prev => prev.map((r, i) => i === verifyIndex ? {
                            ...r, confirmed: false,
                            mitarbeiter_edit: r.mitarbeiter_edit.map((me, mi) => mi === mIdx
                              ? { ...me, id: v, name: (employees as any[]).find((e: any) => e.id === v)?.name ?? '' } : me)
                          } : r))}>
                            <SelectTrigger className="h-10 rounded-xl flex-1 text-sm">
                              <SelectValue placeholder="Mitarbeiter wählen..." />
                            </SelectTrigger>
                            <SelectContent style={{ background:'#fff', border:'1px solid #e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:9999 }}>
                              {(employees as any[]).map((e: any) => (
                                <SelectItem key={e.id} value={e.id} style={{ color:'#0f172a', fontWeight:500 }}>{e.kuerzel} – {e.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button onClick={() => setVerifyItems(prev => prev.map((r, i) => i === verifyIndex ? {
                            ...r, confirmed: false,
                            mitarbeiter_edit: r.mitarbeiter_edit.filter((_, mi) => mi !== mIdx)
                          } : r))} className="p-2 rounded-xl hover:bg-red-50 text-red-400 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setVerifyItems(prev => prev.map((r, i) => i === verifyIndex ? {
                        ...r, confirmed: false,
                        mitarbeiter_edit: [...r.mitarbeiter_edit, { id: '', name: '' }]
                      } : r))} className="flex items-center gap-1.5 text-xs text-[#1e3a5f] hover:text-blue-600 font-medium transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Mitarbeiter hinzufügen
                      </button>
                    </div>
                  </div>
                </div>

                {/* Aktionen */}
                <div className="px-6 pb-6 pt-2 border-t border-gray-100 space-y-2">
                  {/* Bestätigen Button */}
                  <button
                    onClick={() => {
                      setVerifyItems(prev => prev.map((v, i) => i === verifyIndex ? { ...v, confirmed: true } : v));
                      if (verifyIndex < verifyItems.length - 1) setVerifyIndex(i => i + 1);
                    }}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors
                      ${currentVerify.confirmed
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    <CheckCircle className="h-4 w-4" />
                    {currentVerify.confirmed ? '✓ Bestätigt — weiter' : 'Bestätigen & weiter'}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={() => setVerifyIndex(i => Math.max(0, i - 1))} disabled={verifyIndex === 0}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                      <ChevronLeft className="h-4 w-4" /> Zurück
                    </button>
                    <button onClick={() => setVerifyIndex(i => Math.min(verifyItems.length - 1, i + 1))} disabled={verifyIndex === verifyItems.length - 1}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                      Weiter <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Import Button — nur wenn alle bestätigt */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">{confirmedCount} von {verifyItems.length} bestätigt</p>
                <p className="text-xs text-gray-400">
                  {confirmedCount < verifyItems.length
                    ? `Noch ${verifyItems.length - confirmedCount} Seite${verifyItems.length - confirmedCount !== 1 ? 'n' : ''} offen`
                    : 'Alle bestätigt — bereit zum Import'}
                </p>
              </div>
              <button
                onClick={importAll}
                disabled={importing || confirmedCount === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-colors
                  ${confirmedCount === verifyItems.length
                    ? 'bg-[#1e3a5f] text-white hover:bg-[#162d4a]'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {importing ? 'Importiert...' : confirmedCount === verifyItems.length
                  ? `Alle ${confirmedCount} importieren`
                  : `${confirmedCount} bestätigte importieren`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === 'done' && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Import abgeschlossen</h2>
          <p className="text-sm text-gray-400 mb-6">Alle Tickets wurden erfolgreich verarbeitet</p>
          <button onClick={() => { setPages([]); setPhase('idle'); setFileName(''); setLiveLog([]); setVerifyItems([]); }}
            className="flex items-center gap-2 px-6 py-3 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] transition-colors mx-auto">
            <Upload className="h-4 w-4" /> Neue Datei verarbeiten
          </button>
        </div>
      )}
    </div>
  );
}
