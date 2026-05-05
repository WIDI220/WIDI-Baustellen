import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function UpdateBanner() {
  const [show, setShow]       = useState(false);
  const [message, setMessage] = useState('Das System wurde aktualisiert.');

  useEffect(() => {
    const channel = supabase
      .channel('system-announcements')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_announcements',
      }, (payload) => {
        const msg = payload.new?.message;
        if (msg) setMessage(msg);
        setShow(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  function hardReload() {
    // Cache leeren und neu laden – funktioniert in allen Browsern
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    // Timestamp-Parameter zwingt Browser neue Version zu laden
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  }

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 14,
      background: '#0f1f3d', color: '#fff', borderRadius: 14,
      padding: '14px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.45)',
      border: '1px solid rgba(255,255,255,.12)',
      fontFamily: "'Inter',system-ui,sans-serif",
      maxWidth: 460, width: 'calc(100vw - 48px)',
      animation: 'widiSlideUp .3s ease',
    }}>
      <style>{`@keyframes widiSlideUp { from { opacity:0; transform:translateX(-50%) translateY(16px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <div style={{ width:38, height:38, borderRadius:10, background:'rgba(245,158,11,.15)', border:'1px solid rgba(245,158,11,.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:20 }}>
        🔄
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:700, margin:'0 0 2px' }}>Neue Version verfügbar</p>
        <p style={{ fontSize:12, color:'rgba(255,255,255,.5)', margin:0 }}>{message}</p>
      </div>
      <button onClick={hardReload}
        style={{ padding:'9px 18px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:9, fontWeight:700, fontSize:13, cursor:'pointer', flexShrink:0, fontFamily:'inherit', boxShadow:'0 2px 8px rgba(245,158,11,.4)' }}>
        Neu laden →
      </button>
      <button onClick={() => setShow(false)}
        style={{ background:'none', border:'none', color:'rgba(255,255,255,.3)', cursor:'pointer', fontSize:18, padding:'0 0 0 4px', lineHeight:1 }}>
        ✕
      </button>
    </div>
  );
}
