import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractScript as extractPython } from '@/lib/script-extract';

// Zen routes models to different OpenAI-compatible endpoints:
// chat/completions (kimi, deepseek, glm, ...) vs responses (gpt-*, muse-spark-*, grok-*).
const RESPONSES_PREFIX = ['gpt-', 'muse-spark', 'grok-'];

// ponytail: Responses API shape only; add streaming when users ask.
type RespBlock = { content?: { text?: unknown }[] };
function extractResponsesText(data: { output_text?: unknown; output?: RespBlock[] }): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const out = Array.isArray(data?.output) ? data.output : [];
  return out.flatMap((b) => Array.isArray(b?.content) ? b.content : [])
    .filter((c) => typeof c?.text === 'string')
    .map((c) => c.text as string).join('\n');
}

export async function POST(req: NextRequest) {
  const provider = process.env.AI_PROVIDER || 'zen';
  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });

  let system = '';
  try {
    system = await readFile(join(process.cwd(), 'BLENDER_AI_SYSTEM.md'), 'utf8');
  } catch {
    system = 'Generate Blender bpy scripts. Only create geometry, no export/render/quit calls.';
  }

  let url: string;
  let apiKey: string | undefined;
  let model: string;
  let body: unknown;
  let useResponses = false;

  if (provider === 'groq') {
    // OpenAI-compatible: https://api.groq.com/openai/v1/chat/completions
    apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured (missing GROQ_API_KEY)' }, { status: 500 });
    model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    url = 'https://api.groq.com/openai/v1/chat/completions';
    body = { model, messages: [{ role: 'system', content: system }, ...messages.slice(-10)], temperature: 0.4, max_tokens: 4000 };
  } else {
    apiKey = process.env.OPENCODE_ZEN_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI not configured (missing OPENCODE_ZEN_API_KEY)' }, { status: 500 });
    model = process.env.OPENCODE_ZEN_MODEL || 'space-bunny-free';
    useResponses = RESPONSES_PREFIX.some((p) => model.startsWith(p));
    url = useResponses
      ? 'https://opencode.ai/zen/v1/responses'
      : 'https://opencode.ai/zen/v1/chat/completions';
    body = useResponses
      ? { model, instructions: system, input: messages.slice(-10), max_output_tokens: 4000 }
      : { model, messages: [{ role: 'system', content: system }, ...messages.slice(-10)], temperature: 0.4, max_tokens: 4000 };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    // ponytail: free keys die provider-side (quota/policy) — say so, don't dump JSON.
    if (t.includes('FreeTierError'))
      return NextResponse.json({ error: 'Zen free quota exhausted for this key — add billing at opencode.ai/zen or try again later.' }, { status: 429 });
    if (provider === 'groq' && res.status === 429)
      return NextResponse.json({ error: 'Groq rate limit hit — try again in a minute.' }, { status: 429 });
    const label = provider === 'groq' ? 'Groq' : 'Zen';
    return NextResponse.json({ error: `${label} error ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }
  const data = await res.json();
  const reply: string = useResponses ? extractResponsesText(data) : (data.choices?.[0]?.message?.content ?? '');
  return NextResponse.json({ reply, script: extractPython(reply) });
}
