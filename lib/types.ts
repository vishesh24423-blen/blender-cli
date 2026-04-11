export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type OutputFormat = 'glb' | 'fbx' | 'stl' | 'obj' | 'usd';

export type QualityPreset = 'draft' | 'standard' | 'cinematic';

export interface OutputFile {
    url: string;
    size: number;
}

export interface PreviewFile {
    url: string;
}

export interface Job {
    id?: string;
    script: string;
    userId: string;
    status: JobStatus;
    formats: OutputFormat[];
    quality?: QualityPreset;
    outputs: Partial<Record<OutputFormat, OutputFile>> & { preview?: PreviewFile };
    createdAt: number;
    completedAt?: number;
    error?: string;
}

export type RunnerStatusType = 'active' | 'inactive';

export interface RunnerInfo {
    status: RunnerStatusType;
    nextRunAt: number;
    windowEndsAt: number;
    currentJobId: string | null;
    lastUpdated: number;
}
