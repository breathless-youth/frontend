import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeHomeSubject } from "@/features/home-v3/subjectSelection";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { getProfile } from "@/lib/profileApi";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { SubjectStartUnavailableError } from "@/lib/sessionStart";
import { listSubjects } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";

import { PointsMascotsPage } from "../PointsMascotsPage";

const startFocus =
  vi.fn<(source: string, options?: { subjectId?: number }) => Promise<Error | null>>();

vi.mock("@/lib/useFocusStart", () => ({ useFocusStart: () => startFocus }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const USER = 7;

function renderMascots() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/points/mascots?userId=${USER}`]}>
        <Routes>
          <Route path="/points/mascots" element={<PointsMascotsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pressStartStudy() {
  await userEvent.click(await screen.findByRole("button", { name: "락키 잠김, 4시간 12분 남음" }));
  const sheet = await screen.findByRole("dialog");
  await userEvent.click(within(sheet).getByRole("button", { name: "공부 시작하기" }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/?points=1&pointsMock=default");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  // 비회원도 공부 시작은 홈처럼 로그인 없이 한다.
  vi.mocked(getProfile).mockResolvedValue({ loginProvider: null } as Awaited<
    ReturnType<typeof getProfile>
  >);
  startFocus.mockResolvedValue(null);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
  vi.clearAllMocks();
});

describe("도감 잠긴 마스코트 창의 공부 시작하기", () => {
  it("홈에서 고른 과목이 아직 있으면 그 과목으로 홈과 같은 시작 흐름을 부른다", async () => {
    writeHomeSubject(USER, 3);
    vi.mocked(listSubjects).mockResolvedValue([{ id: 3 }] as Awaited<
      ReturnType<typeof listSubjects>
    >);
    renderMascots();

    await pressStartStudy();

    await waitFor(() =>
      expect(startFocus).toHaveBeenCalledWith("mascot_collection", { subjectId: 3 }),
    );
    expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument();
  });

  it("홈에서 고른 과목이 지워졌으면 과목 없이 시작한다", async () => {
    writeHomeSubject(USER, 3);
    vi.mocked(listSubjects).mockResolvedValue([{ id: 9 }] as Awaited<
      ReturnType<typeof listSubjects>
    >);
    renderMascots();

    await pressStartStudy();

    await waitFor(() => expect(startFocus).toHaveBeenCalledWith("mascot_collection", undefined));
  });

  it("고른 과목을 확인하지 못하면 시작하지 않고 홈과 같은 안내를 띄운다", async () => {
    writeHomeSubject(USER, 3);
    vi.mocked(listSubjects).mockRejectedValue(new Error("offline"));
    renderMascots();

    await pressStartStudy();

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "저장된 과목을 확인하지 못했어요. 다시 시도하거나 '과목 없음'을 선택해 주세요.",
      ),
    );
    expect(startFocus).not.toHaveBeenCalled();
  });

  it("과목을 고르지 않았으면 과목 목록을 묻지 않고 바로 시작하고, 시작이 막히면 홈과 같은 안내를 띄운다", async () => {
    startFocus.mockResolvedValue(new SubjectStartUnavailableError("old app"));
    renderMascots();

    await pressStartStudy();

    await waitFor(() => expect(startFocus).toHaveBeenCalledWith("mascot_collection", undefined));
    expect(listSubjects).not.toHaveBeenCalled();
    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
  });
});
