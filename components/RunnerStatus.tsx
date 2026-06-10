'use client';

import { useRunner } from '@/hooks/useRunner';
import { useCountdown } from '@/hooks/useCountdown';

export default function RunnerStatus() {
    const { runner, loading } = useRunner();
    const activeCountdown = useCountdown(runner?.windowEndsAt);

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

    const isActive = runner.status === 'active';
    const isStarting = runner.status === 'starting';
    const isReady = runner.status === 'ready';
    const isInactive = runner.status === 'inactive';
    const isOnline = isActive || isReady || isStarting;

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
                        <>
                            <span className="runner-emoji">🟢</span>
                            <span className="runner-label">Processing...</span>
                            <span className="runner-desc">— running your script</span>
                        </>
                    )}
                    {isReady && (
                        <>
                            <span className="runner-emoji">🟢</span>
                            <span className="runner-label">Runner READY</span>
                            <span className="runner-desc">— processing queue</span>
                        </>
                    )}
                    {isStarting && (
                        <>
                            <span className="runner-emoji">🟡</span>
                            <span className="runner-label">Runner STARTING</span>
                            <span className="runner-desc">— waking up...</span>
                        </>
                    )}
                    {isInactive && (
                        <>
                            <span className="runner-emoji">⚪</span>
                            <span className="runner-label">Runner IDLE</span>
                            <span className="runner-desc">— will wake on your request</span>
                        </>
                    )}
                </div>
                <div className="runner-countdown">
                    {isOnline ? (
                        <span>Active window: <strong>{activeCountdown.formatted}</strong></span>
                    ) : (
                        <span>Waiting for your first request to wake up</span>
                    )}
                </div>
            </div>
        </div>
    );
}
