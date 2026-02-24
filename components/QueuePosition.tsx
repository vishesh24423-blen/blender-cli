'use client';

interface QueuePositionProps {
    position: number;
}

export default function QueuePosition({ position }: QueuePositionProps) {
    return (
        <div className="queue-position">
            <div className="queue-position-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </div>
            <div className="queue-position-text">
                <span className="queue-position-label">Queue Position</span>
                <span className="queue-position-number">#{position}</span>
            </div>
        </div>
    );
}
