'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RunnerInfo } from '@/lib/types';

export function useRunner() {
    const [runner, setRunner] = useState<RunnerInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(
            doc(db, 'system', 'runner'),
            (snap) => {
                if (snap.exists()) {
                    setRunner(snap.data() as RunnerInfo);
                }
                setLoading(false);
            },
            (error) => {
                console.error('Runner listener error:', error);
                setLoading(false);
            }
        );
        return () => unsub();
    }, []);

    return { runner, loading };
}
