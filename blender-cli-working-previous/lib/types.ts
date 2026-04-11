export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type OutputFormat = 'glb' | 'fbx' | 'stl' | 'obj' | 'usd';

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
    outputs: Partial<Record<OutputFormat, OutputFile>>;
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
