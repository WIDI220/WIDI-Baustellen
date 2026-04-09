import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Send, Loader2, Bug, Minimize2, Trash2, ChevronDown } from 'lucide-react';

type MsgRole = 'user' | 'assistant';
interface Msg { id: string; role: MsgRole; content: string; ts: Date; visual?: VisualData; }
interface VisualData { type: 'bars' | 'kpis'; data: any; }
type Mode = 'chat' | 'bug';

const SUGGESTIONS = [
  'Stunden aktueller Monat',
  'Wie viele Baustellen aktiv?',
  'Was ist der Excel-Import?',
  'Was ist der PDF-Rücklauf?',
];

// ── Supabase Abfragen ─────────────────────────────────────────────────────
async function querySupabase(q: string): Promise<{ context: string; visual?: VisualData } | null> {
  const ql = q.toLowerCase();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monatMap: Record<string, string> = {
    januar:'01',februar:'02',märz:'03',april:'04',mai:'05',juni:'06',
    juli:'07',august:'08',september:'09',oktober:'10',november:'11',dezember:'12',
    jan:'01',feb:'02',mär:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dez:'12',
  };
  let qM = m, qY = String(y);
  for (const [n, num] of Object.entries(monatMap)) { if (ql.includes(n)) { qM = num; break; } }
  if (ql.includes('2025')) qY = '2025';
  if (ql.includes('2026')) qY = '2026';
  const from = `${qY}-${qM}-01`, to = `${qY}-${qM}-31`;

  try {
    if (ql.match(/stunden|geleistet|gearbeitet|mitarbeiter.*monat|monat.*stunden/)) {
      const { data } = await supabase.from('ticket_worklogs').select('stunden, employees(name, kuerzel)').gte('leistungsdatum', from).lte('leistungsdatum', to);
      const ma: Record<string, { name: string; kuerzel: string; stunden: number }> = {};
      (data ?? []).forEach((w: any) => {
        const k = w.employees?.kuerzel ?? '?';
        if (!ma[k]) ma[k] = { name: w.employees?.name ?? k, kuerzel: k, stunden: 0 };
        ma[k].stunden += Number(w.stunden ?? 0);
      });
      const sorted = Object.values(ma).sort((a, b) => b.stunden - a.stunden);
      const total = sorted.reduce((s, x) => s + x.stunden, 0);
      return {
        context: `Stunden ${qY}-${qM}: ${total.toFixed(2)}h\n` + sorted.map(x => `${x.kuerzel}: ${x.stunden.toFixed(2)}h`).join('\n'),
        visual: { type: 'bars', data: { title: `Stunden ${qY}-${qM}`, total, items: sorted.map(x => ({ label: x.kuerzel, name: x.name, value: x.stunden, max: sorted[0]?.stunden ?? 1 })) } }
      };
    }
    if (ql.match(/ticket|a-nummer|erledigt|monat.*ticket|ticket.*monat/)) {
      const [{ data: t }, { data: w }] = await Promise.all([
        supabase.from('tickets').select('status, gewerk').gte('eingangsdatum', from).lte('eingangsdatum', to),
        supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', from).lte('leistungsdatum', to),
      ]);
      const gesamt = (t ?? []).length;
      const erledigt = (t ?? []).filter((x: any) => x.status === 'erledigt').length;
      const inArbeit = (t ?? []).filter((x: any) => x.status === 'in_bearbeitung').length;
      const std = (w ?? []).reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
      return {
        context: `Tickets ${qY}-${qM}: ${gesamt} gesamt, ${erledigt} erledigt, ${inArbeit} in Bearbeitung, ${std.toFixed(2)}h`,
        visual: { type: 'kpis', data: { items: [
          { label: 'Gesamt', value: gesamt, color: '#2563eb' },
          { label: 'Erledigt', value: erledigt, color: '#10b981' },
          { label: 'In Bearbeitung', value: inArbeit, color: '#f59e0b' },
          { label: 'Stunden', value: std.toFixed(1) + 'h', color: '#8b5cf6' },
        ]}}
      };
    }
    if (ql.match(/baustelle|projekt/)) {
      const { data } = await supabase.from('baustellen').select('name, status, gewerk').not('status', 'eq', 'abgerechnet');
      const bs = data ?? [];
      const inA = bs.filter((b: any) => b.status === 'in_bearbeitung').length;
      const pau = bs.filter((b: any) => b.status === 'pausiert').length;
      const off = bs.filter((b: any) => b.status === 'offen').length;
      return {
        context: `Baustellen: ${bs.length} aktiv (${inA} in Bearbeitung, ${pau} pausiert, ${off} offen)`,
        visual: { type: 'kpis', data: { items: [
          { label: 'In Bearbeitung', value: inA, color: '#2563eb' },
          { label: 'Pausiert', value: pau, color: '#f59e0b' },
          { label: 'Offen', value: off, color: '#64748b' },
          { label: 'Gesamt aktiv', value: bs.length, color: '#10b981' },
        ]}}
      };
    }
  } catch {}
  return null;
}

