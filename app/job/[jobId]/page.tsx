'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useJob } from '@/hooks/useJob';
import { useRunner } from '@/hooks/useRunner';
import { useCountdown } from '@/hooks/useCountdown';
import QueuePosition from '@/components/QueuePosition';
import ThreeViewer from '@/components/ThreeViewer';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import type { OutputFormat } from '@/lib/types';

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
    queued: { label: 'QUEUED', dotClass: 'status-dot--queued', badgeClass: 'status-badge--queued' },
    processing: { label: 'PROCESSING', dotClass: 'status-dot--processing', badgeClass: 'status-badge--processing' },
    done: { label: 'COMPLETED', dotClass: 'status-dot--done', badgeClass: 'status-badge--done' },
    failed: { label: 'FAILED', dotClass: 'status-dot--failed', badgeClass: 'status-badge--failed' },
};

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = use(params);
    const router = useRouter();
    const { job, loading, error } = useJob(jobId);
    const { runner } = useRunner();
    const nextRunCountdown = useCountdown(runner?.nextRunAt);
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const isQueued = job?.status === 'queued';

    useEffect(() => {
        if (!isQueued) return;

        const fetchPosition = async () => {
            try {
                const q = query(
                    collection(db, 'jobs'),
                    where('status', '==', 'queued'),
                    orderBy('createdAt', 'asc')
                );
                const snap = await getDocs(q);
                const position = snap.docs.findIndex((d) => d.id === jobId) + 1;
                setQueuePosition(position > 0 ? position : 1);
            } catch {
                setQueuePosition(null);
            }
        };

        fetchPosition();
        const interval = setInterval(fetchPosition, 10000);
        return () => clearInterval(interval);
    }, [isQueued, jobId]);

    const handleRetry = () => router.push('/');

    if (loading) {
        return (
            <div className="loading-page">
                <div className="loading-spinner-lg" />
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="job-page">
                <Link href="/" className="back-link">
                    <ArrowLeft size={16} /> Back to home
                </Link>
                <div className="status-card">
                    <div className="status-card-center">
                        <AlertTriangle size={36} color="var(--accent-red)" />
                        <p className="processing-text">{error || 'Job not found'}</p>
                        <Link href="/" className="retry-button">
                            <ArrowLeft size={14} /> Go back
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const status = STATUS_CONFIG[job.status] || STATUS_CONFIG.failed;

    return (
        <div className="min-h-screen bg-[#0a0b0f] text-white">
            <div className="job-page max-w-5xl mx-auto px-4 py-8">
            <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6">
                <ArrowLeft size={16} /> Back to home
            </Link>

            {/* Header */}
            <div className="mb-8">
                <p className="text-white/40 text-sm mb-2">{jobId}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h1 className="text-3xl font-bold">Job Status</h1>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        job.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' :
                        job.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                        job.status === 'queued' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                            job.status === 'done' ? 'bg-emerald-400' :
                            job.status === 'processing' ? 'bg-yellow-400 animate-pulse' :
                            job.status === 'queued' ? 'bg-blue-400 animate-pulse' :
                            'bg-red-400'
                        }`} />
                        {status.label}
                    </span>
                    <button
                        onClick={() => {
                            if (typeof window !== 'undefined') {
                                localStorage.setItem('bl_prefill_script', job.script || '')
                                window.location.href = '/'
                            }
                        }}
                        className="px-4 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                    >
                        ↺ Regenerate
                    </button>
                </div>
            </div>

            {/* ─── Queued ─── */}
            {job.status === 'queued' && (
                <div className="status-card glow-purple">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {queuePosition !== null && <QueuePosition position={queuePosition} />}

                        {runner && runner.status === 'inactive' && (
                            <div style={{
                                padding: '14px 18px',
                                borderRadius: 'var(--radius)',
                                background: 'var(--accent-amber-dim)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}>
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>⏳ Runner is idle</span>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                    Next activation in: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                        {nextRunCountdown.formatted}
                                    </strong>
                                </span>
                            </div>
                        )}

                        {runner && runner.status === 'active' && (
                            <div style={{
                                padding: '14px 18px',
                                borderRadius: 'var(--radius)',
                                background: 'var(--accent-green-dim)',
                            }}>
                                <span style={{ fontSize: '14px', color: 'var(--accent-green)' }}>
                                    Runner is active — your job will be picked up shortly
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Processing ─── */}
            {job.status === 'processing' && (
                <div className="status-card glow-purple">
                    <div className="status-card-center">
                        <div className="processing-spinner" />
                        <p className="processing-text">Blender is running your script...</p>
                        <p className="processing-sub">
                            This usually takes 30 seconds to a few minutes depending on complexity
                        </p>
                    </div>
                </div>
            )}

            {/* ─── Done ─── */}
            {job.status === 'done' && (
                <div>
                    {/* 3D Viewer — full width hero */}
                    {job.outputs?.glb && (
                        <ThreeViewer
                            glbUrl={job.outputs.glb.url}
                            previewUrl={job.outputs.preview}
                            className="w-full h-[560px] mb-6"
                        />
                    )}

                    {/* Download buttons below viewer */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {job.outputs?.glb && (
                            <a href={job.outputs.glb.url} download
                                className="px-4 py-2 rounded-full text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors">
                                ↓ GLB
                            </a>
                        )}
                        {job.outputs?.fbx && (
                            <a href={job.outputs.fbx.url} download
                                className="px-4 py-2 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors">
                                ↓ FBX
                            </a>
                        )}
                        {job.outputs?.stl && (
                            <a href={job.outputs.stl.url} download
                                className="px-4 py-2 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors">
                                ↓ STL
                            </a>
                        )}
                        {job.outputs?.usd && (
                            <a href={job.outputs.usd.url} download
                                className="px-4 py-2 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors">
                                ↓ USD
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Failed ─── */}
            {job.status === 'failed' && (
                <div className="status-card">
                    <div className="error-section">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <AlertTriangle size={20} color="var(--accent-red)" />
                            <span style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>Job Failed</span>
                        </div>
                        {job.error && <div className="error-message">{job.error}</div>}
                        <button className="retry-button" onClick={handleRetry}>
                            <RefreshCw size={14} />
                            Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Script Preview ─── */}
            <div className="bg-white/5 rounded-xl p-4 mt-8">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-white/60 text-sm">script.py</span>
                    <span className="text-white/40 text-xs">
                        {job.formats.map((f) => `.${f}`).join(', ')}
                    </span>
                </div>
                <pre className="text-white/80 text-sm overflow-x-auto">{job.script}</pre>
            </div>
        </div>
        </div>
    );
}
