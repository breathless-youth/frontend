import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryUpdateNoticeStore,
  resetUpdateNoticeStore,
  setUpdateNoticeStore,
  type UpdateNoticeStore,
} from "../updateNotice";
import { UpdateNoticeSheet } from "../UpdateNoticeSheet";
import { UpdateNoticeSheetHost } from "../UpdateNoticeSheetHost";

/**
 * U1 업데이트 안내 시트 (RN 원본 `apps/mobile/__tests__/update-notice-sheet.test.tsx` 19케이스
 * 중 핵심을 이식 — BY-329 검증 리뷰 #2).
 *
 * jsdom은 CSS transition을 실제로 실행하지 않아 `transitionend`가 자동 발화하지 않는다.
 * 닫힘 완료(rendered=false)를 봐야 하는 케이스는 필요하면 `fireEvent.transitionEnd`를
 * 패널(`update-notice-panel`)에 직접 쏜다 — `open`이 아직 rAF로 true가 되지 않았다면(=한 번도
 * 안 열렸다면) 가드가 즉시 언마운트하므로 그 경우는 이벤트 없이도 사라진다.
 */

const TITLE = "로그인이 곧 추가돼요";

describe("UpdateNoticeSheet — 노출", () => {
  it("visible이면 문구와 확인 CTA를 렌더한다", () => {
    render(<UpdateNoticeSheet visible onConfirm={vi.fn()} />);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText("다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("지금까지의 기록도 로그인하면 계정에 그대로 이어져요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
  });

  it("visible=false면 아무것도 렌더하지 않는다", () => {
    render(<UpdateNoticeSheet visible={false} onConfirm={vi.fn()} />);

    expect(screen.queryByTestId("update-notice-sheet")).not.toBeInTheDocument();
  });
});

describe("UpdateNoticeSheet — 확인 CTA", () => {
  it("클릭하면 onConfirm이 호출된다 — 유일한 닫기 경로", () => {
    const onConfirm = vi.fn();
    render(<UpdateNoticeSheet visible onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId("update-notice-confirm"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("UpdateNoticeSheet — 딤", () => {
  it("onDismissRequest를 넘기지 않으면 딤 클릭이 아무 일도 하지 않는다", () => {
    const onConfirm = vi.fn();
    render(<UpdateNoticeSheet visible onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId("update-notice-dim"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });
});

describe("UpdateNoticeSheet — 미개방 언마운트 가드 (회귀)", () => {
  it("한 번도 열리지 않은 채 visible이 false로 돌아가면 즉시 언마운트한다 — 투명 딤이 남지 않는다", () => {
    // 열림 rAF가 발화하기 전에 visible이 다시 꺼진 상황을 재현한다: RN 원본의
    // `!opened.current` 가드가 없으면 transitionend가 영영 발화하지 않아 rendered=true로
    // 남고, fixed inset-0 z-50 딤이 홈 클릭을 계속 삼킨다.
    const { rerender } = render(<UpdateNoticeSheet visible={false} onConfirm={vi.fn()} />);
    rerender(<UpdateNoticeSheet visible onConfirm={vi.fn()} />);
    rerender(<UpdateNoticeSheet visible={false} onConfirm={vi.fn()} />);

    expect(screen.queryByTestId("update-notice-sheet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("update-notice-dim")).not.toBeInTheDocument();
  });
});

describe("UpdateNoticeSheetHost — 확인 CTA로 닫히고 seen이 저장된다", () => {
  let store: UpdateNoticeStore;

  beforeEach(() => {
    vi.stubEnv("VITE_UPDATE_NOTICE_ENABLED", "true");
    store = createMemoryUpdateNoticeStore(false);
    setUpdateNoticeStore(store);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetUpdateNoticeStore();
  });

  it("확인을 누르면 시트가 닫히고 저장소에 봤음이 기록된다", async () => {
    render(<UpdateNoticeSheetHost />);

    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTestId("update-notice-confirm"));

    await waitFor(() => {
      const sheet = screen.queryByTestId("update-notice-sheet");
      if (sheet) {
        // 열림 rAF가 이미 발화했다면(opened) 닫힘엔 transitionend가 필요하다.
        fireEvent.transitionEnd(screen.getByTestId("update-notice-panel"));
      }
      expect(screen.queryByTestId("update-notice-sheet")).not.toBeInTheDocument();
    });
    await expect(store.hasSeenUpdateNotice()).resolves.toBe(true);
  });
});
