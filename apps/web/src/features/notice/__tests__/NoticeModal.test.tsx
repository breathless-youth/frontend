import type { NoticeResponse } from "@focusmakers/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoticeModal } from "../NoticeModal";

const full: NoticeResponse = {
  id: 1,
  title: "포메에 의견을 들려주실 분을 찾아요",
  content: "본문",
  imageUrl: "/images/interview/mascot-phone.png",
  audience: "G1_NOT_STARTED",
  badgeText: "스타벅스 기프티콘 100% 증정",
  buttonText: "인터뷰 신청하기",
  buttonUrl: "https://docs.google.com/forms/x",
};

function setup(notice: NoticeResponse, withPrimary = true) {
  const handlers = { onPrimary: vi.fn(), onNeverAgain: vi.fn(), onClose: vi.fn() };
  render(
    <NoticeModal
      notice={notice}
      onPrimary={withPrimary ? handlers.onPrimary : undefined}
      onNeverAgain={handlers.onNeverAgain}
      onClose={handlers.onClose}
    />,
  );
  return handlers;
}

describe("NoticeModal", () => {
  it("이미지·배지·제목·본문·본 버튼을 그린다", () => {
    setup(full);
    expect(screen.getByRole("dialog", { name: full.title })).toBeInTheDocument();
    expect(screen.getByText(full.badgeText!)).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", full.imageUrl);
    expect(screen.getByRole("button", { name: "인터뷰 신청하기" })).toBeInTheDocument();
  });

  it("없는 항목은 그리지 않는다", () => {
    setup({ ...full, imageUrl: null, badgeText: null, buttonText: null, buttonUrl: null }, false);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(full.badgeText!)).toBeNull();
    expect(screen.queryByRole("button", { name: "인터뷰 신청하기" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("onPrimary가 없으면 버튼 문구가 있어도 본 버튼을 그리지 않는다", () => {
    setup(full, false);
    expect(screen.queryByRole("button", { name: "인터뷰 신청하기" })).toBeNull();
  });

  it("세 버튼이 각자 콜백을 부른다", () => {
    const h = setup(full);
    fireEvent.click(screen.getByRole("button", { name: "인터뷰 신청하기" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보지 않기" }));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(h.onPrimary).toHaveBeenCalledTimes(1);
    expect(h.onNeverAgain).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc로 닫히지 않는다", () => {
    const h = setup(full);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("홈 밖 body로 그려져도 홈과 같은 색 토큰을 쓴다", () => {
    setup(full);
    expect(screen.getByRole("dialog")).toHaveClass("theme-soft-blue");
  });

  it("한국어 제목·본문이 단어 중간에서 줄바꿈되지 않는다", () => {
    setup(full);
    expect(screen.getByText(full.title)).toHaveClass("break-keep");
    expect(screen.getByText("본문")).toHaveClass("break-keep");
  });

  it("열릴 때 본 버튼이 아니라 모달 자체에 초점을 둔다", async () => {
    setup(full);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    expect(screen.getByRole("button", { name: "인터뷰 신청하기" })).not.toHaveFocus();
  });
});
