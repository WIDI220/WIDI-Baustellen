import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, X, Send, Bug, ChevronDown, Loader2, Bot, AlertTriangle, Minimize2, Trash2 } from 'lucide-react';

const OWNER_EMAIL = 'j.paredis@widi-hellersen.de';

type MessageRole = 'user' | 'assistant';
interface Message { id: string; role: MessageRole; content: string; timestamp: Date; isBug?: boolean; }
type ChatMode = 'chat' | 'bug';

const QUICK_SUGGESTIONS = [
  'Wie viele Baustellen sind aktiv?',
  'Maerz 2026 Stunden Uebersicht',
  'Was ist ein Vormonat-Ticket?',
  'Wie importiere ich die Hausmeister Excel?',
];

export default function WidiChatbot() {
  const [open, setOpen]         = useState(false);
  const [minimized, setMin]     = useState(false);
  const [mode, setMode]         = useState<ChatMode>('chat');
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'assistant',
    content: 'Hallo Jan! Ich bin dein WIDI-Assistent und kenne dein System in- und auswendig.\n\nIch kann dir bei Fragen helfen, SQL-Abfragen erklaeren oder Bug-Meldungen aufnehmen.',
    timestamp: new Date(),
  }]);
  const [input, setInput]   = useState('');
  const [loading, setLoad]  = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80); }
  }, [open, messages]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, mode]);

  const addMsg = (role: MessageRole, content: string, isBug = false): Message => {
    const msg: Message = { id: Date.now().toString() + Math.random(), role, content, timestamp: new Date(), isBug };
    setMessages(prev => [...prev, msg]);
    if (!open && role === 'assistant') setUnread(u => u + 1);
    return msg;
  };

  async function fetchContext(): Promise<string> {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const from = `${y}-${m}-01`;
      const to   = `${y}-${m}-31`;

      const [{ data: bs }, { data: twl }, { data: emp }, { data: tk }] = await Promise.all([
        supabase.from('baustellen').select('name, status, gewerk, budget').not('status', 'eq', 'abgerechnet'),
        supabase.from('ticket_worklogs').select('stunden, employees(kuerzel)').gte('leistungsdatum', from).lte('leistungsdatum', to),
        supabase.from('employees').select('name, kuerzel, gewerk').eq('aktiv', true).order('name'),
        supabase.from('tickets').select('status, gewerk').gte('eingangsdatum', from).lte('eingangsdatum', to),
      ]);

      const bsInArbeit = (bs ?? []).filter(b => b.status === 'in_bearbeitung').length;
      const bsPausiert = (bs ?? []).filter(b => b.status === 'pausiert').length;
      const bsOffen    = (bs ?? []).filter(b => b.status === 'offen').length;

      const stdGesamt  = (twl ?? []).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const maStd: Record<string, number> = {};
      (twl ?? []).forEach((w: any) => {
        const k = w.employees?.kuerzel ?? '?';
        maStd[k] = (maStd[k] ?? 0) + Number(w.stunden ?? 0);
      });
      const maStdStr = Object.entries(maStd).sort((a,b) => b[1]-a[1]).map(([k,s]) => `${k}:${s.toFixed(2)}h`).join(', ');

      const tkGesamt   = (tk ?? []).length;
      const tkErledigt = (tk ?? []).filter((t: any) => t.status === 'erledigt').length;
      const tkInArbeit = (tk ?? []).filter((t: any) => t.status === 'in_bearbeitung').length;
      const empList    = (emp ?? []).map((e: any) => `${e.kuerzel}=${e.name}(${e.gewerk ?? '?'})`).join(', ');

      return `Baustellen: ${(bs??[]).length} aktiv (${bsInArbeit} in Bearbeitung, ${bsPausiert} pausiert, ${bsOffen} offen)
Tickets ${y}-${m}: ${tkGesamt} gesamt, ${tkErledigt} erledigt, ${tkInArbeit} in Bearbeitung
Stunden ${y}-${m}: ${stdGesamt.toFixed(2)}h | Aufteilung: ${maStdStr || 'keine'}
Mitarbeiter: ${empList}
Aktuelle Seite: ${window.location.pathname}`;
    } catch (e) {
      return `Kontext-Fehler: ${(e as any).message}`;
    }
  }

  async function sendBugReport(text: string): Promise<boolean> {
    try {
      const { default: emailjs } = await import('@emailjs/browser');
      await emailjs.send('service_bhia75n', 'template_s043jzj', {
        to_email: OWNER_EMAIL,
        to_name:  'Jan Paredis',
        subject:  `Bug WIDI: ${text.slice(0, 60)}`,
        content:  `Bug-Meldung\n\n${text}\n\nSeite: ${window.location.pathname}\nZeit: ${new Date().toLocaleString('de-DE')}`,
      }, 'y7g5YcPgorv_NmH0y');
      return true;
    } catch (e) {
      console.error('EmailJS:', e);
      return false;
    }
  }

  async function sendMessage(overrideText?: string) {
    const userText = (overrideText ?? input).trim();
    if (!userText || loading) return;
    setInput('');
    addMsg('user', userText);
    setLoad(true);

    try {
      if (mode === 'bug') {
        const ok = await sendBugReport(userText);
        addMsg('assistant',
          ok
            ? `Bug-Meldung gesendet an ${OWNER_EMAIL}!\n\nNotiert: "${userText}"\n\nWechsle zurueck in den Chat.`
            : `E-Mail fehlgeschlagen. Bitte melde den Bug direkt an ${OWNER_EMAIL}.\n\nInhalt: "${userText}"`,
          true
        );
        setTimeout(() => setMode('chat'), 3000);
      } else {
        const context = await fetchContext();
        const history = messages.filter(m => m.id !== '0').slice(-12).map(m => ({ role: m.role, content: m.content }));
        history.push({ role: 'user' as MessageRole, content: userText });

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, context }),
        });

        if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        addMsg('assistant', data.text);
      }
    } catch (e: any) {
      addMsg('assistant', `Fehler: ${e.message}\n\nBitte versuche es erneut.`);
    } finally {
      setLoad(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const fmtTime = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <style>{`
        @keyframes chatIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        @keyframes dot{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .widi-win{animation:chatIn .22s cubic-bezier(.34,1.56,.64,1) forwards}
        .widi-msg{animation:msgIn .15s ease forwards}
        .widi-fab{transition:all .2s ease!important}
        .widi-fab:hover{transform:scale(1.1)!important;box-shadow:0 10px 30px rgba(37,99,235,.5)!important}
        .widi-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#94a3b8;margin:0 2px}
        .widi-dot:nth-child(1){animation:dot 1.2s ease infinite 0s}
        .widi-dot:nth-child(2){animation:dot 1.2s ease infinite .2s}
        .widi-dot:nth-child(3){animation:dot 1.2s ease infinite .4s}
        .widi-spin{animation:spin 1s linear infinite}
        .widi-chip{transition:all .15s!important}
        .widi-chip:hover{background:#eff6ff!important;border-color:#bfdbfe!important;color:#2563eb!important}
        .widi-send:hover:not(:disabled){background:#1d4ed8!important}
      `}</style>

      {/* Chat Fenster */}
      {open && !minimized && (
        <div className="widi-win" style={{ position:'fixed', bottom:88, right:24, zIndex:9999, width:390, height:560, background:'#fff', borderRadius:22, boxShadow:'0 32px 80px rgba(0,0,0,.2),0 4px 16px rgba(0,0,0,.08)', display:'flex', flexDirection:'column', overflow:'hidden', border:'1px solid #e2e8f0', fontFamily:"'Inter',system-ui,sans-serif" }}>

          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#2563eb 100%)', padding:'14px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ width:40, height:40, borderRadius:14, overflow:'hidden', flexShrink:0, border:'2px solid rgba(255,255,255,.2)' }}>
              <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }}
                onError={e => { const el = e.target as HTMLImageElement; el.style.display='none'; if(el.parentElement) el.parentElement.innerHTML='<div style="width:100%;height:100%;background:#2563eb;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px">J</div>'; }} />
            </div>
            <div style={{ flex:1 }}>
              <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:0 }}>WIDI Assistent</p>
              <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, margin:0 }}>{loading ? '● Schreibt...' : '● Online'}</p>
            </div>
            <div style={{ display:'flex', gap:3, background:'rgba(255,255,255,.1)', borderRadius:10, padding:3 }}>
              <button onClick={() => setMode('chat')} style={{ padding:'4px 11px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', background:mode==='chat'?'#fff':'transparent', color:mode==='chat'?'#1e3a5f':'rgba(255,255,255,.65)', fontFamily:'inherit', transition:'all .15s' }}>Chat</button>
              <button onClick={() => setMode('bug')} style={{ padding:'4px 11px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', background:mode==='bug'?'#fff':'transparent', color:mode==='bug'?'#dc2626':'rgba(255,255,255,.65)', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, transition:'all .15s' }}><Bug size={11}/>Bug</button>
            </div>
            <button onClick={() => setMessages([messages[0]])} title="Leeren" style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><Trash2 size={13}/></button>
            <button onClick={() => setMin(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><Minimize2 size={13}/></button>
            <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><X size={16}/></button>
          </div>

          {/* Bug Banner */}
          {mode === 'bug' && (
            <div style={{ background:'#fef2f2', borderBottom:'1px solid #fecaca', padding:'8px 14px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <AlertTriangle size={13} style={{ color:'#dc2626', flexShrink:0 }}/>
              <p style={{ fontSize:11, color:'#dc2626', margin:0, fontWeight:600 }}>Bug-Modus — wird per E-Mail an {OWNER_EMAIL} gesendet</p>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 6px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.map(msg => (
              <div key={msg.id} className="widi-msg" style={{ display:'flex', flexDirection:msg.role==='user'?'row-reverse':'row', alignItems:'flex-end', gap:8 }}>
                <div style={{ width:30, height:30, borderRadius:10, flexShrink:0, overflow:'hidden', background:msg.role==='user'?'#2563eb':'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', border:msg.role==='user'?'none':'1px solid #e2e8f0' }}>
                  {msg.role === 'user'
                    ? <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }} onError={e => { const el=e.target as HTMLImageElement; el.style.display='none'; if(el.parentElement) el.parentElement.innerHTML='<span style="color:#fff;font-size:12px;font-weight:800">J</span>'; }}/>
                    : <Bot size={14} style={{ color:'#64748b' }}/>}
                </div>
                <div style={{ maxWidth:'80%' }}>
                  <div style={{ padding:'10px 13px', borderRadius:msg.role==='user'?'16px 4px 16px 16px':'4px 16px 16px 16px', background:msg.role==='user'?'linear-gradient(135deg,#2563eb,#1d4ed8)':msg.isBug?'#fef2f2':'#f8fafc', color:msg.role==='user'?'#fff':'#0f172a', fontSize:13, lineHeight:1.55, border:msg.isBug?'1px solid #fecaca':msg.role==='user'?'none':'1px solid #f1f5f9', whiteSpace:'pre-wrap', wordBreak:'break-word', boxShadow:msg.role==='user'?'0 2px 8px rgba(37,99,235,.2)':'none' }}>
                    {msg.content}
                  </div>
                  <p style={{ fontSize:10, color:'#94a3b8', margin:'3px 5px 0', textAlign:msg.role==='user'?'right':'left' }}>{fmtTime(msg.timestamp)}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="widi-msg" style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
                <div style={{ width:30, height:30, borderRadius:10, flexShrink:0, background:'#f1f5f9', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center' }}><Bot size={14} style={{ color:'#64748b' }}/></div>
                <div style={{ padding:'12px 14px', borderRadius:'4px 16px 16px 16px', background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                  <span className="widi-dot"/><span className="widi-dot"/><span className="widi-dot"/>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick Suggestions */}
          {messages.length <= 2 && mode === 'chat' && (
            <div style={{ padding:'4px 14px 8px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
              {QUICK_SUGGESTIONS.map(s => (
                <button key={s} className="widi-chip" onClick={() => sendMessage(s)}
                  style={{ fontSize:11, padding:'4px 10px', borderRadius:20, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#64748b', cursor:'pointer', fontFamily:'inherit' }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding:'8px 12px 14px', borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
            <div style={{ display:'flex', gap:8, alignItems:'flex-end', background:'#f8fafc', borderRadius:14, border:'1.5px solid #e2e8f0', padding:'8px 8px 8px 12px', transition:'border-color .15s' }}
              onFocusCapture={e => (e.currentTarget as HTMLElement).style.borderColor='#2563eb'}
              onBlurCapture={e  => (e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={mode==='bug'?'Bug beschreiben...':'Frage stellen... (Enter senden)'}
                rows={1} style={{ flex:1, border:'none', background:'transparent', resize:'none', fontSize:13, color:'#0f172a', fontFamily:'inherit', lineHeight:1.5, maxHeight:80, overflow:'auto', outline:'none' }}
                onInput={e => { const t=e.currentTarget; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,80)+'px'; }}/>
              <button className="widi-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}
                style={{ width:34, height:34, borderRadius:10, border:'none', background:loading||!input.trim()?'#e2e8f0':mode==='bug'?'#dc2626':'linear-gradient(135deg,#2563eb,#1d4ed8)', cursor:loading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                {loading ? <Loader2 size={15} className="widi-spin" style={{ color:'#94a3b8' }}/> : <Send size={14} style={{ color:'#fff' }}/>}
              </button>
            </div>
            <p style={{ fontSize:10, color:'#94a3b8', margin:'4px 2px 0', textAlign:'center' }}>Shift+Enter = neue Zeile</p>
          </div>
        </div>
      )}

      {/* Minimiert */}
      {open && minimized && (
        <div onClick={() => setMin(false)} style={{ position:'fixed', bottom:88, right:24, zIndex:9999, background:'linear-gradient(135deg,#0f172a,#2563eb)', borderRadius:14, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', boxShadow:'0 8px 24px rgba(37,99,235,.3)', animation:'chatIn .2s ease forwards', fontFamily:"'Inter',system-ui,sans-serif" }}>
          <div style={{ width:26, height:26, borderRadius:8, overflow:'hidden', border:'1.5px solid rgba(255,255,255,.2)' }}>
            <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top' }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
          </div>
          <span style={{ color:'#fff', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>WIDI Assistent</span>
          <ChevronDown size={14} style={{ color:'rgba(255,255,255,.6)' }}/>
        </div>
      )}

      {/* FAB */}
      <button className="widi-fab" onClick={() => { setOpen(o=>!o); setMin(false); }}
        style={{ position:'fixed', bottom:24, right:24, zIndex:9999, width:56, height:56, borderRadius:18, background:open?'#1e3a5f':'linear-gradient(135deg,#2563eb,#1d4ed8)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(37,99,235,.4)', animation:!open&&unread>0?'pulse 2s ease infinite':'none', overflow:'hidden' }}>
        {open ? <X size={22} style={{ color:'#fff' }}/> : <MessageCircle size={22} style={{ color:'#fff' }}/>}
        {!open && unread > 0 && (
          <div style={{ position:'absolute', top:-3, right:-3, width:18, height:18, borderRadius:'50%', background:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', border:'2px solid #fff' }}>{unread}</div>
        )}
      </button>
    </>
  );
}
