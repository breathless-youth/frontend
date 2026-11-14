import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 추가 타이머·스톱워치 칩의 RoomPage 연결을 본다.
 * 상태 기계와 훅은 `multiTimerMachine.test.ts`·`useMultiTimer.test.tsx`가 본다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function chooseMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

/** 가짜 타이머 아래에서 더보기 메뉴 항목을 고른다. Radix 메뉴는 Enter 키로도 열린다. */
function chooseMenuNow(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "더보기" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

const chip = () => screen.queryByRole("group", { name: "추가 타이머" });

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("RoomPage 추가 타이머·스톱워치 칩", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("더보기 메뉴는 카메라 전환, 스톱워치, 타이머, 보기 형식, 마스코트, 도움말 보기 순서다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const names = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(names).toEqual([
      "카메라 전환",
      "스톱워치",
      "타이머",
      "공부 시간으로 보기",
      "마스코트 보이기",
      "도움말 보기",
    ]);
  });

  it("타이머는 시트에서 시간을 골라 시작하면 시트가 닫히고 하단 칩으로 돈다", async () => {
    renderRoom();
    await chooseMenu("타이머");

    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });
    expect(within(sheet).queryByRole("radio", { name: "뽀모도로" })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "30분 시작" }));

    expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull();
    const group = chip()!;
    expect(within(group).getByText("타이머")).toBeInTheDocument();
    expect(within(group).getByText("/ 30:00")).toBeInTheDocument();
  });

  it("칩에서 멈추고 계속하고, 끄면 칩이 사라진다", async () => {
    renderRoom();
    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));

    await userEvent.click(within(chip()!).getByRole("button", { name: "멈춤" }));
    expect(within(chip()!).getByRole("button", { name: "계속" })).toBeInTheDocument();

    await userEvent.click(within(chip()!).getByRole("button", { name: "끄기" }));
    expect(chip()).toBeNull();
  });

  it("칩을 누르면 시트가 다시 열리고, 취소해도 돌던 타이머는 계속 돈다", async () => {
    renderRoom();
    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));

    await userEvent.click(within(chip()!).getByRole("button", { name: "타이머 설정" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });
    await userEvent.click(within(sheet).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull();
    expect(within(chip()!).getByRole("button", { name: "멈춤" })).toBeInTheDocument();
  });

  it("돌던 타이머의 시트에서 시간을 바꿔 시작하면 새 시간으로 처음부터 다시 돈다", async () => {
    renderRoom();
    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));

    await userEvent.click(within(chip()!).getByRole("button", { name: "타이머 설정" }));
    const sheet = screen.getByRole("dialog", { name: "타이머 설정" });
    fireEvent.keyDown(within(sheet).getByRole("spinbutton", { name: "분" }), { key: "ArrowUp" });
    await userEvent.click(within(sheet).getByRole("button", { name: "31분 시작" }));

    expect(screen.queryByRole("dialog", { name: "타이머 설정" })).toBeNull();
    expect(within(chip()!).getByText("/ 31:00")).toBeInTheDocument();
    expect(within(chip()!).getByRole("timer")).toHaveTextContent("31:00");
    expect(within(chip()!).getByRole("button", { name: "멈춤" })).toBeInTheDocument();
  });

  it("스톱워치는 메뉴에서 바로 칩으로 시작하고 세션을 멈추면 같이 멈춘다", async () => {
    vi.useFakeTimers();
    renderRoom();
    chooseMenuNow("스톱워치");

    expect(within(chip()!).getByText("스톱워치")).toBeInTheDocument();
    await advance(3000);
    expect(within(chip()!).getByRole("timer")).toHaveTextContent("00:03");

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await advance(5000);
    expect(within(chip()!).getByRole("timer")).toHaveTextContent("00:03");
  });

  it("타이머가 도는 동안 스톱워치를 켜면 칩이 스톱워치로 바뀐다", async () => {
    renderRoom();
    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));

    await chooseMenu("스톱워치");

    expect(within(chip()!).getByText("스톱워치")).toBeInTheDocument();
    expect(within(chip()!).queryByText("타이머")).toBeNull();
  });

  it("돌던 타이머가 있을 때 메뉴로 시트를 열고 취소해도 타이머는 계속 돈다", async () => {
    renderRoom();
    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));

    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(within(chip()!).getByText("타이머")).toBeInTheDocument();
    expect(within(chip()!).getByRole("button", { name: "멈춤" })).toBeInTheDocument();
  });

  it("스톱워치가 도는 중 타이머 시트를 열고 취소하면 스톱워치가 계속 돌고, 시작하면 타이머로 바뀐다", async () => {
    renderRoom();
    await chooseMenu("스톱워치");

    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(within(chip()!).getByText("스톱워치")).toBeInTheDocument();

    await chooseMenu("타이머");
    await userEvent.click(screen.getByRole("button", { name: "30분 시작" }));
    expect(within(chip()!).getByText("타이머")).toBeInTheDocument();
    expect(within(chip()!).queryByText("스톱워치")).toBeNull();
  });

  it("칩이 있으면 카메라 작은 창이 칩 위로 올라간다", async () => {
    renderRoom();
    const camera = () => screen.getByRole("button", { name: "내 화면 크게 보기" });
    expect(camera().className).not.toContain("+174px");

    await chooseMenu("스톱워치");

    expect(camera().className).toContain("+174px");
  });
});
