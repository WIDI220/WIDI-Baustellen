import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileText, CheckCircle, Loader2, Hash, HardHat, Euro, User, FileUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const GEWERK_OPTIONS = ['Hochbau', 'Elektro', 'Beides'];

interface ExtractedData {
  name: string; a_nummer: string; auftraggeber: string; beschreibung: string;
  budget: number; budget_details: string; gewerk: string; startdatum: string;
  enddatum: string; ansprechpartner: string; adresse: string;
}

export default function AuftragImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload'|'review'|'done'>('upload');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ExtractedData | null>(null);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('Bitte eine PDF-Datei auswählen'); return; }
    setLoading(true);
    try {
      // PDF → base64
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(',')[1]);
        r.onerror = () => rej(new Error('Lesefehler'));
        r.readAsDataURL(file);
      });

      // Serverless API aufrufen
      const response = await fetch('/api/auftrag-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Fehler beim Auslesen');

      setForm(result.data);
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
      const notizen = [
        form.a_nummer ? `A-Nummer: ${form.a_nummer}` : '',
        form.ansprechpartner ? `Ansprechpartner: ${form.ansprechpartner}` : '',
        form.budget_details ? `Budget-Details: ${form.budget_details}` : '',
      ].filter(Boolean).join('\n');

      const { data, error } = await supabase.from('baustellen').insert({
        name: form.name,
        adresse: form.adresse || null,
        auftraggeber: form.auftraggeber || 'Klinikum Hellersen',
        startdatum: form.startdatum,
        enddatum: form.enddatum,
        status: 'offen',
        gewerk: form.gewerk,
        fortschritt: 0,
        budget: Number(form.budget) || 0,
        beschreibung: form.beschreibung + (notizen ? '\n\n' + notizen : ''),
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Baustelle angelegt!');
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

      {/* Schritte */}
      <div className="flex items-center gap-2">
        {[['upload','1','PDF hochladen'],['review','2','Prüfen & anpassen'],['done','3','Fertig']].map(([s, num, label], i) => {
          const done = (step==='review'&&s==='upload')||(step==='done'&&s!=='done');
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${active?'bg-[#1e3a5f] text-white':done?'bg-emerald-500 text-white':'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-sm ${active?'font-semibold text-gray-800':'text-gray-400'}`}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="h-10 w-10 text-[#1e3a5f] animate-spin mx-auto mb-4" />
              <p className="font-semibold text-gray-700">KI liest den Auftrag aus...</p>
              <p className="text-sm text-gray-400 mt-1">Dauert ca. 10–15 Sekunden</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/2 transition-all"
              onClick={() => fileRef.current?.click()}>
              <div className="w-14 h-14 bg-[#1e3a5f]/5 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-[#1e3a5f]" />
              </div>
              <p className="font-semibold text-gray-700">Auftrags-PDF hier ablegen</p>
              <p className="text-sm text-gray-400 mt-1">oder klicken zum Auswählen</p>
              <p className="text-xs text-gray-300 mt-3">Liest automatisch: Name · A-Nummer · Budget · Gewerk · Termine</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && form && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700">PDF erfolgreich ausgelesen!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Bitte prüfe und passe an – dann Baustelle anlegen.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><HardHat className="h-4 w-4" />Baustelle</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Baustellenname *</Label>
                <Input value={form.name} onChange={e => setForm(f => f?{...f,name:e.target.value}:f)} className="font-semibold" />
              </div>
              <div>
                <Label>A-Nummer</Label>
                <div className="relative"><Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={form.a_nummer} onChange={e => setForm(f => f?{...f,a_nummer:e.target.value}:f)} className="pl-8" /></div>
              </div>
              <div>
                <Label>Gewerk</Label>
                <Select value={form.gewerk} onValueChange={v => setForm(f => f?{...f,gewerk:v}:f)}>
                  {GEWERK_OPTIONS.map(g => <SelectOption key={g} value={g}>{g}</SelectOption>)}
                </Select>
              </div>
              <div>
                <Label>Auftraggeber</Label>
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input value={form.auftraggeber} onChange={e => setForm(f => f?{...f,auftraggeber:e.target.value}:f)} className="pl-8" /></div>
              </div>
              <div>
                <Label>Ansprechpartner</Label>
                <Input value={form.ansprechpartner} onChange={e => setForm(f => f?{...f,ansprechpartner:e.target.value}:f)} />
              </div>
              <div className="col-span-2">
                <Label>Adresse / Ort</Label>
                <Input value={form.adresse} onChange={e => setForm(f => f?{...f,adresse:e.target.value}:f)} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Euro className="h-4 w-4" />Budget & Termine</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Budget (€)</Label>
                <Input type="number" value={form.budget} onChange={e => setForm(f => f?{...f,budget:Number(e.target.value)}:f)} className="font-bold" />
              </div>
              <div>
                <Label>Startdatum</Label>
                <Input type="date" value={form.startdatum} onChange={e => setForm(f => f?{...f,startdatum:e.target.value}:f)} />
              </div>
              <div>
                <Label>Frist (+14 Tage)</Label>
                <Input type="date" value={form.enddatum} onChange={e => setForm(f => f?{...f,enddatum:e.target.value}:f)} />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 font-medium">💡 Budget bitte manuell eintragen – wird nicht automatisch berechnet</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Beschreibung der Arbeiten</h3>
            <Textarea value={form.beschreibung} onChange={e => setForm(f => f?{...f,beschreibung:e.target.value}:f)} className="min-h-[120px]" />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setStep('upload'); setForm(null); }}>
              Anderes PDF
            </Button>
            <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name}>
              {saveMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Legt an...</>
                : <><CheckCircle className="h-4 w-4 mr-2" />Baustelle anlegen</>}
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
