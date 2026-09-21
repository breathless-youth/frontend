import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "../dialog";

function renderOpenDialog() {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>공부를 마칠까요</DialogTitle>
      </DialogContent>
    </Dialog>,
  );

  const content = screen.getByRole("dialog");
  const dim = document.querySelector<HTMLElement>('[data-state="open"]:not([role="dialog"])');

  if (dim === null) {
    throw new Error("딤을 찾지 못했다");
  }

  return { content, dim };
}

describe("Dialog 모션", () => {
  it("본체와 딤이 같은 시간 동안 움직인다", () => {
    const { content, dim } = renderOpenDialog();

    expect(content.className).toContain("duration-200");
    expect(dim.className).toContain("duration-200");
  });

  it("본체와 딤 모두 나가는 애니메이션을 가진다", () => {
    const { content, dim } = renderOpenDialog();

    expect(content.className).toContain("data-[state=closed]:animate-out");
    expect(dim.className).toContain("data-[state=closed]:animate-out");
  });

  it("배율이 0이 아닌 값에서 시작하고 같은 값으로 돌아간다", () => {
    const { content } = renderOpenDialog();

    // 값 없는 zoom-in 은 배율 0 이라 아무것도 없던 자리에서 튀어나온 것처럼 보인다.
    expect(content.className).toContain("data-[state=open]:zoom-in-95");
    expect(content.className).toContain("data-[state=closed]:zoom-out-95");
    expect(content.className).not.toContain("zoom-in-0");
    expect(content.className).not.toContain("zoom-out-0");
  });
});

describe("Dialog 포털 자리와 딤", () => {
  it("container 를 주면 그 안에 그려진다", () => {
    const host = document.createElement("div");
    host.id = "session-surface";
    document.body.appendChild(host);

    render(
      <Dialog open>
        <DialogContent container={host}>
          <DialogTitle>공부를 마칠까요</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(host.contains(screen.getByRole("dialog"))).toBe(true);
  });

  it("overlayClassName 이 딤에 얹힌다", () => {
    render(
      <Dialog open>
        <DialogContent overlayClassName="bg-[var(--session-dim)]">
          <DialogTitle>공부를 마칠까요</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const dim = document.querySelector<HTMLElement>('[data-state="open"]:not([role="dialog"])');
    expect(dim?.className).toContain("bg-[var(--session-dim)]");
  });
});
