export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type OutputFormat = 'glb' | 'fbx' | 'stl' | 'usd';

export type QualityPreset = 'draft' | 'standard' | 'cinematic';

export interface OutputFile {
    url: string;
    size: number;
}

export interface Job {
    id?: string;
    script: string;
    userId: string;
    status: JobStatus;
    formats: OutputFormat[];
    quality?: QualityPreset;
    outputs: Partial<Record<OutputFormat, OutputFile>> & { preview?: string };
    createdAt: number;
    completedAt?: number;
    error?: string;
}

export type RunnerStatusType = 'active' | 'inactive' | 'starting' | 'ready';

export interface RunnerInfo {
    status: RunnerStatusType;
    nextRunAt: number;
    windowEndsAt: number;
    currentJobId: string | null;
    lastUpdated: number;
    readyAt?: number;
    startedAt?: number;
    queueLength?: number;
}
