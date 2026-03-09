import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectOption } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Euro, Clock, Package, FileText, Camera, Plus, Pencil, Trash2, Upload, HardHat } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { fmtEur, fmtDate } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STUNDEN_SATZ = 45;
const STATUS_OPTIONS = [
  { value: 'offen', label: 'Offen', bg:'bg-gray-100', text:'text-gray-600' },
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg:'bg-blue-100', text:'text-blue-700' },
  { value: 'pausiert', label: 'Pausiert', bg:'bg-amber-100', text:'text-amber-700' },
  { value: 'abgeschlossen', label: 'Abgeschlossen', bg:'bg-emerald-100', text:'text-emerald-700' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg:'bg-purple-100', text:'text-purple-700' },
];
const FOTO_KAT = ['vorher','nachher','maengel','abnahme','fortschritt','sonstiges'];
const FOTO_KAT_LABELS: Record<string,string> = { vorher:'Vorher', nachher:'Nachher', maengel:'Mängel', abnahme:'Abnahme', fortschritt:'Fortschritt', sonstiges:'Sonstiges' };
const FOTO_KAT_COLORS: Record<string,string> = { vorher:'bg-gray-100 text-gray-600', nachher:'bg-emerald-100 text-emerald-700', maengel:'bg-red-100 text-red-700', abnahme:'bg-blue-100 text-blue-700', fortschritt:'bg-purple-100 text-purple-700', sonstiges:'bg-orange-100 text-orange-600' };
const MAT_STATUS = ['bestellt','geliefert','verbraucht'];
const NACH_STATUS = ['entwurf','eingereicht','genehmigt','abgelehnt'];
const TABS = ['Übersicht','Stunden','Material','Nachträge','Fotos'];

