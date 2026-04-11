'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import type { OutputFormat, QualityPreset } from '@/lib/types';

const FORMATS: { id: OutputFormat; label: string }[] = [
    { id: 'glb', label: 'GLB' },
    { id: 'fbx', label: 'FBX' },
    { id: 'stl', label: 'STL' },
    { id: 'obj', label: 'OBJ' },
    { id: 'usd', label: 'USD' },
];

const QUALITY_PRESETS: { id: QualityPreset; label: string; description: string }[] = [
    { id: 'draft', label: 'Draft', description: 'Fast, basic lighting — skips upgrades' },
    { id: 'standard', label: 'Standard', description: 'HDRI + PBR clearcoat + bloom (default)' },
    { id: 'cinematic', label: 'Cinematic', description: 'Standard + stronger bloom + 4K render' },
];

const SAMPLE_SCRIPT = `import bpy

# Create a cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "MyCube"

# Subdivide for smoother appearance
bpy.context.object.modifiers.new("Subdivision", 'SUBSURF')
bpy.context.object.modifiers["Subdivision"].levels = 2

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
    const [quality, setQuality] = useState<QualityPreset>('standard');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [qualityOpen, setQualityOpen] = useState(false);

    useEffect(() => {
        try {
            const data = sessionStorage.getItem('blenderlab_regenerate');
            if (data) {
                const { script: savedScript, formats: savedFormats, quality: savedQuality } = JSON.parse(data);
                setScript(savedScript);
                setFormats(savedFormats);
                if (savedQuality) setQuality(savedQuality);
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
                body: JSON.stringify({ script: scriptContent, formats, quality }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit job');

            router.push(`/job/${data.jobId}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setSubmitting(false);
        }
    };

    const selectedQuality = QUALITY_PRESETS.find(q => q.id === quality);

    return (
        <div className="submit-form">
            {/* Quality Preset Selector */}
            <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Quality Preset
                </label>
                <button
                    type="button"
                    onClick={() => setQualityOpen(!qualityOpen)}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-container)',
                        border: '1px solid var(--ghost-border)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '13px',
                    }}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--primary)' }}>✦</span>
                        <span>{selectedQuality?.label}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>— {selectedQuality?.description}</span>
                    </span>
                    <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: qualityOpen ? 'rotate(180deg)' : 'none', color: 'var(--text-muted)' }} />
                </button>

                {qualityOpen && (
                    <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        padding: '6px',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-high)',
                        border: '1px solid var(--ghost-border)',
                        backdropFilter: 'blur(12px)',
                        zIndex: 20,
                    }}>
                        {QUALITY_PRESETS.map((q) => (
                            <button
                                key={q.id}
                                type="button"
                                onClick={() => { setQuality(q.id); setQualityOpen(false); }}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: quality === q.id ? 'var(--primary-dim)' : 'transparent',
                                    border: 'none',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500 }}>{q.label}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{q.description}</div>
                                </div>
                                {quality === q.id && <Check size={14} color="var(--primary)" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>

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
