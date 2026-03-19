import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { toast } from 'sonner';
import { FileText, Upload, CheckCircle, XCircle, AlertCircle, RotateCcw, RefreshCw, Pencil, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

async function hashString(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str.slice(0, 500)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

interface LogEntry {
  page: number;
  type: 'info' | 'ok' | 'warn' | 'error';
  message: string;
}

interface OcrPageResult {
  page: number;
  fileName: string;
  status: 'pending' | 'processing' | 'ok' | 'error' | 'no_match' | 'duplicate';
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
    const results: OcrPageResult[] = [];
    const seenHashes = new Set<string>();

    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setTotalPages(count);
      setPages(Array.from({ length: count }, (_, i) => ({ page: i + 1, fileName: file.name, status: 'pending', needsReview: false, reviewReasons: [] })));
      addLog(0, 'info', `📄 ${file.name} — ${count} Seiten werden verarbeitet`);

      for (let i = 0; i < count; i++) {
        setCurrentPage(i + 1);
        setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'processing' } : p));
        addLog(i + 1, 'info', `⚙️ Seite ${i + 1}/${count} — OCR läuft...`);

        const result: OcrPageResult = { page: i + 1, fileName: file.name, status: 'pending', needsReview: false, reviewReasons: [] };

        try {
          const imageBase64 = await renderPdfPageToBase64(buffer, i);
          result.imageBase64 = imageBase64;

          const pageHash = await hashString(imageBase64);
          if (seenHashes.has(pageHash)) {
            result.status = 'duplicate';
            result.error = 'Seite bereits in diesem Batch';
            addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Duplikat erkannt, übersprungen`);
            results.push(result);
            setPages(prev => prev.map(p => p.page === i + 1 ? result : p));
            continue;
          }
          seenHashes.add(pageHash);

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
            addLog(i + 1, 'error', `❌ Seite ${i + 1} — OCR fehlgeschlagen: ${ocrResult.error?.slice(0, 60)}`);
          } else {
            const ocr = ocrResult.result;
            result.konfidenz = ocr.konfidenz;

            if (!ocr.a_nummer) {
              result.status = 'error';
              result.error = 'Keine A-Nummer erkannt';
              result.needsReview = true;
              result.reviewReasons.push('Keine A-Nummer erkannt');
              addLog(i + 1, 'error', `❌ Seite ${i + 1} — Keine A-Nummer erkannt`);
            } else {
              result.a_nummer = ocr.a_nummer;
              addLog(i + 1, 'info', `🔍 Seite ${i + 1} — A-Nummer: ${ocr.a_nummer}`);

              const { data: ticket } = await supabase.from('tickets').select('id, a_nummer, status').eq('a_nummer', ocr.a_nummer).maybeSingle();

              if (!ticket) {
                result.status = 'no_match';
                result.error = `${ocr.a_nummer} nicht in Datenbank`;
                result.needsReview = true;
                result.reviewReasons.push('Ticket nicht in Datenbank');
                addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — ${ocr.a_nummer} nicht in Datenbank`);
              } else {
                result.ticket_id = ticket.id;

                const namen: string[] = [];
                if (ocr.mitarbeiter_name) namen.push(ocr.mitarbeiter_name);
                if (ocr.mitarbeiter_namen && Array.isArray(ocr.mitarbeiter_namen)) namen.push(...ocr.mitarbeiter_namen);
                const splitNamen: string[] = [];
                for (const n of namen) {
                  splitNamen.push(...n.split(/[,\/&+]/).map((s: string) => s.trim()).filter(Boolean));
                }
                const uniqueNamen = [...new Set(splitNamen.filter(Boolean))];
                result.mitarbeiter_namen = uniqueNamen;
                const { ids, allFound } = parseEmployees(uniqueNamen);
                result.mitarbeiter_ids = ids;

                if (!allFound || uniqueNamen.length === 0) {
                  result.needsReview = true;
                  if (uniqueNamen.length === 0) {
                    result.reviewReasons.push('Kein Mitarbeiter erkannt');
                    addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Kein Mitarbeiter erkannt`);
                  } else {
                    result.reviewReasons.push(`Mitarbeiter nicht zugeordnet (${uniqueNamen.join(', ')})`);
                    addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Mitarbeiter "${uniqueNamen.join(', ')}" nicht zugeordnet`);
                  }
                } else {
                  const empNames = ids.map(id => (employees as any[]).find((e: any) => e.id === id)?.name ?? '?').join(', ');
                  addLog(i + 1, 'ok', `👤 Seite ${i + 1} — Mitarbeiter: ${empNames}`);
                }

                let stundenRaw = Number(ocr.stunden_gesamt ?? 0);
                result.stunden_raw = stundenRaw;

                // Von/Bis als Backup nur wenn Stunden unklar
                if ((stundenRaw === 0 || stundenRaw > 8) && ocr.arbeitszeit_von && ocr.arbeitszeit_bis) {
                  try {
                    const [vonH, vonM] = ocr.arbeitszeit_von.split(':').map(Number);
                    const [bisH, bisM] = ocr.arbeitszeit_bis.split(':').map(Number);
                    const diffMin = (bisH * 60 + bisM) - (vonH * 60 + vonM);
                    if (diffMin > 0 && diffMin <= 480) {
                      const berechnet = Math.round((diffMin / 60) * 4) / 4;
                      addLog(i + 1, 'info', `🕐 Seite ${i + 1} — Stunden aus Von/Bis: ${berechnet}h`);
                      stundenRaw = berechnet;
                      result.stunden_raw = berechnet;
                    }
                  } catch { /* ignorieren */ }
                }

                if (!isValid025(stundenRaw)) {
                  result.needsReview = true;
                  if (stundenRaw > MAX_AUTO_STUNDEN) {
                    result.reviewReasons.push(`Stunden ${stundenRaw}h > ${MAX_AUTO_STUNDEN}h`);
                    addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Stunden ${stundenRaw}h zu hoch`);
                  } else {
                    result.reviewReasons.push(`Stunden ${stundenRaw}h unklar`);
                    addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Stunden ${stundenRaw}h unklar`);
                  }
                  result.stunden_valid = roundTo025(Math.min(stundenRaw, MAX_AUTO_STUNDEN)) || 0.25;
                } else {
                  result.stunden_valid = stundenRaw;
                  addLog(i + 1, 'ok', `⏱️ Seite ${i + 1} — Stunden: ${stundenRaw}h`);
                }

                if (ocr.konfidenz && ocr.konfidenz < 0.70) {
                  result.needsReview = true;
                  result.reviewReasons.push(`Niedrige Konfidenz (${Math.round(ocr.konfidenz * 100)}%)`);
                  addLog(i + 1, 'warn', `⚠️ Seite ${i + 1} — Konfidenz: ${Math.round(ocr.konfidenz * 100)}%`);
                }

                result.leistungsdatum = ocr.leistungsdatum ?? new Date().toISOString().split('T')[0];

                if (!result.needsReview) {
                  await importPage(result);
                  result.status = 'ok';
                  result.imported = true;
                  const empNames = (result.mitarbeiter_ids ?? []).map(id => (employees as any[]).find((e: any) => e.id === id)?.name ?? '?').join(', ');
                  addLog(i + 1, 'ok', `✅ Seite ${i + 1} — ${ocr.a_nummer} · ${empNames} · ${result.stunden_valid}h — importiert`);
                } else {
                  result.status = 'error';
                  addLog(i + 1, 'warn', `🟡 Seite ${i + 1} — ${ocr.a_nummer} → Nachbearbeitung`);
                }
              }
            }
          }
        } catch (err: any) {
          result.status = 'error';
          result.error = err.message?.slice(0, 80);
          result.needsReview = true;
          result.reviewReasons.push(err.message?.slice(0, 60) ?? 'Unbekannter Fehler');
          addLog(i + 1, 'error', `❌ Seite ${i + 1} — ${err.message?.slice(0, 60)}`);
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
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });

      const autoOk = results.filter(r => r.imported).length;
      const needReview = toReview.length;
      const errors = results.filter(r => r.status === 'error' && !r.ticket_id).length;
      const noMatch = results.filter(r => r.status === 'no_match').length;
      const dupes = results.filter(r => r.status === 'duplicate').length;

      addLog(0, 'ok', `🏁 Fertig — ✅ ${autoOk} importiert · 🟡 ${needReview} zur Prüfung · ❌ ${errors + noMatch} Fehler · 🔁 ${dupes} Duplikate`);
      toast.success(`Scan fertig! ✅ ${autoOk} automatisch · ⚠️ ${needReview} zur Prüfung · ❌ ${errors + noMatch} Fehler`);

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
      const rounded = roundTo025(stunden);
      const empIds = item.mitarbeiter_edit.map(m => m.id).filter(Boolean);
      if (empIds.length === 0) { skipped++; continue; }
      try { await importPage(item, rounded, empIds, item.leistungsdatum ?? undefined); saved++; }
      catch { skipped++; }
    }
    queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
    toast.success(`Nachbearbeitung: ✅ ${saved} importiert · ⏭ ${skipped} übersprungen`);
    setShowReview(false);
    setImportingReview(false);
  }

  const okCount = pages.filter(p => p.imported).length;
  const reviewCount = pages.filter(p => p.needsReview && p.ticket_id).length;
  const errorCount = pages.filter(p => p.status === 'error' && !p.ticket_id).length;
  const noMatchCount = pages.filter(p => p.status === 'no_match').length;
  const dupeCount = pages.filter(p => p.status === 'duplicate').length;
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const currentReview = reviewItems[reviewIndex];

  function pageColor(p: OcrPageResult) {
    if (p.imported) return 'bg-emerald-50 border-emerald-200';
    if (p.status === 'duplicate') return 'bg-gray-50 border-gray-200';
    if (p.needsReview && p.ticket_id) return 'bg-amber-50 border-amber-200';
    if (p.status === 'no_match') return 'bg-orange-50 border-orange-200';
    if (p.status === 'error') return 'bg-red-50 border-red-200';
    if (p.status === 'processing') return 'bg-blue-50 border-blue-200';
    return 'bg-gray-50 border-gray-100';
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PDF-Rücklauf</h1>
        <p className="text-sm text-gray-500 mt-0.5">OCR erkennt A-Nummer, Mitarbeiter und Stunden automatisch</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${isProcessing ? 'border-blue-200 bg-blue-50/50 cursor-not-allowed' : 'border-gray-200 hover:border-[#1e3a5f]/40 hover:bg-gray-50 cursor-pointer'}`}>
          <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center ${isProcessing ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {isProcessing ? <RefreshCw className="h-7 w-7 text-blue-600 animate-spin" /> : <Upload className="h-7 w-7 text-gray-400" />}
          </div>
          {isProcessing ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-blue-700">Scanne {fileName}</p>
              <p className="text-xs text-blue-500">Seite {currentPage} von {totalPages}</p>
              <div className="w-full max-w-xs mx-auto bg-blue-100 rounded-full h-2">
                <div className="bg-blue-500 rounded-full h-2 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-blue-400 font-mono">{progress}%</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-gray-700">PDF hier ablegen oder klicken</p>
              <p className="text-xs text-gray-400 mt-1">Stunden ≤ 5h werden automatisch importiert · alles andere zur Prüfung</p>
              {fileName && phase === 'done' && <p className="text-xs text-[#1e3a5f] font-medium mt-2">📄 {fileName}</p>}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} disabled={isProcessing} />
        </div>
      </div>

      {/* Live-Log */}
      {(isProcessing || (phase === 'done' && liveLog.length > 0)) && (
        <div className="bg-gray-950 rounded-2xl p-4 font-mono text-xs max-h-52 overflow-y-auto space-y-0.5">
          <p className="text-gray-500 mb-2 font-sans text-xs font-semibold non-italic">
            {isProcessing ? '⚙️ OCR läuft...' : '📋 Protokoll'}
          </p>
          {liveLog.map((log, i) => (
            <div key={i} className={log.type === 'ok' ? 'text-emerald-400' : log.type === 'warn' ? 'text-amber-400' : log.type === 'error' ? 'text-red-400' : 'text-gray-400'}>
              {log.message}
            </div>
          ))}
          {isProcessing && <div className="text-blue-400 animate-pulse">▋</div>}
        </div>
      )}

      {/* Ampel-Statistiken */}
      {pages.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{okCount}</p><p className="text-xs text-gray-500">Auto importiert</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => reviewCount > 0 && setShowReview(true)}>
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{reviewCount}</p><p className="text-xs text-gray-500">Zur Prüfung {reviewCount > 0 && '→'}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center"><FileText className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{noMatchCount}</p><p className="text-xs text-gray-500">Nicht gefunden</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center"><XCircle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{errorCount}</p><p className="text-xs text-gray-500">Fehler</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center"><RotateCcw className="h-5 w-5 text-gray-400" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{dupeCount}</p><p className="text-xs text-gray-500">Duplikate</p></div>
          </div>
        </div>
      )}

      {/* Seitenübersicht */}
      {pages.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Seitenübersicht</h2>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {pages.map(p => (
              <div key={p.page} className={`flex items-start gap-3 px-4 py-2.5 rounded-xl text-sm border transition-colors ${pageColor(p)}`}>
                <span className="text-xs text-gray-400 font-mono w-12 shrink-0 pt-0.5">S. {p.page}</span>
                {p.imported && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
                {p.needsReview && p.ticket_id && <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                {p.status === 'no_match' && <XCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />}
                {p.status === 'duplicate' && <RotateCcw className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />}
                {p.status === 'error' && !p.needsReview && <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                {p.status === 'processing' && <RotateCcw className="h-4 w-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />}
                {p.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  {p.imported && <span className="text-emerald-800"><strong>{p.a_nummer}</strong> · {p.mitarbeiter_namen?.join(', ') ?? '–'} · {p.stunden_valid}h</span>}
                  {p.needsReview && p.ticket_id && <span className="text-amber-700"><strong>{p.a_nummer}</strong> · {p.reviewReasons.join(' · ')}</span>}
                  {p.status === 'no_match' && <span className="text-orange-700">{p.error}</span>}
                  {p.status === 'duplicate' && <span className="text-gray-500">Duplikat — übersprungen</span>}
                  {p.status === 'error' && !p.needsReview && <span className="text-red-600">{p.error}</span>}
                  {p.status === 'processing' && <span className="text-blue-600">OCR läuft...</span>}
                  {p.status === 'pending' && <span className="text-gray-400">Wartend</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'done' && reviewCount > 0 && (
        <button onClick={() => { setReviewIndex(0); setShowReview(true); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm">
          <Pencil className="h-4 w-4" /> {reviewCount} Einträge nachbearbeiten
        </button>
      )}

      {phase === 'done' && (
        <button onClick={() => { setPages([]); setPhase('idle'); setFileName(''); setLiveLog([]); }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
          <Upload className="h-4 w-4" /> Neue Datei verarbeiten
        </button>
      )}

      {/* Split-View Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-gray-100">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Nachbearbeitung — {reviewIndex + 1} von {reviewItems.length}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setReviewIndex(i => Math.max(0, i - 1))} disabled={reviewIndex === 0}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-mono text-gray-400">{reviewIndex + 1}/{reviewItems.length}</span>
                <button onClick={() => setReviewIndex(i => Math.min(reviewItems.length - 1, i + 1))} disabled={reviewIndex === reviewItems.length - 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {currentReview && (
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* LINKS: Original PDF-Scan */}
              <div className="w-1/2 shrink-0 flex flex-col border-r border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-400 mb-2">📄 ORIGINAL — Seite {currentReview.page}</p>
                <div className="flex-1 bg-gray-50 rounded-xl overflow-hidden flex items-start justify-center">
                  {currentReview.imageBase64 ? (
                    <img src={`data:image/png;base64,${currentReview.imageBase64}`} alt={`Seite ${currentReview.page}`}
                      className="w-full h-full object-contain" style={{ maxHeight: '70vh' }} />
                  ) : (
                    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Kein Bild verfügbar</div>
                  )}
                </div>
              </div>

              {/* RECHTS: OCR-Felder */}
              <div className="w-1/2 flex flex-col overflow-y-auto p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-[#1e3a5f] text-lg">{currentReview.a_nummer}</span>
                    <span className="text-xs text-gray-400">Seite {currentReview.page}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {currentReview.reviewReasons.map((r, i) => (
                      <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{r}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Stunden · OCR las: {currentReview.stunden_raw}h</Label>
                  <Input value={currentReview.stunden_edit}
                    onChange={e => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? { ...r, stunden_edit: e.target.value } : r))}
                    className="h-9 rounded-xl font-mono" placeholder="z.B. 1.5" />
                  {(() => {
                    const v = parseFloat(currentReview.stunden_edit.replace(',', '.'));
                    const rounded = roundTo025(v);
                    if (!isNaN(v) && Math.abs(v - rounded) > 0.001) {
                      return <p className="text-xs text-amber-600 mt-1">→ wird auf {rounded}h gerundet</p>;
                    }
                    return null;
                  })()}
                </div>

                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Leistungsdatum</Label>
                  <Input type="date" value={currentReview.leistungsdatum ?? new Date().toISOString().split('T')[0]}
                    onChange={e => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? { ...r, leistungsdatum: e.target.value } : r))}
                    className="h-9 rounded-xl" />
                </div>

                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Mitarbeiter</Label>
                  <div className="space-y-2">
                    {currentReview.mitarbeiter_edit.map((m, mIdx) => (
                      <div key={mIdx} className="flex gap-2">
                        <Select value={m.id} onValueChange={v => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                          ...r, mitarbeiter_edit: r.mitarbeiter_edit.map((me, mi) => mi === mIdx ? { ...me, id: v, name: (employees as any[]).find((e: any) => e.id === v)?.name ?? '' } : me)
                        } : r))}>
                          <SelectTrigger className="h-8 rounded-xl flex-1 text-xs"><SelectValue placeholder="Mitarbeiter wählen..." /></SelectTrigger>
                          <SelectContent>
                            {(employees as any[]).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <button onClick={() => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                          ...r, mitarbeiter_edit: r.mitarbeiter_edit.filter((_, mi) => mi !== mIdx)
                        } : r))} className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setReviewItems(prev => prev.map((r, i) => i === reviewIndex ? {
                      ...r, mitarbeiter_edit: [...r.mitarbeiter_edit, { id: '', name: '' }]
                    } : r))} className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:text-[#0ea5e9] transition-colors font-medium">
                      <Plus className="h-3.5 w-3.5" /> Mitarbeiter hinzufügen
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => setReviewIndex(i => Math.max(0, i - 1))} disabled={reviewIndex === 0}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Zurück
                  </button>
                  {reviewIndex < reviewItems.length - 1 ? (
                    <button onClick={() => setReviewIndex(i => i + 1)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] transition-colors">
                      Weiter <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={confirmReview} disabled={importingReview}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                      <CheckCircle className="h-4 w-4" />
                      {importingReview ? 'Importiert...' : `Alle ${reviewItems.length} importieren`}
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
