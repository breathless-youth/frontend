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
import { getDecorations, getShopItems, putTimerBackground } from "@/lib/pointsApi";
import { queryClient } from "@/lib/queryClient";
import { showToast } from "@/lib/toast";
import { PROCTOR_SPACE, RAIN_ITEM, shopSpace } from "@/test/spaceFixtures";

const SQUARE = { bytes: new Uint8Array([1]).buffer, width: 1000, height: 1000 };

const prepare = vi.hoisted(() => vi.fn());
import { __resetWatcherAssetsForTests } from "@/features/timer-background/watcher/watcherAssets";

vi.mock("@/features/timer-background/prepareBackgroundPhoto", () => ({
  prepareBackgroundPhoto: prepare,
}));

const nativePicker = vi.hoisted(() => ({ available: false, pick: vi.fn() }));
vi.mock("@/lib/nativeBackgroundPhoto", () => ({
  canUseNativeBackgroundPhoto: () => nativePicker.available,
  pickNativeBackgroundPhoto: nativePicker.pick,
}));

// 회원 확인은 프로필을 서버에서 다시 읽어서, 테스트마다 회원인지 정해 준다.
const member = vi.hoisted(() => ({ value: false }));
vi.mock("@/features/timer-background/spaceCatalogQuery", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isMemberUser: vi.fn(async () => member.value),
}));

// 공간 묶음은 서버 상점 목록에서 가진 공간을 읽는다.
vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(),
  getDecorations: vi.fn(),
  putTimerBackground: vi.fn(),
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
  vi.mocked(getShopItems).mockResolvedValue({ items: [shopSpace(), RAIN_ITEM] });
  const decorations = { selectedMascotCode: "BOOK", accessories: [], timerBackground: null };
  vi.mocked(getDecorations).mockResolvedValue(decorations);
  vi.mocked(putTimerBackground).mockResolvedValue(decorations);
});

/** 회원이면 고른 공간을 서버에도 저장한다. */
function signIn() {
  member.value = true;
}

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  nativePicker.available = false;
  member.value = false;
});

describe("설정 › 타이머 배경 선택 화면", () => {
  it("처음에는 심플이 사용 중이고, 가진 공간을 서버 분류 칩과 묶음으로 보인다", async () => {
    renderPage();

    const simple = await findSimpleTile();
    expect(simple).toHaveAttribute("aria-pressed", "true");
    expect(within(simple).getByText("사용 중")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "다이나믹" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "자연" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "독서실 감독관" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비 오는 창가" })).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("감독 공간을 고르면 감독관이 깔린 미리보기가 뜨고, 적용하면 설정 행 이름이 바뀌고 회원이면 서버에 저장한다", async () => {
    signIn();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    const preview = screen.getByTestId("timer-background-preview");
    expect(within(preview).getByTestId("watcher-background")).toBeInTheDocument();
    expect(screen.getByText("발걸음 소리가 들려요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    // 설정으로 돌아간다. 행의 공간 이름은 `useTimerBackgroundName` 테스트가 본다(테스트 주소에는 계정이 없다).
    expect(await screen.findByRole("button", { name: /^타이머 배경/ })).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith("배경을 적용했어요", { persistOnNavigation: true });
    expect(readTimerBackground()).toEqual(PROCTOR_SPACE);
    expect(putTimerBackground).toHaveBeenCalledExactlyOnceWith(PROCTOR_SPACE.itemId);
    expect(analytics.applied).toHaveBeenCalledWith({
      kind: "space",
      source: "preview",
      tab: "video",
      category: "DYNAMIC",
      item: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
    });
  });

  it("회원의 서버 저장이 실패하면 적용됐다고 알리지 않고 미리보기에 머문다", async () => {
    signIn();
    vi.mocked(putTimerBackground).mockRejectedValueOnce(new Error("offline"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "비 오는 창가" }));

    fireEvent.click(screen.getByRole("button", { name: "적용하기" }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("배경을 적용하지 못했어요. 다시 시도해 주세요."),
    );
    expect(screen.getByTestId("timer-background-preview")).toBeInTheDocument();
    expect(readTimerBackground()).toEqual({ kind: "simple" });
    expect(analytics.applied).not.toHaveBeenCalled();
  });

  it("다음 묶음 제목이 화면 위쪽 40% 안으로 들어오면 그 칩으로 바뀐다", async () => {
    renderPage();
    await screen.findByRole("button", { name: "다이나믹" });
    const sectionOf = (name: string) => screen.getByRole("heading", { name }).closest("section")!;
    // 화면 높이 844에서 다이나믹 묶음 제목이 위에서 300px(40% 선 337px 안)에 있다.
    const tops: Record<string, number> = { "내 사진": -200, 다이나믹: 300, 자연: 900, 심플: 1500 };
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

      expect(screen.getByRole("button", { name: "다이나믹" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      Object.defineProperty(window, "innerHeight", { value: originalHeight, configurable: true });
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    }
  });

  it("내 사진을 다 채우면 앨범 칸과 함께 한 줄을 넘어 좌우로 넘긴다", async () => {
    for (let index = 0; index < 3; index += 1) {
      await timerBackgroundPhotoStore().add(SQUARE, index);
    }
    renderPage();
    const lastPhoto = await screen.findByRole("button", { name: "내 사진 3" });

    const row = screen.getByRole("button", { name: "앨범에서 선택" }).parentElement!;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("grid");
    expect(row).toContainElement(lastPhoto);
    // 서버 공간 묶음은 그대로 세 칸 격자다.
    expect(
      (await screen.findByRole("button", { name: "독서실 감독관" })).parentElement!.className,
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
    expect(analytics.applied).toHaveBeenCalledWith({
      kind: "photo",
      source: "preview",
      tab: "image",
      category: "all",
    });
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

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("배경을 적용하지 못했어요. 다시 시도해 주세요."),
    );
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
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("3장이 차 있으면 앨범을 열지 않고 안내한다", async () => {
    for (let index = 0; index < 3; index += 1) {
      await timerBackgroundPhotoStore().add(SQUARE, index);
    }
    renderPage();
    await screen.findByText("3/3");
    const click = vi.spyOn(fileInput(), "click");

    fireEvent.click(screen.getByRole("button", { name: "앨범에서 선택" }));

    expect(click).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("사진은 3개까지 담을 수 있어요");
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
