'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';
import type { OutputFormat } from '@/lib/types';

const FORMATS: { id: OutputFormat; label: string }[] = [
    { id: 'glb', label: 'GLB' },
    { id: 'fbx', label: 'FBX' },
    { id: 'stl', label: 'STL' },
    { id: 'usd', label: 'USD' },
];

const SAMPLE_SCRIPT = `import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

# Subdivide for smoother appearance
modifier = cube.modifiers.new("Subdivision", 'SUBSURF')
modifier.levels = 2

# Apply smooth shading
bpy.ops.object.shade_smooth()

# Add a simple material
mat = bpy.data.materials.new("CubeMaterial")
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.1, 0.5, 0.9, 1.0)
bsdf.inputs['Roughness'].default_value = 0.5
cube.data.materials.append(mat)
`;

export default function ScriptSubmitForm() {
    const router = useRouter();
    const [script, setScript] = useState('');
    const [formats, setFormats] = useState<OutputFormat[]>(['glb']);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const data = sessionStorage.getItem('blenderlab_regenerate');
            if (data) {
                const { script: savedScript, formats: savedFormats } = JSON.parse(data);
                setScript(savedScript);
                setFormats(savedFormats);
                sessionStorage.removeItem('blenderlab_regenerate');
            }
        } catch { /* ignore */ }
    }, []);

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
                                {selected && <Check size={13} />}
                                .{f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Error */}
            {error && <div className="submit-error">{error}</div>}

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
                        <Sparkles size={16} />
                        Generate 3D Assets
                    </>
                )}
            </button>
        </div>
    );
}
