import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RoomPage } from "@/routes/RoomPage";

import { SessionControlBar } from "../components/SessionControlBar";
import { SessionTimer } from "../components/SessionTimer";
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
 * ⚠️ jsdom은 클래스에 붙은 `@media (orientation: landscape)`를 평가하지 않는다. 실제 가로
 * 렌더는 실기기·브라우저 QA의 몫이고, 여기서는 **델타가 코드에 존재하는지**와 **방향이 JS가
 * 아니라 CSS로 갈리는지**(회전 시 DOM이 유지되는지)를 고정한다. `SessionControlBar`는 세로·
 * 가로가 같은 고정 54px 치수를 쓰고(`size` prop 자체가 없다 — 방향별 variant 없음), 그래서
 * 미디어쿼리 없이 직접 렌더해 치수를 확인할 수 있다.
 */

function renderRoom(url = "/room/7?userId=1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const noop = () => {};

function renderControlBar() {
  return render(
    <SessionControlBar
      paused={false}
      onTogglePause={noop}
      onFlipCamera={noop}
      onRequestExit={noop}
    />,
  );
}

describe("SessionControlBar — 세로·가로 공통 54px (V2 `S1b`)", () => {
  it("바 버튼 3개가 모두 54px 원형이다 — 방향과 무관하게 고정", () => {
    renderControlBar();

    for (const name of ["일시정지", "카메라 전환", "공부 종료"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("h-[54px]");
      expect(button.className).toContain("w-[54px]");
    }
  });

  it("버튼 구성·순서·색은 세로와 가로가 공유한다 — 가로 전용 컴포넌트를 만들지 않는다", () => {
    const { container } = renderControlBar();

    const labels = [...container.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["일시정지", "카메라 전환", "공부 종료"]);
    expect(screen.getByRole("button", { name: "공부 종료" }).className).toContain(
      "bg-[var(--session-control-exit-bg)]",
    );
  });
});

describe("SessionTimer — 가로 타이포 (S3-5 `61:460` · S3-6 `61:531`)", () => {
  it("가로 프리뷰는 35px 우측 정렬로 재배치·축소된다", () => {
    render(<SessionTimer focusSec={0} studySec={0} state="focus" />);

    const number = screen.getByText("00:00:00").parentElement!;
    expect(number.className).toContain("text-[52px]");
    expect(number.className).toContain("landscape:text-[35px]");
    expect(number.className).toContain("landscape:text-right");
    expect(number.parentElement!.className).toContain("landscape:items-end");
  });

  it("가로 프리뷰 총 공부 병기는 13px/40%로 줄고 타이머 아래 우측에 붙는다", () => {
    render(<SessionTimer focusSec={0} studySec={0} state="focus" />);

    const total = screen.getByText("총 00:00:00").parentElement!;
    expect(total.className).toContain("landscape:text-[13px]");
    expect(total.className).toContain("landscape:text-white/40");
    expect(total.className).toContain("landscape:text-right");
  });

  it("가로 심플 타이머는 56px다 — design.md의 84px이 아니라 Figma 실측·display.lg 토큰 값", () => {
    render(<SessionTimer focusSec={0} studySec={0} state="focus" glow />);

    const number = screen.getByText("00:00:00").parentElement!;
    expect(number.className).toContain("landscape:text-[56px]");
    expect(number.className).toContain("landscape:leading-[64px]");
    expect(number.className).not.toContain("84px");
    // 심플은 가로에서도 중앙 정렬을 유지한다(우상단으로 가는 건 프리뷰뿐).
    expect(number.parentElement!.className).not.toContain("landscape:items-end");
  });

  it("발광 반경이 숫자 크기에 비례한다 — 52px에서 24/60px, 56px에서 26/64px", () => {
    // 인라인 style은 미디어쿼리를 탈 수 없어 반경을 `em`으로 뒀다. 상수가 흔들리면
    // 두 방향 중 한쪽이 Figma 실측에서 벗어나므로 여기서 환산값을 고정한다.
    render(<SessionTimer focusSec={0} studySec={0} state="focus" glow />);

    const shadow = screen.getByText("00:00:00").parentElement!.style.textShadow;
    expect(shadow).toContain("var(--session-glow-near)");
    const [near, far] = [...shadow.matchAll(/([\d.]+)em/g)].map((match) => Number(match[1]));

    // 세로 52px — Figma Spec 페이지 `14:7` 실측 24 / 60px과 동일.
    expect(near! * 52).toBeCloseTo(24, 1);
    expect(far! * 52).toBeCloseTo(60, 1);
    // 가로 심플 56px — Figma `61:531` 실측 26 / 64px과 1px 이내(육안 식별 불가).
    expect(Math.abs(near! * 56 - 26)).toBeLessThan(1);
    expect(Math.abs(far! * 56 - 64)).toBeLessThan(1);
  });
});

describe("RoomPage — 가로(거치) 배치", () => {
  function layerOf(container: HTMLElement) {
    return container.querySelector<HTMLElement>(".landscape\\:grid")!;
  }

  it("방향을 JS로 감지하지 않는다 — 미디어쿼리만으로 갈린다", () => {
    const matchMedia = vi.spyOn(window, "matchMedia");

    renderRoom();

    expect(matchMedia).not.toHaveBeenCalled();
    matchMedia.mockRestore();
  });

  it("세로 flex 컬럼과 가로 그리드가 같은 DOM에 함께 선언된다", () => {
    const { container } = renderRoom();

    const layer = layerOf(container);
    expect(layer.className).toContain("flex-col");
    expect(layer.className).toContain("landscape:grid-cols-[1fr_auto_1fr]");
    expect(layer.className).toContain("landscape:grid-rows-[auto_1fr_auto_auto_auto]");
  });

  it("가로 좌우 안전 영역을 반영한다 — 거치 시 노치가 좌우로 온다", () => {
    const { container } = renderRoom();

    const layer = layerOf(container);
    expect(layer.className).toContain("landscape:pl-[calc(env(safe-area-inset-left)+28px)]");
    expect(layer.className).toContain("landscape:pr-[calc(env(safe-area-inset-right)+28px)]");
    // 가로에는 iOS 상태바가 없어 상단 여백이 13 → 18로 바뀐다(상태바 높이만큼 빠진다).
    expect(layer.className).toContain("landscape:pt-[calc(env(safe-area-inset-top)+18px)]");
  });

  it("가로 프리뷰 — 상태 필은 상단 중앙, 타이머는 같은 행 우측 열에 둔다(겹침 방지)", () => {
    const { container } = renderRoom();

    const pill = screen.getByRole("status");
    expect(pill.className).toContain("landscape:col-start-2");
    expect(pill.className).toContain("landscape:row-start-1");

    const timer = container.querySelector('[class*="landscape:col-start-3"]')!;
    expect(timer.className).toContain("landscape:row-start-1");
    expect(timer.className).toContain("landscape:justify-self-end");
    // 우측 모서리로 끌어당기는 음수 마진(BY-336) — 레이어 패딩(28px)은 공용이라 줄이지 않고
    // 타이머만 붙인다(결과 여백 8px + safe-area). 상단은 실측(18px) 그대로다.
    expect(timer.className).toContain("landscape:-mr-5");
    expect(timer.className).not.toContain("landscape:-mt-");
  });

  it("가로 심플 — 타이머가 우상단에서 중앙으로 옮겨간다", async () => {
    const { container } = renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(container.querySelector('[class*="landscape:col-start-3"]')).toBeNull();
    const timer = container.querySelector('[class*="landscape:row-start-2"]')!;
    expect(timer.className).toContain("landscape:justify-self-center");
    expect(timer.className).toContain("landscape:self-center");
  });

  it("가로에서도 상태 필 문구가 남는다 — 좁다고 색 단독으로 상태를 전달하지 않는다", async () => {
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
