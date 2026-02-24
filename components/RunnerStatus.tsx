'use client';

import { useRunner } from '@/hooks/useRunner';
import { useCountdown } from '@/hooks/useCountdown';

export default function RunnerStatus() {
    const { runner, loading } = useRunner();
    const activeCountdown = useCountdown(runner?.windowEndsAt);
    const idleCountdown = useCountdown(runner?.nextRunAt);

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

    return (
        <div className={`runner-status ${isActive ? 'runner-status--active' : 'runner-status--idle'}`}>
            <span className={`runner-dot ${isActive ? 'runner-dot--active' : 'runner-dot--idle'}`} />
            <div className="runner-info">
                <div className="runner-headline">
                    {isActive ? (
                        <>
                            <span className="runner-emoji">🟢</span>
                            <span className="runner-label">Runner ACTIVE</span>
                            <span className="runner-desc">— jobs process within 15 seconds</span>
                        </>
                    ) : (
                        <>
                            <span className="runner-emoji">🟡</span>
                            <span className="runner-label">Runner IDLE</span>
                        </>
                    )}
                </div>
                <div className="runner-countdown">
                    {isActive ? (
                        <span>Runner active for: <strong>{activeCountdown.formatted}</strong></span>
                    ) : (
                        <span>Next run in: <strong>{idleCountdown.formatted}</strong></span>
                    )}
                </div>
                <div className="runner-schedule">
                    Runs at 5:30AM · 11:30AM · 5:30PM · 11:30PM IST
                </div>
            </div>
        </div>
    );
}
