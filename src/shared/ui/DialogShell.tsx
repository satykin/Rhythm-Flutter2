import React, { useRef } from "react";
import { I, type IconName } from "../../components/icons";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * Доступный диалог (Фаза F, §5):
 *  - role="dialog" + aria-modal, заголовок связан через aria-labelledby;
 *  - фокус-трап (Tab/Shift+Tab по кругу, Esc — закрыть, фокус возвращается);
 *  - появление через opacity/scale — безопасно для Reduce Motion;
 *  - клик по подложке = закрыть.
 */
export default function DialogShell({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width = 480,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** тестовая инфраструктура: data-testid панели */
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="anim-fade absolute inset-0 bg-ink-950/75 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-shell-title"
        data-testid={testId}
        className="anim-pop card relative flex max-h-[90vh] w-full flex-col overflow-hidden outline-none"
        style={{ maxWidth: width, background: "var(--color-ink-900)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/6 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-vio-400/20 bg-vio-400/12 text-vio-300">
                <I n={icon} size={16} />
              </span>
            )}
            <h2 id="dialog-shell-title" className="truncate font-display text-[15px] font-semibold tracking-tight text-mist-50">
              {title}
            </h2>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Закрыть диалог (Esc)">
            <I n="x" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2.5 border-t border-white/6 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
