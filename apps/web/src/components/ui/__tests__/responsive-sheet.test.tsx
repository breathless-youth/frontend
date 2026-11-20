import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResponsiveSheet, ResponsiveSheetHeader, ResponsiveSheetTitle } from "../responsive-sheet";

const pcShell = vi.hoisted(() => ({ value: false }));
vi.mock("@/desktop/usePcShell", () => ({ usePcShell: () => pcShell.value }));

afterEach(() => {
  pcShell.value = false;
});

function Harness({ description }: { description?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} description={description}>
        <ResponsiveSheetHeader className="flex justify-between">
          <ResponsiveSheetTitle>목표 시간</ResponsiveSheetTitle>
          <span data-testid="trailing">11월 20일</span>
        </ResponsiveSheetHeader>
        <button type="button" onClick={() => setOpen(false)}>
          저장
        </button>
      </ResponsiveSheet>
    </>
  );
}

function drawerHandle() {
  return document.querySelector('[data-slot="drawer-handle"]');
}

describe("ResponsiveSheet", () => {
  it("모바일에서는 지금처럼 바닥 서랍으로 열고 닫기 버튼을 더하지 않는다", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "열기" }));

    expect(await screen.findByRole("dialog", { name: "목표 시간" })).toBeInTheDocument();
    expect(drawerHandle()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
  });

  it("PC에서는 가운데 창으로 열고 Esc로 닫으면 연 버튼으로 포커스를 돌려준다", async () => {
    pcShell.value = true;
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "열기" });

    await userEvent.click(opener);
    expect(await screen.findByRole("dialog", { name: "목표 시간" })).toBeInTheDocument();
    expect(drawerHandle()).toBeNull();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("PC 닫기 버튼은 머리줄 안에서 제목·오른쪽 값 뒤에 놓여 둘을 덮지 않는다", async () => {
    pcShell.value = true;
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "열기" });
    await userEvent.click(opener);
    await screen.findByRole("dialog", { name: "목표 시간" });

    const close = screen.getByRole("button", { name: "닫기" });
    const row = close.parentElement!;
    const header = screen.getByTestId("trailing").parentElement!;
    // 닫기는 머리줄과 나란한 형제라 겹쳐 그릴 자리가 없고, 그 밖의 닫기 버튼은 없다.
    expect(row).toContainElement(header);
    expect(header).not.toContainElement(close);
    expect(Array.from(row.children)).toEqual([header, close]);
    expect(screen.getAllByRole("button", { name: /닫기|close/i })).toHaveLength(1);

    await userEvent.click(close);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("PC에서 설명을 주면 창의 설명으로 읽어 준다", async () => {
    pcShell.value = true;
    render(<Harness description="하루 목표를 정해요" />);

    await userEvent.click(screen.getByRole("button", { name: "열기" }));

    expect(await screen.findByRole("dialog", { name: "목표 시간" })).toHaveAccessibleDescription(
      "하루 목표를 정해요",
    );
  });
});
