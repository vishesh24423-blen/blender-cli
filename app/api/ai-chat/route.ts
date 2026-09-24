import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { extractScript as extractPython } from '@/lib/script-extract';

// Groq retired llama-3.3-70b-versatile (Aug 2026); gpt-oss-120b is the live default.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured (missing GROQ_API_KEY)' }, { status: 500 });
  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });

  let system = '';
  try {
    system = await readFile(join(process.cwd(), 'BLENDER_AI_SYSTEM.md'), 'utf8');
  } catch {
    system = 'Generate Blender bpy scripts. Only create geometry, no export/render/quit calls.';
  }

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages.slice(-10)],
      temperature: 0.4,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429)
      return NextResponse.json({ error: 'Groq rate limit hit — try again in a minute.' }, { status: 429 });
    return NextResponse.json({ error: `Groq error ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }
  const data = await res.json();
  const reply: string = data.choices?.[0]?.message?.content ?? '';
  if (!reply) {
    const fr = data?.choices?.[0]?.finish_reason;
    console.log('[ai-chat] empty reply, finish_reason:', fr, 'keys:', Object.keys(data ?? {}));
    return NextResponse.json({ error: fr === 'length'
      ? 'AI spent its whole output budget thinking — try a shorter, simpler request.'
      : 'AI returned an empty response — try again or rephrase.' }, { status: 502 });
  }
  return NextResponse.json({ reply, script: extractPython(reply) });
}
