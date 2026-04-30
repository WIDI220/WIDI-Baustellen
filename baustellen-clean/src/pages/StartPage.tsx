// ============================================================
// HANDWERKER ZEITERFASSUNG v2
// - Mitarbeiter & Baustellen live aus Controlling (readonly)
// - Vorher/Nachher Fotos
// - Genehmigen → Verbuchen (2-Stufen-Schutz)
// ============================================================

import { useState, useEffect, useCallback } from "react";

// ── Neue App (Handwerker-Daten, Einträge, Fotos) ─────────────
const APP_URL  = "https://syhjjuewkjjihxwiexmz.supabase.co";
const APP_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aGpqdWV3a2pqaWh4d2lleG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTk2NDYsImV4cCI6MjA5MzA5NTY0Nn0.9A-GrkU72IZ3uxkypX5GttN4EXNv46aX4uOY4wUmfaE";

// ── Controlling (NUR LESEN: employees, baustellen | SCHREIBEN: nur nach Bestätigung) ──
const CTRL_URL = "https://uclsqnpqvphdbeutzzuu.supabase.co";
const CTRL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbHNxbnBxdnBoZGJldXR6enV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODUzNjQsImV4cCI6MjA4Nzc2MTM2NH0.qpWW_Bx4Lddkf3YEPeVwv0yRU_leRwakojcdfGBELs4";

