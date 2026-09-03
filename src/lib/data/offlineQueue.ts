/* ============================================================
 * Офлайн-очередь исходящих изменений (Фаза 1.5b).
 * Паттерн тот же, что в вебе-кэше: запись сначала попадает в
 * локальный кэш (оптимистично), а при недоступности сети —
 * в очередь; flush по событию 'online' и при входе.
 * Конфликты — last-write-wins по updated_at (спека).
 * ============================================================ */

export type QueueTable =
  | "tasks"
  | "routines"
  | "routine_completions"
  | "focus_sessions"
  | "suggestions"
  | "suggestion_feedback"
  | "user_profiles"
  | "task_templates";

export interface QueueOp {
  id: string;
  userId: string;
  table: QueueTable;
  kind: "upsert" | "delete";
  /** сериализуемый payload (строка таблицы или { id } для delete) */
  payload: Record<string, unknown>;
  createdAt: number;
}

const KEY = "rhythm.offlineQueue.v1";

function readAll(): Record<string, QueueOp[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, QueueOp[]>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, QueueOp[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* переполнение хранилища — очередь теряется, но приложение живо */
  }
}

export const offlineQueue = {
  list(userId: string): QueueOp[] {
    return readAll()[userId] ?? [];
  },

  push(op: Omit<QueueOp, "id" | "createdAt">) {
    const map = readAll();
    const arr = map[op.userId] ?? [];
    /* дедупликация: апсерт той же строки заменяет предыдущий (last-write-wins) */
    const filtered =
      op.kind === "upsert"
        ? arr.filter((o) => !(o.table === op.table && o.kind === "upsert" && o.payload.id === op.payload.id))
        : arr.filter((o) => !(o.table === op.table && o.payload.id === op.payload.id));
    map[op.userId] = [
      ...filtered,
      { ...op, id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() },
    ];
    writeAll(map);
  },

  remove(userId: string, opId: string) {
    const map = readAll();
    map[userId] = (map[userId] ?? []).filter((o) => o.id !== opId);
    writeAll(map);
  },

  clear(userId: string) {
    const map = readAll();
    delete map[userId];
    writeAll(map);
  },
};

/** Ошибка похожа на сетевую ( worth retrying ), а не на логическую (4xx). */
export function isNetworkLikeError(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  const m = e.message.toLowerCase();
  return (
    m.includes("fetch") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("привышено время") ||
    m.includes("failed to fetch") ||
    m.includes("load failed")
  );
}
