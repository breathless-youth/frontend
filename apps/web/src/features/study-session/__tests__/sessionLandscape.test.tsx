import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RoomPage } from "@/routes/RoomPage";

import { SessionCaption } from "../components/SessionCaption";
import { SessionControlBar } from "../components/SessionControlBar";
import { SessionTimer } from "../components/SessionTimer";
import { sessionSurfaceStyle } from "../sessionTheme";

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
 * 아니라 CSS로 갈리는지**(회전 시 DOM이 유지되는지)를 고정한다. 치수 자체는 미디어쿼리 없이
 * 검증할 수 있도록 `SessionControlBar`의 `size="sm"`을 직접 렌더해서 확인한다.
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

function renderControlBar(size?: "md" | "sm" | "responsive") {
  return render(
    <SessionControlBar
      paused={false}
      size={size}
      onTogglePause={noop}
      onFlipCamera={noop}
      onRequestExit={noop}
    />,
  );
}

describe("SessionControlBar — 가로 축소 변형 (S3-5 `61:463`)", () => {
  it("size=sm은 218×68 축소 치수를 쓴다 — 바 높이 68 · 간격 20 · 패딩 22/13/9", () => {
    renderControlBar("sm");

    const bar = screen.getByRole("group", { name: "세션 컨트롤" });
    expect(bar.className).toContain("h-[68px]");
    expect(bar.className).toContain("gap-5");
    expect(bar.className).toContain("px-[22px]");
    expect(bar.className).toContain("pt-[13px]");
    expect(bar.className).toContain("pb-[9px]");
  });

  it("size=sm 핸들은 28×3으로 줄어든다", () => {
    const { container } = renderControlBar("sm");

    const handle = container.querySelector('[aria-hidden="true"][class*="w-7"]');
    expect(handle).not.toBeNull();
    expect(handle!.className).toContain("h-[3px]");
  });

  it("가로에서도 버튼 히트 영역이 44px 미만으로 줄지 않는다 (접근성 최소치)", () => {
    renderControlBar("sm");

    for (const name of ["일시정지", "카메라 전환", "공부 종료"]) {
      expect(screen.getByRole("button", { name }).className).toContain("size-[44px]");
    }
  });

  it("세로 md는 50px 버튼을 유지한다 — 그룹 간 축소 금지", () => {
    renderControlBar("md");

    expect(screen.getByRole("button", { name: "일시정지" }).className).toContain("size-[50px]");
    expect(screen.getByRole("group", { name: "세션 컨트롤" }).className).toContain("gap-[22px]");
  });

  it("버튼 구성·순서·색은 세로와 가로가 공유한다 — 가로 전용 컴포넌트를 만들지 않는다", () => {
    const { container } = renderControlBar("sm");

    const labels = [...container.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["일시정지", "카메라 전환", "공부 종료"]);
    expect(screen.getByRole("button", { name: "공부 종료" }).className).toContain(
      "bg-[var(--session-exit-bg)]",
    );
  });

  it("기본값은 하나의 DOM으로 세로·가로를 모두 그린다 — 회전에 언마운트가 없다", () => {
    renderControlBar();

    const bar = screen.getByRole("group", { name: "세션 컨트롤" });
    expect(bar.className).toContain("h-20");
    expect(bar.className).toContain("landscape:h-[68px]");

    const pauseButton = screen.getByRole("button", { name: "일시정지" });
    expect(pauseButton.className).toContain("size-[50px]");
    expect(pauseButton.className).toContain("landscape:size-[44px]");
    // 아이콘도 버튼과 같은 비율(44/50)로 줄어든다 — pause는 Figma 실측(16×18) 그대로다.
    expect(pauseButton.querySelector("img")!.className).toContain("h-[18px]");
    expect(pauseButton.querySelector("img")!.className).toContain("landscape:h-[15.8px]");
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

describe("SessionCaption — 가로 축소 (S3-5 `61:462`)", () => {
  it("가로에서 11px/45%로 줄어든다", () => {
    render(<SessionCaption text="영상은 기기 안에서만 처리돼요" />);

    const caption = screen.getByText("영상은 기기 안에서만 처리돼요");
    expect(caption.className).toContain("text-[12px]");
    expect(caption.className).toContain("landscape:text-[11px]");
    expect(caption.className).toContain("landscape:text-white/45");
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
    // 가로 비집중·일시정지는 Figma 미설계 — 서브 문구는 세로와 같이 필 바로 아래에 둔다.
    expect(screen.getByText("다시 시작하면 이어서 측정돼요")).toBeInTheDocument();
  });

  it("가로에서도 싱글룸 프라이버시 문구만 쓴다", () => {
    renderRoom();

    expect(screen.getByText("영상은 기기 안에서만 처리돼요")).toBeInTheDocument();
    expect(screen.queryByText(/서버로 전송되지 않/)).not.toBeInTheDocument();
  });

  it("심플 배경은 세로·가로가 같은 값을 쓴다 — 회전할 때 배경이 깜빡이지 않는다", () => {
    // Figma는 세로 #0B0F14 / 가로 #0A0F18로 값이 다르지만(미확정 불일치) 세로 값으로 통일했다.
    const vars = sessionSurfaceStyle as unknown as Record<string, string>;
    expect(vars["--session-simple-base"]).toBe("#0b0f14");
    expect(JSON.stringify(vars)).not.toContain("0a0f18");
  });
});
