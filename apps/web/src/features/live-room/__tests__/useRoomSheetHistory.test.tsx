import { act, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRoomSheetHistory } from "../useRoomSheetHistory";

type Sheet = "subject" | "ambient";

type Controls = ReturnType<typeof useRoomSheetHistory<Sheet>> & {
  page: Sheet | null;
  setPage: (next: Sheet | null) => void;
};

const HOME_URL = "/social/groups/1?userId=7";
const ROOM_URL = "/social/groups/1/room?userId=7";
const onClosed = vi.fn();

/** 방 항목 아래에 그룹 홈을 두어, 방 밖으로 나가면 경로로 바로 드러나게 한다. */
function seedRoomEntry() {
  window.history.replaceState({ idx: 0, key: "home" }, "", HOME_URL);
  window.history.pushState({ idx: 1, key: "room", usr: { inviteCode: "0712" } }, "", ROOM_URL);
}

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function historyFlags() {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  return { sheet: state.sessionPage ?? null, guard: "roomHistoryGuard" in state };
}

/** 앞으로 쌓인 항목 없이 뒤로 한 칸 갔다가 popstate가 끝날 때까지 기다린다. */
async function traverse(delta: number) {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      window.history.go(delta);
    });
  });
}

function renderSheets(studying = true) {
  const controls = { current: null as unknown as Controls };
  function Harness({ studying }: { studying: boolean }) {
    const [page, setPage] = useState<Sheet | null>(null);
    if (!studying && page !== null) {
      setPage(null);
    }
    const history = useRoomSheetHistory<Sheet>({ page, setPage, studying, onClosed });
    controls.current = { ...history, page, setPage };
    return null;
  }
  const view = render(<Harness studying={studying} />);
  return {
    controls,
    ...view,
    setStudying: (next: boolean) => view.rerender(<Harness studying={next} />),
  };
}

beforeEach(() => {
  seedRoomEntry();
  onClosed.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useRoomSheetHistory", () => {
  it("처음 열 때 지킴 항목과 창 항목을 쌓고, 닫고 다시 열 때는 창 항목만 쌓는다", async () => {
    const { controls } = renderSheets();
    const push = vi.spyOn(window.history, "pushState");

    act(() => controls.current.openPage("subject"));
    expect(push).toHaveBeenCalledTimes(2);
    expect(historyFlags()).toEqual({ sheet: "subject", guard: true });
    expect(controls.current.page).toBe("subject");

    await traverse(-1);
    expect(controls.current.page).toBeNull();
    expect(historyFlags()).toEqual({ sheet: null, guard: true });

    push.mockClear();
    act(() => controls.current.openPage("ambient"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(historyFlags()).toEqual({ sheet: "ambient", guard: true });
  });

  it("창에서 다른 창을 열면 항목을 더 쌓지 않아 뒤로 가기 한 번에 닫힌다", async () => {
    const { controls } = renderSheets();
    act(() => controls.current.openPage("subject"));
    const push = vi.spyOn(window.history, "pushState");

    act(() => controls.current.openPage("ambient"));
    expect(push).not.toHaveBeenCalled();
    expect(controls.current.page).toBe("ambient");

    await traverse(-1);
    expect(controls.current.page).toBeNull();
  });

  it("창을 닫은 직후의 스와이프가 거듭 와도 방 항목 아래로 내려가지 않는다", async () => {
    const { controls } = renderSheets();
    act(() => controls.current.openPage("subject"));
    await traverse(-1);

    for (let swipe = 0; swipe < 3; swipe += 1) {
      await traverse(-1);
      expect(currentUrl()).toBe(ROOM_URL);
      expect(historyFlags().guard).toBe(true);
      expect(controls.current.page).toBeNull();
    }
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("창을 한 번도 열지 않은 방은 popstate에 항목을 쌓지 않고 바로 떠난다", async () => {
    const { controls } = renderSheets();
    const push = vi.spyOn(window.history, "pushState");
    const go = vi.spyOn(window.history, "go");
    const leave = vi.fn();

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    controls.current.leaveThen(HOME_URL, leave);

    expect(leave).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("앞으로 가기로 닫힌 창의 항목에 오면 창을 열지 않고 되돌아간다", async () => {
    const { controls } = renderSheets();
    act(() => controls.current.openPage("subject"));
    await traverse(-1);

    await traverse(1);
    await waitFor(() => expect(historyFlags().sheet).toBeNull());
    expect(controls.current.page).toBeNull();
    expect(historyFlags().guard).toBe(true);
  });

  it("창을 쓴 방을 떠나면 방 항목이 모두 사라지고 앞뒤 어디로 가도 방으로 돌아오지 않는다", async () => {
    const { controls } = renderSheets();
    act(() => controls.current.openPage("subject"));
    await traverse(-1);
    const leave = vi.fn(() => {
      window.history.replaceState({ idx: 1, key: "result" }, "", "/result");
    });

    controls.current.leaveThen(HOME_URL, leave);
    await waitFor(() => expect(leave).toHaveBeenCalledOnce());
    expect(currentUrl()).toBe("/result");

    await traverse(1);
    expect(currentUrl()).toBe(HOME_URL);
    expect(historyFlags()).toEqual({ sheet: null, guard: false });
    await traverse(-1);
    await traverse(-1);
    expect(currentUrl()).toBe(HOME_URL);
    expect((window.history.state as { key: string }).key).toBe("home");
  });

  it("창이 열린 채 공부가 끝나면 창 항목을 걷고, 되돌리는 중에 떠나도 방 밖으로 더 나가지 않는다", async () => {
    const { controls, setStudying } = renderSheets();
    act(() => controls.current.openPage("ambient"));
    const leave = vi.fn(() => {
      window.history.replaceState({ idx: 1, key: "home-again" }, "", HOME_URL);
    });

    setStudying(false);
    expect(controls.current.page).toBeNull();
    // 사용자가 닫은 것이 아니라 닫힘을 알리지 않는다.
    expect(onClosed).not.toHaveBeenCalled();
    controls.current.leaveThen(HOME_URL, leave);

    await waitFor(() => expect(leave).toHaveBeenCalledOnce());
    await traverse(-1);
    expect((window.history.state as { key: string }).key).toBe("home");
  });

  it("창이 열린 채 공부가 끝나고 떠나기 전까지는 지킴 항목이 남아 방에 머문다", async () => {
    const { controls, setStudying } = renderSheets();
    act(() => controls.current.openPage("subject"));

    setStudying(false);
    await waitFor(() => expect(historyFlags().sheet).toBeNull());
    expect(historyFlags().guard).toBe(true);

    await traverse(-1);
    expect(currentUrl()).toBe(ROOM_URL);
    expect(historyFlags().guard).toBe(true);
  });

  it("떠나는 길은 한 번만 움직이고 두 번째 요청은 처음 이동을 다시 부르지 않는다", async () => {
    const { controls } = renderSheets();
    act(() => controls.current.openPage("subject"));
    await traverse(-1);
    const leave = vi.fn();

    controls.current.leaveThen(HOME_URL, leave);
    controls.current.leaveThen(HOME_URL, leave);

    await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  });
});
