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
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import type { OutputFormat } from '@/lib/types';

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = use(params);
    const router = useRouter();
    const { job, loading, error } = useJob(jobId);
    const { runner } = useRunner();
    const nextRunCountdown = useCountdown(runner?.nextRunAt);
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const isQueued = job?.status === 'queued';

    // ✅ FIXED: moved out of render body into useEffect
    useEffect(() => {
        if (!isQueued) {
            setQueuePosition(null);
        }
    }, [isQueued]);

    // Calculate queue position
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

    const handleRetry = () => {
        router.push('/');
    };

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
                        <AlertTriangle size={40} color="var(--accent-red)" />
                        <p className="processing-text">{error || 'Job not found'}</p>
                        <Link href="/" className="retry-button">
                            <ArrowLeft size={16} /> Go back
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="job-page">
            <Link href="/" className="back-link">
                <ArrowLeft size={16} /> Back to home
            </Link>

            <div className="job-page-header">
                <p className="job-id">Job ID: {jobId}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <h1 className="job-title">Job Status</h1>
                    <span className={`status-badge status-badge--${job.status}`}>
                        {job.status.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* ─── Queued ─── */}
            {job.status === 'queued' && (
                <div className="status-card glow-purple">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {queuePosition !== null && <QueuePosition position={queuePosition} />}

                        {runner && runner.status === 'inactive' && (
                            <div style={{
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--accent-yellow-dim)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                                ⏳ Runner is idle
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                    Next activation in: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                        {nextRunCountdown.formatted}
                                    </strong>
                                </span>
                            </div>
                        )}

                        {runner && runner.status === 'active' && (
                            <div style={{
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--accent-green-dim)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                            }}>
                                <span style={{ fontSize: '14px', color: 'var(--accent-green)' }}>
                                    🟢 Runner is active — your job will be picked up shortly
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
                    <h2 className="downloads-title">Your 3D Models are Ready</h2>
                    <div className="downloads-expiry-warning">
                        <AlertTriangle size={14} />
                        Files expire in 24 hours
                    </div>
                    <div className="downloads-grid">
                        {job.outputs &&
                            Object.entries(job.outputs).map(([format, file]) => (
                                <FileDownloadCard
                                    key={format}
                                    format={format as OutputFormat}
                                    url={file.url}
                                    size={file.size}
                                />
                            ))}
                    </div>
                </div>
            )}

            {/* ─── Failed ─── */}
            {job.status === 'failed' && (
                <div className="status-card">
                    <div className="error-section">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <AlertTriangle size={24} color="var(--accent-red)" />
                            <span style={{ fontSize: '16px', fontWeight: 600 }}>Job Failed</span>
                        </div>
                        {job.error && <div className="error-message">{job.error}</div>}
                        <button className="retry-button" onClick={handleRetry}>
                            <RefreshCw size={16} />
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
