import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, RefreshCw, TrendingUp, Clock, Euro, Package, ChevronRight, Zap } from 'lucide-react';
import { fmtEur } from '@/lib/utils';
import { berechneKosten } from '@/lib/berechnung';

const STUNDEN_SATZ = 38.08;

// ── Schwellenwerte ────────────────────────────────────────────────────────
const REGELN = [
  { typ: 'budget_personal',  label: 'Personalkosten',  schwelle: 80,  icon: TrendingUp, farbe: '#f59e0b' },
  { typ: 'budget_material',  label: 'Materialkosten',  schwelle: 80,  icon: Package,    farbe: '#8b5cf6' },
  { typ: 'budget_gesamt',    label: 'Gesamtbudget',    schwelle: 80,  icon: Euro,       farbe: '#ef4444' },
  { typ: 'frist',            label: 'Frist überschritten', schwelle: 0, icon: Clock,   farbe: '#e11d48' },
];

export default function EskalationenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pruefenLaeuft, setPruefenLaeuft] = useState(false);
  const [filterTyp, setFilterTyp] = useState<string>('alle');
  const [filterGelesen, setFilterGelesen] = useState<'offen' | 'alle'>('offen');

  // ── Daten laden ──────────────────────────────────────────────────────────
  const { data: eskalationen = [], isLoading } = useQuery({
    queryKey: ['bs-eskalationen'],
    queryFn: async () => {
      const { data } = await supabase.from('bs_eskalationen')
        .select('*, baustellen(id, name, status)')
        .order('created_at', { ascending: false });
      return data ?? [];
    }
  });

  const { data: baustellen = [] } = useQuery({
    queryKey: ['bs-esk-baustellen'],
    queryFn: async () => {
      const { data } = await supabase.from('baustellen')
        .select('*')
        .eq('status', 'in_bearbeitung');
      return data ?? [];
    }
  });

  const { data: stunden = [] } = useQuery({
    queryKey: ['bs-esk-stunden'],
    queryFn: async () => {
      const { data } = await supabase.from('bs_stundeneintraege')
        .select('baustelle_id, stunden, employees(stundensatz)');
      return data ?? [];
    }
  });

  const { data: materialien = [] } = useQuery({
    queryKey: ['bs-esk-material'],
    queryFn: async () => {
      const { data } = await supabase.from('bs_materialien')
        .select('baustelle_id, gesamtpreis');
      return data ?? [];
    }
  });

  const { data: nachtraege = [] } = useQuery({
    queryKey: ['bs-esk-nach'],
    queryFn: async () => {
      const { data } = await supabase.from('bs_nachtraege')
        .select('baustelle_id, betrag, status');
      return data ?? [];
    }
  });

  // ── Automatische Prüfung ─────────────────────────────────────────────────
  const pruefen = async () => {
    setPruefenLaeuft(true);
    let neu = 0;
    const bs = baustellen as any[];
    const sw = stunden as any[];
    const mat = materialien as any[];
    const nach = nachtraege as any[];

    for (const baustelle of bs) {
      // Nur aktive Baustellen prüfen
      if (baustelle.status !== 'in_bearbeitung') continue;

      const budget = Number(baustelle.budget ?? 0);
      if (budget <= 0) continue;

      const k = berechneKosten(baustelle.id, sw, mat, nach, budget);

      // ── Budget Personal ───────────────────────────────────────────────
      const pctPersonal = budget > 0 ? (k.personalkosten / budget) * 100 : 0;
      if (pctPersonal >= 80) {
        const vorhanden = await pruefeVorhanden(baustelle.id, 'budget_personal');
        if (!vorhanden) {
          await legeEskalationAn(baustelle.id, 'budget_personal',
            `Personalkosten bei ${Math.round(pctPersonal)}% des Budgets`,
            pctPersonal >= 100 ? 'kritisch' : 'hoch',
            { prozent: Math.round(pctPersonal), betrag: k.personalkosten, budget }
          );
          neu++;
        }
      }

      // ── Budget Material ───────────────────────────────────────────────
      const pctMaterial = budget > 0 ? (k.materialkosten / budget) * 100 : 0;
      if (pctMaterial >= 80) {
        const vorhanden = await pruefeVorhanden(baustelle.id, 'budget_material');
        if (!vorhanden) {
          await legeEskalationAn(baustelle.id, 'budget_material',
            `Materialkosten bei ${Math.round(pctMaterial)}% des Budgets`,
            pctMaterial >= 100 ? 'kritisch' : 'hoch',
            { prozent: Math.round(pctMaterial), betrag: k.materialkosten, budget }
          );
          neu++;
        }
      }

      // ── Gesamtbudget ──────────────────────────────────────────────────
      const pctGesamt = k.pct;
      if (pctGesamt >= 80) {
        const vorhanden = await pruefeVorhanden(baustelle.id, 'budget_gesamt');
        if (!vorhanden) {
          await legeEskalationAn(baustelle.id, 'budget_gesamt',
            `Gesamtkosten bei ${Math.round(pctGesamt)}% des Budgets`,
            pctGesamt >= 100 ? 'kritisch' : 'hoch',
            { prozent: Math.round(pctGesamt), betrag: k.gesamtkosten, budget }
          );
          neu++;
        }
      }

      // ── Frist ─────────────────────────────────────────────────────────
      if (baustelle.enddatum) {
        const daysLeft = Math.round((new Date(baustelle.enddatum).getTime() - Date.now()) / 86400000);
        if (daysLeft < 0) {
          const vorhanden = await pruefeVorhanden(baustelle.id, 'frist');
          if (!vorhanden) {
            await legeEskalationAn(baustelle.id, 'frist',
              `Frist überschritten um ${Math.abs(daysLeft)} Tage`,
              'kritisch',
              { tage: Math.abs(daysLeft), enddatum: baustelle.enddatum }
            );
            neu++;
          }
        } else if (daysLeft <= 7) {
          const vorhanden = await pruefeVorhanden(baustelle.id, 'frist_bald');
          if (!vorhanden) {
            await legeEskalationAn(baustelle.id, 'frist_bald',
              `Frist läuft in ${daysLeft} Tagen ab`,
              'mittel',
              { tage: daysLeft, enddatum: baustelle.enddatum }
            );
            neu++;
          }
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['bs-eskalationen'] });
    setPruefenLaeuft(false);
    if (neu > 0) toast.success(`${neu} neue Eskalation${neu !== 1 ? 'en' : ''} gefunden`);
    else toast.success('Alles in Ordnung — keine neuen Eskalationen');
  };

  const pruefeVorhanden = async (baustelleId: string, typ: string): Promise<boolean> => {
    const { data } = await supabase.from('bs_eskalationen')
      .select('id').eq('baustelle_id', baustelleId).eq('typ', typ).eq('gelesen', false).limit(1);
    return (data?.length ?? 0) > 0;
  };

  const legeEskalationAn = async (baustelleId: string, typ: string, beschreibung: string, schweregrad: string, details: any) => {
    await supabase.from('bs_eskalationen').insert({
      baustelle_id: baustelleId, typ, beschreibung, schweregrad,
      details, gelesen: false,
    });
  };

  const alsGelesenMarkieren = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bs_eskalationen').update({ gelesen: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bs-eskalationen'] }),
  });

  const alleAlsGelesen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('bs_eskalationen').update({ gelesen: true }).eq('gelesen', false);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bs-eskalationen'] }); toast.success('Alle als gelesen markiert'); },
  });

  // ── Filter ────────────────────────────────────────────────────────────────
  const esk = eskalationen as any[];
  const filtered = esk.filter(e => {
    if (filterGelesen === 'offen' && e.gelesen) return false;
    if (filterTyp !== 'alle' && e.typ !== filterTyp) return false;
    return true;
  });

  const offenCount = esk.filter(e => !e.gelesen).length;
  const kritischCount = esk.filter(e => !e.gelesen && e.schweregrad === 'kritisch').length;

  const SCHWERE_CFG: Record<string, { label:string; bg:string; color:string }> = {
    kritisch: { label:'Kritisch', bg:'#fef2f2', color:'#dc2626' },
    hoch:     { label:'Hoch',     bg:'#fff7ed', color:'#d97706' },
    mittel:   { label:'Mittel',   bg:'#fffbeb', color:'#ca8a04' },
    niedrig:  { label:'Niedrig',  bg:'#f0fdf4', color:'#16a34a' },
  };

  const TYP_CFG: Record<string, { label:string; icon:any; farbe:string }> = {
    budget_personal: { label:'Personalkosten',     icon: TrendingUp, farbe:'#f59e0b' },
    budget_material: { label:'Materialkosten',     icon: Package,    farbe:'#8b5cf6' },
    budget_gesamt:   { label:'Gesamtbudget',       icon: Euro,       farbe:'#ef4444' },
    frist:           { label:'Frist überschritten',icon: Clock,      farbe:'#e11d48' },
    frist_bald:      { label:'Frist läuft ab',     icon: Clock,      farbe:'#f59e0b' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, paddingBottom:40, fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#0f172a', margin:0, letterSpacing:'-.03em' }}>
            Eskalationen
            {offenCount > 0 && <span style={{ marginLeft:10, fontSize:14, fontWeight:700, padding:'2px 10px', borderRadius:20, background:'#fef2f2', color:'#dc2626' }}>{offenCount} offen</span>}
          </h1>
          <p style={{ fontSize:13, color:'#94a3b8', margin:'4px 0 0' }}>Automatische Prüfung · Budget, Kosten & Fristen · nur aktive Baustellen</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {offenCount > 0 && (
            <button onClick={() => alleAlsGelesen.mutate()}
              style={{ padding:'9px 16px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, fontSize:13, color:'#64748b', cursor:'pointer', fontFamily:'inherit' }}>
              Alle als gelesen
            </button>
          )}
          <button onClick={pruefen} disabled={pruefenLaeuft}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', background:'linear-gradient(135deg,#1e3a5f,#2563eb)', color:'#fff', border:'none', borderRadius:12, fontSize:13, fontWeight:700, cursor:pruefenLaeuft?'wait':'pointer', boxShadow:'0 4px 14px rgba(37,99,235,.3)', opacity:pruefenLaeuft?.7:1 }}>
            <RefreshCw size={14} style={{ animation: pruefenLaeuft ? 'spin 1s linear infinite' : 'none' }}/> Jetzt prüfen
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Offen',    value:offenCount,    color:'#ef4444', bg:'#fef2f2', border:'#fecaca' },
          { label:'Kritisch', value:kritischCount, color:'#dc2626', bg:'#fef2f2', border:'#fca5a5' },
          { label:'Budget',   value:esk.filter(e=>!e.gelesen&&e.typ?.startsWith('budget')).length, color:'#f59e0b', bg:'#fffbeb', border:'#fde68a' },
          { label:'Fristen',  value:esk.filter(e=>!e.gelesen&&e.typ?.startsWith('frist')).length,  color:'#e11d48', bg:'#fff1f2', border:'#fecdd3' },
        ].map((k,i) => (
          <div key={i} style={{ background:k.bg, border:`1px solid ${k.border}`, borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, borderRadius:'14px 14px 0 0' }}/>
            <p style={{ fontSize:24, fontWeight:900, color:k.color, margin:'0 0 2px', letterSpacing:'-.03em' }}>{k.value}</p>
            <p style={{ fontSize:12, fontWeight:600, color:'#64748b', margin:0 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Schwellenwerte Info */}
      <div style={{ background:'#f8fafc', border:'1px solid #f1f5f9', borderRadius:14, padding:'14px 18px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Automatische Prüfregeln</div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          {[
            { label:'Personalkosten ≥ 80%', farbe:'#f59e0b' },
            { label:'Materialkosten ≥ 80%', farbe:'#8b5cf6' },
            { label:'Gesamtbudget ≥ 80%',   farbe:'#ef4444' },
            { label:'Frist überschritten',   farbe:'#e11d48' },
            { label:'Frist in ≤ 7 Tagen',   farbe:'#f59e0b' },
          ].map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:r.farbe, flexShrink:0 }}/>
              {r.label}
            </div>
          ))}
        </div>
        <p style={{ fontSize:11, color:'#94a3b8', margin:'8px 0 0' }}>Prüfung nur für Baustellen mit Status "In Bearbeitung" · Budget muss eingetragen sein</p>
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:10, padding:3 }}>
          {(['offen','alle'] as const).map(f => (
            <button key={f} onClick={() => setFilterGelesen(f)}
              style={{ padding:'6px 14px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s', fontFamily:'inherit',
                background: filterGelesen===f ? '#fff' : 'transparent',
                color: filterGelesen===f ? '#0f172a' : '#94a3b8',
                boxShadow: filterGelesen===f ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
              {f === 'offen' ? 'Offen' : 'Alle'}
            </button>
          ))}
        </div>
        <select value={filterTyp} onChange={e => setFilterTyp(e.target.value)}
          style={{ padding:'7px 12px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12, background:'#fff', color:'#0f172a', outline:'none', fontFamily:'inherit' }}>
          <option value="alle">Alle Typen</option>
          {Object.entries(TYP_CFG).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
        </select>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>Laden...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:18, border:'1px solid #f1f5f9', padding:'48px', textAlign:'center' }}>
          <CheckCircle size={40} style={{ color:'#10b981', margin:'0 auto 14px', display:'block' }}/>
          <p style={{ fontSize:15, fontWeight:700, color:'#0f172a', margin:'0 0 6px' }}>Keine offenen Eskalationen</p>
          <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Klicke "Jetzt prüfen" um alle aktiven Baustellen zu prüfen</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map((e: any) => {
            const schwere = SCHWERE_CFG[e.schweregrad] ?? SCHWERE_CFG.mittel;
            const typCfg = TYP_CFG[e.typ] ?? { label: e.typ, icon: AlertTriangle, farbe: '#64748b' };
            const Icon = typCfg.icon;
            const details = e.details ?? {};
            return (
              <div key={e.id} style={{ background: e.gelesen ? '#fafafa' : '#fff', borderRadius:16, border:`1px solid ${e.gelesen ? '#f1f5f9' : '#e2e8f0'}`, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:14, opacity: e.gelesen ? .6 : 1 }}>

                {/* Icon */}
                <div style={{ width:40, height:40, borderRadius:12, background: typCfg.farbe+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                  <Icon size={18} style={{ color: typCfg.farbe }}/>
                </div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{e.baustellen?.name ?? '—'}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:600, background:schwere.bg, color:schwere.color }}>{schwere.label}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:500, background: typCfg.farbe+'12', color: typCfg.farbe }}>{typCfg.label}</span>
                  </div>
                  <p style={{ fontSize:13, color:'#374151', margin:'0 0 6px' }}>{e.beschreibung}</p>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                    {details.prozent !== undefined && (
                      <span style={{ fontSize:12, color:'#64748b' }}>Auslastung: <strong style={{ color: details.prozent >= 100 ? '#dc2626' : '#f59e0b' }}>{details.prozent}%</strong></span>
                    )}
                    {details.betrag !== undefined && (
                      <span style={{ fontSize:12, color:'#64748b' }}>Kosten: <strong>{fmtEur(details.betrag)}</strong></span>
                    )}
                    {details.budget !== undefined && (
                      <span style={{ fontSize:12, color:'#64748b' }}>Budget: <strong>{fmtEur(details.budget)}</strong></span>
                    )}
                    {details.tage !== undefined && (
                      <span style={{ fontSize:12, color:'#64748b' }}>Tage: <strong style={{ color:'#dc2626' }}>{details.tage}</strong></span>
                    )}
                    <span style={{ fontSize:11, color:'#94a3b8' }}>{new Date(e.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>

                {/* Aktionen */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {e.baustellen?.id && (
                    <button onClick={() => navigate(`/baustellen/${e.baustellen.id}`)}
                      style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:11, color:'#374151', fontFamily:'inherit' }}>
                      Öffnen <ChevronRight size={11}/>
                    </button>
                  )}
                  {!e.gelesen && (
                    <button onClick={() => alsGelesenMarkieren.mutate(e.id)}
                      style={{ padding:'6px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#16a34a', fontFamily:'inherit' }}>
                      <CheckCircle size={11}/> Erledigt
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
