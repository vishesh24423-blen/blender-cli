// Extract runnable Blender Python from chatty LLM output.
// Prefers the longest fenced block containing bpy; salvages fence-less
// output by slicing from the first import; trims trailing prose so a
// stray English sentence can never become a Blender SyntaxError.
export function extractScript(text: string): string | null {
  if (!text) return null;
  const blocks = [...text.matchAll(/```(?:python|py)?\s*([\s\S]*?)```/gi)]
    .map((m) => m[1].trim())
    .filter((b) => /bpy|bmesh/.test(b));
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];

  const start = text.search(/^\s*(import bpy|from bpy|import bmesh)/m);
  if (start < 0) return null;
  const lines = text.slice(start).split('\n');
  let end = lines.length;
  while (end > 0 && isProse(lines[end - 1])) end--;
  const code = lines.slice(0, end).join('\n').trim();
  return /bpy|bmesh/.test(code) ? code : null;
}

// ponytail: naive prose sniff — no code punctuation but reads like a sentence.
function isProse(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('#')) return false;
  return !/[=(){}\[\].:#'"_@]/.test(t) && (/\s/.test(t) || /[.!?]$/.test(t));
}
