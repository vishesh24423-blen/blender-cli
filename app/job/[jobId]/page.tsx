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

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
    queued: { label: 'QUEUED', dotClass: 'status-dot--queued', badgeClass: 'status-badge--queued' },
    processing: { label: 'PROCESSING', dotClass: 'status-dot--processing', badgeClass: 'status-badge--processing' },
    done: { label: 'COMPLETED', dotClass: 'status-dot--done', badgeClass: 'status-badge--done' },
    failed: { label: 'FAILED', dotClass: 'status-dot--failed', badgeClass: 'status-badge--failed' },
};

interface JobPageProps {
    params: Promise<{ jobId: string }>;
}

function RunnerWakingState() {
    return (
        <div className="status-card glow-purple">
            <div className="status-card-center">
                <div className="waking-animation">
                    <div className="waking-ring" />
                    <div className="waking-ring waking-ring--2" />
                    <div className="waking-ring waking-ring--3" />
                    <div className="waking-icon">
                        <Sparkles size={24} />
                    </div>
                </div>
                <p className="processing-text">Waking up the runner...</p>
                <p className="processing-sub">
                    A GitHub Actions runner is being started. This takes about 30-60 seconds.
                </p>
            </div>
        </div>
    );
}

function RunnerStartingState() {
    return (
        <div className="status-card glow-purple">
            <div className="status-card-center">
                <div className="processing-spinner" />
                <p className="processing-text">Runner is starting up...</p>
                <p className="processing-sub">
                    Installing Blender and initializing the environment. Ready in a few seconds.
                </p>
            </div>
        </div>
    );
}

function QueuedState({ queuePosition, runner }: { queuePosition: number | null; runner: RunnerInfo | null }) {
    return (
        <div className="status-card glow-purple">
            <div className="flex flex-col gap-4">
                {queuePosition !== null && (
                    <div className="queue-position-card">
                        <div className="queue-position-icon">
                            <Clock size={20} />
                        </div>
                        <div className="queue-position-info">
                            <span className="queue-pos-label">Queue Position</span>
                            <span className="queue-pos-number">#{queuePosition}</span>
                        </div>
                        <div className="queue-position-bar">
                            <div className="queue-bar-fill" style={{ width: `${Math.max(0, 100 - (queuePosition - 1) * 33)}%` }} />
                        </div>
                    </div>
                )}

                {runner && (runner.status === 'ready' || runner.status === 'active') && (
                    <div className="status-banner status-banner--active">
                        <div className="banner-dot banner-dot--pulse" />
                        <span>Runner is {runner.status === 'active' ? 'processing' : 'ready'} — your job will be picked up shortly</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProcessingState() {
    return (
        <div className="status-card glow-purple">
            <div className="status-card-center">
                <div className="processing-spinner" />
                <p className="processing-text">Blender is running your script...</p>
                <p className="processing-sub">
                    This usually takes 30 seconds to a few minutes depending on complexity
                </p>
                <div className="processing-bar">
                    <div className="processing-bar-fill" />
                </div>
            </div>
        </div>
    );
}

function DoneState({ job, jobId }: { job: any; jobId: string }) {
    const viewerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setTimeout(() => {
            viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }, []);

    const outputFormats = ['glb', 'fbx', 'stl', 'usd'] as const;

    return (
        <div>
            {/* Success banner */}
            <div className="success-banner">
                <CheckCircle size={20} />
                <span>Your 3D asset is ready!</span>
            </div>

            {/* 3D Viewer */}
            {job.outputs?.glb && (
                <div ref={viewerRef}>
                    <ThreeViewer
                        glbUrl={job.outputs.glb.url}
                        previewUrl={job.outputs.preview}
                        className="w-full h-[560px] mb-6"
                    />
                </div>
            )}

            {/* Download section */}
            <div className="downloads-section">
                <h3 className="downloads-title">Downloads</h3>
                <div className="downloads-grid">
                    {outputFormats.map((fmt) => {
                        const file = job.outputs?.[fmt];
                        if (!file) return null;
                        return (
                            <a
                                key={fmt}
                                href={file.url}
                                download
                                className="download-card-new"
                            >
                                <div className="download-card-new-icon">
                                    <Download size={18} />
                                </div>
                                <div className="download-card-new-info">
                                    <span className="download-card-new-format">.{fmt.toUpperCase()}</span>
                                    <span className="download-card-new-size">
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

export default function JobPage({ params }: JobPageProps) {
    const { jobId } = use(params);
    const router = useRouter();
    const { job, loading, error } = useJob(jobId);
    const { runner } = useRunner();
    const [queuePosition, setQueuePosition] = useState<number | null>(null);
    const [runnerPhase, setRunnerPhase] = useState<string>('unknown');

    const isQueued = job?.status === 'queued';

    // Track runner phase for waking/starting states
    useEffect(() => {
        if (!runner) return;
        setRunnerPhase(runner.status);
    }, [runner]);

    // Queue position polling
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
        const interval = setInterval(fetchPosition, 5000);
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

    // Determine if we should show "waking runner" state - 
    // job is queued but runner is inactive/starting
    const showWakingRunner = isQueued && runner && (runner.status === 'inactive' || runner.status === 'starting');
    const showQueued = isQueued && runner && (runner.status === 'ready' || runner.status === 'active');
    // If no runner data yet but job is queued, show waking state
    const showWakingUnknown = isQueued && !runner;

    return (
        <div className="job-page-container">
            <div className="job-page max-w-5xl mx-auto px-4 py-8">
                <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6">
                    <ArrowLeft size={16} /> Back to home
                </Link>

                {/* Job Header */}
                <div className="mb-8">
                    <p className="text-white/40 text-xs font-mono mb-2">{jobId}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-3xl font-bold font-display">Job Status</h1>
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
                            className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                        >
                            ↺ Regenerate
                        </button>
                    </div>
                </div>

                {/* ─── Status Content ─── */}
                {job.status === 'queued' && showWakingUnknown && <RunnerWakingState />}
                {job.status === 'queued' && runnerPhase === 'starting' && <RunnerStartingState />}
                {job.status === 'queued' && showQueued && <QueuedState queuePosition={queuePosition} runner={runner} />}
                {job.status === 'queued' && showWakingRunner && runnerPhase !== 'starting' && <RunnerWakingState />}

                {job.status === 'processing' && <ProcessingState />}
                {job.status === 'done' && <DoneState job={job} jobId={jobId} />}
                {job.status === 'failed' && <FailedState job={job} onRetry={handleRetry} />}

                {/* ─── Script Preview ─── */}
                <div className="script-preview mt-8">
                    <div className="script-preview-header">
                        <span className="script-preview-label">script.py</span>
                        <span className="text-white/40 text-xs">
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
