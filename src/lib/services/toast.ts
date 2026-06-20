import { writable } from "svelte/store";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  type: ToastType;
  message: string;
  duration?: number;
  dismissible?: boolean;
}

export interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
  duration: number;
  dismissible: boolean;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;

const { subscribe, update } = writable<{ active: ToastItem[]; queue: ToastItem[] }>({
  active: [],
  queue: [],
});

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: string, duration: number): void {
  if (duration <= 0) {
    return;
  }
  const existing = timers.get(id);
  if (existing) {
    clearTimeout(existing);
  }
  timers.set(
    id,
    setTimeout(() => {
      dismiss(id);
    }, duration),
  );
}

function promoteFromQueue(state: { active: ToastItem[]; queue: ToastItem[] }): {
  active: ToastItem[];
  queue: ToastItem[];
} {
  const next = { ...state, active: [...state.active], queue: [...state.queue] };
  while (next.active.length < MAX_VISIBLE && next.queue.length > 0) {
    const item = next.queue.shift();
    if (item) {
      next.active.push(item);
      scheduleDismiss(item.id, item.duration);
    }
  }
  return next;
}

export function showToast(options: ToastOptions): string {
  const id = crypto.randomUUID();
  const item: ToastItem = {
    id,
    type: options.type,
    message: options.message,
    duration:
      options.duration ?? (options.type === "error" ? 0 : DEFAULT_DURATION),
    dismissible: options.dismissible ?? true,
    createdAt: Date.now(),
  };

  update((state) => {
    if (state.active.length < MAX_VISIBLE) {
      const next = { ...state, active: [...state.active, item] };
      scheduleDismiss(item.id, item.duration);
      return next;
    }
    return { ...state, queue: [...state.queue, item] };
  });

  return id;
}

export function dismissToast(id: string): void {
  dismiss(id);
}

function dismiss(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  update((state) => promoteFromQueue({
    active: state.active.filter((item) => item.id !== id),
    queue: state.queue,
  }));
}

export function dismissAllToasts(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  update(() => ({ active: [], queue: [] }));
}

export const toastState = { subscribe };

export const toastService = {
  show: showToast,
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
};
