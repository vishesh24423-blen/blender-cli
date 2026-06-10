'use client';

import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useJob } from '@/hooks/useJob';
import { useRunner } from '@/hooks/useRunner';
import ThreeViewer from '@/components/ThreeViewer';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Clock, CheckCircle, Download, Sparkles, RefreshCw } from 'lucide-react';
import type { RunnerInfo } from '@/lib/types';

const STATUS_CONFIG: Record<string, { label: string }> = {
    queued: { label: 'QUEUED' },
    processing: { label: 'PROCESSING' },
    done: { label: 'COMPLETED' },
    failed: { label: 'FAILED' },
};

const RUNNER_WAKE_TIMEOUT = 120_000; // 2 minutes before showing error

function RunnerWakingState() {
    return (
        <div className="status-card">
            <div className="status-card-center">
                <div className="waking-animation">
                    <div className="waking-ring" />
                    <div className="waking-ring waking-ring--2" />
                    <div className="waking-ring waking-ring--3" />
                    <div className="waking-icon">
                        <Sparkles size={24} />
                    </div>
                </div>
                <p className="text-base font-medium">Waking up the runner...</p>
                <p className="text-sm text-white/40 text-center max-w-sm">
                    A GitHub Actions runner is being started. This takes about 30-60 seconds.
                </p>
            </div>
        </div>
    );
}

function RunnerStartingState() {
    return (
        <div className="status-card">
            <div className="status-card-center">
                <div className="processing-spinner" />
                <p className="text-base font-medium">Runner is starting up...</p>
                <p className="text-sm text-white/40 text-center max-w-sm">
                    Installing Blender and initializing the environment. Almost ready.
                </p>
            </div>
        </div>
    );
}

function QueuedState({ queuePosition, runner }: { queuePosition: number | null; runner: RunnerInfo | null }) {
    return (
        <div className="status-card">
            {queuePosition !== null && (
                <div className="queue-position-card">
                    <div className="queue-pos-left">
                        <div className="queue-pos-icon">
                            <Clock size={18} />
                        </div>
                        <div className="queue-pos-info">
                            <span className="queue-pos-label">Queue Position</span>
                            <span className="queue-pos-number">#{queuePosition}</span>
                        </div>
                    </div>
                    <div className="queue-pos-bar">
                        <div className="queue-bar-fill" style={{ width: `${Math.max(10, 100 - (queuePosition - 1) * 30)}%` }} />
                    </div>
                </div>
            )}

            {runner && (runner.status === 'ready' || runner.status === 'active') && (
                <div className="banner banner--active">
                    <span className="banner-dot" />
                    <span>Runner is {runner.status === 'active' ? 'processing' : 'ready'} — your job will be picked up shortly</span>
                </div>
            )}
        </div>
    );
}

function ProcessingState() {
    return (
        <div className="status-card">
            <div className="status-card-center">
                <div className="processing-spinner" />
                <p className="text-base font-medium">Blender is running your script...</p>
                <p className="text-sm text-white/40 text-center max-w-sm">
                    This usually takes 30 seconds to a few minutes depending on complexity
                </p>
                <div className="progress-bar">
                    <div className="progress-bar-fill" />
                </div>
            </div>
        </div>
    );
}

