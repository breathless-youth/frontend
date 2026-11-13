import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "@/routes/RoomPage";

import { SessionClock } from "../components/SessionClock";
import { sessionSurfaceStyle } from "../sessionTheme";

/** 복원 게이트는 자기 테스트가 따로 있다 — 여기서는 통과시킨다. */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

/**
 * S3-5(가로 프리뷰) · S3-6(가로 심플) — **가로 브레이크포인트 레이아웃**.
 *
 * 가로는 새로운 세션 상태가 아니라 세로(S3-1~S3-4)와 같은 상태·문구·데이터 계약에 얹히는
 * 레이아웃 변형이다. 그래서 이 파일은 상태 로직을 다시 검증하지 않고 **방향 델타**만 고정한다.
 *
 * ⚠️ jsdom은 클래스에 붙은 `landscape-compact`(가로이면서 높이 30rem 미만)를 평가하지 않는다. 실제 가로
 * 렌더는 실기기·브라우저 QA의 몫이고, 여기서는 **델타가 코드에 존재하는지**와 **방향이 JS가
 * 아니라 CSS로 갈리는지**(회전 시 DOM이 유지되는지)를 고정한다.
 */

function renderRoom(url = "/room/7?userId=1") {
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return view;
}

function renderClock(simple: boolean) {
  return render(
    <SessionClock
      view="focus"
      studySec={0}
      focusSec={0}
      todayStudySec={0}
      todayFocusSec={0}
      state="focus"
      statusLabel=""
      simple={simple}
    />,
  );
}

describe("SessionClock — 가로 타이포", () => {
  it("세로 52px, 가로 기본 44px로 가운데 정렬을 유지한다", () => {
    renderClock(false);

    const number = screen.getByTestId("session-clock-number");
    expect(number.className).toContain("text-[52px]");
    expect(number.className).toContain("landscape-compact:text-[44px]");
    expect(number.className).toContain("text-center");
  });

  it("가로 심플은 72px다", () => {
    renderClock(true);

    const number = screen.getByTestId("session-clock-number");
    expect(number.className).toContain("landscape-compact:text-[72px]");
  });
});

describe("RoomPage — 가로(거치) 배치", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function layerOf() {
    // 하단 바는 마스코트와 같은 줄 상자 안에 있어서 바깥쪽 flex 컬럼이 세션 레이어다.
    return screen.getByRole("toolbar", { name: "공부 조작" }).closest<HTMLElement>(".flex-col")!;
  }

  it("방향을 JS로 감지하지 않는다 — 미디어쿼리만으로 갈린다", () => {
    // jsdom에는 matchMedia가 없어 감시할 함수를 직접 붙였다 뗀다.
    const matchMedia = vi.fn();
    vi.stubGlobal("matchMedia", matchMedia);

    renderRoom();

    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("세로·가로가 같은 flex 컬럼을 쓴다 — 회전해도 DOM이 그대로다", () => {
    renderRoom();

    expect(layerOf().className).toContain("flex-col");
  });

  it("가로 좌우 안전 영역을 반영한다 — 거치 시 노치가 좌우로 온다", () => {
    renderRoom();

    const layer = layerOf();
    expect(layer.className).toContain("landscape-compact:pl-[max(env(safe-area-inset-left),16px)]");
    expect(layer.className).toContain(
      "landscape-compact:pr-[max(env(safe-area-inset-right),16px)]",
    );
    // 가로에는 iOS 상태바가 없어 상단 여백이 13 → 18로 바뀐다(상태바 높이만큼 빠진다).
    expect(layer.className).toContain("landscape-compact:pt-[calc(env(safe-area-inset-top)+18px)]");
  });

  it("가로 기본 — 카메라 창은 오른쪽 아래 160×108이다", () => {
    const { container } = renderRoom();

    const surface = container.querySelector('[data-session-surface="camera"]')!;
    expect(surface.className).toContain(
      "landscape-compact:right-[max(env(safe-area-inset-right),16px)]",
    );
    expect(surface.className).toContain("landscape-compact:w-40");
    expect(surface.className).toContain("landscape-compact:h-27");
  });

  it("가로 기본 — 시간 묶음을 과목 줄 높이의 위 가운데에 둔다", () => {
    const { container } = renderRoom();

    const clock = container.querySelector(
      '[class*="landscape-compact:top-[calc(env(safe-area-inset-top)+40px)]"]',
    )!;
    expect(clock).toContainElement(screen.getByTestId("session-clock-number"));
    expect(clock.className).toContain("landscape-compact:-translate-x-1/2");
  });

  it("가로 심플 — 시간 묶음을 화면 가운데에 띄운다", async () => {
    const { container } = renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    const clock = container.querySelector('[class*="landscape-compact:top-1/2"]')!;
    expect(clock).toContainElement(screen.getByTestId("session-clock-number"));
    expect(clock.className).toContain("landscape-compact:-translate-y-1/2");
    expect(clock.className).toContain("landscape-compact:-translate-x-1/2");
  });

  it("가로에서도 상태 문구가 남는다 — 좁다고 색 단독으로 상태를 전달하지 않는다", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(screen.getByRole("status")).toHaveTextContent("측정을 일시정지했어요");
  });

  it("심플 배경은 세로·가로가 같은 값을 쓴다 — 회전할 때 배경이 깜빡이지 않는다", () => {
    // Figma는 세로 #0B0F14 / 가로 #0A0F18로 값이 다르지만(미확정 불일치) 세로 값으로 통일했다.
    const vars = sessionSurfaceStyle as unknown as Record<string, string>;
    expect(vars["--session-simple-base"]).toBe("#0b0f14");
    expect(JSON.stringify(vars)).not.toContain("0a0f18");
  });
});
