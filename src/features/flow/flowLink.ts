/* Flow B: «Фокус на задаче» из таймлайна — передаёт задачу во Flow через localStorage. */

import type { Task } from "../../lib/types";

const KEY = "rhythm.flowlink.v1";

export function readFlowLink(tasks: Task[]): Task | null {
  try {
    const id = localStorage.getItem(KEY);
    if (!id) return null;
    return tasks.find((t) => t.id === id) ?? null;
  } catch {
    return null;
  }
}

export function setFlowLink(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearFlowLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
