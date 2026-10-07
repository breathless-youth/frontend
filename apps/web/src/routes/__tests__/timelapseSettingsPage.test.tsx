import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { App } from "@/App";
import {
  DEFAULT_TIMELAPSE_SETTINGS,
  createMemoryTimelapseSettingsStore,
  resetTimelapseSettingsStore,
  setTimelapseSettingsStore,
  type TimelapseSettingsStore,
} from "@/features/timelapse/timelapseSettings";
import { getDday } from "@/lib/ddayApi";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));

const analytics = vi.hoisted(() => ({ trackTimelapseSettingChanged: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackTimelapseSettingChanged: analytics.trackTimelapseSettingChanged,
}));

const TOOLTIP_QUERY = { selector: "[data-state]" } as const;

let store: TimelapseSettingsStore;

function renderPage(path = "/timelapse-settings?userId=7") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** 설정을 읽어 본문이 그려질 때까지 기다린다. */
async function findSaveSwitch() {
  return screen.findByRole("switch", { name: "타임랩스 저장" });
}

beforeEach(() => {
  vi.stubEnv("VITE_TIMELAPSE", "on");
  store = createMemoryTimelapseSettingsStore();
  setTimelapseSettingsStore(store);
  vi.mocked(getDday).mockResolvedValue({ title: "2027 수능", targetDate: "2027-01-23" });
});

afterEach(() => {
  // App은 모듈 하나의 QueryClient를 쓰므로 앞 테스트의 D-Day 응답이 캐시에 남는다.
  queryClient.clear();
  vi.unstubAllEnvs();
  resetTimelapseSettingsStore();
  vi.clearAllMocks();
});

