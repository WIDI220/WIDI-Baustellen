import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, Loader2, Pencil, HardHat, Euro, Calendar, User, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fmtEur } from '@/lib/utils';

const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];
const STATUS_OPTIONS = [
  { value: 'offen', label: 'Offen' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
];

interface ExtractedData {
  name: string;
  a_nummer: string;
  auftraggeber: string;
  beschreibung: string;
  budget: number;
  budget_details: string;
  gewerk: string;
  startdatum: string;
  enddatum: string;
  ansprechpartner: string;
  adresse: string;
}

export default function AuftragImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [loading, setLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [form, setForm] = useState<ExtractedData | null>(null);

  const addDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('Bitte eine PDF-Datei auswählen'); return; }
    setPdfFile(file);
    setLoading(true);

    try {
      // PDF als base64
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(',')[1]);
        r.onerror = () => rej(new Error('Lesefehler'));
        r.readAsDataURL(file);
      });

      // Claude API aufrufen
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 }
              },
              {
                type: 'text',
                text: `Lies diesen Baustellenauftrag und extrahiere alle Informationen. Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach, keine Markdown-Backticks.

{
  "name": "Baustellenname aus dem Betreff oder Titel",
  "a_nummer": "A-Nummer falls vorhanden, sonst leer",
  "auftraggeber": "Kunde/Auftraggeber, meist Klinikum",
  "beschreibung": "Was soll gemacht werden - vollständige Beschreibung",
  "budget": Zahl in Euro (alle Positionen summieren, Stunden * Stundensatz wenn nötig schätzen mit 45€/h),
  "budget_details": "Wie das Budget aufgeschlüsselt ist (z.B. '120h à 45€ + 500€ Material')",
  "gewerk": "Hochbau oder Elektro oder Beides",
  "startdatum": "Auftragsdatum als YYYY-MM-DD",
  "enddatum": "Frist als YYYY-MM-DD (wenn nicht angegeben: 14 Tage ab heute)",
  "ansprechpartner": "Name des Ansprechpartners oder Unterzeichners",
  "adresse": "Ort/Adresse der Baustelle falls angegeben"
}`
              }
            ]
          }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const text = data.content.find((c: any) => c.type === 'text')?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed: ExtractedData = JSON.parse(clean);

      // Fallbacks setzen
      if (!parsed.startdatum) parsed.startdatum = new Date().toISOString().split('T')[0];
      if (!parsed.enddatum) parsed.enddatum = addDate(14);
      if (!parsed.budget) parsed.budget = 0;
      if (!parsed.gewerk) parsed.gewerk = 'Hochbau';

      setExtracted(parsed);
      setForm({ ...parsed });
      setStep('review');
    } catch (e: any) {
      toast.error('PDF konnte nicht ausgelesen werden: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Keine Daten');
      const payload = {
        name: form.name,
        adresse: form.adresse || null,
        auftraggeber: form.auftraggeber || 'Klinikum Hellersen',
        startdatum: form.startdatum,
        enddatum: form.enddatum,
        status: 'offen',
        gewerk: form.gewerk,
        projektleiter: null,
        fortschritt: 0,
        budget: Number(form.budget) || 0,
        beschreibung: form.beschreibung + (form.a_nummer ? `\n\nA-Nummer: ${form.a_nummer}` : '') + (form.ansprechpartner ? `\nAnsprechpartner: ${form.ansprechpartner}` : '') + (form.budget_details ? `\nBudget-Details: ${form.budget_details}` : ''),
      };
      const { data, error } = await supabase.from('baustellen').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Baustelle erfolgreich angelegt!');
      queryClient.invalidateQueries({ queryKey: ['baustellen-list'] });
      setStep('done');
      setTimeout(() => navigate(`/baustellen/${data.id}`), 1500);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Auftrag importieren</h1>
        <p className="text-sm text-gray-500 mt-0.5">PDF hochladen → KI liest aus → Baustelle wird angelegt</p>
      </div>

      {/* Fortschritts-Schritte */}
      <div className="flex items-center gap-2">
        {[['upload','1','PDF hochladen'],['review','2','Prüfen & anpassen'],['done','3','Fertig']].map(([s, num, label], i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? 'bg-[#1e3a5f] text-white' : (step === 'review' && s === 'upload') || step === 'done' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {((step === 'review' && s === 'upload') || step === 'done' && s !== 'done') ? '✓' : num}
            </div>
            <span className={`text-sm ${step === s ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{label}</span>
            {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-10 w-10 text-[#1e3a5f] animate-spin mx-auto mb-4" />
              <p className="font-semibold text-gray-700">KI liest den Auftrag aus...</p>
              <p className="text-sm text-gray-400 mt-1">Das dauert ca. 10-15 Sekunden</p>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/2 transition-all"
              onClick={() => fileRef.current?.click()}>
              <div className="w-14 h-14 bg-[#1e3a5f]/5 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-[#1e3a5f]" />
              </div>
              <p className="font-semibold text-gray-700">Auftrags-PDF hier ablegen</p>
              <p className="text-sm text-gray-400 mt-1">oder klicken zum Auswählen</p>
              <p className="text-xs text-gray-300 mt-3">Die KI liest automatisch aus: Name, Budget, Gewerk, Termine</p>
            </label>
          )}
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && form && (
        <div className="space-y-4">
          {/* KI Ergebnis Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700">PDF erfolgreich ausgelesen!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Bitte prüfe die Daten und passe sie bei Bedarf an – dann auf Baustelle anlegen klicken.</p>
            </div>
          </div>

          {/* Formular */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><HardHat className="h-4 w-4" />Baustelle</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Baustellenname *</Label>
                <Input value={form.name} onChange={e => setForm(f => f ? {...f, name: e.target.value} : f)} className="font-semibold" />
              </div>
              <div>
                <Label>A-Nummer</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={form.a_nummer} onChange={e => setForm(f => f ? {...f, a_nummer: e.target.value} : f)} className="pl-8" />
                </div>
              </div>
              <div>
                <Label>Gewerk</Label>
                <Select value={form.gewerk} onValueChange={v => setForm(f => f ? {...f, gewerk: v} : f)}>
                  {GEWERK_OPTIONS.map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)}
                </Select>
              </div>
              <div>
                <Label>Auftraggeber</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={form.auftraggeber} onChange={e => setForm(f => f ? {...f, auftraggeber: e.target.value} : f)} className="pl-8" />
                </div>
              </div>
              <div>
                <Label>Ansprechpartner</Label>
                <Input value={form.ansprechpartner} onChange={e => setForm(f => f ? {...f, ansprechpartner: e.target.value} : f)} />
              </div>
              <div>
                <Label>Adresse / Ort</Label>
                <Input value={form.adresse} onChange={e => setForm(f => f ? {...f, adresse: e.target.value} : f)} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Euro className="h-4 w-4" />Budget & Termine</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Budget (€)</Label>
                <Input type="number" value={form.budget} onChange={e => setForm(f => f ? {...f, budget: Number(e.target.value)} : f)} className="font-bold" />
              </div>
              <div>
                <Label>Startdatum</Label>
                <Input type="date" value={form.startdatum} onChange={e => setForm(f => f ? {...f, startdatum: e.target.value} : f)} />
              </div>
              <div>
                <Label>Frist</Label>
                <Input type="date" value={form.enddatum} onChange={e => setForm(f => f ? {...f, enddatum: e.target.value} : f)} />
              </div>
            </div>
            {form.budget_details && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Budget-Aufschlüsselung (von KI erkannt):</p>
                <p className="text-sm text-gray-700">{form.budget_details}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Beschreibung der Arbeiten</h3>
            <Textarea value={form.beschreibung} onChange={e => setForm(f => f ? {...f, beschreibung: e.target.value} : f)} className="min-h-[120px]" />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setStep('upload'); setPdfFile(null); setForm(null); }}>
              Anderes PDF
            </Button>
            <Button className="flex-2 flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Legt an...</> : <><CheckCircle className="h-4 w-4 mr-2" />Baustelle anlegen</>}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-gray-900">Baustelle angelegt!</p>
          <p className="text-sm text-gray-400 mt-2">Du wirst gleich weitergeleitet...</p>
        </div>
      )}
    </div>
  );
}
