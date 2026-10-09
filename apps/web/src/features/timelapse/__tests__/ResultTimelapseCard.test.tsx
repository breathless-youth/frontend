import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { trackOsSettingsOpened, trackTimelapseShareTapped } from "@/lib/amplitude";
import type * as Bridge from "@/lib/bridge";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import { getDday } from "@/lib/ddayApi";
import type * as NativeVideo from "@/lib/nativeVideo";
import { canUseNativeVideo, saveVideoNatively } from "@/lib/nativeVideo";
import { getStreak } from "@/lib/statsApi";
import { showToast } from "@/lib/toast";

import { ResultTimelapseCard } from "../ResultTimelapseCard";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import { createIndexedDbTimelapseStore, type TimelapseStore } from "../timelapseStore";
import type * as TimelapseVideo from "../timelapseVideo";
import { buildTimelapseVideo } from "../timelapseVideo";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackTimelapseShareTapped: vi.fn(),
  trackOsSettingsOpened: vi.fn(),
}));
vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => false),
  postToNative: vi.fn(() => true),
}));
vi.mock("@/lib/nativeVideo", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeVideo>()),
  canUseNativeVideo: vi.fn(() => false),
  saveVideoNatively: vi.fn(),
}));
vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));
vi.mock("@/lib/statsApi", () => ({ getStreak: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("../timelapseVideo", async (importOriginal) => ({
  ...(await importOriginal<typeof TimelapseVideo>()),
  buildTimelapseVideo: vi.fn(),
}));

/** 재생기는 따로 검증했다. 카드가 넘기는 값만 본다. */
vi.mock("../TimelapsePlayer", () => ({
  TimelapsePlayer: (props: {
    aspect: string;
    photos: readonly ArrayBuffer[];
    overlay: { text: { dday: string | null; streak: string | null } };
    children?: ReactNode;
  }) => (
    <div
      data-testid="player"
      data-aspect={props.aspect}
      data-count={props.photos.length}
      data-dday={props.overlay.text.dday ?? ""}
      data-streak={props.overlay.text.streak ?? ""}
    >
      {props.children}
    </div>
  ),
}));

const T0 = new Date(2026, 9, 5, 21, 3).getTime();
const SUMMARY = { endedAtMs: T0 + 3_600_000, studySec: 3_600, focusSec: 2_880, events: [] };

let store: TimelapseStore;
/** 영상을 만들 때의 레코드 값. D-Day와 연속 공부가 먼저 남았는지 본다. */
let builtWith: { ddayLabel?: string | null; streakDays?: number | null } | null;

async function readyTimelapse(photoCount = 2, aspect: "9:16" | "16:9" = "9:16") {
  await store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, aspect });
  for (let index = 0; index < photoCount; index += 1) {
    await store.addPhoto(T0, new Uint8Array([index]).buffer, T0 + index * 10_000);
  }
  await store.finalize(T0, SUMMARY);
}

function nativeApp() {
  vi.mocked(canUseNativeVideo).mockReturnValue(true);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
}

/** 영상 메시지를 모르는 구 버전 앱 */
function oldApp() {
  vi.mocked(canUseNativeVideo).mockReturnValue(false);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
}

function stubCanShare(canShare: boolean) {
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => canShare });
}

async function readyDownload() {
  const button = await screen.findByRole("button", { name: "다운로드" });
  await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"));
  return button;
}

function renderCard(userId: number | null = 7) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResultTimelapseCard startedAtMs={T0} userId={userId} store={store} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
  vi.mocked(getDday).mockResolvedValue({ title: "기말고사", targetDate: "2099-01-01" });
  vi.mocked(getStreak).mockResolvedValue({ streak: 5, maxStreak: 9, studiedDatesInRange: [] });
  builtWith = null;
  vi.mocked(buildTimelapseVideo).mockImplementation(async (ms, videoStore) => {
    const record = await videoStore.get(ms);
    builtWith = { ddayLabel: record?.ddayLabel, streakDays: record?.streakDays };
    return {
      bytes: new Uint8Array([1]).buffer,
      mimeType: "video/mp4",
      method: "webcodecs",
      frames: 2,
      aspect: "9:16",
    };
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "canShare");
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.mocked(canUseNativeVideo).mockReturnValue(false);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
});

