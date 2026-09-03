/* ============================================================
 * withTimeout — защита от вечного ожидания сетевых вызовов.
 * Добавлено после инцидента с «висящим» спиннером на входе:
 * supabase-js не задаёт таймаут fetch, и зависший запрос держал
 * await навсегда. Теперь любая операция ограничена по времени,
 * а ошибка доходит до UI в человекочитаемом виде.
 * ============================================================ */

/**
 * Резолвит `promise`, либо через `ms` миллисекунд отклоняется
 * с ошибкой «превышено время ожидания».
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "операция"): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`${label}: превышено время ожидания (${Math.round(ms / 1000)} с) — проверьте соединение`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}