export default function BaustelleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('Übersicht');
  const [stundenDialog, setStundenDialog] = useState(false);
  const [editStunden, setEditStunden] = useState<any>(null);
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editMaterial, setEditMaterial] = useState<any>(null);
  const [nachtragDialog, setNachtragDialog] = useState(false);
  const [editNachtrag, setEditNachtrag] = useState<any>(null);
  const [fotoDialog, setFotoDialog] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: bs } = useQuery({ queryKey: ['baustelle', id], queryFn: async () => { const { data } = await supabase.from('baustellen').select('*').eq('id', id).single(); return data; } });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; } });
  const { data: stunden = [], refetch: refetchStunden } = useQuery({ queryKey: ['bs-stunden', id], queryFn: async () => { const { data } = await supabase.from('bs_stundeneintraege').select('*, employees(name,kuerzel,stundensatz)').eq('baustelle_id', id).order('datum', { ascending: false }); return data ?? []; } });
  const { data: materialien = [], refetch: refetchMat } = useQuery({ queryKey: ['bs-mat', id], queryFn: async () => { const { data } = await supabase.from('bs_materialien').select('*').eq('baustelle_id', id).order('created_at', { ascending: false }); return data ?? []; } });
  const { data: nachtraege = [], refetch: refetchNach } = useQuery({ queryKey: ['bs-nach', id], queryFn: async () => { const { data } = await supabase.from('bs_nachtraege').select('*').eq('baustelle_id', id).order('created_at', { ascending: false }); return data ?? []; } });
  const { data: fotos = [], refetch: refetchFotos } = useQuery({ queryKey: ['bs-fotos', id], queryFn: async () => { const { data } = await supabase.from('bs_fotos').select('*, employees(name,kuerzel)').eq('baustelle_id', id).order('created_at', { ascending: false }); return data ?? []; } });

  if (!bs) return <div className="p-8 text-center text-gray-400">Baustelle nicht gefunden</div>;

  const sw = stunden as any[];
  const mat = materialien as any[];
  const nach = nachtraege as any[];
  const fts = fotos as any[];
  const emps = employees as any[];

  const personalkosten = sw.reduce((s, w) => s + Number(w.stunden ?? 0) * Number(w.employees?.stundensatz ?? STUNDEN_SATZ), 0);
  const materialkosten = mat.reduce((s, m) => s + Number(m.gesamtpreis ?? 0), 0);
  const nachtragGenehmigt = nach.filter((n: any) => n.status === 'genehmigt').reduce((s, n) => s + Number(n.betrag ?? 0), 0);
  const gesamtkosten = personalkosten + materialkosten;
  const budget = Number(bs.budget ?? 0);
  const pct = budget > 0 ? Math.min(Math.round(gesamtkosten / budget * 100), 100) : 0;
  const overBudget = gesamtkosten > budget && budget > 0;
  const st = STATUS_OPTIONS.find(s => s.value === bs.status);

  // Stunden pro Mitarbeiter
  const stundenProMa = emps.map(e => {
    const h = sw.filter(w => w.mitarbeiter_id === e.id).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
    return { name: e.kuerzel || e.name, stunden: Math.round(h * 10) / 10, kosten: h * Number(e.stundensatz ?? STUNDEN_SATZ) };
  }).filter(x => x.stunden > 0).sort((a, b) => b.stunden - a.stunden);

  // Kosten Aufteilung
  const kostenData = [
    { name: 'Personal', value: Math.round(personalkosten) },
    { name: 'Material', value: Math.round(materialkosten) },
  ].filter(k => k.value > 0);

  // Mutations
  const updateStatus = useMutation({
    mutationFn: async (status: string) => { const { error } = await supabase.from('baustellen').update({ status }).eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Status aktualisiert'); queryClient.invalidateQueries({ queryKey: ['baustelle', id] }); queryClient.invalidateQueries({ queryKey: ['baustellen-list'] }); },
  });

  // Stunden
  const [stundenForm, setStundenForm] = useState({ mitarbeiter_id: '', datum: new Date().toISOString().split('T')[0], stunden: '', beschreibung: '' });
  const saveStunden = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id: id, mitarbeiter_id: stundenForm.mitarbeiter_id, datum: stundenForm.datum, stunden: parseFloat(stundenForm.stunden.replace(',','.')), beschreibung: stundenForm.beschreibung };
      if (editStunden) { const { error } = await supabase.from('bs_stundeneintraege').update(payload).eq('id', editStunden.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_stundeneintraege').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Stunden gespeichert'); setStundenDialog(false); refetchStunden(); queryClient.invalidateQueries({ queryKey: ['bs-stunden-dash'] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteStunden = useMutation({
    mutationFn: async (sid: string) => { const { error } = await supabase.from('bs_stundeneintraege').delete().eq('id', sid); if (error) throw error; },
    onSuccess: () => { refetchStunden(); },
  });

  // Material
  const [matForm, setMatForm] = useState({ bezeichnung: '', menge: '1', einheit: 'Stk', einzelpreis: '', gesamtpreis: '', status: 'bestellt', datum: new Date().toISOString().split('T')[0] });
  const saveMat = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id: id, bezeichnung: matForm.bezeichnung, menge: Number(matForm.menge), einheit: matForm.einheit, einzelpreis: Number(matForm.einzelpreis.replace(',','.')), gesamtpreis: Number(matForm.gesamtpreis.replace(',','.')) || Number(matForm.menge) * Number(matForm.einzelpreis.replace(',','.')), status: matForm.status, datum: matForm.datum };
      if (editMaterial) { const { error } = await supabase.from('bs_materialien').update(payload).eq('id', editMaterial.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_materialien').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Material gespeichert'); setMaterialDialog(false); refetchMat(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMat = useMutation({
    mutationFn: async (mid: string) => { const { error } = await supabase.from('bs_materialien').delete().eq('id', mid); if (error) throw error; },
    onSuccess: () => refetchMat(),
  });

  // Nachträge
  const [nachForm, setNachForm] = useState({ titel: '', beschreibung: '', betrag: '', status: 'entwurf', datum: new Date().toISOString().split('T')[0], begruendung: '' });
  const saveNach = useMutation({
    mutationFn: async () => {
      const payload = { baustelle_id: id, titel: nachForm.titel, beschreibung: nachForm.beschreibung, betrag: Number(nachForm.betrag.replace(',','.')), status: nachForm.status, datum: nachForm.datum, begruendung: nachForm.begruendung };
      if (editNachtrag) { const { error } = await supabase.from('bs_nachtraege').update(payload).eq('id', editNachtrag.id); if (error) throw error; }
      else { const { error } = await supabase.from('bs_nachtraege').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success('Nachtrag gespeichert'); setNachtragDialog(false); refetchNach(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNach = useMutation({
    mutationFn: async (nid: string) => { const { error } = await supabase.from('bs_nachtraege').delete().eq('id', nid); if (error) throw error; },
    onSuccess: () => refetchNach(),
  });

  // Foto Upload
  const [fotoForm, setFotoForm] = useState({ beschreibung: '', kategorie: 'fortschritt' });
  const handleFotoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('baustellen-fotos').upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('baustellen-fotos').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('bs_fotos').insert({ baustelle_id: id, url: urlData.publicUrl, beschreibung: fotoForm.beschreibung, kategorie: fotoForm.kategorie, datum: new Date().toISOString().split('T')[0] });
      if (dbErr) throw dbErr;
      toast.success('Foto hochgeladen'); setFotoDialog(false); refetchFotos();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };
  const deleteFoto = useMutation({
    mutationFn: async (fid: string) => { const { error } = await supabase.from('bs_fotos').delete().eq('id', fid); if (error) throw error; },
    onSuccess: () => refetchFotos(),
  });

  // PDF Export
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20); doc.text(bs.name, 14, 22);
    doc.setFontSize(11); doc.setTextColor(100);
    doc.text(`Auftraggeber: ${bs.auftraggeber || '–'}`, 14, 32);
    doc.text(`Status: ${st?.label}   Budget: ${fmtEur(budget)}   Kosten: ${fmtEur(gesamtkosten)}`, 14, 40);
    autoTable(doc, { startY: 50, head: [['Mitarbeiter', 'Datum', 'Stunden', 'Beschreibung']], body: sw.map(w => [w.employees?.name||'–', w.datum, `${w.stunden}h`, w.beschreibung||'']) });
    const y1 = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13); doc.setTextColor(0); doc.text('Material', 14, y1);
    autoTable(doc, { startY: y1 + 5, head: [['Bezeichnung', 'Menge', 'Einzelpreis', 'Gesamt', 'Status']], body: mat.map(m => [m.bezeichnung, `${m.menge} ${m.einheit}`, `${m.einzelpreis} €`, fmtEur(m.gesamtpreis), m.status]) });
    doc.save(`${bs.name.replace(/\s+/g,'_')}_Bericht.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/baustellen')} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{bs.name}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{bs.auftraggeber} {bs.adresse ? `· ${bs.adresse}` : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportPDF}>PDF Export</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Budget', value: fmtEur(budget), icon: Euro, color: 'text-[#1e3a5f]', bg: 'bg-[#1e3a5f]/5' },
          { label: 'Gesamtkosten', value: fmtEur(gesamtkosten), icon: Euro, color: overBudget ? 'text-red-500' : 'text-emerald-600', bg: overBudget ? 'bg-red-50' : 'bg-emerald-50' },
          { label: 'Personalkosten', value: fmtEur(personalkosten), icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Materialkosten', value: fmtEur(materialkosten), icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 ${k.bg} rounded-xl flex items-center justify-center mb-3`}><k.icon className={`h-4 w-4 ${k.color}`} /></div>
            <p className="text-xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Budget Progress */}
      {budget > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Budget-Auslastung</span>
            <span className={`text-sm font-bold ${overBudget ? 'text-red-500' : 'text-gray-700'}`}>{pct}%</span>
          </div>
          <Progress value={pct} className="h-3" color={overBudget ? '#ef4444' : pct > 80 ? '#f59e0b' : '#1e3a5f'} />
          <p className="text-xs text-gray-400 mt-1.5">{fmtEur(gesamtkosten)} von {fmtEur(budget)} verbraucht · {fmtEur(budget - gesamtkosten)} verbleibend</p>
        </div>
      )}

      {/* Status ändern */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Status ändern</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.filter(s => s.value !== bs.status).map(s => (
            <button key={s.value} onClick={() => updateStatus.mutate(s.value)}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium border border-transparent transition-all ${s.bg} ${s.text} hover:opacity-80`}>
              → {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>

      {/* Tab: Übersicht */}
      {tab === 'Übersicht' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Kostenaufteilung</h3>
            {kostenData.length === 0 ? <p className="text-gray-300 text-center py-8 text-sm">Noch keine Kosten</p> : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={kostenData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {kostenData.map((_,i) => <Cell key={i} fill={['#1e3a5f','#0ea5e9'][i]} />)}
                </Pie><Tooltip formatter={(v: any) => fmtEur(v)} /></PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex justify-around mt-2">
              {kostenData.map((k,i) => <div key={k.name} className="text-center"><div className="w-3 h-3 rounded-full mx-auto mb-1" style={{background:['#1e3a5f','#0ea5e9'][i]}} /><p className="text-xs text-gray-500">{k.name}</p><p className="text-sm font-bold text-gray-800">{fmtEur(k.value)}</p></div>)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Stunden pro Mitarbeiter</h3>
            {stundenProMa.length === 0 ? <p className="text-gray-300 text-center py-8 text-sm">Noch keine Stunden</p> : (
              <div className="space-y-2">
                {stundenProMa.map((m,i) => (
                  <div key={m.name} className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold w-8 text-gray-700">{m.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{width:`${m.stunden/stundenProMa[0].stunden*100}%`, background:`hsl(${210+i*30},70%,50%)`}} />
                    </div>
                    <span className="text-sm font-mono text-gray-600 w-12 text-right">{m.stunden}h</span>
                    <span className="text-xs text-gray-400 w-16 text-right">{fmtEur(m.kosten)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
              <div><p className="text-xs text-gray-400">Gewerk</p><p className="font-medium text-gray-700">{bs.gewerk||'–'}</p></div>
              <div><p className="text-xs text-gray-400">Projektleiter</p><p className="font-medium text-gray-700">{bs.projektleiter||'–'}</p></div>
              <div><p className="text-xs text-gray-400">Start</p><p className="font-medium text-gray-700">{fmtDate(bs.startdatum)}</p></div>
              <div><p className="text-xs text-gray-400">Ende geplant</p><p className="font-medium text-gray-700">{fmtDate(bs.enddatum)}</p></div>
            </div>
            {bs.beschreibung && <p className="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded-xl">{bs.beschreibung}</p>}
          </div>
        </div>
      )}

      {/* Tab: Stunden */}
      {tab === 'Stunden' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div><h3 className="font-semibold text-gray-700">Zeiterfassung</h3><p className="text-xs text-gray-400 mt-0.5">{sw.reduce((s,w)=>s+Number(w.stunden??0),0)}h gesamt · {fmtEur(personalkosten)}</p></div>
            <Button size="sm" onClick={() => { setStundenForm({ mitarbeiter_id:'', datum:new Date().toISOString().split('T')[0], stunden:'', beschreibung:'' }); setEditStunden(null); setStundenDialog(true); }}><Plus className="h-4 w-4 mr-1" />Eintragen</Button>
          </div>
          <div className="divide-y divide-gray-50">
            {sw.length === 0 && <p className="text-gray-300 text-center py-8 text-sm">Noch keine Stunden</p>}
            {sw.map((w: any) => (
              <div key={w.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center"><Clock className="h-4 w-4 text-purple-500" /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{w.employees?.name || '–'}</p>
                  <p className="text-xs text-gray-400">{fmtDate(w.datum)} {w.beschreibung ? `· ${w.beschreibung}` : ''}</p>
                </div>
                <span className="font-mono font-bold text-gray-700">{w.stunden}h</span>
                <span className="text-sm text-gray-400">{fmtEur(Number(w.stunden)*Number(w.employees?.stundensatz??STUNDEN_SATZ))}</span>
                <div className="flex gap-1">
                  <button onClick={() => { setStundenForm({ mitarbeiter_id:w.mitarbeiter_id, datum:w.datum, stunden:String(w.stunden), beschreibung:w.beschreibung||'' }); setEditStunden(w); setStundenDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                  <button onClick={() => { if(confirm('Löschen?')) deleteStunden.mutate(w.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Material */}
      {tab === 'Material' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-50">
            <div><h3 className="font-semibold text-gray-700">Material</h3><p className="text-xs text-gray-400 mt-0.5">{mat.length} Positionen · {fmtEur(materialkosten)}</p></div>
            <Button size="sm" onClick={() => { setMatForm({ bezeichnung:'', menge:'1', einheit:'Stk', einzelpreis:'', gesamtpreis:'', status:'bestellt', datum:new Date().toISOString().split('T')[0] }); setEditMaterial(null); setMaterialDialog(true); }}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
          </div>
          <div className="divide-y divide-gray-50">
            {mat.length === 0 && <p className="text-gray-300 text-center py-8 text-sm">Noch kein Material</p>}
            {mat.map((m: any) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                <Package className="h-4 w-4 text-orange-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{m.bezeichnung}</p>
                  <p className="text-xs text-gray-400">{m.menge} {m.einheit} · {m.einzelpreis} € / Stk · {fmtDate(m.datum)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status==='verbraucht'?'bg-emerald-100 text-emerald-700':m.status==='geliefert'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{m.status}</span>
                <span className="font-bold text-sm text-gray-700">{fmtEur(m.gesamtpreis)}</span>
                <div className="flex gap-1">
                  <button onClick={() => { setMatForm({ bezeichnung:m.bezeichnung, menge:String(m.menge), einheit:m.einheit, einzelpreis:String(m.einzelpreis), gesamtpreis:String(m.gesamtpreis), status:m.status, datum:m.datum||'' }); setEditMaterial(m); setMaterialDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                  <button onClick={() => { if(confirm('Löschen?')) deleteMat.mutate(m.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Nachträge */}
      {tab === 'Nachträge' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div><p className="text-sm text-gray-500">{nach.length} Nachträge · Genehmigt: <strong className="text-emerald-600">{fmtEur(nachtragGenehmigt)}</strong></p></div>
            <Button size="sm" onClick={() => { setNachForm({ titel:'', beschreibung:'', betrag:'', status:'entwurf', datum:new Date().toISOString().split('T')[0], begruendung:'' }); setEditNachtrag(null); setNachtragDialog(true); }}><Plus className="h-4 w-4 mr-1" />Neuer Nachtrag</Button>
          </div>
          {nach.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-300 text-sm">Noch keine Nachträge</div>}
          {nach.map((n: any) => (
            <div key={n.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-800">{n.titel}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(n.datum)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-gray-800">{fmtEur(n.betrag)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.status==='genehmigt'?'bg-emerald-100 text-emerald-700':n.status==='abgelehnt'?'bg-red-100 text-red-700':n.status==='eingereicht'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{n.status}</span>
                  <button onClick={() => { setNachForm({ titel:n.titel, beschreibung:n.beschreibung||'', betrag:String(n.betrag), status:n.status, datum:n.datum||'', begruendung:n.begruendung||'' }); setEditNachtrag(n); setNachtragDialog(true); }} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil className="h-3.5 w-3.5 text-gray-400" /></button>
                  <button onClick={() => { if(confirm('Löschen?')) deleteNach.mutate(n.id); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
              {n.beschreibung && <p className="text-sm text-gray-600 mt-2">{n.beschreibung}</p>}
              {n.begruendung && <p className="text-xs text-gray-400 mt-1 bg-gray-50 rounded-lg p-2">{n.begruendung}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Fotos */}
      {tab === 'Fotos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setFotoDialog(true)}><Camera className="h-4 w-4 mr-1" />Foto hochladen</Button>
          </div>
          {fts.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center"><Camera className="h-10 w-10 text-gray-200 mx-auto mb-3" /><p className="text-gray-300 text-sm">Noch keine Fotos</p></div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {fts.map((f: any) => (
              <div key={f.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group relative">
                <img src={f.url} alt={f.beschreibung} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
                <button onClick={() => { if(confirm('Foto löschen?')) deleteFoto.mutate(f.id); }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                </button>
                <div className="p-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${FOTO_KAT_COLORS[f.kategorie]}`}>{FOTO_KAT_LABELS[f.kategorie]}</span>
                  {f.beschreibung && <p className="text-xs text-gray-600 mt-1 truncate">{f.beschreibung}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(f.datum)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stunden Dialog */}
      <Dialog open={stundenDialog} onOpenChange={setStundenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editStunden ? 'Stunden bearbeiten' : 'Stunden eintragen'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Mitarbeiter</Label><Select value={stundenForm.mitarbeiter_id} onValueChange={v => setStundenForm(f=>({...f,mitarbeiter_id:v}))}><SelectOption value="">Wählen...</SelectOption>{emps.map((e:any) => <SelectOption key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectOption>)}</Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Datum</Label><Input type="date" value={stundenForm.datum} onChange={e => setStundenForm(f=>({...f,datum:e.target.value}))} /></div>
              <div><Label>Stunden</Label><Input placeholder="z.B. 7.5" value={stundenForm.stunden} onChange={e => setStundenForm(f=>({...f,stunden:e.target.value}))} /></div>
            </div>
            <div><Label>Beschreibung</Label><Input placeholder="Was wurde gemacht?" value={stundenForm.beschreibung} onChange={e => setStundenForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStundenDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => saveStunden.mutate()} disabled={saveStunden.isPending||!stundenForm.mitarbeiter_id||!stundenForm.stunden}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Dialog */}
      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editMaterial ? 'Material bearbeiten' : 'Material hinzufügen'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bezeichnung *</Label><Input value={matForm.bezeichnung} onChange={e => setMatForm(f=>({...f,bezeichnung:e.target.value}))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Menge</Label><Input value={matForm.menge} onChange={e => setMatForm(f=>({...f,menge:e.target.value}))} /></div>
              <div><Label>Einheit</Label><Input value={matForm.einheit} onChange={e => setMatForm(f=>({...f,einheit:e.target.value}))} /></div>
              <div><Label>Einzelpreis €</Label><Input value={matForm.einzelpreis} onChange={e => setMatForm(f=>({...f,einzelpreis:e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Gesamtpreis €</Label><Input value={matForm.gesamtpreis} onChange={e => setMatForm(f=>({...f,gesamtpreis:e.target.value}))} /></div>
              <div><Label>Status</Label><Select value={matForm.status} onValueChange={v => setMatForm(f=>({...f,status:v}))}>{MAT_STATUS.map(s => <SelectOption key={s} value={s}>{s}</SelectOption>)}</Select></div>
            </div>
            <div><Label>Datum</Label><Input type="date" value={matForm.datum} onChange={e => setMatForm(f=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setMaterialDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => saveMat.mutate()} disabled={saveMat.isPending||!matForm.bezeichnung}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nachtrag Dialog */}
      <Dialog open={nachtragDialog} onOpenChange={setNachtragDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editNachtrag ? 'Nachtrag bearbeiten' : 'Neuer Nachtrag'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titel *</Label><Input value={nachForm.titel} onChange={e => setNachForm(f=>({...f,titel:e.target.value}))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Betrag €</Label><Input value={nachForm.betrag} onChange={e => setNachForm(f=>({...f,betrag:e.target.value}))} /></div>
              <div><Label>Status</Label><Select value={nachForm.status} onValueChange={v => setNachForm(f=>({...f,status:v}))}>{NACH_STATUS.map(s => <SelectOption key={s} value={s}>{s}</SelectOption>)}</Select></div>
            </div>
            <div><Label>Beschreibung</Label><Textarea value={nachForm.beschreibung} onChange={e => setNachForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <div><Label>Begründung</Label><Textarea value={nachForm.begruendung} onChange={e => setNachForm(f=>({...f,begruendung:e.target.value}))} /></div>
            <div><Label>Datum</Label><Input type="date" value={nachForm.datum} onChange={e => setNachForm(f=>({...f,datum:e.target.value}))} /></div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setNachtragDialog(false)}>Abbrechen</Button>
              <Button className="flex-1" onClick={() => saveNach.mutate()} disabled={saveNach.isPending||!nachForm.titel}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Foto Dialog */}
      <Dialog open={fotoDialog} onOpenChange={setFotoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Foto hochladen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Kategorie</Label><Select value={fotoForm.kategorie} onValueChange={v => setFotoForm(f=>({...f,kategorie:v}))}>{FOTO_KAT.map(k => <SelectOption key={k} value={k}>{FOTO_KAT_LABELS[k]}</SelectOption>)}</Select></div>
            <div><Label>Beschreibung</Label><Input placeholder="z.B. Zustand vor Renovierung" value={fotoForm.beschreibung} onChange={e => setFotoForm(f=>({...f,beschreibung:e.target.value}))} /></div>
            <div>
              <Label>Foto auswählen</Label>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#1e3a5f] transition-colors">
                <Upload className="h-8 w-8 text-gray-300 mb-2" />
                <span className="text-sm text-gray-400">{uploading ? 'Lädt hoch...' : 'Klicken zum Auswählen'}</span>
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => { if(e.target.files?.[0]) handleFotoUpload(e.target.files[0]); }} />
              </label>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setFotoDialog(false)}>Schließen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
