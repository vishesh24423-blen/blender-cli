import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractScript as extractPython } from '@/lib/script-extract';

// space-bunny spends ~4K tokens reasoning — budget must exceed that or content is empty.
export const maxDuration = 300;

// Zen routes models to different OpenAI-compatible endpoints:
// chat/completions (kimi, deepseek, glm, ...) vs responses (gpt-*, muse-spark-*, grok-*).
const RESPONSES_PREFIX = ['gpt-', 'muse-spark', 'grok-'];

// ponytail: proxies normalize to their own shapes — try responses, chat, anthropic, plain. Add streaming when users ask.
type RespBlock = { content?: { text?: unknown; type?: unknown }[] };
function extractReplyText(data: { output_text?: unknown; output?: RespBlock[]; choices?: { message?: { content?: unknown } }[]; content?: { type?: unknown; text?: unknown }[]; text?: unknown; response?: unknown }): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const out = Array.isArray(data?.output) ? data.output : [];
  const fromOutput = out.flatMap((b) => Array.isArray(b?.content) ? b.content : [])
    .filter((c) => typeof c?.text === 'string')
    .map((c) => c.text as string).join('\n');
  if (fromOutput) return fromOutput;
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice) return choice;
  if (Array.isArray(data?.content)) {
    const t = data.content.filter((c) => c?.type === 'text' && typeof c?.text === 'string')
      .map((c) => c.text as string).join('\n');
    if (t) return t;
  }
  if (typeof data?.text === 'string' && data.text) return data.text;
  if (typeof data?.response === 'string' && data.response) return data.response;
  return '';
}

export async function POST(req: NextRequest) {
  // Point at a local signing proxy (e.g. zen-proxy on :6446) via ZEN_BASE_URL
  // to use free/contributor models; direct https://opencode.ai/zen/v1 stays
  // as fallback (paid keys only — free keys get FreeTierError there).
  const base = (process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
  const apiKey = process.env.OPENCODE_ZEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured (missing OPENCODE_ZEN_API_KEY)' }, { status: 500 });
  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });

  let system = '';
  try {
    system = await readFile(join(process.cwd(), 'BLENDER_AI_SYSTEM.md'), 'utf8');
  } catch {
    system = 'Generate Blender bpy scripts. Only create geometry, no export/render/quit calls.';
  }

  const model = process.env.OPENCODE_ZEN_MODEL || 'space-bunny-free';
  const useResponses = RESPONSES_PREFIX.some((p) => model.startsWith(p));
  const url = useResponses ? `${base}/responses` : `${base}/chat/completions`;
  const body = useResponses
    ? { model, instructions: system, input: messages.slice(-10), max_output_tokens: 8000 }
    : { model, messages: [{ role: 'system', content: system }, ...messages.slice(-10)], temperature: 0.4, max_tokens: 8000 };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    // ponytail: free keys die Zen-side (quota/policy) — say so, don't dump JSON.
    if (t.includes('FreeTierError'))
      return NextResponse.json({ error: 'Zen free quota exhausted for this key — run via local signing proxy (ZEN_BASE_URL) or add billing at opencode.ai/zen.' }, { status: 429 });
    return NextResponse.json({ error: `Zen error ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }
  const data = await res.json();
  const reply = extractReplyText(data);
  if (!reply) {
    const fr = data?.choices?.[0]?.finish_reason;
    console.log('[ai-chat] empty reply, finish_reason:', fr, 'keys:', Object.keys(data ?? {}));
    return NextResponse.json({ error: fr === 'length'
      ? 'AI spent its whole output budget thinking — try a shorter, simpler request.'
      : 'AI returned an empty response — try again or rephrase.' }, { status: 502 });
  }
  return NextResponse.json({ reply, script: extractPython(reply) });
}
