import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "../switch";

describe("Switch", () => {
  it("스위치 역할과 켜짐 상태를 드러낸다", () => {
    render(<Switch checked aria-label="집중 연동" onCheckedChange={vi.fn()} />);

    expect(screen.getByRole("switch", { name: "집중 연동" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("탭·스페이스·엔터가 모두 반대 값으로 바꾼다", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} aria-label="집중 연동" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch");

    await userEvent.click(toggle);
    toggle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{Enter}");

    expect(onCheckedChange).toHaveBeenCalledTimes(3);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("탭 이동으로 포커스를 받는다", async () => {
    render(<Switch checked={false} aria-label="집중 연동" onCheckedChange={vi.fn()} />);

    await userEvent.tab();

    expect(screen.getByRole("switch")).toHaveFocus();
  });

  it("disabled 면 조작이 먹지 않는다", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} disabled aria-label="집중 연동" onCheckedChange={onCheckedChange} />,
    );

    await userEvent.click(screen.getByRole("switch"));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  /**
   * 트랙은 24px 라 그 자체로는 최소 터치 타겟에 못 미친다. 보이지 않는 `after` 가 위아래를
   * 덧대 44px 를 만드는데, jsdom 은 레이아웃을 계산하지 않으므로 그 클래스의 존재로 지킨다.
   * 실제 크기는 실기기에서 확인한다.
   */
  it("탭 영역을 넓히는 덧댐이 남아 있다", () => {
    render(<Switch checked={false} aria-label="집중 연동" onCheckedChange={vi.fn()} />);

    expect(screen.getByRole("switch").className).toContain("after:-inset-y-2.5");
  });
});
