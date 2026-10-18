import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button";

describe("Button", () => {
  it("subtle variant와 xl 크기로 렌더된다", () => {
    render(
      <Button variant="subtle" size="xl">
        방 만들기
      </Button>,
    );
    const button = screen.getByRole("button", { name: "방 만들기" });
    expect(button).toBeEnabled();
    expect(button.className).toContain("h-14");
    expect(button.className).toContain("bg-brand-subtle");
    expect(button.className).toContain("text-primary");
  });

  it("type을 지정하지 않으면 기본값이 submit이 아니라 button이다", () => {
    render(<Button>확인</Button>);
    expect(screen.getByRole("button", { name: "확인" })).toHaveAttribute("type", "button");
  });

  it("type을 지정하면 그대로 유지된다", () => {
    render(<Button type="submit">제출</Button>);
    expect(screen.getByRole("button", { name: "제출" })).toHaveAttribute("type", "submit");
  });

  it("icon 크기는 54px 원형이다", () => {
    render(
      <Button size="icon" aria-label="아이콘 버튼">
        A
      </Button>,
    );
    const button = screen.getByRole("button", { name: "아이콘 버튼" });
    expect(button.className).toContain("h-13.5");
    expect(button.className).toContain("w-13.5");
    expect(button.className).toContain("rounded-full");
  });

  it("outline-primary는 배경 없이 브랜드색 테두리와 글자다", () => {
    render(<Button variant="outline-primary">시간 직접 입력</Button>);
    expect(screen.getByRole("button", { name: "시간 직접 입력" })).toHaveClass(
      "border-primary",
      "bg-transparent",
      "text-primary",
    );
  });

  it("link는 배경·테두리 없이 밑줄 친 브랜드색 글자다", () => {
    render(<Button variant="link">수정</Button>);
    expect(screen.getByRole("button", { name: "수정" })).toHaveClass(
      "bg-transparent",
      "text-primary",
      "underline",
    );
  });

  it("outline-destructive는 배경 없이 오류색 테두리와 글자다", () => {
    render(<Button variant="outline-destructive">삭제</Button>);
    expect(screen.getByRole("button", { name: "삭제" })).toHaveClass(
      "border-feedback-danger",
      "bg-transparent",
      "text-feedback-danger",
    );
  });
});
