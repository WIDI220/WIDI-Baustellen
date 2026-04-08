import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────
interface Pruefer {
  id: string
  name: string
  kuerzel: string | null
  soll_stueckzahl_global: number
  aktiv: boolean
}

interface PrueferSoll {
  id: string
  pruefer_id: string
  monat: string
  soll_stueckzahl: number
}

interface Messung {
  id: string
  pruefer_name: string
  monat: string
  anzahl_gesamt: number
  anzahl_bestanden: number
  anzahl_nicht_bestanden: number
  import_dateiname: string | null
}

interface ImportLog {
  id: string
  dateiname: string | null
  monat: string | null
  anzahl_gesamt: number | null
  anzahl_neu: number | null
  created_at: string
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────
const COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#BA7517', '#D4537E']
const MONAT_LABELS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

function getCurrentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonat(monat: string) {
  const [y, m] = monat.split('-')
  return `${MONAT_LABELS[parseInt(m) - 1]} ${y}`
}

function getZielerreichung(ist: number, soll: number) {
  if (soll === 0) return null
  return Math.round((ist / soll) * 100)
}

function getBadgeClass(pct: number | null) {
  if (pct === null) return 'badge-gray'
  if (pct >= 100) return 'badge-green'
  if (pct >= 80) return 'badge-amber'
  return 'badge-red'
}

function parseCSV(text: string): { pruefer: string; datum: string; ergebnis: string }[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(';').map(h => h.trim().replace(/"/g, ''))
  const idx = {
    pruefer: header.findIndex(h => h.toUpperCase().includes('LETZTER') && h.toUpperCase().includes('PR')),
    datum: header.findIndex(h => h.toUpperCase().includes('LETZTE') && h.toUpperCase().includes('PR') && !h.toUpperCase().includes('LETZTER')),
    ergebnis: header.findIndex(h => h.toUpperCase().includes('ERGEBNIS')),
  }
  if (idx.pruefer === -1 || idx.datum === -1) return []
  return lines.slice(1).map(line => {
    const cols = line.split(';').map(c => c.trim().replace(/"/g, ''))
    return {
      pruefer: cols[idx.pruefer] || '',
      datum: cols[idx.datum] || '',
      ergebnis: idx.ergebnis >= 0 ? cols[idx.ergebnis] || '' : '',
    }
  }).filter(r => r.pruefer && r.datum)
}

function datumToMonat(datum: string): string {
  // Format: DD.MM.YYYY
  const parts = datum.split('.')
  if (parts.length !== 3) return ''
  return `${parts[2]}-${parts[1].padStart(2, '0')}`
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────
export default function DGUVAuswertungPage() {
  const [tab, setTab] = useState<'auswertung' | 'mitarbeiter' | 'import'>('auswertung')
  const [pruefer, setPruefer] = useState<Pruefer[]>([])
  const [prueferSoll, setPrueferSoll] = useState<PrueferSoll[]>([])
  const [messungen, setMessungen] = useState<Messung[]>([])
  const [importLogs, setImportLogs] = useState<ImportLog[]>([])
  const [selectedJahr, setSelectedJahr] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Prüfer-Modal
  const [showPrueferModal, setShowPrueferModal] = useState(false)
  const [editPruefer, setEditPruefer] = useState<Pruefer | null>(null)
  const [prueferForm, setPrueferForm] = useState({ name: '', kuerzel: '', soll_stueckzahl_global: 0 })

  // Soll-Modal
  const [showSollModal, setShowSollModal] = useState(false)
  const [sollPruefer, setSollPruefer] = useState<Pruefer | null>(null)
  const [sollForm, setSollForm] = useState({ monat: getCurrentMonthStr(), soll_stueckzahl: 0 })

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Daten laden ────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true)
    const [p, ps, m, il] = await Promise.all([
      supabase.from('dguv_pruefer').select('*').order('name'),
      supabase.from('dguv_pruefer_soll').select('*'),
      supabase.from('dguv_messungen').select('*').order('monat', { ascending: false }),
      supabase.from('dguv_uploads').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    if (p.data) setPruefer(p.data)
    if (ps.data) setPrueferSoll(ps.data)
    if (m.data) setMessungen(m.data)
    if (il.data) setImportLogs(il.data)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // ── Soll für Prüfer+Monat ermitteln ───────────────────────────────────
  function getSoll(prueferName: string, monat: string): number {
    const p = pruefer.find(pr => pr.name === prueferName)
    if (!p) return 0
    const spez = prueferSoll.find(s => s.pruefer_id === p.id && s.monat === monat)
    return spez ? spez.soll_stueckzahl : p.soll_stueckzahl_global
  }

  // ── Jahres-Monate aufbauen ────────────────────────────────────────────
  const jahrMonate = Array.from({ length: 12 }, (_, i) =>
    `${selectedJahr}-${String(i + 1).padStart(2, '0')}`
  )

  const aktivePruefer = pruefer.filter(p => p.aktiv)

  // Messungen für aktuellen Monat
  const aktuellerMonat = getCurrentMonthStr()
  const messFeb = messungen.filter(m => m.monat === aktuellerMonat)

  // Gesamt-Kennzahlen für aktuellen Monat
  const gesamtIst = messFeb.reduce((s, m) => s + m.anzahl_gesamt, 0)
  const gesamtNichtBest = messFeb.reduce((s, m) => s + m.anzahl_nicht_bestanden, 0)
  const avgZiel = (() => {
    const vals = messFeb.map(m => getZielerreichung(m.anzahl_gesamt, getSoll(m.pruefer_name, m.monat))).filter(v => v !== null) as number[]
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  })()

  // ── CSV Import ────────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    setImportMsg(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setImportMsg({ type: 'err', text: 'Keine gültigen Zeilen gefunden. Spalten LETZTER PRÜFER und LETZTE PRÜFUNG werden benötigt.' })
        setImportLoading(false)
        return
      }

      // Gruppieren nach Prüfer + Monat
      const grouped: Record<string, { gesamt: number; bestanden: number; nichtBestanden: number }> = {}
      for (const row of rows) {
        const monat = datumToMonat(row.datum)
        if (!monat || !row.pruefer) continue
        const key = `${row.pruefer}||${monat}`
        if (!grouped[key]) grouped[key] = { gesamt: 0, bestanden: 0, nichtBestanden: 0 }
        grouped[key].gesamt++
        if (row.ergebnis.toLowerCase().includes('nicht')) grouped[key].nichtBestanden++
        else grouped[key].bestanden++
      }

      // Upsert in dguv_messungen
      const upserts = Object.entries(grouped).map(([key, val]) => {
        const [pruefer_name, monat] = key.split('||')
        return {
          pruefer_name,
          monat,
          anzahl_gesamt: val.gesamt,
          anzahl_bestanden: val.bestanden,
          anzahl_nicht_bestanden: val.nichtBestanden,
          import_dateiname: file.name,
        }
      })

      const { error } = await supabase
        .from('dguv_messungen')
        .upsert(upserts, { onConflict: 'pruefer_name,monat' })

      if (error) throw error

      // Import-Log
      const monate = [...new Set(upserts.map(u => u.monat))].join(', ')
      await supabase.from('dguv_uploads').insert({
        dateiname: file.name,
        monat: monate,
        anzahl_gesamt: rows.length,
        anzahl_neu: upserts.length,
        anzahl_korrekturen: 0,
        user_email: (await supabase.auth.getUser()).data.user?.email || '',
      })

      setImportMsg({ type: 'ok', text: `✓ ${rows.length} Messungen importiert · ${upserts.length} Prüfer/Monat-Kombinationen aktualisiert` })
      await loadAll()
    } catch (err: any) {
      setImportMsg({ type: 'err', text: `Fehler: ${err.message}` })
    } finally {
      setImportLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Prüfer CRUD ────────────────────────────────────────────────────────
  async function savePruefer() {
    if (!prueferForm.name.trim()) return
    if (editPruefer) {
      await supabase.from('dguv_pruefer').update({
        name: prueferForm.name,
        kuerzel: prueferForm.kuerzel || null,
        soll_stueckzahl_global: prueferForm.soll_stueckzahl_global,
      }).eq('id', editPruefer.id)
    } else {
      await supabase.from('dguv_pruefer').insert({
        name: prueferForm.name,
        kuerzel: prueferForm.kuerzel || null,
        soll_stueckzahl_global: prueferForm.soll_stueckzahl_global,
      })
    }
    setShowPrueferModal(false)
    setEditPruefer(null)
    setPrueferForm({ name: '', kuerzel: '', soll_stueckzahl_global: 0 })
    await loadAll()
  }

  async function togglePrueferAktiv(p: Pruefer) {
    await supabase.from('dguv_pruefer').update({ aktiv: !p.aktiv }).eq('id', p.id)
    await loadAll()
  }

  async function saveSoll() {
    if (!sollPruefer) return
    await supabase.from('dguv_pruefer_soll').upsert({
      pruefer_id: sollPruefer.id,
      monat: sollForm.monat,
      soll_stueckzahl: sollForm.soll_stueckzahl,
    }, { onConflict: 'pruefer_id,monat' })
    setShowSollModal(false)
    setSollPruefer(null)
    await loadAll()
  }

  // ── Diagramm-Daten vorbereiten ─────────────────────────────────────────
  function getMessungForPrueferMonat(prueferName: string, monat: string) {
    return messungen.find(m => m.pruefer_name === prueferName && m.monat === monat)
  }

  const maxStueck = (() => {
    let max = 0
    for (const monat of jahrMonate) {
      for (const p of aktivePruefer) {
        const m = getMessungForPrueferMonat(p.name, monat)
        const soll = getSoll(p.name, monat)
        max = Math.max(max, m?.anzahl_gesamt || 0, soll)
      }
    }
    return max || 100
  })()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--color-text-secondary)', fontSize: 14 }}>
      Daten werden geladen…
    </div>
  )

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>DGUV Prüfer-Auswertung</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>Messungen & Produktivität nach Mitarbeiter</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}
          >
            {importLoading ? '⟳ Importiere…' : '↓ CSV importieren'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button
            onClick={() => { setEditPruefer(null); setPrueferForm({ name: '', kuerzel: '', soll_stueckzahl_global: 0 }); setShowPrueferModal(true) }}
            style={{ padding: '7px 14px', fontSize: 13, border: 'none', borderRadius: 8, background: '#533AB7', color: 'white', cursor: 'pointer' }}
          >
            + Prüfer anlegen
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', fontSize: 13,
          background: importMsg.type === 'ok' ? '#EAF3DE' : '#FCEBEB',
          color: importMsg.type === 'ok' ? '#3B6D11' : '#A32D2D',
          border: `0.5px solid ${importMsg.type === 'ok' ? '#C0DD97' : '#F7C1C1'}`,
        }}>
          {importMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '0.5px solid var(--color-border-tertiary)', marginBottom: '1.5rem' }}>
        {(['auswertung', 'mitarbeiter', 'import'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t ? '2px solid #533AB7' : '2px solid transparent',
            color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: tab === t ? 500 : 400,
          }}>
            {t === 'auswertung' ? 'Auswertung' : t === 'mitarbeiter' ? 'Mitarbeiter' : 'Import-Verlauf'}
          </button>
        ))}
      </div>

      {/* ── Tab: Auswertung ─────────────────────────────────────────────── */}
      {tab === 'auswertung' && (
        <>
          {/* Kennzahl-Karten */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: '1.5rem' }}>
            {[
              { label: 'Messungen gesamt', value: gesamtIst.toLocaleString('de'), sub: formatMonat(aktuellerMonat) },
              { label: 'Prüfer aktiv', value: aktivePruefer.length, sub: aktivePruefer.map(p => p.name.split(' ')[1] || p.name).join(' · ') },
              { label: 'Zielerreichung Ø', value: avgZiel !== null ? `${avgZiel}%` : '—', sub: 'vs. Soll-Stückzahl', highlight: avgZiel !== null ? (avgZiel >= 100 ? '#3B6D11' : avgZiel >= 80 ? '#854F0B' : '#A32D2D') : undefined },
              { label: 'Nicht bestanden', value: gesamtNichtBest, sub: gesamtIst > 0 ? `${((gesamtNichtBest / gesamtIst) * 100).toFixed(2)}% Fehlerquote` : '—', highlight: gesamtNichtBest > 0 ? '#A32D2D' : undefined },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: k.highlight || 'var(--color-text-primary)' }}>{k.value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Diagramm + Prüfer-Karte */}
          <div style={{ display: 'flex', gap: 16, marginBottom: '1.5rem' }}>
            {/* Balkendiagramm */}
            <div style={{ flex: 2, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Monatliche Stückzahlen — pro Prüfer</div>
                <select
                  value={selectedJahr}
                  onChange={e => setSelectedJahr(Number(e.target.value))}
                  style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                >
                  {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>

              <div style={{ position: 'relative', height: 200 }}>
                {/* Y-Achse Hilfslinien */}
                {[0, 25, 50, 75, 100].map(pct => (
                  <div key={pct} style={{
                    position: 'absolute', left: 0, right: 0,
                    bottom: `${pct}%`,
                    borderTop: pct === 0 ? '1px solid var(--color-border-secondary)' : '0.5px solid var(--color-border-tertiary)',
                    zIndex: 0,
                  }} />
                ))}

                {/* Balken */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 28 }}>
                  {jahrMonate.map((monat, mi) => {
                    const hatDaten = aktivePruefer.some(p => getMessungForPrueferMonat(p.name, monat))
                    return (
                      <div key={monat} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 'calc(100% - 24px)' }}>
                          {aktivePruefer.map((p, pi) => {
                            const m = getMessungForPrueferMonat(p.name, monat)
                            const h = m ? Math.max(2, Math.round((m.anzahl_gesamt / maxStueck) * 100)) : 2
                            return (
                              <div key={p.id} title={m ? `${p.name}: ${m.anzahl_gesamt} Messungen` : `${p.name}: keine Daten`} style={{
                                width: 14, height: `${h}%`,
                                background: COLORS[pi % COLORS.length],
                                borderRadius: '2px 2px 0 0',
                                opacity: hatDaten ? 1 : 0.15,
                                transition: 'height 0.3s ease',
                                cursor: m ? 'pointer' : 'default',
                              }} />
                            )
                          })}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', position: 'absolute', bottom: 6 }}>
                          {MONAT_LABELS[mi]}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Soll-Linie (durchschnitt global) */}
                {aktivePruefer.length > 0 && (() => {
                  const avgSoll = aktivePruefer.reduce((s, p) => s + p.soll_stueckzahl_global, 0) / aktivePruefer.length
                  const pct = Math.min(100, Math.round((avgSoll / maxStueck) * 100))
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${pct}% + 28px - ${pct * 0.28}px)`, borderTop: '1.5px dashed #AFA9EC', zIndex: 2 }}>
                      <span style={{ position: 'absolute', right: 0, top: -16, fontSize: 10, color: '#7F77DD', background: 'var(--color-background-primary)', padding: '0 4px' }}>
                        Ø Soll: {Math.round(avgSoll)}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* Legende */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                {aktivePruefer.map((p, pi) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    <div style={{ width: 10, height: 10, background: COLORS[pi % COLORS.length], borderRadius: 2 }} />
                    {p.name}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <div style={{ width: 10, height: 0, borderTop: '1.5px dashed #AFA9EC' }} />
                  Ø Soll-Linie
                </div>
              </div>
            </div>

            {/* Prüfer-Karte aktueller Monat */}
            <div style={{ flex: 1, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: '1rem' }}>Prüfer — {formatMonat(aktuellerMonat)}</div>
              {aktivePruefer.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Noch keine Prüfer angelegt.</div>
              )}
              {aktivePruefer.map((p, pi) => {
                const m = getMessungForPrueferMonat(p.name, aktuellerMonat)
                const soll = getSoll(p.name, aktuellerMonat)
                const ist = m?.anzahl_gesamt || 0
                const ziel = getZielerreichung(ist, soll)
                const pct = soll > 0 ? Math.min(100, Math.round((ist / soll) * 100)) : 0
                const initials = p.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: pi < aktivePruefer.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${COLORS[pi % COLORS.length]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: COLORS[pi % COLORS.length], flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ marginTop: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{ist} / {soll}</span>
                          {ziel !== null && <span style={{ color: ziel >= 100 ? '#3B6D11' : ziel >= 80 ? '#854F0B' : '#A32D2D', fontWeight: 500 }}>{ziel}%</span>}
                        </div>
                        <div style={{ background: 'var(--color-background-secondary)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: COLORS[pi % COLORS.length], borderRadius: 4, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    </div>
                    {ziel !== null && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: ziel >= 100 ? '#EAF3DE' : ziel >= 80 ? '#FAEEDA' : '#FCEBEB',
                        color: ziel >= 100 ? '#3B6D11' : ziel >= 80 ? '#854F0B' : '#A32D2D',
                      }}>
                        {ziel >= 100 ? `+${ziel - 100}%` : `-${100 - ziel}%`}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detailtabelle */}
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: '1rem' }}>Detailübersicht — alle Importe</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '6px 0 8px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div>Prüfer</div><div style={{ textAlign: 'right' }}>Monat</div><div style={{ textAlign: 'right' }}>Soll</div><div style={{ textAlign: 'right' }}>Ist</div><div style={{ textAlign: 'right' }}>Nicht best.</div><div style={{ textAlign: 'right' }}>Zielerreichung</div>
            </div>
            {messungen.length === 0 && (
              <div style={{ padding: '1rem 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>Noch keine Messungen importiert.</div>
            )}
            {messungen.slice(0, 50).map(m => {
              const soll = getSoll(m.pruefer_name, m.monat)
              const ziel = getZielerreichung(m.anzahl_gesamt, soll)
              const pi = aktivePruefer.findIndex(p => p.name === m.pruefer_name)
              const initials = m.pruefer_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 13, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: pi >= 0 ? `${COLORS[pi % COLORS.length]}22` : '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, color: pi >= 0 ? COLORS[pi % COLORS.length] : '#1D9E75' }}>
                      {initials}
                    </div>
                    {m.pruefer_name}
                  </div>
                  <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatMonat(m.monat)}</div>
                  <div style={{ textAlign: 'right' }}>{soll || '—'}</div>
                  <div style={{ textAlign: 'right', fontWeight: 500 }}>{m.anzahl_gesamt}</div>
                  <div style={{ textAlign: 'right', color: m.anzahl_nicht_bestanden > 0 ? '#A32D2D' : 'var(--color-text-secondary)' }}>{m.anzahl_nicht_bestanden}</div>
                  <div style={{ textAlign: 'right' }}>
                    {ziel !== null ? (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: ziel >= 100 ? '#EAF3DE' : ziel >= 80 ? '#FAEEDA' : '#FCEBEB',
                        color: ziel >= 100 ? '#3B6D11' : ziel >= 80 ? '#854F0B' : '#A32D2D',
                      }}>{ziel}%</span>
                    ) : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Tab: Mitarbeiter ────────────────────────────────────────────── */}
      {tab === 'mitarbeiter' && (
        <div>
          {pruefer.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, background: 'var(--color-background-secondary)', borderRadius: 12 }}>
              Noch keine Prüfer angelegt. Klicke auf "Prüfer anlegen".
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pruefer.map((p, pi) => {
              const monSoll = prueferSoll.filter(s => s.pruefer_id === p.id).sort((a, b) => b.monat.localeCompare(a.monat))
              return (
                <div key={p.id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem 1.25rem', opacity: p.aktiv ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${COLORS[pi % COLORS.length]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: COLORS[pi % COLORS.length] }}>
                      {p.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name} {p.kuerzel && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>({p.kuerzel})</span>}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Globales Soll: {p.soll_stueckzahl_global} Stück/Monat</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setSollPruefer(p); setSollForm({ monat: getCurrentMonthStr(), soll_stueckzahl: 0 }); setShowSollModal(true) }}
                        style={{ padding: '5px 12px', fontSize: 12, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                        Soll setzen
                      </button>
                      <button onClick={() => { setEditPruefer(p); setPrueferForm({ name: p.name, kuerzel: p.kuerzel || '', soll_stueckzahl_global: p.soll_stueckzahl_global }); setShowPrueferModal(true) }}
                        style={{ padding: '5px 12px', fontSize: 12, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                        Bearbeiten
                      </button>
                      <button onClick={() => togglePrueferAktiv(p)}
                        style={{ padding: '5px 12px', fontSize: 12, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', color: p.aktiv ? '#A32D2D' : '#3B6D11', cursor: 'pointer' }}>
                        {p.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    </div>
                  </div>
                  {monSoll.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Individuelle Monatsvorgaben</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {monSoll.map(s => (
                          <span key={s.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-tertiary)' }}>
                            {formatMonat(s.monat)}: {s.soll_stueckzahl}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Import-Verlauf ──────────────────────────────────────────── */}
      {tab === 'import' && (
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '6px 0 8px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <div>Datei</div><div style={{ textAlign: 'right' }}>Monat</div><div style={{ textAlign: 'right' }}>Messungen</div><div style={{ textAlign: 'right' }}>Datum</div>
          </div>
          {importLogs.length === 0 && (
            <div style={{ padding: '1rem 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>Noch keine Importe.</div>
          )}
          {importLogs.map(log => (
            <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 13 }}>
              <div style={{ color: 'var(--color-text-primary)' }}>{log.dateiname || '—'}</div>
              <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>{log.monat || '—'}</div>
              <div style={{ textAlign: 'right', fontWeight: 500 }}>{log.anzahl_gesamt || 0}</div>
              <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>{new Date(log.created_at).toLocaleDateString('de-DE')}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Prüfer anlegen/bearbeiten ────────────────────────────── */}
      {showPrueferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, padding: '1.5rem', width: 380, border: '0.5px solid var(--color-border-tertiary)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: '1.25rem' }}>{editPruefer ? 'Prüfer bearbeiten' : 'Prüfer anlegen'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Name (wie in CSV)</label>
                <input value={prueferForm.name} onChange={e => setPrueferForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z.B. M. Münch"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>Muss exakt mit "LETZTER PRÜFER" in der CSV übereinstimmen</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Kürzel (optional)</label>
                <input value={prueferForm.kuerzel} onChange={e => setPrueferForm(f => ({ ...f, kuerzel: e.target.value }))}
                  placeholder="z.B. MM"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Globales Soll (Stück/Monat)</label>
                <input type="number" value={prueferForm.soll_stueckzahl_global} onChange={e => setPrueferForm(f => ({ ...f, soll_stueckzahl_global: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowPrueferModal(false); setEditPruefer(null) }}
                style={{ padding: '7px 14px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                Abbrechen
              </button>
              <button onClick={savePruefer}
                style={{ padding: '7px 14px', fontSize: 13, border: 'none', borderRadius: 6, background: '#533AB7', color: 'white', cursor: 'pointer' }}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Soll setzen ───────────────────────────────────────────── */}
      {showSollModal && sollPruefer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, padding: '1.5rem', width: 340, border: '0.5px solid var(--color-border-tertiary)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Monatliches Soll setzen</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>{sollPruefer.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Monat</label>
                <input type="month" value={sollForm.monat} onChange={e => setSollForm(f => ({ ...f, monat: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Soll-Stückzahl</label>
                <input type="number" value={sollForm.soll_stueckzahl} onChange={e => setSollForm(f => ({ ...f, soll_stueckzahl: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>Globales Soll: {sollPruefer.soll_stueckzahl_global} · Leer lassen = global gilt</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSollModal(false); setSollPruefer(null) }}
                style={{ padding: '7px 14px', fontSize: 13, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                Abbrechen
              </button>
              <button onClick={saveSoll}
                style={{ padding: '7px 14px', fontSize: 13, border: 'none', borderRadius: 6, background: '#533AB7', color: 'white', cursor: 'pointer' }}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