// ── Visuelle Antwort ──────────────────────────────────────────────────────
function Visual({ data }: { data: VisualData }) {
  if (data.type === 'kpis') return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:8 }}>
      {data.data.items.map((item: any, i: number) => (
        <div key={i} style={{ background:`${item.color}12`, border:`1px solid ${item.color}30`, borderRadius:8, padding:'7px 9px' }}>
          <div style={{ fontSize:16, fontWeight:800, color:item.color }}>{item.value}</div>
          <div style={{ fontSize:10, color:'#64748b', fontWeight:500 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
  if (data.type === 'bars') {
    const items = data.data.items.slice(0, 8);
    const max = items[0]?.value ?? 1;
    return (
      <div style={{ marginTop:8 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#64748b', marginBottom:6 }}>{data.data.title} — {data.data.total.toFixed(1)}h</div>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
            <div style={{ width:24, fontSize:10, fontWeight:700, color:'#1e3a5f', flexShrink:0 }}>{item.label}</div>
            <div style={{ flex:1, height:16, background:'#f1f5f9', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(item.value/max)*100}%`, background:'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius:3 }}>
              </div>
            </div>
            <div style={{ fontSize:10, fontWeight:700, color:'#2563eb', flexShrink:0, minWidth:32, textAlign:'right' }}>{item.value.toFixed(1)}h</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────
export default function WidiChatbot() {
  const [open, setOpen]   = useState(false);
  const [mini, setMini]   = useState(false);
  const [mode, setMode]   = useState<Mode>('chat');
  const [msgs, setMsgs]   = useState<Msg[]>([{
    id: '0', role: 'assistant', ts: new Date(),
    content: 'Hallo Jan! Ich kenne dein System vollständig.\n\nFrag mich alles — Stunden, Tickets, Baustellen, Funktionen.',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoad] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80); }
  }, [open, msgs]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, mode]);

  const addMsg = useCallback((role: MsgRole, content: string, visual?: VisualData) => {
    const msg: Msg = { id: Date.now() + Math.random() + '', role, content, ts: new Date(), visual };
    setMsgs(p => [...p, msg]);
    if (!open && role === 'assistant') setUnread(u => u + 1);
  }, [open]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput('');
    addMsg('user', text);
    setLoad(true);
    try {
      if (mode === 'bug') {
        await supabase.from('activity_log').insert({
          user_email: 'j.paredis@widi-hellersen.de',
          action: `🐛 Bug: ${text}`,
          entity_type: 'bug_report',
          metadata: { seite: window.location.pathname },
        });
        addMsg('assistant', `✅ Bug gespeichert!\n\n"${text}"\n\nSichtbar im Activity Log.`);
        setTimeout(() => setMode('chat'), 2000);
        return;
      }
      const dbResult = await querySupabase(text);
      const history = msgs.filter(m => m.id !== '0').slice(-10).map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user' as MsgRole, content: text });
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: dbResult?.context ?? '' }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      addMsg('assistant', data.text, dbResult?.visual);
    } catch (e: any) {
      addMsg('assistant', `Fehler: ${e.message}. Bitte erneut versuchen.`);
    } finally {
      setLoad(false);
    }
  }, [input, loading, mode, msgs, addMsg]);

  const fmtTime = (d: Date) => d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });

  return (
    <>
      <style>{`
        @keyframes wi-chat{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes wi-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes wi-inL{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes wi-dot{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
        @keyframes wi-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes wi-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes wi-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.55);opacity:0}}
        @keyframes wi-pulse2{0%{transform:scale(1);opacity:.3}100%{transform:scale(1.7);opacity:0}}
        @keyframes wi-scan{0%{top:-15%}100%{top:115%}}
        @keyframes wi-fab-in{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
        .wi-chat-win{animation:wi-chat .22s cubic-bezier(.34,1.56,.64,1) forwards}
        .wi-msg-ai{animation:wi-in .2s ease forwards}
        .wi-msg-user{animation:wi-inL .2s ease forwards}
        .wi-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#94a3b8;margin:0 2px}
        .wi-dot:nth-child(1){animation:wi-dot 1.2s ease infinite}
        .wi-dot:nth-child(2){animation:wi-dot 1.2s ease infinite .2s}
        .wi-dot:nth-child(3){animation:wi-dot 1.2s ease infinite .4s}
        .wi-spin{animation:wi-spin 1s linear infinite}
        .wi-float{animation:wi-float 3.5s ease-in-out infinite}
        .wi-pr1{animation:wi-pulse 2s ease-out infinite}
        .wi-pr2{animation:wi-pulse2 2s ease-out infinite .65s}
        .wi-scan{animation:wi-scan 3.5s linear infinite}
        .wi-fab{transition:all .2s ease!important;animation:wi-fab-in .3s ease forwards}
        .wi-fab:hover{transform:scale(1.08)!important;box-shadow:0 10px 28px rgba(37,99,235,.5)!important}
        .wi-chip:hover{background:#eff6ff!important;border-color:#bfdbfe!important;color:#2563eb!important}
        .wi-send:hover:not(:disabled){background:#1d4ed8!important}
      `}</style>

      {/* ── Chat Fenster ────────────────────────────────────────────────── */}
      {open && !mini && (
        <div className="wi-chat-win" style={{ position:'fixed', bottom:92, right:24, zIndex:9999, width:400, height:580, background:'#fff', borderRadius:22, boxShadow:'0 32px 80px rgba(0,0,0,.2),0 4px 16px rgba(0,0,0,.08)', display:'flex', flexDirection:'column', overflow:'hidden', border:'1px solid #e2e8f0', fontFamily:"'Inter',system-ui,sans-serif" }}>

          {/* Header — großes animiertes Foto */}
          <div style={{ background:'linear-gradient(160deg,#0f172a 0%,#1e3a5f 55%,#1e3a8a 100%)', padding:'18px 16px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:0, flexShrink:0, position:'relative' }}>

            {/* Aktionen oben rechts */}
            <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:3 }}>
              <div style={{ display:'flex', gap:2, background:'rgba(255,255,255,.08)', borderRadius:9, padding:3 }}>
                <button onClick={() => setMode('chat')} style={{ padding:'3px 10px', borderRadius:7, border:'none', fontSize:10, fontWeight:600, cursor:'pointer', background:mode==='chat'?'#fff':'transparent', color:mode==='chat'?'#1e3a5f':'rgba(255,255,255,.55)', fontFamily:'inherit', transition:'all .15s' }}>Chat</button>
                <button onClick={() => setMode('bug')} style={{ padding:'3px 10px', borderRadius:7, border:'none', fontSize:10, fontWeight:600, cursor:'pointer', background:mode==='bug'?'#fff':'transparent', color:mode==='bug'?'#dc2626':'rgba(255,255,255,.55)', fontFamily:'inherit', transition:'all .15s', display:'flex', alignItems:'center', gap:3 }}><Bug size={9}/>Bug</button>
              </div>
              <button onClick={() => setMsgs([msgs[0]])} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)', padding:5, borderRadius:7, display:'flex' }}><Trash2 size={12}/></button>
              <button onClick={() => setMini(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)', padding:5, borderRadius:7, display:'flex' }}><Minimize2 size={12}/></button>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)', padding:5, borderRadius:7, display:'flex' }}><X size={14}/></button>
            </div>

            {/* Großes animiertes Foto */}
            <div className="wi-float" style={{ position:'relative', width:80, height:80, marginBottom:10 }}>
              <div className="wi-pr1" style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1.5px solid rgba(96,165,250,.6)', pointerEvents:'none' }}/>
              <div className="wi-pr2" style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1px solid rgba(96,165,250,.3)', pointerEvents:'none' }}/>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'conic-gradient(#2563eb,#60a5fa,#1d4ed8,#2563eb)', padding:'2.5px' }}>
                <div style={{ width:'100%', height:'100%', borderRadius:'50%', overflow:'hidden', position:'relative' }}>
                  <img src="/jan-avatar.png" alt="Jan"
                    style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top', display:'block' }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                      if (el.parentElement) el.parentElement.innerHTML = '<div style="width:100%;height:100%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800">J</div>';
                    }}/>
                  <div className="wi-scan" style={{ position:'absolute', left:0, right:0, height:'14%', background:'linear-gradient(to bottom,transparent,rgba(37,99,235,.18),transparent)', pointerEvents:'none' }}/>
                </div>
              </div>
              <div style={{ position:'absolute', bottom:2, right:2, width:14, height:14, borderRadius:'50%', background:'#10b981', border:'2.5px solid #0f172a' }}/>
            </div>

            <div style={{ color:'#fff', fontWeight:700, fontSize:14, letterSpacing:'-.01em', marginBottom:4 }}>WIDI Assistent</div>
            <div style={{ color:'rgba(255,255,255,.45)', fontSize:11 }}>{loading ? '● Analysiert...' : '● Online · Systemzugriff aktiv'}</div>

            {/* Bug Banner */}
            {mode === 'bug' && (
              <div style={{ marginTop:10, background:'rgba(220,38,38,.15)', border:'1px solid rgba(220,38,38,.3)', borderRadius:8, padding:'6px 12px', fontSize:11, color:'#fca5a5', fontWeight:500 }}>
                Bug-Modus — wird im Activity Log gespeichert
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 6px', display:'flex', flexDirection:'column', gap:10 }}>
            {msgs.map(msg => (
              <div key={msg.id} className={msg.role==='user'?'wi-msg-user':'wi-msg-ai'} style={{ display:'flex', flexDirection:msg.role==='user'?'row-reverse':'row', alignItems:'flex-start', gap:8 }}>
                {/* Avatar */}
                <div style={{ width:28, height:28, borderRadius:10, flexShrink:0, overflow:'hidden', background:msg.role==='user'?'#2563eb':'#f1f5f9', border:msg.role==='user'?'none':'1px solid #e2e8f0', marginTop:2 }}>
                  <img src="/jan-avatar.png" alt="J"
                    style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                      if (el.parentElement) el.parentElement.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${msg.role==='user'?'#fff':'#64748b'};font-size:11px;font-weight:800">J</div>`;
                    }}/>
                </div>
                {/* Bubble */}
                <div style={{ maxWidth:'82%' }}>
                  <div style={{ padding:'9px 12px', borderRadius:msg.role==='user'?'16px 4px 16px 16px':'4px 16px 16px 16px', background:msg.role==='user'?'linear-gradient(135deg,#2563eb,#1d4ed8)':'#f8fafc', color:msg.role==='user'?'#fff':'#0f172a', fontSize:12.5, lineHeight:1.55, border:msg.role==='user'?'none':'1px solid #f1f5f9', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                    {msg.content}
                    {msg.visual && <Visual data={msg.visual}/>}
                  </div>
                  <div style={{ fontSize:10, color:'#94a3b8', margin:'3px 5px 0', textAlign:msg.role==='user'?'right':'left' }}>{fmtTime(msg.ts)}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="wi-msg-ai" style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <div style={{ width:28, height:28, borderRadius:10, flexShrink:0, background:'#f1f5f9', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                  <Loader2 size={13} className="wi-spin" style={{ color:'#64748b' }}/>
                </div>
                <div style={{ padding:'11px 14px', borderRadius:'4px 16px 16px 16px', background:'#f8fafc', border:'1px solid #f1f5f9', marginTop:2 }}>
                  <span className="wi-dot"/><span className="wi-dot"/><span className="wi-dot"/>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Suggestions */}
          {msgs.length <= 2 && mode === 'chat' && (
            <div style={{ padding:'4px 14px 8px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} className="wi-chip" onClick={() => send(s)}
                  style={{ fontSize:11, padding:'4px 10px', borderRadius:20, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#64748b', fontFamily:'inherit', cursor:'pointer', transition:'all .15s' }}>
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
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={mode==='bug'?'Bug beschreiben...':'Frage stellen... (Enter senden)'}
                rows={1} style={{ flex:1, border:'none', background:'transparent', resize:'none', fontSize:13, color:'#0f172a', fontFamily:'inherit', lineHeight:1.5, maxHeight:80, overflow:'auto', outline:'none' }}
                onInput={e => { const t=e.currentTarget; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,80)+'px'; }}/>
              <button className="wi-send" onClick={() => send()} disabled={loading || !input.trim()}
                style={{ width:34, height:34, borderRadius:10, border:'none', background:loading||!input.trim()?'#e2e8f0':mode==='bug'?'#dc2626':'linear-gradient(135deg,#2563eb,#1d4ed8)', cursor:loading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                {loading ? <Loader2 size={14} className="wi-spin" style={{ color:'#94a3b8' }}/> : <Send size={13} style={{ color:'#fff' }}/>}
              </button>
            </div>
            <p style={{ fontSize:10, color:'#94a3b8', margin:'4px 2px 0', textAlign:'center' }}>Shift+Enter = neue Zeile</p>
          </div>
        </div>
      )}

      {/* ── Minimiert ──────────────────────────────────────────────────── */}
      {open && mini && (
        <div onClick={() => setMini(false)} style={{ position:'fixed', bottom:92, right:24, zIndex:9999, background:'linear-gradient(135deg,#0f172a,#2563eb)', borderRadius:16, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', boxShadow:'0 8px 24px rgba(37,99,235,.3)', fontFamily:"'Inter',system-ui,sans-serif" }}>
          <div style={{ width:26, height:26, borderRadius:8, overflow:'hidden', border:'1.5px solid rgba(255,255,255,.2)' }}>
            <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top' }}
              onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
          </div>
          <span style={{ color:'#fff', fontSize:13, fontWeight:600 }}>WIDI Assistent</span>
          <ChevronDown size={14} style={{ color:'rgba(255,255,255,.6)' }}/>
        </div>
      )}

      {/* ── FAB — Clean Icon ───────────────────────────────────────────── */}
      <button className="wi-fab" onClick={() => { setOpen(o => !o); setMini(false); }}
        style={{ position:'fixed', bottom:24, right:24, zIndex:9999, width:56, height:56, borderRadius:18, background: open ? '#1e3a5f' : 'linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow: open ? '0 4px 16px rgba(30,58,95,.4)' : '0 6px 24px rgba(37,99,235,.4)' }}>
        {open
          ? <X size={22} style={{ color:'#fff' }}/>
          : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.02 2 11c0 2.4.92 4.6 2.44 6.27L3 21l3.93-1.37C8.28 20.5 10.08 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z" fill="white" fillOpacity="0.95"/>
              <circle cx="8.5" cy="11" r="1.2" fill="#1e3a5f"/>
              <circle cx="12" cy="11" r="1.2" fill="#1e3a5f"/>
              <circle cx="15.5" cy="11" r="1.2" fill="#1e3a5f"/>
            </svg>
          )
        }
        {!open && unread > 0 && (
          <div style={{ position:'absolute', top:-4, right:-4, width:18, height:18, borderRadius:'50%', background:'#ef4444', border:'2px solid #fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff' }}>{unread}</div>
        )}
      </button>
    </>
  );
}
