import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import emailjs from '@emailjs/browser';
import { MessageCircle, X, Send, Bug, ChevronDown, Loader2, Bot, User, AlertTriangle, Minimize2 } from 'lucide-react';

const EMAILJS_SERVICE  = 'service_bhia75n';
const EMAILJS_TEMPLATE = 'template_s043jzj';
const EMAILJS_KEY      = 'y7g5YcPgorv_NmH0y';
const OWNER_EMAIL      = 'j.paredis@widi-hellersen.de';

const SYSTEM_PROMPT = `Du bist der interne KI-Assistent des WIDI Baustellen & Ticketing Systems der Firma WIDI Hellersen GmbH.

Das System verwaltet:
- Baustellen (Hochbau und Elektro) mit Budget, Personal- und Materialkosten
- Tickets (Instandhaltungsaufträge) mit A-Nummern im Format A26-XXXXX
- Mitarbeiter mit Stundenbuchungen
- DGUV Prüfungen und Begehungen
- Interne Stunden

Der Nutzer ist Jan Paredis (Controller / Projektmanager), der einzige Nutzer des Systems.

Beantworte Fragen präzise und auf Deutsch. Bei Bug-Meldungen fasse das Problem klar zusammen.
Wenn du Datenbankabfragen brauchst um eine Frage zu beantworten, sage dem Nutzer welche Information du benötigst.
Halte Antworten kurz und direkt.`;

type MessageRole = 'user' | 'assistant';
interface Message { id: string; role: MessageRole; content: string; timestamp: Date; isBug?: boolean; }
type ChatMode = 'chat' | 'bug';

