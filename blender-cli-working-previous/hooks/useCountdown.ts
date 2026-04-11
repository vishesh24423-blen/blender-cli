'use client';

import { useState, useEffect, useCallback } from 'react';

export function useCountdown(targetTimestamp: number | undefined | null) {
    const calculate = useCallback(() => {
        if (!targetTimestamp) return 0;
        return Math.max(0, targetTimestamp - Date.now());
    }, [targetTimestamp]);

    const [timeLeft, setTimeLeft] = useState<number>(calculate);
    const [prevTarget, setPrevTarget] = useState(targetTimestamp);

    if (targetTimestamp !== prevTarget) {
        setPrevTarget(targetTimestamp);
        setTimeLeft(calculate());
    }

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(calculate());
        }, 1000);
        return () => clearInterval(interval);
    }, [calculate]);

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    const formatted = (() => {
        if (timeLeft <= 0) return '0s';
        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    })();

    return {
        timeLeft,
        hours,
        minutes,
        seconds,
        formatted,
        isExpired: timeLeft <= 0,
    };
}
