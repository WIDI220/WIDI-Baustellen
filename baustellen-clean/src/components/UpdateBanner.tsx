import { useState, useEffect, useCallback } from 'react';

// Vercel setzt bei jedem Deploy einen neuen ETag auf index.html
// Wir vergleichen den aktuellen ETag mit dem beim Start geladenen
// Bei Abweichung → neues Deployment → Banner anzeigen

const CHECK_INTERVAL = 5 * 60 * 1000; // alle 5 Minuten

async function fetchETag(): Promise<string | null> {
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    return res.headers.get('etag') ?? res.headers.get('last-modified') ?? null;
  } catch {
    return null;
  }
}

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [initialETag, setInitialETag] = useState<string | null>(null);

  // Beim Start: aktuellen ETag merken
  useEffect(() => {
    fetchETag().then(setInitialETag);
  }, []);

  // Regelmäßig prüfen
  const check = useCallback(async () => {
    if (!initialETag) return;
    const current = await fetchETag();
    if (current && current !== initialETag) {
      setUpdateAvailable(true);
    }
  }, [initialETag]);

  useEffect(() => {
    if (!initialETag) return;
    const interval = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [check, initialETag]);

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 14,
      background: '#0f1f3d', color: '#fff', borderRadius: 14,
      padding: '14px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.35)',
      border: '1px solid rgba(255,255,255,.1)', fontFamily: "'Inter',system-ui,sans-serif",
      maxWidth: 420, width: 'calc(100vw - 48px)',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
        🔄
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>Neue Version verfügbar</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: 0 }}>Bitte aktualisieren um die neuesten Funktionen zu nutzen</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none',
          borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0,
          fontFamily: 'inherit',
        }}>
        Jetzt aktualisieren
      </button>
    </div>
  );
}
