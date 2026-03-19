import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { toast } from 'sonner';
import { Upload, CheckCircle, XCircle, AlertCircle, RotateCcw, RefreshCw, Pencil, Plus, Trash2, ChevronLeft, ChevronRight, FileText, Scan, Zap } from 'lucide-react';
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
  leistungsdatum?: string | null;
  konfidenz?: number;
  needsReview: boolean;
  reviewReasons: string[];
  error?: string;
  imported?: boolean;
  imageBase64?: string;
}
interface ReviewItem extends OcrPageResult {
  stunden_edit: string;
  mitarbeiter_edit: { id: string; name: string }[];
}

export default function PdfRuecklauf() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [importingReview, setImportingReview] = useState(false);
  const [liveLog, setLiveLog] = useState<LogEntry[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

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

  async function importPage(page: OcrPageResult, stundenOverride?: number, mitarbeiterOverride?: string[], datumOverride?: string) {
    const stunden = stundenOverride ?? page.stunden_valid!;
    const empIds = mitarbeiterOverride ?? page.mitarbeiter_ids?.filter(Boolean) as string[];
    const leistungsdatum = datumOverride ?? page.leistungsdatum ?? new Date().toISOString().split('T')[0];
    for (const empId of empIds) {
      if (!empId) continue;
      await supabase.from('ticket_worklogs').insert({ ticket_id: page.ticket_id, employee_id: empId, stunden, leistungsdatum });
    }
    await supabase.from('tickets').update({ status: 'erledigt', updated_at: new Date().toISOString() }).eq('id', page.ticket_id);
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
            xhr.send(JSON.stringify({ imageBase64, fileName: file.name, pageNumber: i + 1, employees: (employees as any[]).map((e: any) => ({ name: e.name, kuerzel: e.kuerzel })) }));
          });

          if (!ocrResult.success) {
            result.status = 'error';
            result.error = ocrResult.error ?? 'OCR fehlgeschlagen';
            result.needsReview = true;
            result.reviewReasons.push('OCR fehlgeschlagen');
            addLog(i + 1, 'error', `Seite ${i + 1} — Fehler: ${ocrResult.error?.slice(0, 50)}`);
          } else {
            const ocr = ocrResult.result;
            result.konfidenz = ocr.konfidenz;
            if (!ocr.a_nummer) {
              result.status = 'error';
              result.error = 'Keine A-Nummer erkannt';
              result.needsReview = true;
              result.reviewReasons.push('Keine A-Nummer erkannt');
              addLog(i + 1, 'error', `Seite ${i + 1} — Keine A-Nummer`);
            } else {
              result.a_nummer = ocr.a_nummer;
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
                result.mitarbeiter_namen = uniqueNamen;
                const { ids, allFound } = parseEmployees(uniqueNamen);
                result.mitarbeiter_ids = ids;
                if (!allFound || uniqueNamen.length === 0) {
                  result.needsReview = true;
                  result.reviewReasons.push(uniqueNamen.length === 0 ? 'Kein Mitarbeiter erkannt' : `Mitarbeiter nicht zugeordnet (${uniqueNamen.join(', ')})`);
                  addLog(i + 1, 'warn', `Seite ${i + 1} — Mitarbeiter unklar`);
                } else {
                  const empNames = ids.map(id => (employees as any[]).find((e: any) => e.id === id)?.name ?? '?').join(', ');
                  addLog(i + 1, 'ok', `Seite ${i + 1} — ${ocr.a_nummer} · ${empNames}`);
                }
                let stundenRaw = Number(ocr.stunden_gesamt ?? 0);
                result.stunden_raw = stundenRaw;
                if ((stundenRaw === 0 || stundenRaw > 8) && ocr.arbeitszeit_von && ocr.arbeitszeit_bis) {
                  try {
                    const [vonH, vonM] = ocr.arbeitszeit_von.split(':').map(Number);
                    const [bisH, bisM] = ocr.arbeitszeit_bis.split(':').map(Number);
                    const diffMin = (bisH * 60 + bisM) - (vonH * 60 + vonM);
                    if (diffMin > 0 && diffMin <= 480) { stundenRaw = Math.round((diffMin / 60) * 4) / 4; result.stunden_raw = stundenRaw; }
                  } catch { /* ignorieren */ }
                }
                if (!isValid025(stundenRaw)) {
                  result.needsReview = true;
                  result.reviewReasons.push(stundenRaw > MAX_AUTO_STUNDEN ? `Stunden ${stundenRaw}h > ${MAX_AUTO_STUNDEN}h` : `Stunden ${stundenRaw}h unklar`);
                  result.stunden_valid = roundTo025(Math.min(stundenRaw, MAX_AUTO_STUNDEN)) || 0.25;
                } else {
                  result.stunden_valid = stundenRaw;
                }
                if (ocr.konfidenz && ocr.konfidenz < 0.70) {
                  result.needsReview = true;
                  result.reviewReasons.push(`Niedrige Konfidenz (${Math.round(ocr.konfidenz * 100)}%)`);
                }
                result.leistungsdatum = ocr.leistungsdatum ?? new Date().toISOString().split('T')[0];
                if (!result.needsReview) {
                  await importPage(result);
                  result.status = 'ok';
                  result.imported = true;
                  const empNames = (result.mitarbeiter_ids ?? []).map(id => (employees as any[]).find((e: any) => e.id === id)?.name ?? '?').join(', ');
                  addLog(i + 1, 'ok', `✓ ${ocr.a_nummer} · ${empNames} · ${result.stunden_valid}h`);
                } else {
                  result.status = 'error';
                  addLog(i + 1, 'warn', `Seite ${i + 1} — ${ocr.a_nummer} → Prüfung nötig`);
                }
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

      const toReview = results.filter(r => r.needsReview && r.ticket_id);
      setReviewItems(toReview.map(r => ({
        ...r,
        stunden_edit: String(r.stunden_valid ?? r.stunden_raw ?? ''),
        mitarbeiter_edit: (r.mitarbeiter_ids ?? []).map((id, i) => ({ id: id ?? '', name: r.mitarbeiter_namen?.[i] ?? '' })).filter(m => m.id),
      })));
      setPhase('done');
      setCurrentImage(null);
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      const autoOk = results.filter(r => r.imported).length;
      const needReview = toReview.length;
      const errors = results.filter(r => r.status === 'error' && !r.ticket_id).length;
      const noMatch = results.filter(r => r.status === 'no_match').length;
      toast.success(`Fertig — ✅ ${autoOk} importiert · ⚠️ ${needReview} zur Prüfung · ❌ ${errors + noMatch} Fehler`);
      if (needReview > 0) { setReviewIndex(0); setShowReview(true); }
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function confirmReview() {
    setImportingReview(true);
    let saved = 0, skipped = 0;
    for (const item of reviewItems) {
      if (!item.ticket_id) { skipped++; continue; }
      const stunden = parseFloat(item.stunden_edit.replace(',', '.'));
      if (isNaN(stunden) || stunden <= 0) { skipped++; continue; }
      const empIds = item.mitarbeiter_edit.map(m => m.id).filter(Boolean);
      if (empIds.length === 0) { skipped++; continue; }
      try { await importPage(item, roundTo025(stunden), empIds, item.leistungsdatum ?? undefined); saved++; }
      catch { skipped++; }
    }
    queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
    toast.success(`✅ ${saved} importiert · ⏭ ${skipped} übersprungen`);
    setShowReview(false);
    setImportingReview(false);
  }

  const okCount = pages.filter(p => p.imported).length;
  const reviewCount = pages.filter(p => p.needsReview && p.ticket_id).length;
  const errorCount = pages.filter(p => p.status === 'error' && !p.ticket_id).length;
  const noMatchCount = pages.filter(p => p.status === 'no_match').length;
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const currentReview = reviewItems[reviewIndex];

  return (
    <div className="space-y-6 max-w-6xl">
      <style>{`
        @keyframes scanBeam {
          0% { transform: translateY(-4px); opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { transform: translateY(calc(100vh)); opacity: 0; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
        }
        .scan-card { animation: fadeSlideIn 0.3s ease forwards; }
        .scan-beam {
          animation: scanBeam 2.2s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        .pulse-ring { animation: pulse-glow 2s ease-in-out infinite; }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PDF-Rücklauf</h1>
          <p className="text-sm text-gray-400 mt-0.5">KI erkennt A-Nummer, Mitarbeiter und Stunden automatisch</p>
        </div>
        {phase === 'done' && (
          <button onClick={() => { setPages([]); setPhase('idle'); setFileName(''); setLiveLog([]); }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Upload className="h-4 w-4" /> Neue Datei
          </button>
        )}
      </div>

      {/* IDLE: Upload */}
      {phase === 'idle' && (
        <div onClick={() => fileInputRef.current?.click()}
          className="group relative border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all duration-300">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 group-hover:bg-blue-100 mx-auto mb-5 flex items-center justify-center transition-colors">
            <Upload className="h-7 w-7 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>
          <p className="text-base font-semibold text-gray-700 group-hover:text-gray-900">PDF hier ablegen oder klicken</p>
          <p className="text-sm text-gray-400 mt-1.5">Stunden ≤ 5h werden automatisch importiert · alles andere zur Prüfung</p>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
        </div>
      )}

      {/* SCANNING: Split-View mit Scanner-Animation */}
      {phase === 'scanning' && (
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-lg bg-white" style={{ minHeight: '520px' }}>
          <div className="grid grid-cols-5 h-full" style={{ minHeight: '520px' }}>

            {/* LINKS 3/5: Ticket-Vorschau mit Scanner */}
            <div className="col-span-3 relative bg-gray-950 overflow-hidden flex items-center justify-center">
              {currentImage ? (
                <>
                  <img
                    key={currentPage}
                    src={`data:image/png;base64,${currentImage}`}
                    alt="Ticket"
                    className="w-full h-full object-contain"
                    style={{ maxHeight: '520px', opacity: 0.92 }}
                  />
                  {/* Scanner-Balken */}
                  <div className="scan-beam absolute left-0 right-0 pointer-events-none" style={{ top: 0 }}>
                    <div className="h-0.5 bg-blue-400" style={{ boxShadow: '0 0 20px 6px rgba(96,165,250,0.7), 0 0 40px 12px rgba(96,165,250,0.3)' }} />
                  </div>
                  {/* Scan-Overlay Gradient */}
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.3) 100%)' }} />
                  {/* Seiten-Badge */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <div className="pulse-ring flex items-center gap-2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full font-mono">
                      <Scan className="h-3 w-3 text-blue-400" />
                      {currentPage} / {totalPages}
                    </div>
                  </div>
                  {/* Fortschritt unten */}
                  <div className="absolute bottom-0 left-0 right-0">
                    <div className="h-1 bg-gray-800">
                      <div className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${progress}%`, boxShadow: '0 0 8px rgba(59,130,246,0.8)' }} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
                  <p className="text-gray-500 text-sm">Bereite vor...</p>
                </div>
              )}
            </div>

            {/* RECHTS 2/5: Live-Feed */}
            <div className="col-span-2 flex flex-col bg-gray-50 border-l border-gray-100">
              {/* Header */}
              <div className="px-5 py-4 bg-white border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Live-Analyse</span>
                  </div>
                  <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{progress}%</span>
                </div>
                {/* Mini Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                    <p className="text-lg font-bold text-emerald-700">{okCount}</p>
                    <p className="text-[10px] text-emerald-500 font-medium">OK</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-2.5 text-center">
                    <p className="text-lg font-bold text-amber-700">{reviewCount}</p>
                    <p className="text-[10px] text-amber-500 font-medium">Prüfung</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-2.5 text-center">
                    <p className="text-lg font-bold text-red-700">{errorCount + noMatchCount}</p>
                    <p className="text-[10px] text-red-400 font-medium">Fehler</p>
                  </div>
                </div>
              </div>

              {/* Live-Log Feed */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {[...liveLog].reverse().map((log, i) => (
                  <div key={i} className={`scan-card flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs
                    ${log.type === 'ok' ? 'bg-emerald-50 text-emerald-700' :
                      log.type === 'warn' ? 'bg-amber-50 text-amber-700' :
                      log.type === 'error' ? 'bg-red-50 text-red-600' :
                      'bg-white text-gray-500 border border-gray-100'}`}>
                    <span className="mt-0.5 shrink-0">
                      {log.type === 'ok' ? '✓' : log.type === 'warn' ? '⚠' : log.type === 'error' ? '✕' : '·'}
                    </span>
                    <span className="leading-relaxed">{log.message}</span>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl text-xs text-blue-500">
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                    <span>Analysiere Seite {currentPage}...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DONE: Statistiken + Seitenübersicht */}
      {phase === 'done' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{okCount}</p><p className="text-xs text-gray-400">Auto importiert</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => reviewCount > 0 && setShowReview(true)}>
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><AlertCircle className="h-5 w-5 text-amber-500" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{reviewCount}</p><p className="text-xs text-gray-400">Zur Prüfung {reviewCount > 0 && '→'}</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center"><FileText className="h-5 w-5 text-orange-400" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{noMatchCount}</p><p className="text-xs text-gray-400">Nicht gefunden</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><XCircle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{errorCount}</p><p className="text-xs text-gray-400">Fehler</p></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wider">Seitenübersicht</h2>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {pages.map(p => (
                <div key={p.page} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm border transition-colors
                  ${p.imported ? 'bg-emerald-50 border-emerald-100' :
                    p.needsReview && p.ticket_id ? 'bg-amber-50 border-amber-100' :
                    p.status === 'no_match' ? 'bg-orange-50 border-orange-100' :
                    p.status === 'error' ? 'bg-red-50 border-red-100' :
                    'bg-gray-50 border-gray-100'}`}>
                  <span className="text-xs text-gray-300 font-mono w-8 shrink-0">{p.page}</span>
                  {p.imported && <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {p.needsReview && p.ticket_id && <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />}
                  {p.status === 'no_match' && <XCircle className="h-4 w-4 text-orange-400 shrink-0" />}
                  {p.status === 'error' && !p.needsReview && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    {p.imported && <span className="text-emerald-800"><strong className="font-mono">{p.a_nummer}</strong> · {p.mitarbeiter_namen?.join(', ')} · {p.stunden_valid}h</span>}
                    {p.needsReview && p.ticket_id && <span className="text-amber-700"><strong className="font-mono">{p.a_nummer}</strong> · {p.reviewReasons[0]}</span>}
                    {p.status === 'no_match' && <span className="text-orange-600 font-mono">{p.error}</span>}
                    {p.status === 'error' && !p.needsReview && <span className="text-red-500">{p.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {reviewCount > 0 && (
            <button onClick={() => { setReviewIndex(0); setShowReview(true); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-amber-500 text-white rounded-2xl text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm">
              <Pencil className="h-4 w-4" /> {reviewCount} Einträge nachbearbeiten
            </button>
          )}
        </>
      )}

      {/* Split-View Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-gray-100 bg-white">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span>Nachbearbeitung</span>
                <span className="text-sm font-normal text-gray-400">— {reviewIndex + 1} von {reviewItems.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setReviewIndex(i => Math.max(0, i - 1))} disabled={reviewIndex === 0}
                  className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setReviewIndex(i => Math.min(reviewItems.length - 1, i + 1))} disabled={reviewIndex === reviewItems.length - 1}
                  className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </DialogTitle>
          </div>

          {currentReview && (
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="w-1/2 shrink-0 bg-gray-950 flex items-center justify-center p-2">
                {currentReview.imageBase64 ? (
                  <img src={`data:image/png;base64,${currentReview.imageBase64}`}
                    alt={`Seite ${currentReview.page}`}
                    className="w-full h-full object-contain rounded-xl" style={{ maxHeight: '75vh' }} />
                ) : (
                  <div className="text-gray-500 text-sm">Kein Bild</div>
                )}
              </div>

              <div className="w-1/2 flex flex-col overflow-y-auto p-6 space-y-4 bg-white">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono font-bold text-[#1e3a5f] text-xl">{currentReview.a_nummer}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">S. {currentReview.page}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {currentReview.reviewReasons.map((r, i) => (
                      <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">{r}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block font-medium uppercase tracking-wider">Stunden · OCR: {currentReview.stunden_raw}h</Label>
                  <Input value={currentReview.stunden_edit}
                    onChange={e => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? { ...r, stunden_edit: e.target.value } : r))}
                    className="h-10 rounded-xl font-mono text-base" placeholder="z.B. 1.5" />
                </div>

                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block font-medium uppercase tracking-wider">Leistungsdatum</Label>
                  <Input type="date" value={currentReview.leistungsdatum ?? new Date().toISOString().split('T')[0]}
                    onChange={e => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? { ...r, leistungsdatum: e.target.value } : r))}
                    className="h-10 rounded-xl" />
                </div>

                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block font-medium uppercase tracking-wider">Mitarbeiter</Label>
                  <div className="space-y-2">
                    {currentReview.mitarbeiter_edit.map((m, mIdx) => (
                      <div key={mIdx} className="flex gap-2">
                        <Select value={m.id} onValueChange={v => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                          ...r, mitarbeiter_edit: r.mitarbeiter_edit.map((me, mi) => mi === mIdx
                            ? { ...me, id: v, name: (employees as any[]).find((e: any) => e.id === v)?.name ?? '' } : me)
                        } : r))}>
                          <SelectTrigger className="h-9 rounded-xl flex-1 text-xs"><SelectValue placeholder="Mitarbeiter wählen..." /></SelectTrigger>
                          <SelectContent>{(employees as any[]).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <button onClick={() => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                          ...r, mitarbeiter_edit: r.mitarbeiter_edit.filter((_, mi) => mi !== mIdx)
                        } : r))} className="p-2 rounded-xl hover:bg-red-50 text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                      ...r, mitarbeiter_edit: [...r.mitarbeiter_edit, { id: '', name: '' }]
                    } : r))} className="flex items-center gap-1.5 text-xs text-[#1e3a5f] hover:text-blue-600 font-medium transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Mitarbeiter hinzufügen
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100 mt-auto">
                  <button onClick={() => setReviewIndex(i => Math.max(0, i - 1))} disabled={reviewIndex === 0}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Zurück
                  </button>
                  {reviewIndex < reviewItems.length - 1 ? (
                    <button onClick={() => setReviewIndex(i => i + 1)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] transition-colors">
                      Weiter <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={confirmReview} disabled={importingReview}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      <CheckCircle className="h-4 w-4" />
                      {importingReview ? 'Läuft...' : `Alle ${reviewItems.length} importieren`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