const appApi = async (path, options = {}) => {
  const res = await fetch(`${APP_URL}/rest/v1/${path}`, {
    headers: { apikey: APP_KEY, Authorization: `Bearer ${APP_KEY}`, "Content-Type": "application/json", Prefer: options.prefer || "return=representation", ...options.headers },
    ...options,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Fehler"); }
  if (res.status === 204) return null;
  return res.json();
};

const ctrlRead = async (path) => {
  const res = await fetch(`${CTRL_URL}/rest/v1/${path}`, {
    headers: { apikey: CTRL_KEY, Authorization: `Bearer ${CTRL_KEY}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Controlling Lesefehler");
  return res.json();
};

const ctrlWrite = async (path, body, options = {}) => {
  const res = await fetch(`${CTRL_URL}/rest/v1/${path}`, {
    method: options.method || "POST",
    headers: { apikey: CTRL_KEY, Authorization: `Bearer ${CTRL_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Controlling Schreibfehler"); }
  return res.status === 204 ? null : res.json();
};

const uploadFoto = async (file, mitarbeiterId) => {
  const ext = file.name.split(".").pop();
  const path = `${mitarbeiterId}/${Date.now()}.${ext}`;
  const res = await fetch(`${APP_URL}/storage/v1/object/fotos/${path}`, {
    method: "POST",
    headers: { apikey: APP_KEY, Authorization: `Bearer ${APP_KEY}`, "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Foto Upload fehlgeschlagen");
  return `${APP_URL}/storage/v1/object/public/fotos/${path}`;
};

// ── Konstanten ────────────────────────────────────────────────
const TYP = {
  baustelle: { label: "Baustelle",  icon: "🏗️", color: "#e67e22" },
  ticket:    { label: "Ticket",     icon: "🎫", color: "#3498db" },
  dguv:      { label: "DGUV",       icon: "🦺", color: "#27ae60" },
  sonstiges: { label: "Sonstiges",  icon: "📋", color: "#8e44ad" },
};
const ST = {
  offen:      { label: "Offen",      bg: "#fff3cd", color: "#856404" },
  genehmigt:  { label: "Genehmigt",  bg: "#d1eddb", color: "#0f5132" },
  abgelehnt:  { label: "Abgelehnt",  bg: "#f8d7da", color: "#842029" },
  verbucht:   { label: "Verbucht ✓", bg: "#cfe2ff", color: "#084298" },
};

const inp = { width: "100%", padding: "12px 14px", border: "1.5px solid #e8e6e0", borderRadius: "10px", fontSize: "15px", background: "#fff", color: "#1a1a1a", boxSizing: "border-box", fontFamily: "inherit", outline: "none", marginTop: "6px" };
const lbl = { fontSize: "13px", fontWeight: "600", color: "#444", display: "block", textTransform: "uppercase", letterSpacing: "0.4px" };

// ── Login ─────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Lese Mitarbeiter live aus Controlling (nur lesend!)
    ctrlRead("employees?aktiv=eq.true&order=name.asc&select=id,name,gewerk,kuerzel")
      .then(data => {
        // Admin wird separat hinzugefügt – kein Controlling-Mitarbeiter als Admin
        setList(data);
      })
      .catch(() => setError("Mitarbeiter konnten nicht geladen werden"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f4f0", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ fontSize: "44px", marginBottom: "10px" }}>⚒️</div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: "700", color: "#1a1a1a", letterSpacing: "-0.5px" }}>Zeiterfassung</h1>
          <p style={{ margin: "8px 0 0", color: "#666", fontSize: "15px" }}>Wähle deinen Namen</p>
        </div>

        {error && <div style={{ background: "#f8d7da", color: "#842029", padding: "12px", borderRadius: "10px", marginBottom: "16px", fontSize: "14px" }}>⚠️ {error}</div>}

        {loading ? <p style={{ textAlign: "center", color: "#999" }}>Lade Mitarbeiter...</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Admin Login zuerst */}
            <button onClick={() => onLogin({ id: "admin", name: "Chef / Admin", rolle: "admin" })}
              style={{ padding: "14px 18px", background: "#1a1a1a", border: "2px solid #1a1a1a", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "15px", fontWeight: "600", color: "#fff", fontFamily: "inherit" }}>
              <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#d4612a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700", flexShrink: 0 }}>A</span>
              Chef / Admin
              <span style={{ marginLeft: "auto", fontSize: "11px", background: "#d4612a", padding: "3px 8px", borderRadius: "20px" }}>Admin</span>
            </button>

            <div style={{ height: "1px", background: "#e8e6e0", margin: "6px 0" }} />

            {list.map(m => (
              <button key={m.id} onClick={() => onLogin({ ...m, rolle: "handwerker" })}
                style={{ padding: "14px 18px", background: "#fff", border: "2px solid #e8e6e0", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "15px", fontWeight: "500", color: "#1a1a1a", fontFamily: "inherit", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#d4612a"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#e8e6e0"}>
                <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#d4612a22", color: "#d4612a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700", flexShrink: 0 }}>
                  {m.name.charAt(0)}
                </span>
                <span style={{ flex: 1, textAlign: "left" }}>{m.name}</span>
                <span style={{ fontSize: "12px", color: "#999" }}>{m.gewerk}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Neuer Eintrag ─────────────────────────────────────────────
function NeuerEintrag({ mitarbeiter, onSuccess, onCancel }) {
  const [baustellen, setBaustellen] = useState([]);
  const [form, setForm] = useState({ datum: new Date().toISOString().split("T")[0], typ: "", baustelle_id: "", beschreibung: "", stunden: "", material: "", material_kosten: "" });
  const [fotos, setFotos] = useState({ vorher: null, nachher: null });
  const [previews, setPreviews] = useState({ vorher: null, nachher: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Lese Baustellen live aus Controlling – alle aktiven
    ctrlRead("baustellen?status=not.eq.abgeschlossen&status=not.eq.abgerechnet&order=name.asc&select=id,name,adresse,status")
      .then(setBaustellen)
      .catch(() => setBaustellen([]));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFoto = (typ, file) => {
    if (!file) return;
    setFotos(f => ({ ...f, [typ]: file }));
    setPreviews(p => ({ ...p, [typ]: URL.createObjectURL(file) }));
  };

  const handleSubmit = async () => {
    if (!form.typ) return setError("Bitte Typ wählen");
    if (!form.stunden || isNaN(form.stunden) || Number(form.stunden) <= 0) return setError("Bitte gültige Stunden eingeben");
    if (form.typ === "baustelle" && !form.baustelle_id) return setError("Bitte Baustelle wählen");
    setSaving(true); setError("");
    try {
      let foto_vorher = null, foto_nachher = null;
      if (fotos.vorher) foto_vorher = await uploadFoto(fotos.vorher, mitarbeiter.id);
      if (fotos.nachher) foto_nachher = await uploadFoto(fotos.nachher, mitarbeiter.id);

      await appApi("zeiteintraege", {
        method: "POST",
        body: JSON.stringify({
          // Wir speichern controlling_employee_id damit wir später verknüpfen können
          controlling_employee_id: mitarbeiter.id,
          mitarbeiter_name: mitarbeiter.name,
          datum: form.datum,
          typ: form.typ,
          controlling_baustelle_id: form.baustelle_id || null,
          beschreibung: form.beschreibung || null,
          stunden: Number(form.stunden),
          material: form.material || null,
          material_kosten: form.material_kosten ? Number(form.material_kosten) : null,
          foto_vorher,
          foto_nachher,
          status: "offen",
        }),
      });
      onSuccess();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ paddingBottom: "80px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid #e8e6e0", display: "flex", alignItems: "center", gap: "12px", background: "#fff" }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#666", padding: 0 }}>←</button>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "#1a1a1a" }}>Neuer Eintrag</h2>
      </div>

      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Typ */}
        <div>
          <label style={lbl}>Was hast du gemacht?</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
            {Object.entries(TYP).map(([key, cfg]) => (
              <button key={key} onClick={() => set("typ", key)} style={{
                padding: "14px 10px", border: `2px solid ${form.typ === key ? cfg.color : "#e8e6e0"}`,
                borderRadius: "12px", background: form.typ === key ? cfg.color + "18" : "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
                fontSize: "14px", fontWeight: form.typ === key ? "600" : "400",
                color: form.typ === key ? cfg.color : "#555", fontFamily: "inherit",
              }}>
                <span style={{ fontSize: "20px" }}>{cfg.icon}</span>{cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Datum */}
        <div><label style={lbl}>Datum</label><input type="date" value={form.datum} onChange={e => set("datum", e.target.value)} style={inp} /></div>

        {/* Baustelle */}
        {form.typ === "baustelle" && (
          <div>
            <label style={lbl}>Baustelle</label>
            <select value={form.baustelle_id} onChange={e => set("baustelle_id", e.target.value)} style={inp}>
              <option value="">-- Baustelle wählen --</option>
              {baustellen.map(b => <option key={b.id} value={b.id}>{b.name}{b.adresse ? ` · ${b.adresse}` : ""}</option>)}
            </select>
          </div>
        )}

        {/* Beschreibung */}
        <div>
          <label style={lbl}>Beschreibung <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span></label>
          <textarea value={form.beschreibung} onChange={e => set("beschreibung", e.target.value)} placeholder="Was genau wurde gemacht?" rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>

        {/* Stunden */}
        <div><label style={lbl}>Stunden</label><input type="number" value={form.stunden} onChange={e => set("stunden", e.target.value)} placeholder="z.B. 3.5" step="0.25" min="0.25" max="24" style={inp} /></div>

        {/* Material */}
        <div>
          <label style={lbl}>Material <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span></label>
          <input type="text" value={form.material} onChange={e => set("material", e.target.value)} placeholder="z.B. Kabel 10m, Schrauben..." style={inp} />
        </div>
        {form.material && (
          <div><label style={lbl}>Materialkosten (€)</label><input type="number" value={form.material_kosten} onChange={e => set("material_kosten", e.target.value)} placeholder="z.B. 45.00" step="0.01" style={inp} /></div>
        )}

        {/* Vorher/Nachher Fotos (nur bei Baustelle) */}
        {form.typ === "baustelle" && (
          <div>
            <label style={lbl}>Dokumentation Fotos</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
              {["vorher", "nachher"].map(typ => (
                <div key={typ}>
                  <label style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                    padding: "14px 10px", border: `2px dashed ${previews[typ] ? "#27ae60" : "#d0cec8"}`,
                    borderRadius: "12px", cursor: "pointer", color: "#666", fontSize: "13px",
                    background: previews[typ] ? "#f0faf4" : "#fafaf8", textAlign: "center",
                  }}>
                    <span style={{ fontSize: "24px" }}>{typ === "vorher" ? "📷" : "✅"}</span>
                    <span style={{ fontWeight: "600", textTransform: "capitalize" }}>{typ === "vorher" ? "Vorher" : "Nachher"}</span>
                    {previews[typ] ? <span style={{ color: "#27ae60", fontSize: "12px" }}>Foto ✓</span> : <span style={{ fontSize: "11px", color: "#aaa" }}>Foto hochladen</span>}
                    <input type="file" accept="image/*" capture="environment" onChange={e => handleFoto(typ, e.target.files[0])} style={{ display: "none" }} />
                  </label>
                  {previews[typ] && <img src={previews[typ]} alt={typ} style={{ width: "100%", borderRadius: "8px", marginTop: "6px", height: "100px", objectFit: "cover" }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sonstiges Foto */}
        {form.typ !== "baustelle" && (
          <div>
            <label style={lbl}>Foto / Beleg <span style={{ color: "#999", fontWeight: 400 }}>(optional)</span></label>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", border: "2px dashed #d0cec8", borderRadius: "12px", cursor: "pointer", color: "#666", fontSize: "14px", marginTop: "6px", background: "#fafaf8" }}>
              <span style={{ fontSize: "20px" }}>📷</span>
              {previews.vorher ? "Foto ausgewählt ✓" : "Foto hochladen"}
              <input type="file" accept="image/*" capture="environment" onChange={e => handleFoto("vorher", e.target.files[0])} style={{ display: "none" }} />
            </label>
            {previews.vorher && <img src={previews.vorher} alt="Beleg" style={{ width: "100%", borderRadius: "8px", marginTop: "8px", maxHeight: "180px", objectFit: "cover" }} />}
          </div>
        )}

        {error && <div style={{ background: "#f8d7da", color: "#842029", padding: "12px 16px", borderRadius: "10px", fontSize: "14px" }}>⚠️ {error}</div>}

        <button onClick={handleSubmit} disabled={saving} style={{ padding: "16px", background: saving ? "#ccc" : "#d4612a", color: "#fff", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Wird gespeichert..." : "Eintrag einreichen ✓"}
        </button>
      </div>
    </div>
  );
}

// ── Mitarbeiter Dashboard ─────────────────────────────────────
function MitarbeiterDashboard({ user }) {
  const [view, setView] = useState("list");
  const [eintraege, setEintraege] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    appApi(`zeiteintraege?controlling_employee_id=eq.${user.id}&order=erstellt_am.desc&limit=60`)
      .then(setEintraege).finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  if (view === "neu") return <NeuerEintrag mitarbeiter={user} onSuccess={() => { load(); setView("list"); }} onCancel={() => setView("list")} />;

  const offene = eintraege.filter(e => e.status === "offen").length;
  return (
    <div style={{ paddingBottom: "80px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "20px", background: "#1a1a1a", color: "#fff" }}>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.6 }}>Eingeloggt als</p>
        <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700" }}>{user.name}</h2>
        {offene > 0 && <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.7 }}>{offene} Eintrag{offene > 1 ? "träge" : ""} wartet auf Genehmigung</p>}
      </div>
      <div style={{ padding: "16px 20px" }}>
        <button onClick={() => setView("neu")} style={{ width: "100%", padding: "16px", background: "#d4612a", color: "#fff", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <span style={{ fontSize: "20px" }}>+</span> Neuen Eintrag erstellen
        </button>
      </div>
      <div style={{ padding: "0 20px" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Meine Einträge</h3>
        {loading ? <p style={{ color: "#999", textAlign: "center", padding: "40px 0" }}>Laden...</p> :
         eintraege.length === 0 ? <p style={{ color: "#999", textAlign: "center", padding: "40px 0" }}>Noch keine Einträge</p> :
         <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
           {eintraege.map(e => <EintragCard key={e.id} e={e} onReload={load} />)}
         </div>}
      </div>
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────
function AdminDashboard() {
  const [eintraege, setEintraege] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("offen");
  const [kommentar, setKommentar] = useState({});
  const [verbuchenId, setVerbuchenId] = useState(null);
  const [verbuchenLoading, setVerbuchenLoading] = useState(false);
  const [verbuchenError, setVerbuchenError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setEintraege(await appApi("zeiteintraege?order=erstellt_am.desc&limit=300")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id, status) => {
    await appApi(`zeiteintraege?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, admin_kommentar: kommentar[id] || null, bearbeitet_am: new Date().toISOString() }),
    });
    setKommentar(k => { const n = { ...k }; delete n[id]; return n; });
    load();
  };

  // ── VERBUCHEN: schreibt ins Controlling (nur nach expliziter Bestätigung) ──
  const handleVerbuchen = async (eintrag) => {
    setVerbuchenLoading(true);
    setVerbuchenError("");
    try {
      if (eintrag.typ === "baustelle" && eintrag.controlling_baustelle_id) {
        // → bs_stundeneintraege
        await ctrlWrite("bs_stundeneintraege", {
          baustelle_id: eintrag.controlling_baustelle_id,
          mitarbeiter_id: eintrag.controlling_employee_id,
          datum: eintrag.datum,
          stunden: eintrag.stunden,
          beschreibung: eintrag.beschreibung || `App-Eintrag: ${eintrag.mitarbeiter_name}`,
        });
        // → bs_fotos wenn vorhanden
        if (eintrag.foto_vorher) {
          await ctrlWrite("bs_fotos", { baustelle_id: eintrag.controlling_baustelle_id, url: eintrag.foto_vorher, kategorie: "vorher", datum: eintrag.datum, hochgeladen_von: eintrag.controlling_employee_id, beschreibung: `Vorher – ${eintrag.mitarbeiter_name}` });
        }
        if (eintrag.foto_nachher) {
          await ctrlWrite("bs_fotos", { baustelle_id: eintrag.controlling_baustelle_id, url: eintrag.foto_nachher, kategorie: "nachher", datum: eintrag.datum, hochgeladen_von: eintrag.controlling_employee_id, beschreibung: `Nachher – ${eintrag.mitarbeiter_name}` });
        }
      } else if (eintrag.typ === "dguv") {
        // → interne_stunden
        await ctrlWrite("interne_stunden", { employee_id: eintrag.controlling_employee_id, datum: eintrag.datum, stunden: eintrag.stunden, beschreibung: `DGUV – ${eintrag.beschreibung || ""}` });
      } else if (eintrag.typ === "sonstiges") {
        // → interne_stunden
        await ctrlWrite("interne_stunden", { employee_id: eintrag.controlling_employee_id, datum: eintrag.datum, stunden: eintrag.stunden, beschreibung: eintrag.beschreibung || "Sonstiges" });
      } else if (eintrag.typ === "ticket") {
        // → ticket_worklogs (ohne ticket_id, da wir keine haben – Beschreibung als Hinweis)
        await ctrlWrite("interne_stunden", { employee_id: eintrag.controlling_employee_id, datum: eintrag.datum, stunden: eintrag.stunden, beschreibung: `Ticket – ${eintrag.beschreibung || ""}` });
      }
      // Status auf verbucht setzen
      await appApi(`zeiteintraege?id=eq.${eintrag.id}`, { method: "PATCH", body: JSON.stringify({ status: "verbucht", bearbeitet_am: new Date().toISOString() }) });
      setVerbuchenId(null);
      load();
    } catch (e) { setVerbuchenError(e.message); }
    finally { setVerbuchenLoading(false); }
  };

  const gefiltert = eintraege.filter(e => e.status === filter);
  const counts = { offen: eintraege.filter(e => e.status === "offen").length, genehmigt: eintraege.filter(e => e.status === "genehmigt").length };

  return (
    <div style={{ paddingBottom: "80px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Verbuchen Bestätigungs-Modal */}
      {verbuchenId && (() => {
        const e = eintraege.find(x => x.id === verbuchenId);
        if (!e) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: "480px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: "700", color: "#1a1a1a" }}>⚠️ Ins Controlling verbuchen?</h3>
              <p style={{ margin: "0 0 16px", color: "#555", fontSize: "14px", lineHeight: "1.5" }}>
                Dieser Eintrag wird <strong>dauerhaft</strong> in dein Controlling-System geschrieben. Das kann nicht rückgängig gemacht werden.
              </p>
              <div style={{ background: "#f5f4f0", borderRadius: "10px", padding: "14px", marginBottom: "20px", fontSize: "14px", color: "#333" }}>
                <div><strong>{e.mitarbeiter_name}</strong> · {e.datum}</div>
                <div>{TYP[e.typ]?.label} · {e.stunden}h</div>
                {e.beschreibung && <div style={{ color: "#666", marginTop: "4px" }}>{e.beschreibung}</div>}
              </div>
              {verbuchenError && <div style={{ background: "#f8d7da", color: "#842029", padding: "10px", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>❌ {verbuchenError}</div>}
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setVerbuchenId(null); setVerbuchenError(""); }} style={{ flex: 1, padding: "14px", background: "#f5f4f0", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>Abbrechen</button>
                <button onClick={() => handleVerbuchen(e)} disabled={verbuchenLoading} style={{ flex: 1, padding: "14px", background: verbuchenLoading ? "#ccc" : "#084298", color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "700", cursor: verbuchenLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {verbuchenLoading ? "Wird verbucht..." : "Jetzt verbuchen ✓"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ padding: "20px", background: "#1a1a1a", color: "#fff" }}>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.6 }}>Admin</p>
        <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700" }}>Genehmigungen</h2>
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          {counts.offen > 0 && <span style={{ background: "#d4612a", padding: "3px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: "600" }}>{counts.offen} offen</span>}
          {counts.genehmigt > 0 && <span style={{ background: "#0f5132", padding: "3px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: "600" }}>{counts.genehmigt} zu verbuchen</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e8e6e0", background: "#fff", overflowX: "auto" }}>
        {["offen", "genehmigt", "verbucht", "abgelehnt"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "12px 16px", border: "none", background: "none", cursor: "pointer", whiteSpace: "nowrap",
            fontSize: "14px", fontWeight: filter === s ? "600" : "400",
            color: filter === s ? "#d4612a" : "#666",
            borderBottom: filter === s ? "2px solid #d4612a" : "2px solid transparent",
            fontFamily: "inherit",
          }}>
            {ST[s]?.label || s}
            {(s === "offen" && counts.offen > 0) && <span style={{ marginLeft: "6px", background: "#d4612a", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px" }}>{counts.offen}</span>}
            {(s === "genehmigt" && counts.genehmigt > 0) && <span style={{ marginLeft: "6px", background: "#0f5132", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px" }}>{counts.genehmigt}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {loading ? <p style={{ color: "#999", textAlign: "center", padding: "40px 0" }}>Laden...</p> :
         gefiltert.length === 0 ? <p style={{ color: "#999", textAlign: "center", padding: "40px 0" }}>Keine Einträge</p> :
         gefiltert.map(e => (
          <div key={e.id} style={{ background: "#fff", border: "1px solid #e8e6e0", borderRadius: "14px", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontSize: "22px" }}>{TYP[e.typ]?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "600", fontSize: "15px", color: "#1a1a1a" }}>{e.mitarbeiter_name}</div>
                  <div style={{ fontSize: "13px", color: "#666" }}>{new Date(e.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                </div>
                <span style={{ fontSize: "15px", fontWeight: "700", color: TYP[e.typ]?.color }}>{e.stunden}h</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                <Pill color={TYP[e.typ]?.color}>{TYP[e.typ]?.label}</Pill>
                <Pill color={e.status === "verbucht" ? "#084298" : e.status === "genehmigt" ? "#0f5132" : "#666"}>{ST[e.status]?.label}</Pill>
              </div>
              {e.beschreibung && <p style={{ margin: "6px 0", fontSize: "14px", color: "#444" }}>{e.beschreibung}</p>}
              {e.material && <p style={{ margin: "4px 0", fontSize: "13px", color: "#666" }}>📦 {e.material}{e.material_kosten ? ` — ${e.material_kosten}€` : ""}</p>}
              {/* Vorher/Nachher Fotos */}
              {(e.foto_vorher || e.foto_nachher) && (
                <div style={{ display: "grid", gridTemplateColumns: e.foto_vorher && e.foto_nachher ? "1fr 1fr" : "1fr", gap: "8px", marginTop: "10px" }}>
                  {e.foto_vorher && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#666", marginBottom: "4px" }}>VORHER</div>
                      <img src={e.foto_vorher} alt="Vorher" style={{ width: "100%", borderRadius: "8px", height: "120px", objectFit: "cover" }} />
                    </div>
                  )}
                  {e.foto_nachher && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "600", color: "#27ae60", marginBottom: "4px" }}>NACHHER</div>
                      <img src={e.foto_nachher} alt="Nachher" style={{ width: "100%", borderRadius: "8px", height: "120px", objectFit: "cover" }} />
                    </div>
                  )}
                </div>
              )}
              {e.admin_kommentar && <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#666", fontStyle: "italic" }}>💬 {e.admin_kommentar}</p>}
            </div>

            {/* Aktionen: offen → genehmigen/ablehnen */}
            {e.status === "offen" && (
              <div style={{ padding: "12px 16px", background: "#fafaf8", borderTop: "1px solid #f0ede8" }}>
                <input placeholder="Kommentar (optional)..." value={kommentar[e.id] || ""} onChange={ev => setKommentar(k => ({ ...k, [e.id]: ev.target.value }))} style={{ ...inp, marginBottom: "10px", fontSize: "13px", padding: "8px 12px" }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => handleAction(e.id, "genehmigt")} style={{ flex: 1, padding: "12px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>✓ Genehmigen</button>
                  <button onClick={() => handleAction(e.id, "abgelehnt")} style={{ flex: 1, padding: "12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>✗ Ablehnen</button>
                </div>
              </div>
            )}

            {/* Aktionen: genehmigt → verbuchen (explizite Bestätigung!) */}
            {e.status === "genehmigt" && (
              <div style={{ padding: "12px 16px", background: "#f0faf4", borderTop: "1px solid #d1eddb" }}>
                <button onClick={() => setVerbuchenId(e.id)} style={{ width: "100%", padding: "12px", background: "#084298", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>
                  📤 Ins Controlling verbuchen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────
function EintragCard({ e, onReload }) {
  const cfg = TYP[e.typ] || {}; const st = ST[e.status] || {};
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(false);

  const kannNachherFoto = e.typ === "baustelle" && !e.foto_nachher && e.status !== "verbucht";

  const handleNachherFoto = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadFoto(file, e.controlling_employee_id);
      await appApi(`zeiteintraege?id=eq.${e.id}`, {
        method: "PATCH",
        body: JSON.stringify({ foto_nachher: url }),
      });
      setDone(true);
      if (onReload) onReload();
    } catch (err) {
      alert("Fehler beim Hochladen: " + err.message);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e6e0", borderRadius: "12px", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>{cfg.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: "600", fontSize: "14px", color: cfg.color }}>{cfg.label}</span>
            </div>
            <div style={{ fontSize: "13px", color: "#999", marginTop: "2px" }}>{new Date(e.datum).toLocaleDateString("de-DE")} · {e.stunden}h</div>
          </div>
          <span style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "20px", background: st.bg, color: st.color, fontWeight: "500", whiteSpace: "nowrap" }}>{st.label}</span>
        </div>
        {e.beschreibung && <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#555" }}>{e.beschreibung}</p>}
        {e.admin_kommentar && <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#888", fontStyle: "italic" }}>💬 {e.admin_kommentar}</p>}

        {/* Vorhandene Fotos anzeigen */}
        {(e.foto_vorher || e.foto_nachher) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
            {e.foto_vorher && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#666", marginBottom: "3px" }}>VORHER</div>
                <img src={e.foto_vorher} alt="Vorher" style={{ width: "100%", borderRadius: "6px", height: "80px", objectFit: "cover" }} />
              </div>
            )}
            {e.foto_nachher && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#27ae60", marginBottom: "3px" }}>NACHHER</div>
                <img src={e.foto_nachher} alt="Nachher" style={{ width: "100%", borderRadius: "6px", height: "80px", objectFit: "cover" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nachher-Foto nachträglich hinzufügen */}
      {kannNachherFoto && !done && (
        <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #f0ede8", background: "#fafaf8" }}>
          {preview ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#27ae60", marginBottom: "4px" }}>NACHHER VORSCHAU</div>
              <img src={preview} alt="Vorschau" style={{ width: "100%", borderRadius: "8px", maxHeight: "140px", objectFit: "cover" }} />
              {uploading && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#999", textAlign: "center" }}>Wird hochgeladen...</p>}
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", border: "2px dashed #d0cec8", borderRadius: "10px", cursor: "pointer", background: "#fff" }}>
              <span style={{ fontSize: "18px" }}>✅</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#444" }}>Nachher-Foto hinzufügen</div>
                <div style={{ fontSize: "11px", color: "#aaa" }}>Arbeit abgeschlossen? Foto machen</div>
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={ev => handleNachherFoto(ev.target.files[0])} style={{ display: "none" }} />
            </label>
          )}
        </div>
      )}

      {/* Erfolgsmeldung */}
      {done && (
        <div style={{ padding: "10px 16px", background: "#f0faf4", borderTop: "1px solid #d1eddb", fontSize: "13px", color: "#0f5132", fontWeight: "600" }}>
          ✓ Nachher-Foto wurde hinzugefügt
        </div>
      )}
    </div>
  );
}

function Pill({ children, color }) {
  return <span style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "20px", background: color + "18", color, fontWeight: "500" }}>{children}</span>;
}

function BottomNav({ user, view, setView, onLogout }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e6e0", display: "flex", padding: "8px 16px 12px", gap: "4px", maxWidth: "480px", margin: "0 auto" }}>
      {user.rolle === "admin"
        ? <NavBtn active={view === "admin"} onClick={() => setView("admin")} icon="📋" label="Genehmigungen" />
        : <NavBtn active={view === "dashboard"} onClick={() => setView("dashboard")} icon="🏠" label="Meine Einträge" />}
      <NavBtn active={false} onClick={onLogout} icon="👤" label="Abmelden" />
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", fontFamily: "inherit", color: active ? "#d4612a" : "#888" }}>
      <span style={{ fontSize: "22px" }}>{icon}</span>
      <span style={{ fontSize: "11px", fontWeight: active ? "600" : "400" }}>{label}</span>
    </button>
  );
}

// ── App Root ──────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState(null);

  const handleLogin = (m) => { setUser(m); setView(m.rolle === "admin" ? "admin" : "dashboard"); };
  const handleLogout = () => { setUser(null); setView(null); };

  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return (
    <div style={{ minHeight: "100vh", background: "#f5f4f0", fontFamily: "'DM Sans', sans-serif", maxWidth: "480px", margin: "0 auto", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {view === "dashboard" && <MitarbeiterDashboard user={user} />}
      {view === "admin" && <AdminDashboard />}
      <BottomNav user={user} view={view} setView={setView} onLogout={handleLogout} />
    </div>
  );
}
