/* ============================================================
 * Разведение задач по слотам (продуктовый фикс 7).
 * Правило владельца: одновременно — одна задача.
 * Чистая функция: не знает ни о store, ни о тостах.
 * ============================================================ */

import { DAY_START, DAY_END } from "../../lib/time";

export interface OccupiedSlot {
  id: string;
  startMin: number;
  endMin: number;
}

export interface ResolvedSlot {
  startMin: number;
  endMin: number;
  /** true, если пришлось сдвинуть интервал (исходный слот был занят) */
  moved: boolean;
}

const STEP = 15;

const collides = (occupied: OccupiedSlot[], start: number, dur: number) =>
  occupied.some((o) => start < o.endMin && start + dur > o.startMin);

/**
 * Ищет место для интервала [startMin, startMin+durationMin).
 *  - слот свободен → возвращает его как есть (moved=false);
 *  - занят → авто-сдвиг на БЛИЖАЙШИЙ свободный слот той же длительности
 *    (вперёд приоритетнее при равенстве дистанций);
 *  - до конца дня окна нет → null (вызывающий код показывает предупреждение).
 *
 * `occupied` не должен содержать перемещаемую задачу и пропущенные
 * (skipped) задачи — пропуск освобождает время (фильтрует вызывающий код).
 */
export function resolveSlot(
  occupied: OccupiedSlot[],
  startMin: number,
  durationMin: number,
  opts?: { dayStart?: number; dayEnd?: number }
): ResolvedSlot | null {
  const dayStart = opts?.dayStart ?? DAY_START;
  const dayEnd = opts?.dayEnd ?? DAY_END;
  const dur = Math.max(15, durationMin);
  if (dayEnd - dayStart < dur) return null;

  const s0 = Math.min(Math.max(startMin, dayStart), dayEnd - dur);

  /* исходный слот свободен */
  if (!collides(occupied, s0, dur)) return { startMin: s0, endMin: s0 + dur, moved: false };

  /* вперёд */
  let forward: number | null = null;
  for (let s = s0 + STEP; s <= dayEnd - dur; s += STEP) {
    if (!collides(occupied, s, dur)) {
      forward = s;
      break;
    }
  }

  /* назад — допустим, только если запрошенное начало РАНЬШЕ старта первой
   * пересекающей задачи (есть куда «подвинуться» до неё). Если начало уже
   * внутри занятой цепочки — единственный осмысленный ход вперёд:backward
   * не рассматриваем, чтобы перепрыгнуть ВСЮ цепочку (фикс 8, тест L16). */
  let earliestCollidingStart = Infinity;
  for (const o of occupied) {
    if (s0 < o.endMin && s0 + dur > o.startMin) earliestCollidingStart = Math.min(earliestCollidingStart, o.startMin);
  }
  const canGoBack = s0 < earliestCollidingStart;

  let backward: number | null = null;
  if (canGoBack) {
    for (let s = s0 - STEP; s >= dayStart; s -= STEP) {
      if (!collides(occupied, s, dur)) {
        backward = s;
        break;
      }
    }
  }

  if (forward === null && backward === null) return null;
  if (forward !== null && (backward === null || forward - s0 <= s0 - backward)) {
    return { startMin: forward, endMin: forward + dur, moved: true };
  }
  return { startMin: backward as number, endMin: (backward as number) + dur, moved: true };
}
