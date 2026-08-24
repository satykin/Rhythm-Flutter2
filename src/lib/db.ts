/* ============================================================
 * Rhythm — слой данных (data layer)
 *
 * Архитектура повторяет будущую связку Supabase:
 *   - Schema  ≈ таблицы users / tasks / routines / mood_logs
 *   - Adapter ≈ клиент (сейчас LocalAdapter на localStorage,
 *               в проде — SupabaseAdapter с realtime-подписками)
 *   - db.*    ≈ async API с сетевой задержкой, как у HTTP-клиента
 * ============================================================ */

import type { MoodLog, Routine, Task, User } from "./types";

export interface Schema {
  version: number;
  users: User[];
  tasks: Task[];
  routines: Routine[];
  mood_logs: MoodLog[];
}

export interface StorageAdapter {
  load(): Promise<Schema | null>;
  persist(schema: Schema): Promise<void>;
}

const DB_KEY = "rhythm.db.v1";
const SCHEMA_VERSION = 1;

const latency = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms + Math.random() * 60));

/** Локальный адаптер — аналог Hive из ТЗ (кэш первого слоя). */
const LocalAdapter: StorageAdapter = {
  async load() {
    await latency(120);
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Schema;
      if (parsed.version !== SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  async persist(schema) {
    await latency(20);
    localStorage.setItem(DB_KEY, JSON.stringify(schema));
  },
};

let schema: Schema = { version: SCHEMA_VERSION, users: [], tasks: [], routines: [], mood_logs: [] };

export const db = {
  async boot(): Promise<Schema> {
    const loaded = await LocalAdapter.load();
    if (loaded) schema = loaded;
    return schema;
  },

  get(): Schema {
    return schema;
  },

  async commit(): Promise<void> {
    await LocalAdapter.persist(schema);
  },

  /* ---------- users ---------- */
  findUserByEmail(email: string): User | undefined {
    return schema.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  },
  insertUser(u: User) {
    schema.users.push(u);
  },

  /* ---------- tasks ---------- */
  tasksOf(userId: string): Task[] {
    return schema.tasks.filter((t) => t.userId === userId);
  },
  insertTask(t: Task) {
    schema.tasks.push(t);
  },
  updateTask(t: Task) {
    const i = schema.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) schema.tasks[i] = t;
  },
  removeTask(id: string) {
    schema.tasks = schema.tasks.filter((t) => t.id !== id);
  },

  /* ---------- routines ---------- */
  routinesOf(userId: string): Routine[] {
    return schema.routines.filter((r) => r.userId === userId);
  },
  insertRoutine(r: Routine) {
    schema.routines.push(r);
  },

  /* ---------- mood_logs ---------- */
  moodsOf(userId: string): MoodLog[] {
    return schema.mood_logs.filter((m) => m.userId === userId);
  },
  insertMood(m: MoodLog) {
    schema.mood_logs.push(m);
  },
  updateMood(m: MoodLog) {
    const i = schema.mood_logs.findIndex((x) => x.id === m.id);
    if (i >= 0) schema.mood_logs[i] = m;
  },

  /* ---------- сервис ---------- */
  async wipeUserData(userId: string): Promise<void> {
    schema.tasks = schema.tasks.filter((t) => t.userId !== userId);
    schema.mood_logs = schema.mood_logs.filter((m) => m.userId !== userId);
    schema.routines = schema.routines.filter((r) => r.userId !== userId);
    await this.commit();
  },
};

/* ---------- сессия (аналог Supabase Auth session) ---------- */
const SESSION_KEY = "rhythm.session.v1";

export const sessionStore = {
  read(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  write(userId: string) {
    localStorage.setItem(SESSION_KEY, userId);
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};
