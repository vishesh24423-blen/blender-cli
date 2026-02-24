'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import type { OutputFormat } from '@/lib/types';

const FORMATS: { id: OutputFormat; label: string }[] = [
    { id: 'glb', label: 'GLB' },
    { id: 'fbx', label: 'FBX' },
    { id: 'stl', label: 'STL' },
    { id: 'obj', label: 'OBJ' },
    { id: 'usd', label: 'USD' },
];

const SAMPLE_SCRIPT = `import bpy

# Clear default objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
bpy.context.object.name = "MyCube"

# Add a smooth modifier
bpy.ops.object.modifier_add(type='SUBSURF')
bpy.context.object.modifiers["Subdivision"].levels = 2

# Set smooth shading
bpy.ops.object.shade_smooth()`;

export default function ScriptSubmitForm() {
    const router = useRouter();
    const [script, setScript] = useState('');
    const [formats, setFormats] = useState<OutputFormat[]>(['glb']);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleFormat = (format: OutputFormat) => {
        setFormats((prev) =>
            prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
        );
    };

    const handleSubmit = async () => {
        const scriptContent = script.trim() || SAMPLE_SCRIPT;
        if (formats.length === 0) {
            setError('Select at least one output format');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/submit-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: scriptContent, formats }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit job');

            router.push(`/job/${data.jobId}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setSubmitting(false);
        }
    };

    return (
        <div className="submit-form">
            {/* Code Editor */}
            <div className="editor-wrapper">
                <div className="editor-header">
                    <div className="editor-dots">
                        <span className="editor-dot editor-dot--red" />
                        <span className="editor-dot editor-dot--yellow" />
                        <span className="editor-dot editor-dot--green" />
                    </div>
                    <span className="editor-filename">script.py</span>
                </div>
                <textarea
                    id="script-editor"
                    className="editor-textarea"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder={SAMPLE_SCRIPT}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            </div>

            {/* Format Selector */}
            <div className="format-selector">
                <label className="format-label">Output Formats</label>
                <div className="format-options">
                    {FORMATS.map((f) => {
                        const selected = formats.includes(f.id);
                        return (
                            <button
                                key={f.id}
                                type="button"
                                className={`format-chip ${selected ? 'format-chip--selected' : ''}`}
                                onClick={() => toggleFormat(f.id)}
                            >
                                {selected && <Check size={14} />}
                                .{f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="submit-error">
                    {error}
                </div>
            )}

            {/* Submit */}
            <button
                id="submit-job-button"
                className="submit-button"
                onClick={handleSubmit}
                disabled={submitting}
            >
                {submitting ? (
                    <>
                        <span className="submit-spinner" />
                        Submitting...
                    </>
                ) : (
                    <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                        </svg>
                        Generate 3D Assets
                    </>
                )}
            </button>
        </div>
    );
}
