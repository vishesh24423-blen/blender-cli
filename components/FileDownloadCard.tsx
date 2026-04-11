'use client';

import { useMemo } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { formatFileSize } from '@/lib/utils';
import type { OutputFormat } from '@/lib/types';
import { Download, Clock, Package } from 'lucide-react';

interface FileDownloadCardProps {
    format: OutputFormat;
    url: string;
    size: number;
}

const FORMAT_COLORS: Record<string, string> = {
    glb: '#22c55e',
    fbx: '#8b5cf6',
    stl: '#f59e0b',
    obj: '#3b82f6',
    usd: '#ec4899',
};

export default function FileDownloadCard({ format, url, size }: FileDownloadCardProps) {
    const expiryTime = useMemo(() => Date.now() + 24 * 60 * 60 * 1000, []);
    const expiry = useCountdown(expiryTime);

    const color = FORMAT_COLORS[format] || '#6b7280';

    return (
        <div className="download-card">
            <div className="download-card-header">
                <div className="download-card-icon" style={{ background: `${color}15`, color }}>
                    <Package size={20} />
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
                <Download size={14} />
                Download
            </a>

            <div className="download-card-expiry">
                <Clock size={11} />
                <span>~{expiry.formatted}</span>
            </div>
        </div>
    );
}
