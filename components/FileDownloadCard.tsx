'use client';

import { useMemo } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { formatFileSize } from '@/lib/utils';
import type { OutputFormat } from '@/lib/types';
import { Download, Clock, FileBox } from 'lucide-react';

interface FileDownloadCardProps {
    format: OutputFormat;
    url: string;
    size: number;
}

const FORMAT_COLORS: Record<string, string> = {
    glb: '#10b981',
    fbx: '#8b5cf6',
    stl: '#f59e0b',
    obj: '#3b82f6',
    usd: '#ec4899',
};

export default function FileDownloadCard({ format, url, size }: FileDownloadCardProps) {
    // Assume 24 hour expiry from now (R2 signed URLs)
    const expiryTime = useMemo(() => Date.now() + 24 * 60 * 60 * 1000, []);
    const expiry = useCountdown(expiryTime);

    const color = FORMAT_COLORS[format] || '#6b7280';

    return (
        <div className="download-card" style={{ '--accent': color } as React.CSSProperties}>
            <div className="download-card-header">
                <div className="download-card-icon" style={{ background: `${color}20`, color }}>
                    <FileBox size={24} />
                </div>
                <div className="download-card-meta">
                    <span className="download-card-format">.{format.toUpperCase()}</span>
                    <span className="download-card-size">{formatFileSize(size)}</span>
                </div>
            </div>

            <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="download-card-button"
                style={{ background: color }}
            >
                <Download size={16} />
                Download
            </a>

            <div className="download-card-expiry">
                <Clock size={12} />
                <span>Expires in ~{expiry.formatted}</span>
            </div>
        </div>
    );
}
