import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDday } from "@/lib/ddayApi";
import { getStreak } from "@/lib/statsApi";

import { ResultTimelapseCard } from "../ResultTimelapseCard";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import { createIndexedDbTimelapseStore, type TimelapseStore } from "../timelapseStore";

vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));
vi.mock("@/lib/statsApi", () => ({ getStreak: vi.fn() }));

/** 재생기는 따로 검증했다. 카드가 넘기는 값만 본다. */
vi.mock("../TimelapsePlayer", () => ({
  TimelapsePlayer: (props: {
    aspect: string;
    photos: readonly ArrayBuffer[];
    overlay: { text: { dday: string | null; streak: string | null } };
  }) => (
    <div
      data-testid="player"
      data-aspect={props.aspect}
      data-count={props.photos.length}
      data-dday={props.overlay.text.dday ?? ""}
      data-streak={props.overlay.text.streak ?? ""}
    />
  ),
}));

const T0 = new Date(2026, 9, 5, 21, 3).getTime();
const SUMMARY = { endedAtMs: T0 + 3_600_000, studySec: 3_600, focusSec: 2_880, events: [] };

let store: TimelapseStore;

async function readyTimelapse(photoCount = 2, aspect: "9:16" | "16:9" = "9:16") {
  await store.begin(T0, { ...DEFAULT_TIMELAPSE_SETTINGS, aspect });
  for (let index = 0; index < photoCount; index += 1) {
    await store.addPhoto(T0, new Uint8Array([index]).buffer, T0 + index * 10_000);
  }
  await store.finalize(T0, SUMMARY);
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ResultTimelapseCard", () => {
  it("보관된 타임랩스가 있으면 안내 문구와 재생기를 보여준다", async () => {
    await readyTimelapse(2, "16:9");
    renderCard();

    const player = await screen.findByTestId("player");
    expect(player).toHaveAttribute("data-aspect", "16:9");
    expect(player).toHaveAttribute("data-count", "2");
    expect(
      screen.getByText("이미지를 터치하여 타임랩스를 공유하거나 저장해보세요"),
    ).toBeInTheDocument();
  });

  it("ⓘ를 누르면 설정에서 끌 수 있다고 알려준다", async () => {
    await readyTimelapse();
    renderCard();
    await screen.findByTestId("player");

    fireEvent.click(screen.getByRole("button", { name: "타임랩스 안내" }));

    expect(
      await screen.findByText("타임랩스는 언제든 설정에서 끌 수 있어요", {
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

  it("레코드가 없으면 아무것도 그리지 않는다", async () => {
    const { container } = renderCard();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("아직 촬영 중이면 아무것도 그리지 않는다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    const { container } = renderCard();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("결과 화면이 먼저 열려도 촬영 정리가 끝나면 카드가 나타난다", async () => {
    await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(T0, new Uint8Array([0]).buffer, T0);
    renderCard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();

    await store.finalize(T0, SUMMARY);

    expect(await screen.findByTestId("player", {}, { timeout: 3000 })).toBeInTheDocument();
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

    await new Promise((resolve) => setTimeout(resolve, 20));
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
});
