'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Sparkles, AlertTriangle } from 'lucide-react';
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

type SubmitPhase = 'idle' | 'submitting' | 'waking-runner' | 'redirecting';

export default function ScriptSubmitForm() {
    const router = useRouter();
    const [script, setScript] = useState('');
    const [formats, setFormats] = useState<OutputFormat[]>(['glb']);
    const [quality, setQuality] = useState<'draft' | 'standard' | 'cinematic'>('standard');
    const [phase, setPhase] = useState<SubmitPhase>('idle');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const prefill = localStorage.getItem('bl_prefill_script')
        if (prefill) {
            setScript(prefill)
            localStorage.removeItem('bl_prefill_script')
        }
        
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

        setPhase('submitting');
        setError(null);

        try {
            const res = await fetch('/api/submit-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: scriptContent, formats, quality }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit job');

            if (data.runnerStatus === 'error') {
                setPhase('idle');
                setError('Runner failed to start. Check GitHub Actions configuration.');
                return;
            }

            if (data.runnerStatus === 'starting') {
                setPhase('waking-runner');
                await new Promise(r => setTimeout(r, 1500));
            }

            setPhase('redirecting');
            router.push(`/job/${data.jobId}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setPhase('idle');
        }
    };

    const isBusy = phase !== 'idle';

    return (
        <div className="submit-form">
            {/* Quality Preset Selector */}
            <div className="quality-selector">
                <p className="section-label">Quality</p>
                <div className="quality-options">
                    {(['draft', 'standard', 'cinematic'] as const).map((q) => (
                        <button
                            key={q}
                            type="button"
                            onClick={() => setQuality(q)}
                            className={`quality-chip ${quality === q ? 'quality-chip--active' : ''}`}
                        >
                            {q === 'draft'     && '⚡'}
                            {q === 'standard'  && '✦'}
                            {q === 'cinematic' && '◈'}
                            {' '}
                            {q.charAt(0).toUpperCase() + q.slice(1)}
                        </button>
                    ))}
                </div>
                <p className="quality-hint">
                    {quality === 'draft'     && 'Fast render, basic lighting · ~30s'}
                    {quality === 'standard'  && 'HDRI + PBR clearcoat + bloom · ~90s'}
                    {quality === 'cinematic' && '4K + DOF + volumetric · ~4min'}
                </p>
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
                <label className="section-label">Output Formats</label>
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
            {error && (
                <div className="submit-error">
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            {/* Submit Button */}
            <button
                id="submit-job-button"
                className="submit-button"
                onClick={handleSubmit}
                disabled={isBusy}
            >
                {phase === 'submitting' && (
                    <><span className="submit-spinner" /> Submitting...</>
                )}
                {phase === 'waking-runner' && (
                    <><span className="submit-spinner" /> Waking runner...</>
                )}
                {phase === 'redirecting' && (
                    <><span className="submit-spinner" /> Opening job page...</>
                )}
                {phase === 'idle' && (
                    <><Sparkles size={16} /> Generate 3D Assets</>
                )}
            </button>

            {phase === 'waking-runner' && (
                <div className="runner-waking-banner">
                    <div className="runner-waking-dots">
                        <span className="waking-dot" />
                        <span className="waking-dot waking-dot--delay1" />
                        <span className="waking-dot waking-dot--delay2" />
                    </div>
                    <span>Starting GitHub Actions runner... redirecting to job page.</span>
                </div>
            )}
        </div>
    );
}
