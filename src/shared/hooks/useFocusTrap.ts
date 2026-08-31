import { useEffect, type RefObject } from "react";

/**
 * Фокус-трап для диалогов (Фаза F, §5 / WCAG):
 *  - при активации фокус переходит на первый фокусируемый элемент
 *    (или на сам контейнер, если внутри ничего нет);
 *  - Tab / Shift+Tab циклически ходят внутри контейнера;
 *  - Esc вызывает onClose.
 * Не блокирует скролл и не мешает Reduce Motion (только фокус).
 */
const SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => el.offsetParent !== null);

    const initial = focusables()[0] ?? node;
    if (initial.tabIndex < 0 && initial === node) initial.tabIndex = -1;
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active, onClose]);
}
