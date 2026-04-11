'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Job } from '@/lib/types';

export function useJob(jobId: string) {
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) return;

        const unsub = onSnapshot(
            doc(db, 'jobs', jobId),
            (snap) => {
                if (snap.exists()) {
                    setJob({ id: snap.id, ...snap.data() } as Job);
                } else {
                    setError('Job not found');
                }
                setLoading(false);
            },
            (err) => {
                console.error('Job listener error:', err);
                setError(err.message);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [jobId]);

    return { job, loading, error };
}
