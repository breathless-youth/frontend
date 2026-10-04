import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("배경음 버튼이 꺼짐 상태로 있고 누르면 시트가 열린다", async () => {
    renderRoom();
    const button = screen.getByRole("button", { name: "배경음" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);

    expect(screen.getByRole("dialog", { name: "배경음" })).toBeInTheDocument();
    expect(await screen.findByRole("slider", { name: "백색소음 음량" })).toBeInTheDocument();
  });

  it("배경음 버튼은 하단 바가 아니라 부가 기능 그룹에서 카메라 전환 위에 있다", () => {
    renderRoom();

    const namesIn = (group: string) =>
      within(screen.getByRole("group", { name: group }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"));
    expect(namesIn("세션 컨트롤")).toEqual(["일시정지", "공부 종료"]);
    expect(namesIn("부가 기능")).toEqual([expect.stringMatching(/^배경음/), "카메라 전환"]);
  });

  it("탭 순서가 부가 기능(배경음, 카메라 전환)에서 시작해 하단 바로 이어진다", async () => {
    renderRoom();

    const names: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      names.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }

    const ambient = names.findIndex((name) => name.startsWith("배경음"));
    expect(ambient).toBeGreaterThanOrEqual(0);
    expect(names[ambient + 1]).toBe("카메라 전환");
    expect(names.indexOf("일시정지")).toBeGreaterThan(ambient + 1);
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
