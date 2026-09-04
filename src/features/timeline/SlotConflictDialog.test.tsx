import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SlotConflictDialog from "./SlotConflictDialog";
import type { SlotCheckResult } from "./conflicts";

/* ============================================================
 * Продуктовый фикс 14: конфликт слота — блокирующая модалка.
 * Открытие при конфликте; ESC/«Отмена»/клик по фону НЕ меняют
 * состояние; «Перенести» применяет ВЫБРАННЫЙ в списке слот.
 * ============================================================ */

const conflict: SlotCheckResult = {
  free: false,
  colliding: [{ id: "t1", title: "Встреча", startMin: 840, endMin: 885 }],
  proposals: [
    { startMin: 900, endMin: 960 }, // 15:00–16:00 (ближайшее)
    { startMin: 990, endMin: 1050 }, // 16:30–17:30
    { startMin: 1110, endMin: 1170 }, // 18:30–19:30
  ],
};

const renderDialog = (onPick = vi.fn(), onCancel = vi.fn()) =>
  render(<SlotConflictDialog check={conflict} taskTitle="Отчёт" onPick={onPick} onCancel={onCancel} />);

describe("SlotConflictDialog — блокирующая модалка (фикс 14)", () => {
  it("при конфликте открывается: видно, что занято, и варианты переноса", () => {
    renderDialog();
    expect(screen.getByTestId("slot-conflict-dialog")).toBeInTheDocument();
    expect(screen.getByText("Встреча")).toBeInTheDocument();
    expect(screen.getByText("14:00–14:45")).toBeInTheDocument();
    expect(screen.getAllByTestId("slot-conflict-option")).toHaveLength(3);
    /* по умолчанию выбрано ближайшее окно — кнопка это отражает */
    expect(screen.getByTestId("slot-conflict-apply")).toHaveTextContent("Перенести на 15:00");
  });

  it("без конфликта ничего не рендерится", () => {
    render(<SlotConflictDialog check={null} taskTitle="X" onPick={() => {}} onCancel={() => {}} />);
    expect(screen.queryByTestId("slot-conflict-dialog")).not.toBeInTheDocument();
  });

  it("ESC = «Отмена»: закрывает, перенос НЕ применяется", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    renderDialog(onPick, onCancel);
    fireEvent.keyDown(screen.getByTestId("slot-conflict-dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("клик по подложке НЕ закрывает модалку (выбор защищён)", () => {
    const onCancel = vi.fn();
    renderDialog(vi.fn(), onCancel);
    fireEvent.click(screen.getByTestId("dialog-shell-backdrop"));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("slot-conflict-dialog")).toBeInTheDocument();
  });

  it("«Отмена» не меняет состояние (onPick не вызывается)", () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    renderDialog(onPick, onCancel);
    fireEvent.click(screen.getByTestId("slot-conflict-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("выбор окна в списке — «Перенести» применяет выбранный слот", () => {
    const onPick = vi.fn();
    renderDialog(onPick);
    const options = screen.getAllByTestId("slot-conflict-option");
    fireEvent.click(options[1]); // 16:30–17:30
    expect(screen.getByTestId("slot-conflict-apply")).toHaveTextContent("Перенести на 16:30");
    fireEvent.click(screen.getByTestId("slot-conflict-apply"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ startMin: 990, endMin: 1050 });
  });

  it("блокирует прокрутку страницы, пока открыта, и восстанавливает после", () => {
    const { unmount } = renderDialog();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