export default function WidiChatbot() {
  const [open, setOpen]         = useState(false);
  const [minimized, setMin]     = useState(false);
  const [mode, setMode]         = useState<ChatMode>('chat');
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'assistant',
    content: 'Hallo Jan! Ich bin dein WIDI-Assistent. Ich kann dir bei Fragen zum System helfen oder Bug-Meldungen aufnehmen. Was kann ich für dich tun?',
    timestamp: new Date(),
  }]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [bugSent, setBugSent]   = useState(false);
  const [unread, setUnread]     = useState(0);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
  }, [open, messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, mode]);

  const addMsg = (role: MessageRole, content: string, isBug = false) => {
    const msg: Message = { id: Date.now().toString(), role, content, timestamp: new Date(), isBug };
    setMessages(prev => [...prev, msg]);
    if (!open && role === 'assistant') setUnread(u => u + 1);
    return msg;
  };

  // Systeminformationen aus Supabase holen für Kontext
  async function fetchContext(): Promise<string> {
    try {
      const [{ data: bs }, { data: tw }, { data: emp }] = await Promise.all([
        supabase.from('baustellen').select('name, status, gewerk').not('status', 'eq', 'abgerechnet').limit(20),
        supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', '2026-03-01').lt('leistungsdatum', '2026-04-01'),
        supabase.from('employees').select('name, kuerzel').eq('aktiv', true),
      ]);
      const bsAktiv   = (bs ?? []).filter(b => b.status === 'in_bearbeitung').length;
      const bsPausiert= (bs ?? []).filter(b => b.status === 'pausiert').length;
      const maerzStd  = (tw ?? []).reduce((s, w) => s + Number(w.stunden ?? 0), 0);
      const maList    = (emp ?? []).map(e => `${e.kuerzel}=${e.name}`).join(', ');
      return `\n\n[SYSTEMKONTEXT]\nAktive Baustellen: ${bsAktiv} in Bearbeitung, ${bsPausiert} pausiert\nMärz 2026 Stunden gesamt: ${maerzStd.toFixed(2)}h\nMitarbeiter: ${maList}`;
    } catch { return ''; }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    addMsg('user', userText);
    setLoading(true);

    try {
      if (mode === 'bug') {
        // Bug-Report per E-Mail
        await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
          to_email:  OWNER_EMAIL,
          to_name:   'Jan Paredis',
          subject:   `🐛 Bug-Meldung: ${userText.slice(0, 60)}${userText.length > 60 ? '...' : ''}`,
          content:   `Bug-Meldung vom WIDI Chatbot:\n\n${userText}\n\nZeitstempel: ${new Date().toLocaleString('de-DE')}\nSeite: ${window.location.pathname}`,
        }, EMAILJS_KEY);
        addMsg('assistant', `✅ Deine Bug-Meldung wurde erfolgreich an ${OWNER_EMAIL} gesendet. Ich habe folgendes notiert:\n\n"${userText}"\n\nIch wechsle zurück in den normalen Modus.`, true);
        setBugSent(true);
        setTimeout(() => { setMode('chat'); setBugSent(false); }, 3000);
      } else {
        // Claude API aufrufen
        const ctx = await fetchContext();
        const history = messages
          .filter(m => m.id !== '0')
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: SYSTEM_PROMPT + ctx,
            messages: [...history, { role: 'user', content: userText }],
          }),
        });
        const data = await response.json();
        const text = data.content?.find((b: any) => b.type === 'text')?.text ?? 'Keine Antwort erhalten.';
        addMsg('assistant', text);
      }
    } catch (e: any) {
      addMsg('assistant', `❌ Fehler: ${e.message ?? 'Unbekannter Fehler'}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const fmtTime = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatPulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.08); }
        }
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
          40%            { opacity: 1; transform: translateY(-4px); }
        }
        .widi-chat-bubble { animation: chatSlideUp 0.25s ease forwards; }
        .widi-fab { transition: all 0.2s ease; }
        .widi-fab:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(37,99,235,0.45) !important; }
        .widi-msg-user { animation: chatSlideUp 0.15s ease forwards; }
        .widi-msg-ai   { animation: chatSlideUp 0.2s ease forwards; }
        .widi-send:hover { background: #1d4ed8 !important; }
        .widi-input:focus { outline: none; border-color: #2563eb !important; }
        .widi-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #94a3b8; margin: 0 2px; }
        .widi-dot:nth-child(1) { animation: typingDot 1.2s ease infinite 0s; }
        .widi-dot:nth-child(2) { animation: typingDot 1.2s ease infinite 0.2s; }
        .widi-dot:nth-child(3) { animation: typingDot 1.2s ease infinite 0.4s; }
      `}</style>

      {/* ── Chat Fenster ── */}
      {open && !minimized && (
        <div className="widi-chat-bubble" style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 9999,
          width: 380, height: 540,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={18} style={{ color: '#fff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>WIDI Assistent</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: 0 }}>
                {loading ? 'Schreibt...' : 'Online'}
              </p>
            </div>
            {/* Mode Toggle */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setMode('chat')} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'chat' ? '#fff' : 'transparent', color: mode === 'chat' ? '#1e3a5f' : 'rgba(255,255,255,0.7)', transition: 'all .15s' }}>
                Chat
              </button>
              <button onClick={() => setMode('bug')} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'bug' ? '#fff' : 'transparent', color: mode === 'bug' ? '#dc2626' : 'rgba(255,255,255,0.7)', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bug size={11} /> Bug
              </button>
            </div>
            <button onClick={() => setMin(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }} title="Minimieren">
              <Minimize2 size={14} />
            </button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          </div>

          {/* Bug-Mode Banner */}
          {mode === 'bug' && (
            <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <AlertTriangle size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#dc2626', margin: 0, fontWeight: 600 }}>Bug-Modus — Deine Meldung wird per E-Mail an {OWNER_EMAIL} gesendet</p>
            </div>
          )}

          {/* Nachrichten */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map(msg => (
              <div key={msg.id} className={msg.role === 'user' ? 'widi-msg-user' : 'widi-msg-ai'}
                style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8 }}>
                {/* Avatar */}
                <div style={{ width: 28, height: 28, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? '#2563eb' : '#f1f5f9' }}>
                  {msg.role === 'user'
                    ? <User size={13} style={{ color: '#fff' }} />
                    : <Bot size={13} style={{ color: '#64748b' }} />}
                </div>
                {/* Bubble */}
                <div style={{ maxWidth: '78%' }}>
                  <div style={{
                    padding: '9px 12px',
                    borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: msg.role === 'user' ? '#2563eb' : msg.isBug ? '#fef2f2' : '#f8fafc',
                    color: msg.role === 'user' ? '#fff' : '#0f172a',
                    fontSize: 13, lineHeight: 1.5,
                    border: msg.isBug ? '1px solid #fecaca' : msg.role === 'user' ? 'none' : '1px solid #f1f5f9',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '3px 4px 0', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                    {fmtTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            {/* Loading dots */}
            {loading && (
              <div className="widi-msg-ai" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
                  <Bot size={13} style={{ color: '#64748b' }} />
                </div>
                <div style={{ padding: '12px 14px', borderRadius: '4px 16px 16px 16px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <span className="widi-dot" /><span className="widi-dot" /><span className="widi-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick Suggestions */}
          {messages.length <= 2 && mode === 'chat' && (
            <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {['Wie viele Baustellen sind aktiv?', 'März Stunden Übersicht', 'Was ist eine A-Nummer?'].map(s => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eff6ff'; (e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe'; (e.currentTarget as HTMLElement).style.color = '#2563eb'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: '#f8fafc', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '8px 8px 8px 12px', transition: 'border-color .15s' }}
              onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }}
              onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}>
              <textarea
                ref={inputRef}
                className="widi-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'bug' ? 'Beschreibe den Bug...' : 'Frage stellen... (Enter zum Senden)'}
                rows={1}
                style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 13, color: '#0f172a', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 80, overflow: 'auto' }}
                onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px'; }}
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()} className="widi-send"
                style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: loading || !input.trim() ? '#e2e8f0' : mode === 'bug' ? '#dc2626' : '#2563eb', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                {loading ? <Loader2 size={15} style={{ color: '#94a3b8', animation: 'spin 1s linear infinite' }} /> : <Send size={14} style={{ color: '#fff' }} />}
              </button>
            </div>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: '5px 4px 0', textAlign: 'center' }}>
              Shift+Enter für neue Zeile · Enter zum Senden
            </p>
          </div>
        </div>
      )}

      {/* ── Minimiert Banner ── */}
      {open && minimized && (
        <div onClick={() => setMin(false)} style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 9999,
          background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
          borderRadius: 14, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', boxShadow: '0 8px 24px rgba(37,99,235,0.3)',
          animation: 'chatSlideUp 0.2s ease forwards',
        }}>
          <Bot size={16} style={{ color: '#fff' }} />
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>WIDI Assistent</span>
          <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
        </div>
      )}

      {/* ── FAB Button ── */}
      <button
        className="widi-fab"
        onClick={() => { setOpen(o => !o); setMin(false); }}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: 18,
          background: open ? '#1e3a5f' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(37,99,235,0.35)',
          animation: !open && unread > 0 ? 'chatPulse 2s ease infinite' : 'none',
        }}>
        {open
          ? <X size={22} style={{ color: '#fff' }} />
          : <MessageCircle size={22} style={{ color: '#fff' }} />}
        {!open && unread > 0 && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', border: '2px solid #fff' }}>
            {unread}
          </div>
        )}
      </button>
    </>
  );
}
