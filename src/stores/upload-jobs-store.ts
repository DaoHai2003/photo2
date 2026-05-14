/**
 * Upload Jobs Store — track background upload tasks (Drive → album).
 *
 * Mục đích: cho user tạo album xong vẫn navigate đi làm việc khác, upload chạy
 * ngầm trong tab browser. Mỗi job = 1 album đang upload, theo dõi qua albumId.
 *
 * Lifecycle:
 *   • addJob() khi album vừa tạo, có file Drive cần upload
 *   • updateProgress() được gọi liên tục từ background loop
 *   • completeJob() khi upload xong → giữ lại 5s để hiện snackbar rồi removeJob
 *   • removeJob() xoá khỏi UI
 *
 * UI: <upload-progress-chip /> ở dashboard layout đọc store này, render chip
 * floating góc dưới-phải. Mỗi job 1 chip. KHÔNG động data — chỉ track progress.
 */
import { create } from 'zustand';

export interface UploadJob {
  id: string;             // album_id (1 job per album)
  albumTitle: string;
  total: number;          // tổng số file cần upload
  uploaded: number;       // số file đã upload
  status: 'running' | 'done' | 'error';
  errorMsg?: string;
  startedAt: number;      // timestamp ms
}

interface UploadJobsState {
  jobs: UploadJob[];
  addJob: (job: Omit<UploadJob, 'uploaded' | 'status' | 'startedAt'>) => void;
  updateProgress: (id: string, uploaded: number) => void;
  completeJob: (id: string) => void;
  errorJob: (id: string, msg: string) => void;
  removeJob: (id: string) => void;
}

export const useUploadJobsStore = create<UploadJobsState>((set) => ({
  jobs: [],
  addJob: (job) => set((s) => ({
    jobs: [
      ...s.jobs.filter((j) => j.id !== job.id),  // dedupe by album id
      { ...job, uploaded: 0, status: 'running' as const, startedAt: Date.now() },
    ],
  })),
  updateProgress: (id, uploaded) => set((s) => ({
    jobs: s.jobs.map((j) => j.id === id ? { ...j, uploaded } : j),
  })),
  completeJob: (id) => set((s) => ({
    jobs: s.jobs.map((j) => j.id === id ? { ...j, status: 'done' as const, uploaded: j.total } : j),
  })),
  errorJob: (id, msg) => set((s) => ({
    jobs: s.jobs.map((j) => j.id === id ? { ...j, status: 'error' as const, errorMsg: msg } : j),
  })),
  removeJob: (id) => set((s) => ({
    jobs: s.jobs.filter((j) => j.id !== id),
  })),
}));