describe("ResultTimelapseCard", () => {
  it("보관된 타임랩스가 있으면 제목과 재생기를 보여준다", async () => {
    await readyTimelapse(2, "16:9");
    renderCard();

    const player = await screen.findByTestId("player");
    expect(player).toHaveAttribute("data-aspect", "16:9");
    expect(player).toHaveAttribute("data-count", "2");
    const title = screen.getByRole("heading", { level: 2, name: "타임랩스" });
    // ⓘ는 제목 오른쪽에 둔다.
    expect(title.parentElement).toContainElement(
      screen.getByRole("button", { name: "타임랩스 안내" }),
    );
    expect(screen.queryByText(/이미지를 터치하여/)).toBeNull();
  });

  it("ⓘ를 누르면 설정에서 끌 수 있다고 알려준다", async () => {
    await readyTimelapse();
    renderCard();
    await screen.findByTestId("player");

    fireEvent.click(screen.getByRole("button", { name: "타임랩스 안내" }));

    expect(
      await screen.findByText("타임랩스 촬영은 설정에서 언제든 끌 수 있어요", {
        selector: "[data-state]",
      }),
    ).toBeInTheDocument();
  });

  it("D-Day와 연속 공부를 받아 재생기에 넘기고 레코드에 남긴다", async () => {
    await readyTimelapse();
    renderCard();

    await waitFor(() =>
      expect(screen.getByTestId("player")).toHaveAttribute("data-streak", "5일 연속 공부 🔥"),
    );
    expect(screen.getByTestId("player").dataset.dday).toMatch(/^D-\d+ · 기말고사$/);
    await waitFor(async () =>
      expect(await store.get(T0)).toMatchObject({
        ddayLabel: expect.stringMatching(/ · 기말고사$/),
        streakDays: 5,
      }),
    );
  });

  it("D-Day를 정하지 않았으면 D-Day 없이 기록한다", async () => {
    vi.mocked(getDday).mockResolvedValue(null);
    await readyTimelapse();
    renderCard();

    await waitFor(async () => expect(await store.get(T0)).toMatchObject({ ddayLabel: null }));
    expect(screen.getByTestId("player")).toHaveAttribute("data-dday", "");
  });

  it("신원이 없으면 D-Day와 연속 공부를 조회하지 않는다", async () => {
    await readyTimelapse();
    renderCard(null);

    await screen.findByTestId("player");
    expect(getDday).not.toHaveBeenCalled();
    expect(getStreak).not.toHaveBeenCalled();
  });

  it("D-Day와 연속 공부를 레코드에 남긴 뒤 영상을 만든다", async () => {
    await readyTimelapse();
    renderCard();

    await waitFor(() => expect(buildTimelapseVideo).toHaveBeenCalledTimes(1));
    expect(builtWith).toEqual({ ddayLabel: expect.stringContaining("기말고사"), streakDays: 5 });
  });

  it("연속 공부 조회가 끝나기 전에는 만들지 않는다", async () => {
    vi.mocked(getStreak).mockReturnValue(new Promise(() => {}));
    await readyTimelapse();
    renderCard();

    await screen.findByTestId("player");
    await waitFor(async () => expect((await store.get(T0))?.ddayLabel).toBeDefined());
    expect(buildTimelapseVideo).not.toHaveBeenCalled();
  });

  it("기록을 남기기 전에 화면을 떠나면 영상을 만들지 않는다", async () => {
    await readyTimelapse();
    let finish!: () => void;
    const slow: TimelapseStore = {
      ...store,
      annotate: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ResultTimelapseCard startedAtMs={T0} userId={null} store={slow} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(slow.annotate).toHaveBeenCalled());

    unmount();
    finish();
    // 보관된 영상을 읽은 뒤에 만들기 시작하므로 그만큼 기다린다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(buildTimelapseVideo).not.toHaveBeenCalled();
  });

  it("신원이 없으면 조회 없이 바로 만든다", async () => {
    await readyTimelapse();
    renderCard(null);

    await waitFor(() => expect(buildTimelapseVideo).toHaveBeenCalledTimes(1));
  });

  it("레코드가 없으면 아무것도 그리지 않는다", async () => {
    const { container } = renderCard();

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(container).toBeEmptyDOMElement();
  });

  it("아직 촬영 중이면 아무것도 그리지 않는다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    const { container } = renderCard();

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(container).toBeEmptyDOMElement();
  });

  it("결과 화면이 먼저 열려도 촬영 정리가 끝나면 카드가 나타난다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(T0, new Uint8Array([0]).buffer, T0);
    renderCard();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();

    await store.finalize(T0, SUMMARY);

    expect(await screen.findByTestId("player", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("촬영 정리가 끝나지 않으면 30초 뒤에는 다시 읽지 않는다", async () => {
    vi.useFakeTimers();
    const stuck: TimelapseStore = {
      ...store,
      get: vi.fn(() =>
        Promise.resolve({
          startedAtMs: T0,
          status: "recording" as const,
          settings: DEFAULT_TIMELAPSE_SETTINGS,
          intervalMs: 10_000,
          nextSeq: 0,
          photoCount: 0,
        }),
      ),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ResultTimelapseCard startedAtMs={T0} userId={7} store={stuck} />
      </QueryClientProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const calls = vi.mocked(stuck.get).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(calls).toBeGreaterThan(30);
    expect(vi.mocked(stuck.get).mock.calls.length).toBe(calls);
  });

  it("보관된 기록인데 사진이 하나도 없으면 아무것도 그리지 않는다", async () => {
    await readyTimelapse();
    const empty: TimelapseStore = { ...store, listPhotos: () => Promise.resolve([]) };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ResultTimelapseCard startedAtMs={T0} userId={7} store={empty} />
      </QueryClientProvider>,
    );

    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(container).toBeEmptyDOMElement();
  });

  it("D-Day 조회에 실패하면 레코드에 남은 값을 쓴다", async () => {
    vi.mocked(getDday).mockRejectedValue(new Error("network"));
    await readyTimelapse();
    await store.annotate(T0, { ddayLabel: "D-9 · 모의고사" });
    renderCard();

    await waitFor(() =>
      expect(screen.getByTestId("player")).toHaveAttribute("data-dday", "D-9 · 모의고사"),
    );
  });

  it("연속 공부 조회에 실패하면 레코드에 남은 값을 쓴다", async () => {
    vi.mocked(getStreak).mockRejectedValue(new Error("network"));
    await readyTimelapse();
    await store.annotate(T0, { streakDays: 3 });
    renderCard();

    await waitFor(() =>
      expect(screen.getByTestId("player")).toHaveAttribute("data-streak", "3일 연속 공부 🔥"),
    );
  });

  it("신원이 없으면 레코드에 남은 D-Day와 연속 공부도 보여주지 않는다", async () => {
    await readyTimelapse();
    await store.annotate(T0, { ddayLabel: "D-9 · 모의고사", streakDays: 3 });
    renderCard(null);

    const player = await screen.findByTestId("player");
    expect(player).toHaveAttribute("data-dday", "");
    expect(player).toHaveAttribute("data-streak", "");
  });

  it("재생기를 눌러도 공유 창을 열지 않는다", async () => {
    await readyTimelapse();
    renderCard();

    const player = await screen.findByTestId("player");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "타임랩스 공유하기" })).toBeEnabled(),
    );
    expect(within(player).queryByRole("button")).toBeNull();
    fireEvent.click(player);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("공유하기를 누르면 공유 창이 열리고 닫으면 버튼으로 포커스가 돌아온다", async () => {
    await readyTimelapse();
    renderCard();

    const open = await screen.findByRole("button", { name: "타임랩스 공유하기" });
    await waitFor(() => expect(open).toBeEnabled());
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
    open.focus();
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog", { name: "공유하기" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(open).toHaveFocus();
  });

  it("다운로드를 누르면 사진 앱에 저장하고 토스트로 알린다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("saved");
    await readyTimelapse();
    renderCard();

    fireEvent.click(await readyDownload());

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("사진 앱에 저장했어요"));
    expect(screen.getByRole("status")).not.toHaveTextContent("사진 앱에 저장했어요");
    expect(saveVideoNatively).toHaveBeenCalledTimes(1);
    expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
      button: "save",
      result: "saved",
      entry: "result",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("사진 권한이 꺼져 있으면 설정 열기를 함께 보여준다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("denied");
    await readyTimelapse();
    renderCard();

    fireEvent.click(await readyDownload());
    fireEvent.click(await screen.findByRole("button", { name: "설정 열기" }));

    expect(screen.getByRole("status")).toHaveTextContent("사진 접근 권한이 꺼져 있어요");
    expect(showToast).not.toHaveBeenCalled();
    expect(trackOsSettingsOpened).toHaveBeenCalledWith("timelapse_share");
    expect(postToNative).toHaveBeenCalledWith(expect.objectContaining({ type: "open-settings" }));
  });

  it("저장하는 동안에는 다운로드를 다시 누를 수 없다", async () => {
    nativeApp();
    let finish!: (status: "failed") => void;
    vi.mocked(saveVideoNatively).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await readyTimelapse();
    renderCard();

    const download = await readyDownload();
    fireEvent.click(download);
    fireEvent.click(download);

    expect(download).toHaveAttribute("aria-disabled", "true");
    await act(async () => finish("failed"));
    expect(saveVideoNatively).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("저장하지 못했어요");
  });

  it("영상을 만드는 동안 다운로드 버튼에 진행률을 보여준다", async () => {
    vi.mocked(buildTimelapseVideo).mockImplementation((_ms, _store, onProgress) => {
      onProgress(0.37);
      return new Promise(() => {});
    });
    await readyTimelapse();
    renderCard();

    const download = await screen.findByRole("button", { name: "만드는 중 37%" });
    expect(download).toHaveAttribute("aria-disabled", "true");
  });

  it("저장할 수 없는 구 버전 앱에서는 다운로드를 숨긴다", async () => {
    oldApp();
    stubCanShare(true);
    await readyTimelapse();
    renderCard();

    // 공유 창에 쓸 영상은 그대로 미리 만든다.
    await waitFor(() => expect(buildTimelapseVideo).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "타임랩스 공유하기" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /다운로드|만드는 중/ })).toBeNull();
  });

  it("저장도 공유도 할 수 없는 구 버전 앱에서는 영상을 미리 만들지 않는다", async () => {
    oldApp();
    stubCanShare(false);
    await readyTimelapse();
    renderCard();

    const open = await screen.findByRole("button", { name: "타임랩스 공유하기" });
    await waitFor(() => expect(open).toBeEnabled());
    // 보관된 영상을 읽은 뒤에 만들기 시작하므로 그만큼 기다린다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(buildTimelapseVideo).not.toHaveBeenCalled();
  });

  it("D-Day와 연속 공부를 남기기 전에는 공유 창을 열지 않는다", async () => {
    vi.mocked(getStreak).mockReturnValue(new Promise(() => {}));
    await readyTimelapse();
    renderCard();

    const open = await screen.findByRole("button", { name: "타임랩스 공유하기" });
    fireEvent.click(open);

    expect(open).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(buildTimelapseVideo).not.toHaveBeenCalled();
  });

  it("오프라인이면 조회를 기다리지 않고 레코드에 남은 값으로 공유 창을 연다", async () => {
    await readyTimelapse();
    await store.annotate(T0, { ddayLabel: "D-9 · 모의고사", streakDays: 3 });
    // 레코드는 온라인일 때 읽어 두고 D-Day와 연속 공부 조회는 오프라인에서 시작하게 한다.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["timelapse", T0], await store.get(T0));
    onlineManager.setOnline(false);
    try {
      render(
        <QueryClientProvider client={queryClient}>
          <ResultTimelapseCard startedAtMs={T0} userId={7} store={store} />
        </QueryClientProvider>,
      );

      const open = await screen.findByRole("button", { name: "타임랩스 공유하기" });
      await waitFor(() => expect(open).toBeEnabled());
      expect(screen.getByTestId("player")).toHaveAttribute("data-dday", "D-9 · 모의고사");
      await waitFor(() =>
        expect(builtWith).toEqual({ ddayLabel: "D-9 · 모의고사", streakDays: 3 }),
      );
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
