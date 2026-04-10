import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileText, CheckCircle, Loader2, Hash, HardHat, Euro, User, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];

interface ExtractedData {
  name: string; a_nummer: string; auftraggeber: string; beschreibung: string;
  budget: number; gewerk: string; startdatum: string; enddatum: string;
  ansprechpartner: string; adresse: string; betreff_original: string;
  kostenstelle: string;
}

// Einheitliches Format: [A20917] Betreff oder nur Betreff
function buildFinalName(name: string, a_nummer: string): string {
  const n = (name || '').trim();
  const a = (a_nummer || '').trim();
  if (!a) return n;
  // Verhindere doppeltes Präfix falls schon drin
  if (n.startsWith(`[A${a}]`) || n.startsWith(`[${a}]`)) return n;
  return `[A${a}] ${n}`;
}

export default function AuftragImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload'|'review'|'done'>('upload');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ExtractedData | null>(null);
  const [typ, setTyp] = useState<'intern'|'extern'>('intern');
  const isExtern = typ === 'extern';

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('Bitte eine PDF-Datei auswählen'); return; }
    setLoading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(',')[1]);
        r.onerror = () => rej(new Error('Lesefehler'));
        r.readAsDataURL(file);
      });
      const response = await fetch('/api/auftrag-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Fehler beim Auslesen');
      setForm({ ...result.data, kostenstelle: '' });
      setStep('review');
      toast.success('PDF erfolgreich ausgelesen!');
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Keine Daten');
      const finalName = buildFinalName(form.name, form.a_nummer);
      const notizen = form.ansprechpartner ? `Ansprechpartner: ${form.ansprechpartner}` : '';
      const { data, error } = await supabase.from('baustellen').insert({
        name: finalName,
        adresse: form.adresse || null,
        auftraggeber: form.auftraggeber || null,
        startdatum: form.startdatum,
        enddatum: form.enddatum || null,
        status: 'offen',
        gewerk: form.gewerk,
        fortschritt: 0,
        budget: Number(form.budget) || 0,
        beschreibung: form.beschreibung + (notizen ? '\n\n' + notizen : ''),
        typ: typ,
        kostenstelle: form.kostenstelle || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(isExtern ? 'Externes Ticket angelegt!' : 'Baustelle angelegt!');
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      setStep('done');
      setTimeout(() => navigate(`/baustellen/${data.id}`), 1500);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const finalName = form ? buildFinalName(form.name, form.a_nummer) : '';

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Auftrag importieren</h1>
        <p className="text-sm text-gray-500 mt-0.5">Typ wählen → PDF hochladen → KI liest Daten aus → anlegen</p>
      </div>

      {/* Fortschrittsleiste */}
      <div className="flex items-center gap-2">
        {(['upload','review','done'] as const).map((s, i) => {
          const labels = ['PDF hochladen','Prüfen & anpassen','Fertig'];
          const done = (step==='review'&&s==='upload')||(step==='done'&&s!=='done');
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${active?'bg-[#1e3a5f] text-white':done?'bg-emerald-500 text-white':'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : i+1}
              </div>
              <span className={`text-sm ${active?'font-semibold text-gray-800':'text-gray-400'}`}>{labels[i]}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
            </div>
          );
        })}
      </div>

      {/* Typ-Auswahl — immer sichtbar im Upload-Schritt */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Was möchtest du anlegen?</p>
          <div style={{ display:'flex', gap:10 }}>
            {([
              ['intern', 'Baustelle', '#2563eb', 'Internes Projekt oder Auftrag'],
              ['extern', 'Externes Ticket', '#e11d48', 'Auftrag von externem Kunden'],
            ] as const).map(([t, label, color, sub]) => (
              <button key={t} type="button" onClick={() => setTyp(t)}
                style={{ flex:1, padding:'14px 18px', borderRadius:14, border:`2px solid ${typ===t ? color : '#e2e8f0'}`,
                  background: typ===t ? color+'0d' : '#fff', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                <p style={{ fontSize:14, fontWeight:700, color: typ===t ? color : '#374151', margin:'0 0 3px' }}>{label}</p>
                <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>{sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="h-10 w-10 text-[#1e3a5f] animate-spin mx-auto mb-4" />
              <p className="font-semibold text-gray-700">KI liest Betreff und Daten aus...</p>
              <p className="text-sm text-gray-400 mt-1">Dauert ca. 10–20 Sekunden</p>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-52 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-[#1e3a5f] hover:bg-[#f8faff] transition-all"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f)handleFile(f); }}>
              <div className="w-14 h-14 bg-[#1e3a5f]/5 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-[#1e3a5f]" />
              </div>
              <p className="font-semibold text-gray-700">Auftrags-PDF ablegen oder klicken</p>
              <p className="text-xs text-gray-400 mt-2">Liest: Betreff · A-Nummer · Auftraggeber · Termine · Gewerk</p>
            </div>
          )}
        </div>
      )}

      {/* Review */}
      {step === 'review' && form && (
        <div className="space-y-4">

          {/* Erkannter Betreff */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-1">✓ PDF ausgelesen – bitte prüfen</p>
            {form.betreff_original && (
              <p className="text-sm text-emerald-800">
                Betreff erkannt: <span className="font-bold font-mono">„{form.betreff_original}"</span>
              </p>
            )}
          </div>

          {/* Name + A-Nummer – das wichtigste Feld */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <HardHat className="h-4 w-4" /> Baustellenname & A-Nummer
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Betreff / Baustellenname *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => f ? {...f, name: e.target.value} : f)}
                  className="font-semibold"
                  placeholder="Betreff aus dem PDF" />
                <p className="text-xs text-gray-400 mt-1">Exakter Betreff-Text aus dem Dokument</p>
              </div>
              <div>
                <Label>A-Nummer</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    value={form.a_nummer}
                    onChange={e => setForm(f => f ? {...f, a_nummer: e.target.value} : f)}
                    className="pl-8 font-mono"
                    placeholder="z.B. 20917" />
                </div>
              </div>
            </div>

            {/* Live-Vorschau des finalen Namens */}
            <div className="rounded-xl p-3 border-2 border-[#1e3a5f]/20 bg-[#f4f6fa]">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">Gespeicherter Baustellenname:</p>
              <p className="font-bold text-[#1e3a5f] text-base">{finalName || '–'}</p>
              <p className="text-xs text-gray-400 mt-1">Format: [A-Nummer] Betreff</p>
            </div>
          </div>

          {/* Auftraggeber & Details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><User className="h-4 w-4" />Auftraggeber</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Auftraggeber</Label>
                <Input value={form.auftraggeber} onChange={e => setForm(f => f?{...f,auftraggeber:e.target.value}:f)} />
              </div>
              <div>
                <Label>Ansprechpartner</Label>
                <Input value={form.ansprechpartner} onChange={e => setForm(f => f?{...f,ansprechpartner:e.target.value}:f)} />
              </div>
              {isExtern && (
                <div>
                  <Label>Kostenstelle</Label>
                  <Input value={form.kostenstelle||''} placeholder="z.B. 900120"
                    onChange={e => setForm(f => f?{...f,kostenstelle:e.target.value}:f)} />
                </div>
              )}
              <div className="col-span-2">
                <Label>Adresse / Ort</Label>
                <Input value={form.adresse} onChange={e => setForm(f => f?{...f,adresse:e.target.value}:f)} />
              </div>
              <div>
                <Label>Gewerk</Label>
                <Select value={form.gewerk} onValueChange={v => setForm(f => f?{...f,gewerk:v}:f)}>
                  {GEWERK_OPTIONS.map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)}
                </Select>
              </div>
            </div>
          </div>

          {/* Termine */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h3 className="font-semibold text-gray-700">Termine</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Startdatum</Label>
                <Input type="date" value={form.startdatum} onChange={e => setForm(f => f?{...f,startdatum:e.target.value}:f)} />
              </div>
              <div>
                <Label>Frist</Label>
                <Input type="date" value={form.enddatum} onChange={e => setForm(f => f?{...f,enddatum:e.target.value}:f)} />
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Euro className="h-4 w-4" />Budget</h3>
            <div>
              <Label>Budget (€)</Label>
              <Input type="number" value={form.budget||''} placeholder="Manuell eintragen"
                onChange={e => setForm(f => f?{...f,budget:Number(e.target.value)}:f)} className="font-bold" />
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />Budget wird nicht automatisch berechnet
              </p>
            </div>
          </div>

          {/* Beschreibung */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Beschreibung der Arbeiten</h3>
            <Textarea value={form.beschreibung} onChange={e => setForm(f => f?{...f,beschreibung:e.target.value}:f)} className="min-h-[100px]" />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setStep('upload'); setForm(null); }}>
              Anderes PDF
            </Button>
            <Button className="flex-1" onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Legt an...</>
                : <><CheckCircle className="h-4 w-4 mr-2"/>{isExtern ? 'Externes Ticket anlegen' : 'Baustelle anlegen'}</>}
            </Button>
          </div>
        </div>
      )}

      {/* Fertig */}
      {step === 'done' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-gray-900">{isExtern ? 'Externes Ticket angelegt!' : 'Baustelle angelegt!'}</p>
          <p className="text-sm text-gray-400 mt-2">Du wirst gleich weitergeleitet...</p>
        </div>
      )}
    </div>
  );
}
