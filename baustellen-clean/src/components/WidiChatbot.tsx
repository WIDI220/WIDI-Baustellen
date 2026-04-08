import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, X, ChevronDown, Minimize2, Trash2, Bug, Send, Loader2 } from 'lucide-react';

// ── Typen ─────────────────────────────────────────────────────────────────
type MsgRole = 'user' | 'assistant';
interface Msg { id: string; role: MsgRole; content: string; ts: Date; visual?: VisualData; }
interface VisualData { type: 'table' | 'bars' | 'kpis'; data: any; }
type Mode = 'chat' | 'bug';

// ── Supabase Abfragen ─────────────────────────────────────────────────────
async function querySupabase(question: string): Promise<{ context: string; visual?: VisualData } | null> {
  const q = question.toLowerCase();
  const now = new Date();
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');

  // Monat aus Frage extrahieren
  const monatMap: Record<string, string> = {
    januar:'01', februar:'02', märz:'03', april:'04', mai:'05', juni:'06',
    juli:'07', august:'08', september:'09', oktober:'10', november:'11', dezember:'12',
    jan:'01', feb:'02', mär:'03', apr:'04', jun:'06', jul:'07', aug:'08', sep:'09', okt:'10', nov:'11', dez:'12',
  };
  let qMonth = curM, qYear = String(curY);
  for (const [name, num] of Object.entries(monatMap)) {
    if (q.includes(name)) { qMonth = num; break; }
  }
  if (q.includes('2025')) qYear = '2025';
  if (q.includes('2026')) qYear = '2026';
  const from = `${qYear}-${qMonth}-01`;
  const to   = `${qYear}-${qMonth}-31`;

  try {
    // ── Mitarbeiter-Stunden ──────────────────────────────────────────────
    if (q.match(/stunden|hours|geleistet|gearbeitet|mitarbeiter.*monat|monat.*mitarbeiter|wer hat wie/)) {
      const { data } = await supabase
        .from('ticket_worklogs')
        .select('stunden, employees(name, kuerzel, gewerk)')
        .gte('leistungsdatum', from).lte('leistungsdatum', to);

      const ma: Record<string, { name: string; kuerzel: string; gewerk: string; stunden: number }> = {};
      (data ?? []).forEach((w: any) => {
        const k = w.employees?.kuerzel ?? '?';
        if (!ma[k]) ma[k] = { name: w.employees?.name ?? k, kuerzel: k, gewerk: w.employees?.gewerk ?? '?', stunden: 0 };
        ma[k].stunden += Number(w.stunden ?? 0);
      });
      const sorted = Object.values(ma).sort((a, b) => b.stunden - a.stunden);
      const total  = sorted.reduce((s, m) => s + m.stunden, 0);

      const ctx = `Stunden ${qYear}-${qMonth}: ${total.toFixed(2)}h gesamt\n` +
        sorted.map(m => `${m.kuerzel} (${m.name}): ${m.stunden.toFixed(2)}h`).join('\n');

      return {
        context: ctx,
        visual: {
          type: 'bars',
          data: { title: `Stunden ${qYear}-${qMonth}`, total, items: sorted.map(m => ({ label: m.kuerzel, name: m.name, value: m.stunden, max: sorted[0].stunden })) }
        }
      };
    }

    // ── Ticket-Übersicht ─────────────────────────────────────────────────
    if (q.match(/ticket|a-nummer|anummer|erledigt|bearbeitung|monat.*ticket|ticket.*monat/)) {
      const [{ data: tickets }, { data: wl }] = await Promise.all([
        supabase.from('tickets').select('status, gewerk').gte('eingangsdatum', from).lte('eingangsdatum', to),
        supabase.from('ticket_worklogs').select('stunden, tickets(gewerk)').gte('leistungsdatum', from).lte('leistungsdatum', to),
      ]);
      const tList = tickets ?? [];
      const wList = wl ?? [];
      const gesamt    = tList.length;
      const erledigt  = tList.filter((t: any) => t.status === 'erledigt').length;
      const inArbeit  = tList.filter((t: any) => t.status === 'in_bearbeitung').length;
      const hbTickets = tList.filter((t: any) => t.gewerk === 'Hochbau').length;
      const elTickets = tList.filter((t: any) => t.gewerk === 'Elektro').length;
      const stdGes    = wList.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
      const stdHB     = wList.filter((w: any) => w.tickets?.gewerk === 'Hochbau').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
      const stdEL     = wList.filter((w: any) => w.tickets?.gewerk === 'Elektro').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);

      return {
        context: `Tickets ${qYear}-${qMonth}: ${gesamt} gesamt | ${erledigt} erledigt | ${inArbeit} in Bearbeitung\nHochbau: ${hbTickets} Tickets, ${stdHB.toFixed(2)}h\nElektro: ${elTickets} Tickets, ${stdEL.toFixed(2)}h\nGesamt Stunden: ${stdGes.toFixed(2)}h`,
        visual: {
          type: 'kpis',
          data: { title: `Tickets ${qYear}-${qMonth}`, items: [
            { label: 'Gesamt', value: gesamt, color: '#2563eb' },
            { label: 'Erledigt', value: erledigt, color: '#10b981' },
            { label: 'In Bearbeitung', value: inArbeit, color: '#f59e0b' },
            { label: 'Stunden', value: stdGes.toFixed(1) + 'h', color: '#8b5cf6' },
          ]}
        }
      };
    }

    // ── Baustellen ───────────────────────────────────────────────────────
    if (q.match(/baustelle|projekt|hochbau.*baustell|elektro.*baustell/)) {
      const { data } = await supabase.from('baustellen').select('name, status, gewerk, budget').not('status', 'eq', 'abgerechnet');
      const bs = data ?? [];
      const inArbeit = bs.filter((b: any) => b.status === 'in_bearbeitung');
      const pausiert  = bs.filter((b: any) => b.status === 'pausiert');
      const offen     = bs.filter((b: any) => b.status === 'offen');

      const ctx = `Baustellen aktiv: ${bs.length}\n` +
        `In Bearbeitung (${inArbeit.length}): ${inArbeit.map((b: any) => b.name).join(', ')}\n` +
        `Pausiert (${pausiert.length}): ${pausiert.map((b: any) => b.name).join(', ')}\n` +
        `Offen (${offen.length}): ${offen.map((b: any) => b.name).join(', ')}`;

      return {
        context: ctx,
        visual: {
          type: 'kpis',
          data: { title: 'Baustellen Übersicht', items: [
            { label: 'In Bearbeitung', value: inArbeit.length, color: '#2563eb' },
            { label: 'Pausiert',       value: pausiert.length,  color: '#f59e0b' },
            { label: 'Offen',          value: offen.length,     color: '#64748b' },
            { label: 'Gesamt aktiv',   value: bs.length,        color: '#10b981' },
          ]}
        }
      };
    }

    // ── Spezifischer Mitarbeiter ──────────────────────────────────────────
    const maNames: Record<string, string> = {
      mk:'MK', ce:'CE', ug:'UG', ub:'UB', cr:'CR', sb:'SB', sg:'SG',
      fw:'FW', tb:'TB', tw:'TW', mm:'MM', jn:'JN', ta:'TA', mg:'MG',
      'matthias':'MK', 'caspar':'CE', 'uwe':'UG', 'christoph':'CR',
      'sigrid':'SB', 'stefan':'SG', 'frank':'FW', 'timo':'TB',
      'timur':'TW', 'adrian':'MM', 'jonas':'JN', 'tarik':'TA',
    };
    for (const [key, kuerzel] of Object.entries(maNames)) {
      if (q.includes(key)) {
        const { data: emp } = await supabase.from('employees').select('id, name, kuerzel').eq('kuerzel', kuerzel).single();
        if (!emp) continue;
        const { data: wlData } = await supabase
          .from('ticket_worklogs')
          .select('stunden, leistungsdatum')
          .eq('employee_id', (emp as any).id)
          .gte('leistungsdatum', from).lte('leistungsdatum', to);

        const std = (wlData ?? []).reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
        const anzahl = (wlData ?? []).length;
        return { context: `${(emp as any).name} (${kuerzel}) in ${qYear}-${qMonth}: ${std.toFixed(2)}h auf ${anzahl} Tickets` };
      }
    }

  } catch (e) { console.error('Supabase Query:', e); }
  return null;
}

