import "fake-indexeddb/auto";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as Toast from "@/lib/toast";

import { App } from "@/App";
import {
  readTimerBackground,
  writeTimerBackground,
} from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { queryClient } from "@/lib/queryClient";
import { showToast } from "@/lib/toast";

const SQUARE = { bytes: new Uint8Array([1]).buffer, width: 1000, height: 1000 };

const prepare = vi.hoisted(() => vi.fn());
import {
  __resetWatcherAssetsForTests,
  readWatcherAsset,
  watcherAssetUrls,
} from "@/features/timer-background/watcher/watcherAssets";

vi.mock("@/features/timer-background/prepareBackgroundPhoto", () => ({
  prepareBackgroundPhoto: prepare,
}));

const nativePicker = vi.hoisted(() => ({ available: false, pick: vi.fn() }));
vi.mock("@/lib/nativeBackgroundPhoto", () => ({
  canUseNativeBackgroundPhoto: () => nativePicker.available,
  pickNativeBackgroundPhoto: nativePicker.pick,
}));

vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof Toast>()),
  showToast: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  applied: vi.fn(),
  added: vi.fn(),
  removed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackTimerBackgroundApplied: analytics.applied,
  trackTimerBackgroundPhotoAdded: analytics.added,
  trackTimerBackgroundPhotoRemoved: analytics.removed,
}));

/** jsdom에는 PointerEvent가 없어 손가락마다 id를 받는 대역을 둔다. */
class Pointer extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/timer-background-settings?userId=7"]}>
      <App />
    </MemoryRouter>,
  );
}

/** 위쪽 칩과 묶음의 타일이 같은 이름(심플)을 쓰므로 화면 순서로 타일을 고른다. 칩이 먼저 온다. */
async function findSimpleTile(): Promise<HTMLElement> {
  const [, tile] = await screen.findAllByRole("button", { name: "심플" });
  return tile!;
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

async function addPhotoFromFile() {
  prepare.mockResolvedValueOnce(SQUARE);
  fireEvent.change(fileInput(), {
    target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
  });
  const preview = await screen.findByTestId("timer-background-preview");
  // 미리보기의 원본 사진은 따로 읽어 와서 깔린 뒤에 조작한다.
  await within(preview).findByTestId("timer-background-layer");
  return preview;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  __resetWatcherAssetsForTests();
  vi.stubGlobal("PointerEvent", Pointer);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  nativePicker.available = false;
});

