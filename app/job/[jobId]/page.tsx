'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useJob } from '@/hooks/useJob';
import { useRunner } from '@/hooks/useRunner';
import { useCountdown } from '@/hooks/useCountdown';
import QueuePosition from '@/components/QueuePosition';
import FileDownloadCard from '@/components/FileDownloadCard';
import ThreeViewer from '@/components/ThreeViewer';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import type { OutputFormat, QualityPreset } from '@/lib/types';

const QUALITY_LABELS: Record<QualityPreset, string> = {
    draft: 'Draft',
    standard: 'Standard',
    cinematic: 'Cinematic',
};

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
        <div className="job-page">
            <Link href="/" className="back-link">
                <ArrowLeft size={16} /> Back to home
            </Link>

            {/* Header */}
            <div className="job-page-header">
                <p className="job-id">{jobId}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h1 className="job-title">Job Status</h1>
                    <span className={`status-badge ${status.badgeClass}`}>
                        <span className={`status-dot ${status.dotClass}`} />
                        {status.label}
                    </span>
                    {job.quality && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 12px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--primary-dim)',
                            fontSize: '12px',
                            color: 'var(--primary)',
                            fontWeight: 500,
                        }}>
                            ✦ {QUALITY_LABELS[job.quality]}
                        </span>
                    )}
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
                <div className="downloads-section">
                    {/* 3D Viewer — hero position */}
                    {job.outputs?.glb && (
                        <div style={{ marginBottom: '28px' }}>
                            <ThreeViewer
                                glbUrl={job.outputs.glb.url}
                                posterUrl={job.outputs.preview?.url}
                                className="h-[500px]"
                            />
                        </div>
                    )}

                    {/* Download section */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <h2 className="downloads-title">Download Files</h2>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 12px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-amber-dim)',
                            fontSize: '12px',
                            color: 'var(--accent-amber)',
                        }}>
                            <AlertTriangle size={11} />
                            Expires in 24 hours
                        </div>
                    </div>

                    <div className="downloads-grid">
                        {job.outputs &&
                            (Object.entries(job.outputs) as [string, { url: string; size?: number }][]).filter(
                                ([format]) => format !== 'preview'
                            ).map(([format, file]) => (
                                <FileDownloadCard
                                    key={format}
                                    format={format as OutputFormat}
                                    url={file.url}
                                    size={file.size || 0}
                                />
                            ))}
                    </div>

                    {/* Regenerate */}
                    <div style={{ marginTop: '28px', textAlign: 'center' }}>
                        <button
                            onClick={() => {
                                sessionStorage.setItem('blenderlab_regenerate', JSON.stringify({
                                    script: job.script,
                                    formats: job.formats,
                                    quality: job.quality || 'standard',
                                }));
                                router.push('/');
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 24px',
                                borderRadius: 'var(--radius-full)',
                                background: 'transparent',
                                border: '1px solid var(--ghost-border)',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                            }}
                        >
                            <Sparkles size={15} />
                            Regenerate with Same Settings
                        </button>
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
            <div className="script-preview">
                <div className="script-preview-header">
                    <span className="script-preview-label">script.py</span>
                    <span className="script-preview-label">
                        {job.formats.map((f) => `.${f}`).join(', ')}
                    </span>
                </div>
                <pre className="script-preview-code">{job.script}</pre>
            </div>
        </div>
    );
}