// ── Visuelle Antwort-Komponente ───────────────────────────────────────────
function Visual({ data }: { data: VisualData }) {
  if (data.type === 'kpis') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        {data.data.items.map((item: any, i: number) => (
          <div key={i} style={{ background: `${item.color}12`, border: `1px solid ${item.color}30`, borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{item.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (data.type === 'bars') {
    const items = data.data.items.slice(0, 8);
    const max = items[0]?.value ?? 1;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
          {data.data.title} — {data.data.total.toFixed(1)}h gesamt
        </div>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 26, fontSize: 11, fontWeight: 700, color: '#1e3a5f', flexShrink: 0 }}>{item.label}</div>
            <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(item.value / max) * 100}%`, background: `linear-gradient(90deg, #2563eb, #60a5fa)`, borderRadius: 4, transition: 'width .6s ease', display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{item.value.toFixed(1)}h</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.type === 'table') {
    const { headers, rows } = data.data;
    return (
      <div style={{ marginTop: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr>{headers.map((h: string, i: number) => (
              <th key={i} style={{ padding: '4px 8px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row: any[], i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                {row.map((cell: any, j: number) => (
                  <td key={j} style={{ padding: '4px 8px', color: '#0f172a' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

// ── Quick Suggestions ─────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Stunden im aktuellen Monat',
  'Wie viele Baustellen aktiv?',
  'Was ist der Excel-Import?',
  'Was ist der PDF-Rücklauf?',
];

// ── Haupt-Komponente ──────────────────────────────────────────────────────
export default function WidiChatbot() {
  const [open, setOpen]     = useState(false);
  const [mini, setMini]     = useState(false);
  const [mode, setMode]     = useState<Mode>('chat');
  const [msgs, setMsgs]     = useState<Msg[]>([{
    id: '0', role: 'assistant', ts: new Date(),
    content: 'Hallo Jan! Ich kenne dein System vollständig — Baustellen, Tickets, Import, Stunden, alles.\n\nStell mir eine Frage oder wähle einen Vorschlag.',
  }]);
  const [input, setInput]   = useState('');
  const [loading, setLoad]  = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80); }
  }, [open, msgs]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, mode]);

  const addMsg = useCallback((role: MsgRole, content: string, visual?: VisualData) => {
    const msg: Msg = { id: Date.now() + Math.random() + '', role, content, ts: new Date(), visual };
    setMsgs(p => [...p, msg]);
    if (!open && role === 'assistant') setUnread(u => u + 1);
  }, [open]);

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput('');
    addMsg('user', text);
    setLoad(true);

    try {
      if (mode === 'bug') {
        // Bug in Supabase speichern
        await supabase.from('activity_log').insert({
          user_email: 'j.paredis@widi-hellersen.de',
          action: `🐛 Bug-Meldung: ${text}`,
          entity_type: 'bug_report',
          metadata: { seite: window.location.pathname, zeit: new Date().toISOString() },
        });
        addMsg('assistant', `✅ Bug gespeichert!\n\n"${text}"\n\nDu findest alle Bug-Meldungen im Activity Log.`);
        setTimeout(() => setMode('chat'), 2500);
        return;
      }

      // Supabase-Kontext holen
      const dbResult = await querySupabase(text);
      const context = dbResult?.context ?? '';

      // API aufrufen
      const history = msgs.filter(m => m.id !== '0').slice(-10).map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: text });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      addMsg('assistant', data.text, dbResult?.visual);
    } catch (e: any) {
      addMsg('assistant', `Fehler: ${e.message}. Bitte versuche es erneut.`);
    } finally {
      setLoad(false);
    }
  }, [input, loading, mode, msgs, addMsg]);

  const fmtTime = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <style>{`
        @keyframes wi-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes wi-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.55);opacity:0}}
        @keyframes wi-pulse2{0%{transform:scale(1);opacity:.3}100%{transform:scale(1.7);opacity:0}}
        @keyframes wi-b1{0%,100%{height:4px}50%{height:20px}}
        @keyframes wi-b2{0%,100%{height:7px}50%{height:28px}}
        @keyframes wi-b3{0%,100%{height:5px}50%{height:16px}}
        @keyframes wi-b4{0%,100%{height:11px}50%{height:26px}}
        @keyframes wi-b5{0%,100%{height:6px}50%{height:20px}}
        @keyframes wi-b6{0%,100%{height:3px}50%{height:13px}}
        @keyframes wi-b7{0%,100%{height:9px}50%{height:24px}}
        @keyframes wi-scan{0%{top:-15%}100%{top:115%}}
        @keyframes wi-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes wi-inL{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes wi-dot{0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
        @keyframes wi-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes wi-chat{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes wi-fab-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        .wi-float{animation:wi-float 3.5s ease-in-out infinite}
        .wi-pr1{animation:wi-pulse 2s ease-out infinite}
        .wi-pr2{animation:wi-pulse2 2s ease-out infinite .65s}
        .wi-b1{animation:wi-b1 .42s ease-in-out infinite}
        .wi-b2{animation:wi-b2 .50s ease-in-out infinite .08s}
        .wi-b3{animation:wi-b3 .38s ease-in-out infinite .15s}
        .wi-b4{animation:wi-b4 .46s ease-in-out infinite .04s}
        .wi-b5{animation:wi-b5 .54s ease-in-out infinite .12s}
        .wi-b6{animation:wi-b6 .40s ease-in-out infinite .19s}
        .wi-b7{animation:wi-b7 .48s ease-in-out infinite .09s}
        .wi-scan{animation:wi-scan 3.5s linear infinite}
        .wi-msg-ai{animation:wi-in .2s ease forwards}
        .wi-msg-user{animation:wi-inL .2s ease forwards}
        .wi-chat{animation:wi-chat .25s cubic-bezier(.34,1.56,.64,1) forwards}
        .wi-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#94a3b8;margin:0 2px}
        .wi-dot:nth-child(1){animation:wi-dot 1.2s ease infinite 0s}
        .wi-dot:nth-child(2){animation:wi-dot 1.2s ease infinite .2s}
        .wi-dot:nth-child(3){animation:wi-dot 1.2s ease infinite .4s}
        .wi-spin{animation:wi-spin 1s linear infinite}
        .wi-fab{transition:all .2s ease!important}
        .wi-fab:hover{transform:scale(1.1)!important;box-shadow:0 10px 30px rgba(37,99,235,.5)!important}
        .wi-chip{transition:all .15s!important;cursor:pointer}
        .wi-chip:hover{background:#eff6ff!important;border-color:#bfdbfe!important;color:#2563eb!important}
        .wi-send:hover:not(:disabled){background:#1d4ed8!important}
        .wi-mode:hover{opacity:.8}
      `}</style>

      {/* ── Chat Fenster ────────────────────────────────────────────── */}
      {open && !mini && (
        <div className="wi-chat" style={{ position:'fixed', bottom:88, right:24, zIndex:9999, width:400, height:580, background:'#fff', borderRadius:22, boxShadow:'0 32px 80px rgba(0,0,0,.2),0 4px 16px rgba(0,0,0,.08)', display:'flex', flexDirection:'column', overflow:'hidden', border:'1px solid #e2e8f0', fontFamily:"'Inter',system-ui,sans-serif" }}>

          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#2563eb 100%)', padding:'13px 15px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ width:40, height:40, borderRadius:13, overflow:'hidden', border:'2px solid rgba(255,255,255,.25)', flexShrink:0, background:'#1e3a5f' }}>
              <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }}
                onError={e => { const el=e.target as HTMLImageElement; el.style.display='none'; if(el.parentElement) el.parentElement.innerHTML='<div style="width:100%;height:100%;background:#2563eb;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px">J</div>'; }}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ color:'#fff', fontWeight:700, fontSize:13 }}>WIDI Assistent</div>
              <div style={{ color:'rgba(255,255,255,.5)', fontSize:11 }}>{loading ? '● Analysiert...' : '● Online'}</div>
            </div>
            <div style={{ display:'flex', gap:3, background:'rgba(255,255,255,.1)', borderRadius:10, padding:3 }}>
              <button className="wi-mode" onClick={() => setMode('chat')} style={{ padding:'4px 12px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', background:mode==='chat'?'#fff':'transparent', color:mode==='chat'?'#1e3a5f':'rgba(255,255,255,.65)', fontFamily:'inherit', transition:'all .15s' }}>Chat</button>
              <button className="wi-mode" onClick={() => setMode('bug')} style={{ padding:'4px 12px', borderRadius:8, border:'none', fontSize:11, fontWeight:600, cursor:'pointer', background:mode==='bug'?'#fff':'transparent', color:mode==='bug'?'#dc2626':'rgba(255,255,255,.65)', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, transition:'all .15s' }}><Bug size={11}/>Bug</button>
            </div>
            <button onClick={() => setMsgs([msgs[0]])} title="Leeren" style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><Trash2 size={13}/></button>
            <button onClick={() => setMini(true)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><Minimize2 size={13}/></button>
            <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.4)', padding:5, borderRadius:7, display:'flex' }}><X size={16}/></button>
          </div>

          {/* Bug Banner */}
          {mode === 'bug' && (
            <div style={{ background:'#fef2f2', borderBottom:'1px solid #fecaca', padding:'7px 14px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <Bug size={12} style={{ color:'#dc2626', flexShrink:0 }}/>
              <p style={{ fontSize:11, color:'#dc2626', margin:0, fontWeight:600 }}>Bug-Modus — wird im Activity Log gespeichert</p>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 6px', display:'flex', flexDirection:'column', gap:10 }}>
            {msgs.map(msg => (
              <div key={msg.id} className={msg.role === 'user' ? 'wi-msg-user' : 'wi-msg-ai'} style={{ display:'flex', flexDirection:msg.role==='user'?'row-reverse':'row', alignItems:'flex-start', gap:8 }}>
                {/* Avatar */}
                <div style={{ width:28, height:28, borderRadius:10, flexShrink:0, overflow:'hidden', background:msg.role==='user'?'#2563eb':'#f1f5f9', border:msg.role==='user'?'none':'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                  <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }}
                    onError={e => { const el=e.target as HTMLImageElement; el.style.display='none'; if(el.parentElement) el.parentElement.innerHTML=`<span style="color:${msg.role==='user'?'#fff':'#64748b'};font-size:11px;font-weight:800">J</span>`; }}/>
                </div>
                {/* Bubble */}
                <div style={{ maxWidth:'82%' }}>
                  <div style={{ padding:'9px 12px', borderRadius:msg.role==='user'?'16px 4px 16px 16px':'4px 16px 16px 16px', background:msg.role==='user'?'linear-gradient(135deg,#2563eb,#1d4ed8)':'#f8fafc', color:msg.role==='user'?'#fff':'#0f172a', fontSize:12.5, lineHeight:1.55, border:msg.role==='user'?'none':'1px solid #f1f5f9', whiteSpace:'pre-wrap', wordBreak:'break-word', boxShadow:msg.role==='user'?'0 2px 8px rgba(37,99,235,.22)':'none' }}>
                    {msg.content}
                    {msg.visual && <Visual data={msg.visual} />}
                  </div>
                  <div style={{ fontSize:10, color:'#94a3b8', margin:'3px 5px 0', textAlign:msg.role==='user'?'right':'left' }}>{fmtTime(msg.ts)}</div>
                </div>
              </div>
            ))}

            {/* Loading */}
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

          {/* Quick Suggestions */}
          {msgs.length <= 2 && mode === 'chat' && (
            <div style={{ padding:'4px 14px 8px', display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} className="wi-chip" onClick={() => sendMessage(s)}
                  style={{ fontSize:11, padding:'4px 10px', borderRadius:20, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#64748b', fontFamily:'inherit' }}>
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
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={mode==='bug'?'Bug beschreiben...':'Frage stellen... (Enter senden)'}
                rows={1} style={{ flex:1, border:'none', background:'transparent', resize:'none', fontSize:13, color:'#0f172a', fontFamily:'inherit', lineHeight:1.5, maxHeight:80, overflow:'auto', outline:'none' }}
                onInput={e => { const t=e.currentTarget; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,80)+'px'; }}/>
              <button className="wi-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}
                style={{ width:34, height:34, borderRadius:10, border:'none', background:loading||!input.trim()?'#e2e8f0':mode==='bug'?'#dc2626':'linear-gradient(135deg,#2563eb,#1d4ed8)', cursor:loading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                {loading ? <Loader2 size={14} className="wi-spin" style={{ color:'#94a3b8' }}/> : <Send size={13} style={{ color:'#fff' }}/>}
              </button>
            </div>
            <p style={{ fontSize:10, color:'#94a3b8', margin:'4px 2px 0', textAlign:'center' }}>Shift+Enter = neue Zeile</p>
          </div>
        </div>
      )}

      {/* ── Minimiert ─────────────────────────────────────────────── */}
      {open && mini && (
        <div onClick={() => setMini(false)} style={{ position:'fixed', bottom:88, right:24, zIndex:9999, background:'linear-gradient(135deg,#0f172a,#2563eb)', borderRadius:16, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', boxShadow:'0 8px 24px rgba(37,99,235,.3)', fontFamily:"'Inter',system-ui,sans-serif" }}>
          <div style={{ width:26, height:26, borderRadius:8, overflow:'hidden', border:'1.5px solid rgba(255,255,255,.2)' }}>
            <img src="/jan-avatar.png" alt="J" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top' }}
              onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
          </div>
          <span style={{ color:'#fff', fontSize:13, fontWeight:600 }}>WIDI Assistent</span>
          <ChevronDown size={14} style={{ color:'rgba(255,255,255,.6)' }}/>
        </div>
      )}

      {/* ── Avatar + FAB ──────────────────────────────────────────── */}
      {!open && (
        <div style={{ position:'fixed', bottom:16, right:20, zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          {/* Großer animierter Avatar wenn geschlossen */}
          <div className="wi-float" style={{ position:'relative', width:72, height:72, cursor:'pointer' }} onClick={() => setOpen(true)}>
            <div className="wi-pr1" style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1.5px solid #2563eb', pointerEvents:'none' }}/>
            <div className="wi-pr2" style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1px solid #2563eb', pointerEvents:'none' }}/>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'conic-gradient(#2563eb,#60a5fa,#1d4ed8,#2563eb)', padding:'2.5px' }}>
              <div style={{ width:'100%', height:'100%', borderRadius:'50%', overflow:'hidden', position:'relative' }}>
                <img src="/jan-avatar.png" alt="Jan" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top', display:'block' }}
                  onError={e => { const el=e.target as HTMLImageElement; el.style.display='none'; if(el.parentElement) el.parentElement.innerHTML='<div style="width:100%;height:100%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800">J</div>'; }}/>
                <div className="wi-scan" style={{ position:'absolute', left:0, right:0, height:'14%', background:'linear-gradient(to bottom,transparent,rgba(37,99,235,.18),transparent)', pointerEvents:'none' }}/>
              </div>
            </div>
            {/* Sprechbalken */}
            <div style={{ position:'absolute', bottom:-24, left:'50%', transform:'translateX(-50%)', display:'flex', gap:2.5, alignItems:'center', height:20 }}>
              <div className="wi-b1" style={{ width:4, borderRadius:2, background:'#2563eb' }}/>
              <div className="wi-b2" style={{ width:4, borderRadius:2, background:'#3b82f6', opacity:.85 }}/>
              <div className="wi-b3" style={{ width:4, borderRadius:2, background:'#60a5fa', opacity:.9 }}/>
              <div className="wi-b4" style={{ width:4, borderRadius:2, background:'#2563eb' }}/>
              <div className="wi-b5" style={{ width:4, borderRadius:2, background:'#3b82f6', opacity:.8 }}/>
            </div>
            {/* Online */}
            <div style={{ position:'absolute', bottom:2, right:2, width:14, height:14, borderRadius:'50%', background:'#10b981', border:'2px solid #fff' }}/>
            {/* Unread Badge */}
            {unread > 0 && (
              <div style={{ position:'absolute', top:-2, left:-2, width:18, height:18, borderRadius:'50%', background:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', border:'2px solid #fff' }}>{unread}</div>
            )}
          </div>
          <div style={{ marginTop:16 }}/>
        </div>
      )}

      {/* FAB wenn offen */}
      {open && (
        <button className="wi-fab" onClick={() => setOpen(false)}
          style={{ position:'fixed', bottom:24, right:24, zIndex:9999, width:52, height:52, borderRadius:16, background:'#1e3a5f', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(37,99,235,.35)' }}>
          <X size={20} style={{ color:'#fff' }}/>
        </button>
      )}
    </>
  );
}
