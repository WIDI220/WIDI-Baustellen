import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X, Users, Target } from 'lucide-react';

interface Pruefer {
  id: string; name: string; kuerzel: string;
  soll_monat: number; aktiv: boolean;
}

const EMPTY = { name: '', kuerzel: '', soll_monat: 0, aktiv: true };

export default function DGUVPruefer() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const { data: pruefer = [] } = useQuery({
    queryKey: ['dguv-pruefer'],
    queryFn: async () => {
      const { data } = await supabase.from('dguv_pruefer').select('*').order('name');
      return data ?? [];
    }
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name erforderlich');
      const payload = {
        name: form.name.trim(),
        kuerzel: form.kuerzel.trim().toUpperCase(),
        soll_monat: Number(form.soll_monat) || 0,
        aktiv: form.aktiv,
      };
      if (editId) {
        const { error } = await supabase.from('dguv_pruefer').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dguv_pruefer').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? 'Prüfer aktualisiert' : 'Prüfer angelegt');
      qc.invalidateQueries({ queryKey: ['dguv-pruefer'] });
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dguv_pruefer').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Gelöscht'); qc.invalidateQueries({ queryKey: ['dguv-pruefer'] }); },
  });

  function reset() { setEditId(null); setForm(EMPTY); setShowForm(false); }
  function startEdit(p: Pruefer) {
    setEditId(p.id);
    setForm({ name: p.name, kuerzel: p.kuerzel ?? '', soll_monat: p.soll_monat, aktiv: p.aktiv });
    setShowForm(true);
  }

  const p = pruefer as Pruefer[];
  const aktivCount = p.filter(x => x.aktiv).length;
  const gesamtSoll = p.filter(x => x.aktiv).reduce((s, x) => s + x.soll_monat, 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:32, fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Prüfer <span style={{ color:'#f59e0b' }}>Verwaltung</span>
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>
            {aktivCount} aktive Prüfer · Soll gesamt {gesamtSoll.toLocaleString('de-DE')} Messungen/Monat
          </p>
        </div>
        <button onClick={() => { reset(); setShowForm(true); }}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(245,158,11,0.3)' }}>
          <Plus size={15} /> Prüfer anlegen
        </button>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {[
          { label:'Aktive Prüfer',      value:aktivCount,                                icon:Users,   color:'#f59e0b', bg:'#fffbeb', border:'#fde68a' },
          { label:'Soll gesamt/Monat',  value:`${gesamtSoll.toLocaleString('de-DE')} Stk`, icon:Target, color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
          { label:'Ø Soll pro Prüfer',  value:aktivCount > 0 ? Math.round(gesamtSoll/aktivCount)+' Stk' : '–', icon:Target, color:'#10b981', bg:'#f0fdf4', border:'#bbf7d0' },
        ].map((k, i) => (
          <div key={i} style={{ background:k.bg, border:`1px solid ${k.border}`, borderRadius:16, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, borderRadius:'16px 16px 0 0' }} />
            <k.icon size={17} style={{ color:k.color, marginBottom:10 }} />
            <p style={{ fontSize:22, fontWeight:900, color:'#0f172a', margin:'0 0 2px', letterSpacing:'-.03em' }}>{k.value}</p>
            <p style={{ fontSize:12, color:'#64748b', margin:0, fontWeight:600 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Formular */}
      {showForm && (
        <div style={{ background:'#fff', borderRadius:18, border:'1.5px solid #f59e0b', padding:'20px 24px' }}>
          <p style={{ fontSize:14, fontWeight:700, color:'#92400e', margin:'0 0 16px' }}>
            {editId ? 'Prüfer bearbeiten' : 'Neuen Prüfer anlegen'}
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:14 }}>
            {[
              { label:'Vollständiger Name *', key:'name', placeholder:'Marcel Münch' },
              { label:'Kürzel',              key:'kuerzel', placeholder:'MM' },
              { label:'Soll/Monat (Stk)',    key:'soll_monat', placeholder:'300', type:'number' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={(form as any)[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type==='number' ? Number(e.target.value) : e.target.value }))}
                  style={{ width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, color:'#0f172a', background:'#f8fafc', outline:'none', fontFamily:'inherit' }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 12px' }}>
            💡 Der Name muss exakt so geschrieben sein wie in der CSV-Datei (z.B. "M. Münch")
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => upsert.mutate()} disabled={upsert.isPending}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              <Check size={14} /> {editId ? 'Speichern' : 'Anlegen'}
            </button>
            <button onClick={reset}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, color:'#64748b', cursor:'pointer' }}>
              <X size={14} /> Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Tabelle */}
      <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9' }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a', margin:0 }}>Alle Prüfer</h3>
          <p style={{ fontSize:12, color:'#94a3b8', margin:'3px 0 0' }}>Name muss exakt dem CSV-Namen entsprechen für automatische Zuordnung</p>
        </div>
        {p.length === 0 ? (
          <div style={{ padding:'48px', textAlign:'center', color:'#94a3b8' }}>
            <Users size={36} style={{ marginBottom:12, opacity:.3 }} />
            <p style={{ fontWeight:600, margin:'0 0 6px' }}>Noch keine Prüfer angelegt</p>
            <p style={{ fontSize:13, margin:0 }}>Lege Prüfer an bevor du Messungen importierst</p>
          </div>
        ) : (
          <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                {['Name (= CSV-Name)', 'Kürzel', 'Soll/Monat', 'Status', ''].map(h => (
                  <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.map(pr => (
                <tr key={pr.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                  <td style={{ padding:'13px 16px', fontWeight:700, color:'#0f172a' }}>{pr.name}</td>
                  <td style={{ padding:'13px 16px' }}>
                    <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:12, background:'#f1f5f9', padding:'2px 8px', borderRadius:6, color:'#374151' }}>{pr.kuerzel}</span>
                  </td>
                  <td style={{ padding:'13px 16px' }}>
                    <span style={{ fontWeight:700, fontSize:16, color:'#f59e0b' }}>{pr.soll_monat.toLocaleString('de-DE')}</span>
                    <span style={{ fontSize:11, color:'#94a3b8', marginLeft:4 }}>Stk</span>
                  </td>
                  <td style={{ padding:'13px 16px' }}>
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600, background:pr.aktiv?'#f0fdf4':'#f8fafc', color:pr.aktiv?'#065f46':'#94a3b8' }}>
                      {pr.aktiv ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td style={{ padding:'13px 16px', textAlign:'right' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                      <button onClick={() => startEdit(pr)}
                        style={{ padding:'6px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                        <Pencil size={12} /> Bearbeiten
                      </button>
                      <button onClick={() => { if (confirm(`${pr.name} löschen?`)) del.mutate(pr.id); }}
                        style={{ padding:'6px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
