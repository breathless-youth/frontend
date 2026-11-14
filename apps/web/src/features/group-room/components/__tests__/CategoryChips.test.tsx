import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryChips } from "../CategoryChips";

const options = [
  { value: "CSAT", label: "수능" },
  { value: "SCHOOL", label: "내신" },
];

afterEach(() => vi.restoreAllMocks());

describe("CategoryChips", () => {
  it("전체 칩 없이 접어도 앞에 둔 칩을 중복하지 않는다", () => {
    render(
      <CategoryChips options={options} value="CSAT" onChange={vi.fn()} compact leading="CSAT" />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("접으면 앞에 둘 칩만 전체 바로 뒤로 오고, 고른 값만으로는 순서가 바뀌지 않는다", () => {
    const three = [...options, { value: "LANGUAGE", label: "어학" }];
    const labels = () => screen.getAllByRole("button").map((button) => button.textContent);
    const { rerender } = render(
      <CategoryChips
        options={three}
        value="LANGUAGE"
        onChange={vi.fn()}
        allLabel="전체"
        compact
        leading={null}
      />,
    );
    expect(labels()).toEqual(["전체", "수능", "내신", "어학"]);
    rerender(
      <CategoryChips
        options={three}
        value="LANGUAGE"
        onChange={vi.fn()}
        allLabel="전체"
        compact
        leading="SCHOOL"
      />,
    );
    expect(labels()).toEqual(["전체", "내신", "수능", "어학"]);
  });

  it("접힌 두 번째 줄은 포커스와 접근성 트리에서 제외하고 펼치면 복원한다", () => {
    const offset = vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.textContent === "내신" ? 42 : 0;
    });
    const { rerender } = render(
      <CategoryChips options={options} value={null} onChange={vi.fn()} allLabel="전체" compact />,
    );
    const hidden = screen.getByText("내신");
    expect(hidden).toHaveAttribute("inert");
    expect(hidden).toHaveAttribute("aria-hidden", "true");
    rerender(<CategoryChips options={options} value={null} onChange={vi.fn()} allLabel="전체" />);
    expect(hidden).not.toHaveAttribute("inert");
    expect(hidden).not.toHaveAttribute("aria-hidden");
    offset.mockRestore();
  });
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

  it("묶음 폭이 305px보다 좁으면 글자와 좌우 여백, 최소 폭을 한 번 더 줄이는 클래스를 둔다", () => {
    render(<CategoryChips options={options} value={null} onChange={vi.fn()} allLabel="전체" />);
    // jsdom에는 레이아웃이 없어 줄 수를 측정할 수 없으므로, 폭 320px 화면에서 칩을 두 줄에 모으는 클래스가 삭제되지 않게 고정한다.
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveClass(
        "text-sm",
        "@max-[305px]:text-[13px]",
        "@max-[305px]:px-2",
        "@max-[305px]:min-w-10",
      );
    }
  });

  it("보이는 높이 36px 칩의 누르는 영역을 위아래 5px씩 넓혀 44px로 맞춘다", () => {
    render(<CategoryChips options={options} value={null} onChange={vi.fn()} allLabel="전체" />);
    // jsdom에는 레이아웃이 없어 영역 높이를 측정할 수 없으므로, 36px 칩이 44px 영역이 되는 클래스를 고정한다.
    // 영역은 1px 테두리 안쪽에서 시작해서 4px 대신 5px씩 넓혀야 칩 밖으로 4px씩 나간다.
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveClass("h-9", "border", "before:absolute", "before:-inset-y-1.25");
    }
  });
});
