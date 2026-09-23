'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Copy, Check, ArrowDownToLine, Loader2 } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string; script?: string | null };

const IDEAS = ['low-poly tree', 'wooden chair', 'red sports car', 'medieval castle', 'coffee mug', 'robot toy'];

export default function AiChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput(''); setError(null); setBusy(true);
    const next = [...msgs, { role: 'user' as const, content: prompt }];
    setMsgs(next);
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
        signal: AbortSignal.timeout(150000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      if (!data.reply && !data.script) throw new Error('AI returned an empty response — try again or rephrase.');
      setMsgs([...next, { role: 'assistant', content: data.reply, script: data.script }]);
      if (data.script) applyScript(data.script, true); // auto-fill editor
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const applyScript = (script: string, quiet = false) => {
    window.dispatchEvent(new CustomEvent('bl:use-script', { detail: script }));
    if (!quiet) document.getElementById('script-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const copyLast = async (script: string) => {
    try { await navigator.clipboard.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const lastScript = [...msgs].reverse().find((m) => m.script)?.script ?? null;

  return (
    <section className="ai-chat">
      <div className="ai-chat-head">
        <span className="ai-chat-badge"><Sparkles size={14} /> AI sculptor</span>
        <h2>Describe it — get a Blender script</h2>
        <p>Powered by Groq. Output follows the worker rules (geometry only, Blender 5.2-safe).</p>
      </div>

      {msgs.length > 0 && (
        <div className="ai-chat-log">
          {msgs.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg--${m.role}`}>
              <div className="ai-msg-body">
                {m.script ? (
                  <>
                    <pre className="ai-code">{m.script.slice(0, 1200)}{m.script.length > 1200 ? '\n# … (full script in editor below)' : ''}</pre>
                    <div className="ai-msg-actions">
                      <span className="ai-inserted"><Check size={13} /> In editor below</span>
                      <button className="ai-btn ai-btn--ghost" onClick={() => copyLast(m.script!)}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
                    </div>
                  </>
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="ai-msg ai-msg--assistant"><div className="ai-msg-body ai-typing"><Loader2 size={14} className="ai-spin" /> Carving bpy…</div></div>}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <div className="submit-error">⚠ {error}</div>}

      <div className="ai-input-row">
        <input
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="e.g. a low-poly pine tree with snow…"
          disabled={busy}
        />
        <button className="ai-send" onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 size={16} className="ai-spin" /> : <Send size={16} />}
        </button>
      </div>

      <div className="ai-ideas">
        {IDEAS.map((idea) => (
          <button key={idea} className="ai-idea" onClick={() => send(`Create ${idea}`)} disabled={busy}>{idea}</button>
        ))}
      </div>

      {lastScript && msgs.length > 0 && (
        <button className="ai-use-bar" onClick={() => applyScript(lastScript)}>
          <ArrowDownToLine size={14} /> Insert latest script into editor below
        </button>
      )}
    </section>
  );
}
