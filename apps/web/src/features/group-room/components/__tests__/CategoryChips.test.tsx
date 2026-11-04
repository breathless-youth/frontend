import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CategoryChips } from "../CategoryChips";

const options = [
  { value: "CSAT", label: "수능" },
  { value: "SCHOOL", label: "내신" },
];

describe("CategoryChips", () => {
  it("전체 라벨이 없으면 시험·목표 칩만 두고 넘긴 값의 칩이 눌려 있다", () => {
    render(<CategoryChips options={options} value="SCHOOL" onChange={vi.fn()} />);
    expect(
      screen
        .getAllByRole("button")
        .map((button) => [button.textContent, button.getAttribute("aria-pressed")]),
    ).toEqual([
      ["수능", "false"],
      ["내신", "true"],
    ]);
  });

  it("다른 칩을 누르면 그 값을 넘기고, 눌린 칩을 다시 눌러도 풀지 않는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CategoryChips options={options} value={null} onChange={onChange} allLabel="전체" />);
    await user.click(screen.getByRole("button", { name: "내신" }));
    expect(onChange).toHaveBeenCalledWith("SCHOOL");
    await user.click(screen.getByRole("button", { name: "전체" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("전체 라벨이 없으면 값이 늘 있어서 문자열만 받는 함수를 넘길 수 있다", async () => {
    const picked: string[] = [];
    const onChange = (value: string) => picked.push(value);
    render(<CategoryChips options={options} value="CSAT" onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "내신" }));
    expect(picked).toEqual(["SCHOOL"]);
  });

  it("묶음 폭이 345px보다 좁으면 모든 칩의 좌우 여백을 줄이는 클래스를 둔다", () => {
    render(<CategoryChips options={options} value={null} onChange={vi.fn()} allLabel="전체" />);
    // jsdom에는 레이아웃이 없어 줄 수를 측정할 수 없으므로, 폭 360px 화면에서 칩을 두 줄에 모으는 클래스가 삭제되지 않게 고정한다.
    expect(screen.getByRole("group")).toHaveClass("@container");
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveClass("px-3.5", "@max-[345px]:px-2.75", "min-w-11");
    }
  });
});