describe("설정 › 타이머 배경 선택 화면", () => {
  it("처음에는 심플이 사용 중이고, 감독관 말고 다른 감시·자연 배경은 출시 예정이라 누를 수 없다", async () => {
    renderPage();

    const simple = await findSimpleTile();
    expect(simple).toHaveAttribute("aria-pressed", "true");
    expect(within(simple).getByText("사용 중")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "문 너머 강아지, 출시 예정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /문 너머 강아지/ })).toBeNull();
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  it("독서실 감독관을 고르면 빈 방이 깔린 미리보기가 뜨고, 적용하면 설정 행 이름이 바뀐다", async () => {
    renderPage();
    await findSimpleTile();

    fireEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));
    const preview = screen.getByTestId("timer-background-preview");
    expect(within(preview).getByTestId("watcher-background")).toBeInTheDocument();
    expect(screen.getByText("발걸음 소리가 들려요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    expect(
      await screen.findByRole("button", { name: "타이머 배경, 독서실 감독관" }),
    ).toBeInTheDocument();
    expect(readTimerBackground()).toEqual({ kind: "proctor" });
    expect(analytics.applied).toHaveBeenCalledWith({ kind: "proctor" });
  });

  it("감독관을 적용하면 영상·소리를 기기에 받는 동안 적용하는 중을 보이고, 다 받으면 돌아간다", async () => {
    let finish = () => {};
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response("clip", { headers: { "content-type": "video/mp4" } });
      }),
    );
    renderPage();
    await findSimpleTile();
    fireEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    const applying = await screen.findByRole("button", { name: "적용하는 중…" });
    expect(applying).toBeDisabled();
    expect(readTimerBackground()).toEqual({ kind: "simple" });

    finish();
    expect(
      await screen.findByRole("button", { name: "타이머 배경, 독서실 감독관" }),
    ).toBeInTheDocument();
    expect(readTimerBackground()).toEqual({ kind: "proctor" });
    // 테스트 창(1024×768)은 태블릿이라 태블릿 영상을 받는다.
    const [first] = watcherAssetUrls({ width: window.innerWidth, height: window.innerHeight });
    expect(first).toContain("tablet");
    expect(await readWatcherAsset(first)).not.toBeNull();
  });

  it("받는 동안 미리보기를 닫으면 받기가 끝나도 적용하지 않는다", async () => {
    let finish = () => {};
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response("clip");
      }),
    );
    renderPage();
    await findSimpleTile();
    fireEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));
    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));
    await screen.findByRole("button", { name: "적용하는 중…" });

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    await act(async () => finish());

    expect(screen.queryByTestId("timer-background-preview")).toBeNull();
    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(analytics.applied).not.toHaveBeenCalled();
  });

  it("다음 묶음 제목이 화면 위쪽 40% 안으로 들어오면 그 칩으로 바뀐다", async () => {
    renderPage();
    await findSimpleTile();
    const sectionOf = (name: string) => screen.getByRole("heading", { name }).closest("section")!;
    // 화면 높이 844에서 감시 묶음 제목이 위에서 300px(40% 선 337px 안)에 있다.
    const tops: Record<string, number> = { "내 사진": -200, 감시: 300, 자연: 900, 심플: 1500 };
    for (const [name, top] of Object.entries(tops)) {
      sectionOf(name).getBoundingClientRect = () => ({ top }) as DOMRect;
    }
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    // jsdom은 문서 높이가 0이라 맨 끝에 닿은 것으로 보지 않게 길이를 준다.
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 5000,
      configurable: true,
    });

    try {
      fireEvent.scroll(window);

      expect(screen.getByRole("button", { name: "감시" })).toHaveAttribute("aria-pressed", "true");
    } finally {
      Object.defineProperty(window, "innerHeight", { value: originalHeight, configurable: true });
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    }
  });

  it("내 사진은 많아져도 한 줄에 두고 좌우로 넘긴다", async () => {
    for (let index = 0; index < 4; index += 1) {
      await timerBackgroundPhotoStore().add(SQUARE, index);
    }
    renderPage();
    const lastPhoto = await screen.findByRole("button", { name: "내 사진 4" });

    const row = screen.getByRole("button", { name: "앨범에서 선택" }).parentElement!;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("grid");
    expect(row).toContainElement(lastPhoto);
    // 감시·자연 묶음은 그대로 세 칸 격자다.
    expect(
      screen.getByRole("button", { name: "독서실 감독관" }).parentElement!.className,
    ).toContain("grid-cols-3");
  });

  it("칩을 누르면 그 묶음으로 스크롤하고 칩이 눌린 상태가 된다", async () => {
    renderPage();
    const natureChip = await screen.findByRole("button", { name: "자연" });

    fireEvent.click(natureChip);

    expect(natureChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "내 사진" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("앨범에서 고른 사진은 담긴 뒤 바로 미리보기가 뜨고, 적용하면 설정으로 돌아가 이름이 바뀐다", async () => {
    renderPage();
    await findSimpleTile();

    await addPhotoFromFile();
    expect(analytics.added).toHaveBeenCalledWith({ count: 1, source: "file" });
    expect(screen.queryByText("발걸음 소리가 들려요")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    expect(
      await screen.findByRole("button", { name: "타이머 배경, 내 사진 1" }),
    ).toBeInTheDocument();
    expect(readTimerBackground()).toEqual({ kind: "photo", photoId: expect.any(String) });
    expect(analytics.applied).toHaveBeenCalledWith({ kind: "photo" });
    expect(showToast).toHaveBeenCalledWith("배경을 적용했어요", { persistOnNavigation: true });
  });

  it("적용하기를 연달아 눌러도 한 번만 적용하고 돌아간다", async () => {
    renderPage();
    await findSimpleTile();
    await addPhotoFromFile();

    const button = screen.getByRole("button", { name: "적용하기" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(
      await screen.findByRole("button", { name: "타이머 배경, 내 사진 1" }),
    ).toBeInTheDocument();
    expect(analytics.applied).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(showToast).mock.calls.filter(([message]) => message === "배경을 적용했어요"),
    ).toHaveLength(1);
  });

  it("미리보기에서 사진을 끌면 위치가 바뀌고 적용할 때 저장된다", async () => {
    renderPage();
    await findSimpleTile();
    const preview = await addPhotoFromFile();
    // 390×844 화면에 정사각형 사진은 좌우로 454px 넘친다. 그 절반을 왼쪽으로 끌면 오른쪽 끝을 본다.
    preview.getBoundingClientRect = () => ({ width: 390, height: 844 }) as DOMRect;

    fireEvent.pointerDown(preview, { pointerId: 1, clientX: 300, clientY: 400 });
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 73, clientY: 400 });
    fireEvent.pointerUp(preview, { pointerId: 1, clientX: 73, clientY: 400 });
    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    await waitFor(async () => {
      const [photo] = await timerBackgroundPhotoStore().list();
      expect(photo?.fit).toEqual({ scale: 1, x: 100, y: 50 });
    });
  });

  it("미리보기에서 뒤로 가면 적용하지 않고 선택 화면으로 돌아온다", async () => {
    renderPage();
    fireEvent.click(await findSimpleTile());
    expect(screen.getByTestId("timer-background-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(screen.queryByTestId("timer-background-preview")).toBeNull();
    expect(localStorage.getItem("focusmakers.timerBackground")).toBeNull();
    expect(analytics.applied).not.toHaveBeenCalled();
  });

  it("쓰던 사진을 삭제하면 심플로 돌아간다", async () => {
    const photo = await timerBackgroundPhotoStore().add(SQUARE, 1);
    writeTimerBackground({ kind: "photo", photoId: photo.id });
    renderPage();
    expect(await screen.findByRole("button", { name: "내 사진 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "내 사진 1" })).toBeNull());
    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(await findSimpleTile()).toHaveAttribute("aria-pressed", "true");
    expect(analytics.removed).toHaveBeenCalledWith({ count: 0, wasSelected: true });
    expect(showToast).toHaveBeenCalledWith("사진을 삭제했어요");
  });

  it("배경 선택을 저장하지 못하면 적용됐다고 알리지 않고 미리보기에 머문다", async () => {
    renderPage();
    fireEvent.click(await findSimpleTile());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "QuotaExceededError");
    });

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    expect(showToast).toHaveBeenCalledWith("배경을 적용하지 못했어요. 다시 시도해 주세요.");
    expect(showToast).not.toHaveBeenCalledWith("배경을 적용했어요");
    expect(analytics.applied).not.toHaveBeenCalled();
    expect(screen.getByTestId("timer-background-preview")).toBeInTheDocument();
  });

  it("사진 조정값을 저장하지 못하면 배경을 바꾸지 않는다", async () => {
    renderPage();
    await findSimpleTile();
    await addPhotoFromFile();
    vi.spyOn(timerBackgroundPhotoStore(), "updateFit").mockRejectedValueOnce(new Error("idb"));

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("배경을 적용하지 못했어요. 다시 시도해 주세요."),
    );
    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(analytics.applied).not.toHaveBeenCalled();
  });

  it("사진을 삭제하지 못하면 사진을 남기고 실패를 알린다", async () => {
    await timerBackgroundPhotoStore().add(SQUARE, 1);
    renderPage();
    const removeButton = await screen.findByRole("button", { name: "내 사진 1 삭제" });
    vi.spyOn(timerBackgroundPhotoStore(), "remove").mockRejectedValueOnce(new Error("idb"));

    fireEvent.click(removeButton);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("사진을 삭제하지 못했어요. 다시 시도해 주세요."),
    );
    expect(screen.getByRole("button", { name: "내 사진 1" })).toBeInTheDocument();
    expect(analytics.removed).not.toHaveBeenCalled();
  });

  it("사진을 담지 못하면 미리보기를 열지 않고 안내한다", async () => {
    renderPage();
    await findSimpleTile();
    vi.spyOn(timerBackgroundPhotoStore(), "add").mockRejectedValueOnce(new Error("idb"));
    prepare.mockResolvedValueOnce(SQUARE);

    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요"),
    );
    expect(screen.queryByTestId("timer-background-preview")).toBeNull();
    expect(analytics.added).not.toHaveBeenCalled();
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  it("10장이 차 있으면 앨범을 열지 않고 안내한다", async () => {
    for (let index = 0; index < 10; index += 1) {
      await timerBackgroundPhotoStore().add(SQUARE, index);
    }
    renderPage();
    await screen.findByText("10/10");
    const click = vi.spyOn(fileInput(), "click");

    fireEvent.click(screen.getByRole("button", { name: "앨범에서 선택" }));

    expect(click).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("사진은 10개까지 담을 수 있어요");
  });

  it("앱 선택기를 쓸 수 있으면 앱에서 고른 사진을 담는다", async () => {
    nativePicker.available = true;
    nativePicker.pick.mockResolvedValueOnce(SQUARE);
    renderPage();
    await findSimpleTile();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "앨범에서 선택" }));
    });

    expect(await screen.findByTestId("timer-background-preview")).toBeInTheDocument();
    expect(analytics.added).toHaveBeenCalledWith({ count: 1, source: "native" });
  });
});
