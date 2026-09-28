import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "../RoomPage";

/**
 * 배경음 버튼·시트의 RoomPage 배선만 본다 — 시트 안 조작은 `AmbientSoundSheet.test.tsx`,
 * 재생 명령은 `useAmbientSound.test.tsx` 가 검증한다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

const CATALOG_JSON = JSON.stringify({
  version: 1,
  sounds: [{ id: "white", kind: "synth", label: "백색소음" }],
});

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomPage — 배경음 버튼·시트", () => {
  beforeEach(() => {
    // 훅이 `/sounds/catalog.json` 을 받는다 — jsdom 은 상대 URL fetch 가 던지므로 응답을 준다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(CATALOG_JSON, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("우상단 배경음 버튼이 꺼짐 상태로 있고 누르면 시트가 열린다", async () => {
    renderRoom();
    const button = screen.getByRole("button", { name: "배경음" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);

    expect(screen.getByRole("dialog", { name: "배경음" })).toBeInTheDocument();
    expect(await screen.findByRole("slider", { name: "백색소음 음량" })).toBeInTheDocument();
  });

  /**
   * 가로 1행 3열은 비어 있지 않고 순공시간·총공부시간이 오른쪽 끝에 붙어 있다. 같은 높이에
   * 두면 겹치므로 상태 필 아래로 내린다. jsdom 은 미디어쿼리를 평가하지 않아 클래스로 지킨다.
   */
  it("가로에서는 배경음 버튼이 상태 필 아래로 내려간다", () => {
    renderRoom();

    const button = screen.getByRole("button", { name: "배경음" });
    expect(button.className).toContain("landscape:top-[calc(env(safe-area-inset-top)+90px)]");
    // 세로는 그대로 상단이다 — 그 아래가 가운데 타이머 자리라 좁은 기기에서 겹친다.
    expect(button.className).toContain("top-[calc(env(safe-area-inset-top)+13px)]");
  });

  /**
   * 시트는 Radix 라 뒤 화면 차단을 스스로 한다. 손으로 만든 `inert` 를 겹치면 닫힐 때
   * 포커스를 돌려줄 버튼이 이미 inert 라 복귀가 조용히 실패한다.
   */
  it("시트가 열려 있는 동안 뒤 화면이 가려지고, 닫으면 진입 버튼으로 포커스가 돌아온다", async () => {
    renderRoom();
    const tapLayer = screen.getByRole("button", { name: "심플 모드 전환" });

    await userEvent.click(screen.getByRole("button", { name: "배경음" }));

    // 시트 밖은 aria-hidden 이라 기본 조회로는 잡히지 않는다.
    expect(screen.queryByRole("button", { name: "심플 모드 전환" })).not.toBeInTheDocument();
    expect(tapLayer).not.toHaveAttribute("inert");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "배경음" })).toHaveFocus();
    });
  });

  it("시트에서 음량을 올리면 버튼이 켜짐 상태로 바뀐다", async () => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "배경음" }));
    fireEvent.change(await screen.findByRole("slider", { name: "백색소음 음량" }), {
      target: { value: "60" },
    });
    await userEvent.keyboard("{Escape}");

    expect(await screen.findByRole("button", { name: "배경음 켜짐" })).toBeInTheDocument();
  });
});