function DoneState({ job }: { job: any }) {
    const viewerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setTimeout(() => {
            viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }, []);

    const outputFormats = ['glb', 'fbx', 'stl', 'usd'] as const;

    return (
        <div>
            <div className="success-banner">
                <CheckCircle size={20} />
                <span>Your 3D asset is ready!</span>
            </div>

            {job.outputs?.glb && (
                <div ref={viewerRef}>
                    <ThreeViewer
                        glbUrl={job.outputs.glb.url}
                        previewUrl={job.outputs.preview}
                        className="viewer-3d"
                    />
                </div>
            )}

            <div className="downloads-section">
                <h3 className="downloads-title">Downloads</h3>
                <div className="downloads-grid">
                    {outputFormats.map((fmt) => {
                        const file = job.outputs?.[fmt];
                        if (!file) return null;
                        return (
                            <a key={fmt} href={file.url} download className="download-card">
                                <div className="download-card-icon">
                                    <Download size={16} />
                                </div>
                                <div className="download-card-info">
                                    <span className="download-card-format">.{fmt.toUpperCase()}</span>
                                    <span className="download-card-size">
                                        {file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
                                    </span>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function FailedState({ job, onRetry }: { job: any; onRetry: () => void }) {
    return (
        <div className="status-card">
            <div className="error-section">
                <div className="error-header">
                    <AlertTriangle size={20} color="var(--accent-red)" />
                    <span className="error-title">Job Failed</span>
                </div>
                {job.error && <div className="error-message">{job.error}</div>}
                <button className="retry-button" onClick={onRetry}>
                    <RefreshCw size={14} />
                    Try Again
                </button>
            </div>
        </div>
    );
}

function RunnerTimeoutState() {
    return (
        <div className="status-card">
            <div className="status-card-center gap-3">
                <AlertTriangle size={28} color="var(--accent-amber)" />
                <p className="text-base font-medium">Runner is taking longer than expected</p>
                <p className="text-sm text-white/40 text-center max-w-sm">
                    The GitHub Actions runner may still be starting up. Your job is queued and will process automatically once the runner connects.
                </p>
                <Link href="/" className="retry-button">
                    <ArrowLeft size={14} />
                    Back to home
                </Link>
            </div>
        </div>
    );
}

function RunnerErrorState() {
    return (
        <div className="status-card">
            <div className="status-card-center gap-3">
                <AlertTriangle size={28} color="var(--accent-red)" />
                <p className="text-base font-medium">Runner failed to start</p>
                <p className="text-sm text-white/40 text-center max-w-sm">
                    The GitHub Actions runner could not be started. Make sure the repository has Actions enabled and the required secrets are configured.
                </p>
                <Link href="/" className="retry-button">
                    <ArrowLeft size={14} />
                    Back to home
                </Link>
            </div>
        </div>
    );
}

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = use(params);
    const router = useRouter();
    const { job, loading, error } = useJob(jobId);
    const { runner } = useRunner();
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const [wakeTimeout, setWakeTimeout] = useState(false);
    const wakeTimerRef = useRef<NodeJS.Timeout | null>(null);

    const isQueued = job?.status === 'queued';

    // Queue position polling
    useEffect(() => {
        if (!isQueued) {
            setQueuePosition(null);
            return;
        }

        const fetchPosition = async () => {
            try {
                const q = query(
                    collection(db, 'jobs'),
                    where('status', '==', 'queued'),
                    orderBy('createdAt', 'asc')
                );
                const snap = await getDocs(q);
                const position = snap.docs.findIndex((d) => d.id === jobId) + 1;
                setQueuePosition(position > 0 ? position : null);
            } catch {
                setQueuePosition(null);
            }
        };

        fetchPosition();
        const interval = setInterval(fetchPosition, 5000);
        return () => clearInterval(interval);
    }, [isQueued, jobId]);

    // Timeout for waking state
    useEffect(() => {
        if (!isQueued) {
            setWakeTimeout(false);
            if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
            return;
        }

        const isWaking = !runner || runner.status === 'inactive' || runner.status === 'starting';
        if (!isWaking) {
            setWakeTimeout(false);
            if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
            return;
        }

        wakeTimerRef.current = setTimeout(() => {
            setWakeTimeout(true);
        }, RUNNER_WAKE_TIMEOUT);

        return () => {
            if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
        };
    }, [isQueued, runner?.status]);

    // If runner finally becomes ready/active, clear timeout
    useEffect(() => {
        if (runner && (runner.status === 'ready' || runner.status === 'active')) {
            setWakeTimeout(false);
            if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
        }
    }, [runner?.status]);

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
                    <div className="status-card-center gap-3">
                        <AlertTriangle size={36} color="var(--accent-red)" />
                        <p className="text-base font-medium">{error || 'Job not found'}</p>
                        <Link href="/" className="retry-button">
                            <ArrowLeft size={14} /> Go back
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const status = STATUS_CONFIG[job.status] || STATUS_CONFIG.failed;

    const getStatusBadgeClass = () => {
        switch (job.status) {
            case 'done': return 'badge badge--done';
            case 'processing': return 'badge badge--processing';
            case 'queued': return 'badge badge--queued';
            case 'failed': return 'badge badge--failed';
            default: return 'badge';
        }
    };

    const getStatusDotClass = () => {
        switch (job.status) {
            case 'done': return 'dot dot--done';
            case 'processing': return 'dot dot--processing';
            case 'queued': return 'dot dot--queued';
            case 'failed': return 'dot dot--failed';
            default: return 'dot';
        }
    };

    const isWaking = isQueued && (!runner || runner.status === 'inactive');
    const isStarting = isQueued && runner?.status === 'starting';
    const isReallyQueued = isQueued && runner && (runner.status === 'ready' || runner.status === 'active');

    return (
        <div className="page-root">
            <div className="page-container">
                <Link href="/" className="back-link">
                    <ArrowLeft size={16} /> Back to home
                </Link>

                {/* Job Header */}
                <div className="job-header">
                    <div className="job-header-top">
                        <h1 className="job-title">Job Status</h1>
                        <span className={getStatusBadgeClass()}>
                            <span className={getStatusDotClass()} />
                            {status.label}
                        </span>
                    </div>
                    <p className="job-id">{jobId}</p>
                    <div className="job-actions">
                        <button
                            onClick={() => {
                                localStorage.setItem('bl_prefill_script', job.script || '')
                                window.location.href = '/'
                            }}
                            className="btn-ghost"
                        >
                            ↺ Regenerate
                        </button>
                    </div>
                </div>

                {/* Status Content */}
                {job.status === 'queued' && wakeTimeout && <RunnerTimeoutState />}
                {job.status === 'queued' && !wakeTimeout && isWaking && <RunnerWakingState />}
                {job.status === 'queued' && !wakeTimeout && isStarting && <RunnerStartingState />}
                {job.status === 'queued' && !wakeTimeout && isReallyQueued && (
                    <QueuedState queuePosition={queuePosition} runner={runner} />
                )}

                {job.status === 'processing' && <ProcessingState />}
                {job.status === 'done' && <DoneState job={job} />}
                {job.status === 'failed' && <FailedState job={job} onRetry={handleRetry} />}

                {/* Script Preview */}
                <div className="script-preview">
                    <div className="script-preview-header">
                        <span className="script-preview-label">script.py</span>
                        <span className="script-preview-meta">
                            {job.quality && <span className="capitalize">{job.quality}</span>}
                            {' · '}
                            {job.formats.map((f) => `.${f}`).join(', ')}
                        </span>
                    </div>
                    <pre className="script-preview-code">{job.script}</pre>
                </div>
            </div>
        </div>
    );
}
