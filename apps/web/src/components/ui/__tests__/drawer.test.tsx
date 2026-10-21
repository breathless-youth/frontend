import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { COVERS_TAB_BAR_ATTR } from "@/lib/nativeModalOverlay";

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "../drawer";

/**
 * 끌어 닫기는 jsdom에 레이아웃이 없어 여기서 볼 수 없다. 실기기에서 확인한다.
 * 모양은 클래스 문자열로 본다. 바닥 시트 모양을 이 부품 한 곳에서만 정한다는 약속을 지키는지 보는 것이다.
 */
function ControlledDrawer({ onClose }: { onClose: (reason: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (!next) {
          onClose(details.reason);
        }
        setOpen(next);
      }}
    >
      <DrawerContent className="theme-soft-blue">
        <DrawerTitle>시트 제목</DrawerTitle>
        <DrawerClose>닫기</DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

function renderDrawer() {
  const onClose = vi.fn();
  render(<ControlledDrawer onClose={onClose} />);
  return { onClose, sheet: screen.getByRole("dialog", { name: "시트 제목" }) };
}

describe("DrawerContent — 탭 바", () => {
  it("열린 시트는 모달이고 탭 바 자리까지 덮는다고 표시한다", () => {
    const { sheet } = renderDrawer();

    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveAttribute(COVERS_TAB_BAR_ATTR);
  });
});

describe("DrawerContent — 닫기", () => {
  it("Esc로 닫으면 escape-key를 넘기고 시트를 걷는다", async () => {
    const { onClose } = renderDrawer();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledWith("escape-key");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("닫기 버튼은 close-press를 넘긴다", async () => {
    const { onClose } = renderDrawer();

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(onClose).toHaveBeenCalledWith("close-press");
  });

  it("바깥을 누르면 outside-press를 넘긴다", async () => {
    const { onClose } = renderDrawer();

    await userEvent.click(document.body);

    expect(onClose).toHaveBeenCalledWith("outside-press");
  });
});

describe("DrawerContent — 포커스와 손잡이", () => {
  it("열리면 시트 자체가 포커스를 받는다", async () => {
    const { sheet } = renderDrawer();

    await waitFor(() => expect(sheet).toHaveFocus());
  });

  it("손잡이는 보조기기에 숨기고 잡는 영역을 44px로 둔다", () => {
    const { sheet } = renderDrawer();
    const handle = sheet.querySelector('[data-slot="drawer-handle"]');

    expect(handle).toHaveAttribute("aria-hidden", "true");
    expect(handle?.className.split(" ")).toContain("h-11");
  });
});

describe("DrawerContent — 모양", () => {
  it("둥글기·그림자를 여기서 정하고 호출부 클래스는 덧붙인다", () => {
    const { sheet } = renderDrawer();
    const classes = sheet.className.split(" ");

    expect(classes).toContain("rounded-t-3xl");
    expect(classes).toContain("shadow-[0_-12px_40px_rgba(0,0,0,0.18)]");
    expect(classes).toContain("theme-soft-blue");
  });

  it("태블릿에서는 본문 열 폭으로 가운데에 띄운다", () => {
    const { sheet } = renderDrawer();

    expect(sheet.className.split(" ")).toContain("page-width");
  });

  it("모션 축소에서는 미끄러지지 않고 페이드만 한다", () => {
    const { sheet } = renderDrawer();
    const classes = sheet.className.split(" ");
    const slides = classes.filter((name) => name.includes("translateY(100%)"));

    expect(slides.length).toBeGreaterThan(0);
    expect(slides.every((name) => name.startsWith("motion-safe:"))).toBe(true);
    expect(classes).toContain("motion-reduce:transition-opacity");
    expect(classes).toContain("motion-reduce:data-starting-style:opacity-0");
    expect(classes).toContain("motion-reduce:data-ending-style:opacity-0");
  });
});
