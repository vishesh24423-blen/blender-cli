import type { RunnerInfo } from './types';

/**
 * The worker heartbeats `lastActive` every 30s while the GitHub Actions run
 * is alive. If the run crashes/fails/times out, the heartbeat stops — but
 * Firestore keeps the last status ('ready'/'active') forever. Every UI and
 * wake decision must go through here instead of trusting `status` alone.
 *
 * Without this, a failed run (e.g. Actions #109) shows as 🟢 READY with a
 * live window countdown even though nothing is running.
 */
export const RUNNER_QUIET_MS = 120_000; // 4 missed heartbeats = dead

export function lastActiveOf(runner: RunnerInfo | null | undefined): number {
    if (!runner) return 0;
    // Older docs used lastUpdated; prefer lastActive, fall back gracefully.
    return runner.lastActive ?? runner.lastUpdated ?? runner.startedAt ?? 0;
}

export function isRunnerAlive(
    runner: RunnerInfo | null | undefined,
    now: number = Date.now(),
    quietMs: number = RUNNER_QUIET_MS,
): boolean {
    if (!runner) return false;
    if (runner.status !== 'active' && runner.status !== 'ready' && runner.status !== 'starting') return false;
    return now - lastActiveOf(runner) < quietMs;
}

/** Human "last seen" label for the offline state, e.g. "last seen 14m ago". */
export function lastSeenLabel(runner: RunnerInfo | null | undefined, now: number = Date.now()): string {
    const ts = lastActiveOf(runner);
    if (!ts) return 'never seen';
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 60) return `last seen ${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `last seen ${m}m ago`;
    const h = Math.floor(m / 60);
    return `last seen ${h}h ${m % 60}m ago`;
}