describe("설정 › 타임랩스", () => {
  it("처음에는 저장이 켜져 있고 세로가 선택돼 있으며 정보 스위치는 모두 꺼져 있다", async () => {
    renderPage();

    expect(await findSaveSwitch()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("타임랩스")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "세로 9:16" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    for (const label of ["얼굴 가림", "집중 흐름 바", "날짜", "순공 시간", "집중률", "연속 공부"]) {
      expect(screen.getByRole("switch", { name: label })).toHaveAttribute("aria-checked", "false");
    }
    expect(await screen.findByRole("switch", { name: "D-Day" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      within(screen.getByTestId("timelapse-preview")).getByText("공부 중 화면"),
    ).toBeInTheDocument();
  });

  it("저장 툴팁이 보관 방식을 알려준다", async () => {
    renderPage();
    await findSaveSwitch();

    fireEvent.click(screen.getByRole("button", { name: "타임랩스 저장 안내" }));

    expect(
      await screen.findByText("기기 내에만 최대 7일, 7개까지 보관돼요.", TOOLTIP_QUERY),
    ).toBeInTheDocument();
  });

  it("얼굴 가림 툴팁이 가리는 범위를 알려준다", async () => {
    renderPage();
    await findSaveSwitch();

    fireEvent.click(screen.getByRole("button", { name: "얼굴 가림 안내" }));

    expect(
      await screen.findByText("처음 인식된 얼굴만 가려요.", TOOLTIP_QUERY),
    ).toBeInTheDocument();
  });

  it("정보 스위치를 켜면 미리보기에 나타나고 저장되며 이벤트를 보낸다", async () => {
    renderPage();
    await findSaveSwitch();

    fireEvent.click(screen.getByRole("switch", { name: "날짜" }));

    expect(screen.getByRole("switch", { name: "날짜" })).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByTestId("timelapse-preview")).getByText("10월 5일"),
    ).toBeInTheDocument();
    expect((await store.load()).info.date).toBe(true);
    expect(analytics.trackTimelapseSettingChanged).toHaveBeenCalledWith({
      setting: "date",
      value: true,
    });
  });

  it("저장을 끄면 나머지 설정을 숨기고 저장하며 이벤트를 보낸다", async () => {
    renderPage();

    fireEvent.click(await findSaveSwitch());

    expect(screen.queryByText("영상 비율")).toBeNull();
    expect(screen.queryByText("미리보기")).toBeNull();
    expect(screen.queryByText("영상에 넣을 정보")).toBeNull();
    expect((await store.load()).enabled).toBe(false);
    expect(analytics.trackTimelapseSettingChanged).toHaveBeenCalledWith({
      setting: "enabled",
      value: false,
    });
  });

  it("가로를 고르면 저장하고, 이미 고른 칸을 다시 눌러도 선택이 풀리지 않는다", async () => {
    renderPage();
    await findSaveSwitch();
    const landscape = screen.getByRole("radio", { name: "가로 16:9" });

    fireEvent.click(landscape);
    fireEvent.click(landscape);

    expect(landscape).toHaveAttribute("aria-checked", "true");
    expect((await store.load()).aspect).toBe("16:9");
    expect(analytics.trackTimelapseSettingChanged).toHaveBeenCalledTimes(1);
    expect(analytics.trackTimelapseSettingChanged).toHaveBeenCalledWith({
      setting: "aspect",
      value: "16:9",
    });
  });

  it("비율을 바꾸면 미리보기를 새로 그린다", async () => {
    renderPage();
    await findSaveSwitch();
    const portrait = screen.getByTestId("timelapse-preview");

    fireEvent.click(screen.getByRole("radio", { name: "가로 16:9" }));

    // WebKit은 고정 크기에서 aspect-ratio로 클래스만 바뀌면 높이를 다시 계산하지 않아 0이 된다.
    expect(screen.getByTestId("timelapse-preview")).not.toBe(portrait);
  });

  it("D-Day를 불러오는 동안 미리보기에는 숫자 없이 D-Day만 보여준다", async () => {
    setTimelapseSettingsStore(
      createMemoryTimelapseSettingsStore({
        ...DEFAULT_TIMELAPSE_SETTINGS,
        info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, dday: true },
      }),
    );
    vi.mocked(getDday).mockReturnValue(new Promise(() => {}));
    renderPage();

    const top = await screen.findByTestId("timelapse-preview-top");
    expect(within(top).getByText("D-Day")).toBeInTheDocument();
  });

  it("D-Day를 켜면 미리보기에 실제 D-Day를 보여준다", async () => {
    const target = new Date();
    target.setDate(target.getDate() + 10);
    const targetDate = [
      target.getFullYear(),
      String(target.getMonth() + 1).padStart(2, "0"),
      String(target.getDate()).padStart(2, "0"),
    ].join("-");
    vi.mocked(getDday).mockResolvedValue({ title: "기말고사", targetDate });
    renderPage();
    await findSaveSwitch();

    fireEvent.click(await screen.findByRole("switch", { name: "D-Day" }));

    expect(
      await within(screen.getByTestId("timelapse-preview")).findByText("D-10 · 기말고사"),
    ).toBeInTheDocument();
  });

  it("D-Day가 없으면 켜 둔 값이 남아 있어도 미리보기에 넣지 않는다", async () => {
    setTimelapseSettingsStore(
      createMemoryTimelapseSettingsStore({
        ...DEFAULT_TIMELAPSE_SETTINGS,
        info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, dday: true },
      }),
    );
    vi.mocked(getDday).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("디데이 설정 필요")).toBeInTheDocument();
    expect(screen.queryByTestId("timelapse-preview-top")).toBeNull();
  });

  it("D-Day를 설정하지 않았으면 스위치 대신 안내 문구를 보여준다", async () => {
    vi.mocked(getDday).mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("디데이 설정 필요")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "D-Day" })).toBeNull();
  });

  it("다른 탭에서 D-Day를 정하고 돌아오면 다시 읽어 스위치를 보여준다", async () => {
    vi.mocked(getDday).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("디데이 설정 필요")).toBeInTheDocument();

    // 홈 탭은 다른 웹뷰라 이 문서의 캐시를 고쳐 주지 못한다. 탭이 다시 보이는 신호로만 알 수 있다.
    vi.mocked(getDday).mockResolvedValue({ title: "2027 수능", targetDate: "2027-01-23" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    expect(await screen.findByRole("switch", { name: "D-Day" })).toBeInTheDocument();
  });

  it("미설정을 캐시한 뒤 재조회가 실패하면 스위치를 보여준다", async () => {
    // 만료된 미설정 응답을 남겨 두어 화면이 열리면 다시 조회하게 한다.
    queryClient.setQueryData(["dday", 7], null, { updatedAt: 0 });
    vi.mocked(getDday).mockRejectedValue(new Error("D-Day 조회 실패"));
    renderPage();

    expect(
      await screen.findByRole("switch", { name: "D-Day" }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("디데이 설정 필요")).toBeNull();
  });

  it("실제 D-Day를 받아 둔 뒤 재조회가 실패하면 미리보기는 숫자 없는 D-Day로 돌아간다", async () => {
    queryClient.setQueryData(
      ["dday", 7],
      { title: "기말고사", targetDate: "2027-01-23" },
      { updatedAt: 0 },
    );
    setTimelapseSettingsStore(
      createMemoryTimelapseSettingsStore({
        ...DEFAULT_TIMELAPSE_SETTINGS,
        info: { ...DEFAULT_TIMELAPSE_SETTINGS.info, dday: true },
      }),
    );
    vi.mocked(getDday).mockRejectedValue(new Error("D-Day 조회 실패"));
    renderPage();

    const top = await screen.findByTestId("timelapse-preview-top");
    expect(await within(top).findByText("D-Day", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(top).queryByText(/기말고사/)).toBeNull();
    expect(screen.getByRole("switch", { name: "D-Day" })).toBeInTheDocument();
  });

  it("D-Day를 불러오는 동안에는 스위치를 보여준다", async () => {
    vi.mocked(getDday).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByRole("switch", { name: "D-Day" })).toBeInTheDocument();
    expect(screen.queryByText("디데이 설정 필요")).toBeNull();
  });

  it("신원이 없으면 D-Day를 조회하지 않고 스위치를 보여준다", async () => {
    renderPage("/timelapse-settings");

    expect(await screen.findByRole("switch", { name: "D-Day" })).toBeInTheDocument();
    expect(getDday).not.toHaveBeenCalled();
  });

  it.each([
    ["얼굴 가림", "face_mask"],
    ["집중 흐름 바", "flow_bar"],
    ["날짜", "date"],
    ["순공 시간", "focus_time"],
    ["집중률", "focus_rate"],
    ["D-Day", "dday"],
    ["연속 공부", "streak"],
  ])("%s 스위치는 setting=%s로 이벤트를 보낸다", async (label, setting) => {
    renderPage();
    await findSaveSwitch();

    fireEvent.click(await screen.findByRole("switch", { name: label }));

    expect(analytics.trackTimelapseSettingChanged).toHaveBeenCalledWith({ setting, value: true });
  });

  it("플래그가 꺼져 있으면 페이지가 없다", async () => {
    vi.stubEnv("VITE_TIMELAPSE", "");
    // 청크를 미리 받아 두어야 라우트가 있을 때 아래 대기 안에 페이지가 그려진다.
    await import("@/routes/TimelapseSettingsPage");
    renderPage();

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("switch", { name: "타임랩스 저장" })).toBeNull();
  });
});
