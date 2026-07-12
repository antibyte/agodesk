import { get, writable } from "svelte/store";

export type LocalJobKind = "shell" | "search" | "download" | "index" | "conversion";

export type LocalJobStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled";

export interface LocalJob {
  job_id: string;
  kind: LocalJobKind;
  status: LocalJobStatus;
  created_at: string;
  updated_at: string;
  title?: string;
  progress?: number;
  result_offset?: number;
  result_count?: number;
  shell_session_id?: string;
  error_code?: string;
}

export interface LocalJobState {
  jobs: LocalJob[];
}

const MAX_JOBS = 200;

const initialState: LocalJobState = {
  jobs: [],
};

function createLocalJobStore() {
  const { subscribe, set, update } = writable<LocalJobState>(initialState);

  return {
    subscribe,
    upsert(job: LocalJob): void {
      update((state) => {
        const jobs = [...state.jobs];
        const index = jobs.findIndex((entry) => entry.job_id === job.job_id);
        if (index >= 0) {
          jobs[index] = { ...jobs[index], ...job, updated_at: job.updated_at };
        } else {
          jobs.unshift(job);
        }
        return { jobs: jobs.slice(0, MAX_JOBS) };
      });
    },
    patch(jobId: string, patch: Partial<LocalJob>): void {
      update((state) => ({
        jobs: state.jobs.map((job) =>
          job.job_id === jobId
            ? { ...job, ...patch, updated_at: new Date().toISOString() }
            : job,
        ),
      }));
    },
    listRunning(): LocalJob[] {
      return get({ subscribe }).jobs.filter((job) =>
        job.status === "queued" || job.status === "running" || job.status === "waiting_input",
      );
    },
    reset(): void {
      set(initialState);
    },
  };
}

export const localJobState = createLocalJobStore();

export function createLocalJob(
  kind: LocalJobKind,
  partial: Partial<LocalJob> & { job_id: string },
): LocalJob {
  const now = new Date().toISOString();
  return {
    kind,
    status: "queued",
    created_at: now,
    updated_at: now,
    ...partial,
  };
}
