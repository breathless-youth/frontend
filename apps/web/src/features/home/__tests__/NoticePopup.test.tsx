import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NoticeResponse } from "../notice";
import { NoticePopup } from "../NoticePopup";

/**
 * U2 공지 팝업 — 순수 프레젠테이션 (스펙 §4.3, 승인된 테스트 목록 §4.4).
 *
 * 검증 무게중심은 **세 가지 닫기 동선의 콜백 구분**이다: X·확인은 "이번 방문만 닫기",
 * "다시 보지 않기"는 영구 dismiss로 이어지므로, 서로 섞여 호출되면 정책(결정 4)이 깨진다.
 */

const BASE_NOTICE: NoticeResponse = {
  id: 1,
  title: "새 기능이 나왔어요",
  content: "이제 종일룸에서 친구와 함께 공부할 수 있어요.",
  imageUrl: null,
};

function renderPopup(overrides: Partial<NoticeResponse> = {}) {
  const handlers = { onConfirm: vi.fn(), onClose: vi.fn(), onNeverShowAgain: vi.fn() };
  render(<NoticePopup notice={{ ...BASE_NOTICE, ...overrides }} {...handlers} />);
  return handlers;
}

describe("NoticePopup — 렌더", () => {
  it("제목·본문·다시 보지 않기·확인·X를 렌더한다", () => {
    renderPopup();

    expect(screen.getByText(BASE_NOTICE.title)).toBeInTheDocument();
    expect(screen.getByText(BASE_NOTICE.content)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 보지 않기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
  });

  it("imageUrl이 있으면 배너 이미지를 렌더한다", () => {
    renderPopup({ imageUrl: "https://cdn.example.com/banner.png" });

    expect(screen.getByTestId("notice-popup-banner")).toHaveAttribute(
      "src",
      "https://cdn.example.com/banner.png",
    );
  });

  it("imageUrl이 null이면 배너 영역을 그리지 않는다 — 텍스트만 (결정 8)", () => {
    renderPopup({ imageUrl: null });

    expect(screen.queryByTestId("notice-popup-banner")).not.toBeInTheDocument();
  });
});

describe("NoticePopup — 세 가지 닫기 동선의 콜백 구분 (결정 4)", () => {
  it("확인은 onConfirm만 호출한다", () => {
    const handlers = renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onNeverShowAgain).not.toHaveBeenCalled();
  });

  it("X는 onClose만 호출한다", () => {
    const handlers = renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onNeverShowAgain).not.toHaveBeenCalled();
  });

  it("다시 보지 않기는 onNeverShowAgain만 호출한다", () => {
    const handlers = renderPopup();

    fireEvent.click(screen.getByRole("button", { name: "다시 보지 않기" }));

    expect(handlers.onNeverShowAgain).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("딤 클릭은 아무 콜백도 호출하지 않는다 — 닫기 동선은 세 개뿐", () => {
    const handlers = renderPopup();

    fireEvent.click(screen.getByTestId("notice-popup-dim"));

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onNeverShowAgain).not.toHaveBeenCalled();
  });
});
