'use client';

import { useState, useEffect } from 'react';
import { useRunner } from '@/hooks/useRunner';
import { useCountdown } from '@/hooks/useCountdown';
import { isRunnerAlive, lastSeenLabel } from '@/lib/runner';
import type { GitHubRun } from '@/lib/types';

export default function RunnerStatus() {
    const { runner, loading } = useRunner();
    const [ghRuns, setGhRuns] = useState<GitHubRun[]>([]);
    const [ghError, setGhError] = useState(false);
    const activeCountdown = useCountdown(runner?.windowEndsAt);

    useEffect(() => {
        const fetchGhStatus = async () => {
            try {
                const res = await fetch('/api/github-status');
                const data = await res.json();
                if (data.available && data.runs) {
                    setGhRuns(data.runs);
                    setGhError(false);
                } else {
                    setGhError(true);
                }
            } catch {
                setGhError(true);
            }
        };

        fetchGhStatus();
        const interval = setInterval(fetchGhStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="runner-status-skeleton">
                <div className="runner-dot-skeleton" />
                <div className="runner-text-skeleton" />
            </div>
        );
    }

    if (!runner) {
        return (
            <div className="runner-status runner-status--offline">
                <span className="runner-dot runner-dot--offline" />
                <div className="runner-info">
                    <span className="runner-label">Runner status unavailable</span>
                </div>
            </div>
        );
    }

    const ghRun = ghRuns[0];
    const isRunActive = ghRun && (ghRun.status === 'queued' || ghRun.status === 'in_progress');
    const isRunCompleted = ghRun && ghRun.status === 'completed';
    const isRunPending = ghRun && ghRun.status === 'pending';

    // Liveness beats status: a crashed/failed Actions run stops the 30s
    // heartbeat, leaving Firestore frozen at 'ready'. Without this check a
    // dead run shows 🟢 READY with a live countdown (that's what happened
    // with the failed run while the badge still said READY).
    // Re-evaluated every second via the countdown tick below.
    const alive = isRunnerAlive(runner);
    const stale = !alive && (runner.status === 'active' || runner.status === 'ready' || runner.status === 'starting');

    const isActive = alive && runner.status === 'active';
    const isReady = alive && runner.status === 'ready';
    const isStarting = alive && runner.status === 'starting';
    const isInactive = runner.status === 'inactive' || stale;

    return (
        <div className={`runner-status ${
            isActive ? 'runner-status--active' :
            isReady ? 'runner-status--ready' :
            isStarting ? 'runner-status--starting' :
            'runner-status--idle'
        }`}>
            <span className={`runner-dot ${
                isActive ? 'runner-dot--active' :
                isReady ? 'runner-dot--ready' :
                isStarting ? 'runner-dot--starting' :
                'runner-dot--idle'
            }`} />
            <div className="runner-info">
                <div className="runner-headline">
                    {isActive && (
                        <><span className="runner-emoji">🟢</span><span className="runner-label">Processing...</span></>
                    )}
                    {isReady && (
                        <><span className="runner-emoji">🟢</span><span className="runner-label">Runner READY</span></>
                    )}
                    {isStarting && (
                        <><span className="runner-emoji">🟡</span><span className="runner-label">Runner STARTING</span></>
                    )}
                    {isInactive && (
                        <><span className="runner-emoji">⚪</span><span className="runner-label">Runner IDLE</span></>
                    )}
                </div>

                {/* GitHub Actions status */}
                {ghRun && (
                    <a
                        href={ghRun.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gh-run-link"
                    >
                        <span className="gh-run-status">
                            {isRunActive && <span className="gh-dot gh-dot--active" />}
                            {isRunCompleted && <span className="gh-dot gh-dot--done" />}
                            {isRunPending && <span className="gh-dot gh-dot--pending" />}
                            {ghRun.status === 'queued' && 'Queued'}
                            {ghRun.status === 'in_progress' && 'Running'}
                            {ghRun.status === 'completed' && ghRun.conclusion === 'success' && 'Succeeded'}
                            {ghRun.status === 'completed' && ghRun.conclusion !== 'success' && 'Failed'}
                            {ghRun.status === 'pending' && 'Pending'}
                            {ghRun.status === 'waiting' && 'Waiting'}
                            {' '}· #{ghRun.runNumber}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 8.5L7 5 2 1.5z"/></svg>
                    </a>
                )}

                {ghError && (
                    <span className="gh-run-error">GitHub status unavailable</span>
                )}

                {stale && runner.note && (
                    <span className="gh-run-error">{runner.note}</span>
                )}

                <div className="runner-countdown">
                    {isInactive ? (
                        <span>{stale ? `${lastSeenLabel(runner)} — submit a job to wake a fresh runner` : 'Waiting for your first request'}</span>
                    ) : (
                        <span>Window: <strong>{activeCountdown.formatted}</strong></span>
                    )}
                </div>
            </div>
        </div>
    );
}
