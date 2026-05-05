import { useState, useEffect } from 'react';

declare const __BUILD_TIME__: string;

const BUILD_TIME = __BUILD_TIME__;
const CHECK_INTERVAL = 2 * 60 * 1000; // alle 2 Minuten

async function getServerVersion(): Promise<number | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.t ?? null;
  } catch {
    return null;
  }
}

export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Eigene Build-Zeit in ms
    const myTime = new Date(BUILD_TIME).getTime();

    async function check() {
      const serverTime = await getServerVersion();
      if (serverTime && serverTime > myTime + 5000) {
        // Server hat eine neuere Version (5s Puffer für Build-Varianz)
        setShow(true);
      }
    }

    // Sofort prüfen + dann regelmäßig
    check();
    const interval = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 14,
      background: '#0f1f3d', color: '#fff', borderRadius: 14,
      padding: '14px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      border: '1px solid rgba(255,255,255,.12)', fontFamily: "'Inter',system-ui,sans-serif",
      maxWidth: 440, width: 'calc(100vw - 48px)',
      animation: 'slideUp .3s ease',
    }}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <div style={{ width:38, height:38, borderRadius:10, background:'rgba(245,158,11,.15)', border:'1px solid rgba(245,158,11,.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:20 }}>
        🔄
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:700, margin:'0 0 2px' }}>Neue Version verfügbar</p>
        <p style={{ fontSize:12, color:'rgba(255,255,255,.45)', margin:0 }}>
          Das System wurde aktualisiert – bitte neu laden
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding:'9px 18px', background:'#f59e0b', color:'#fff', border:'none',
          borderRadius:9, fontWeight:700, fontSize:13, cursor:'pointer', flexShrink:0,
          fontFamily:'inherit', boxShadow:'0 2px 8px rgba(245,158,11,.4)',
        }}>
        Neu laden →
      </button>
    </div>
  );
}
