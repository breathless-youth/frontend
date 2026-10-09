import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { trackOsSettingsOpened, trackTimelapseShareTapped } from "@/lib/amplitude";
import type * as Bridge from "@/lib/bridge";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import type * as NativeVideo from "@/lib/nativeVideo";
import { canUseNativeVideo, saveVideoNatively, shareVideoNatively } from "@/lib/nativeVideo";
import { showToast } from "@/lib/toast";

import { TimelapseShareDialog } from "../TimelapseShareDialog";
import { savedOverlayFor } from "../timelapseFrame";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import {
  createIndexedDbTimelapseStore,
  type TimelapseRecord,
  type TimelapseStore,
} from "../timelapseStore";
import type * as TimelapseVideo from "../timelapseVideo";
import { buildTimelapseVideo, TimelapseVideoError } from "../timelapseVideo";

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
  shareVideoNatively: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("../timelapseVideo", async (importOriginal) => ({
  ...(await importOriginal<typeof TimelapseVideo>()),
  buildTimelapseVideo: vi.fn(),
}));

/**
 * 재생기 대역
 *
 * 재생기는 따로 검증했으므로 다이얼로그가 넘기는 값과 children 내용만 본다.
 */
vi.mock("../TimelapsePlayer", () => ({
  TimelapsePlayer: (props: {
    aspect: string;
    photos: readonly ArrayBuffer[];
    children?: ReactNode;
  }) => (
    <div data-testid="player" data-aspect={props.aspect} data-count={props.photos.length}>
      {props.children}
    </div>
  ),
}));

const T0 = new Date(2026, 9, 5, 21, 3).getTime();
const BUTTONS = ["저장하기", "인스타그램", "카카오톡", "더 보기"];

let store: TimelapseStore;
let record: TimelapseRecord;

function builtVideo() {
  return {
    bytes: new Uint8Array([1]).buffer,
    mimeType: "video/mp4",
    method: "webcodecs" as const,
    frames: 2,
    aspect: "9:16" as const,
  };
}

/** 결과를 테스트가 정할 때까지 붙잡아 두는 약속 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function stubWebShare(canShare: boolean, share = vi.fn(() => Promise.resolve())) {
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => canShare });
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  return share;
}

function nativeApp() {
  vi.mocked(canUseNativeVideo).mockReturnValue(true);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
}

function oldApp() {
  vi.mocked(canUseNativeVideo).mockReturnValue(false);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
}

function renderDialog(entry: "result" | "list" = "list") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const ui = (isOpen: boolean) => (
    <QueryClientProvider client={client}>
      <TimelapseShareDialog
        open={isOpen}
        onOpenChange={onOpenChange}
        record={record}
        overlay={savedOverlayFor(record)}
        entry={entry}
        store={store}
      />
    </QueryClientProvider>
  );
  const view = render(ui(true));
  return { ...view, client, onOpenChange, reopen: (isOpen: boolean) => view.rerender(ui(isOpen)) };
}

/** 닫으면 open을 실제로 false로 바꿔 Content 언마운트까지 일으킨다. */
function renderClosingDialog(entry: "result" | "list") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let setOpenFromTest: (open: boolean) => void = () => {};
  let setTargetFromTest: (target: TimelapseRecord) => void = () => {};
  function Closing() {
    const [open, setOpen] = useState(true);
    const [target, setTarget] = useState(record);
    setOpenFromTest = setOpen;
    setTargetFromTest = setTarget;
    return (
      <TimelapseShareDialog
        open={open}
        onOpenChange={setOpen}
        record={target}
        overlay={savedOverlayFor(target)}
        entry={entry}
        store={store}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Closing />
    </QueryClientProvider>,
  );
  return {
    ...view,
    setOpen: (open: boolean) => act(() => setOpenFromTest(open)),
    /** 목록에서 다른 줄을 누른 것처럼 레코드를 바꿔 다시 연다. */
    openWith: (target: TimelapseRecord) =>
      act(() => {
        setTargetFromTest(target);
        setOpenFromTest(true);
      }),
  };
}

/**
 * 닫힘 애니메이션 흉내
 *
 * jsdom은 애니메이션이 없어 Radix Presence가 닫자마자 Content를 언마운트한다.
 * data-state에 따라 animationName을 돌려주면 Presence가 animationend를 받을 때까지 Content를 남긴다.
 */
function animateDialogStates() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const styles = real(element, pseudo);
    return new Proxy(styles, {
      get(target, key) {
        const state = element.getAttribute("data-state");
        if (key === "animationName" && state !== null) return state === "closed" ? "exit" : "enter";
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
  }
}

function endExitAnimation(element: HTMLElement) {
  const event = new Event("animationend");
  Object.assign(event, { animationName: "exit" });
  act(() => {
    element.dispatchEvent(event);
  });
}

async function openedDialog() {
  return await screen.findByRole("dialog", { name: "공유하기" });
}

async function readyButton(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"));
  return button;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
  await store.begin(T0, DEFAULT_TIMELAPSE_SETTINGS);
  await store.addPhoto(T0, new Uint8Array([0]).buffer, T0);
  await store.addPhoto(T0, new Uint8Array([1]).buffer, T0 + 10_000);
  await store.finalize(T0, { endedAtMs: T0 + 3_600_000, studySec: 3_600, focusSec: 2_880 });
  record = (await store.get(T0))!;
  vi.mocked(canUseNativeVideo).mockReturnValue(false);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
  vi.mocked(buildTimelapseVideo).mockResolvedValue(builtVideo());
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("버튼 노출", () => {
  it("새 앱은 저장하기·인스타그램·카카오톡·더 보기를 모두 보여준다", async () => {
    nativeApp();
    renderDialog();

    const dialog = await openedDialog();
    for (const name of BUTTONS) {
      expect(within(dialog).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(dialog).getByText("포커스 메이커스")).toBeInTheDocument();
  });

  it("브라우저는 파일을 공유할 수 없으면 저장하기만 보여준다", async () => {
    renderDialog();

    const dialog = await openedDialog();
    expect(within(dialog).getByRole("button", { name: "저장하기" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "더 보기" })).toBeNull();
  });

  it("구 버전 앱이 파일을 공유할 수 있으면 공유 버튼만 보여준다", async () => {
    oldApp();
    stubWebShare(true);
    renderDialog();

    const dialog = await openedDialog();
    expect(within(dialog).queryByRole("button", { name: "저장하기" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "더 보기" })).toBeInTheDocument();
  });

  it("구 버전 앱이 공유도 할 수 없으면 업데이트를 안내하고 영상을 만들지 않는다", async () => {
    oldApp();
    renderDialog();

    const dialog = await openedDialog();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "앱을 업데이트하면 저장하고 공유할 수 있어요",
    );
    expect(within(dialog).queryByRole("button", { name: "저장하기" })).toBeNull();
    expect(within(dialog).queryByRole("progressbar")).toBeNull();
    // 앞 테스트가 늦게 시작한 영상 만들기가 섞여 들어오므로 이 테스트의 저장소로 부른 것만 본다.
    expect(buildTimelapseVideo).not.toHaveBeenCalledWith(T0, store, expect.any(Function));
  });
});

describe("영상 준비", () => {
  it("만드는 동안 진행률을 보여주고 버튼을 모두 비활성으로 둔다", async () => {
    nativeApp();
    vi.mocked(buildTimelapseVideo).mockImplementation((_ms, _store, onProgress) => {
      onProgress(0.4);
      return new Promise(() => {});
    });
    renderDialog();

    const dialog = await openedDialog();
    expect(within(dialog).getByText("공유할 영상을 생성하고 있어요")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40"),
    );
    for (const name of BUTTONS) {
      expect(within(dialog).getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "저장하기" }));
    expect(saveVideoNatively).not.toHaveBeenCalled();
  });

  it("영상이 준비되면 진행률을 걷고 버튼을 연다", async () => {
    nativeApp();
    renderDialog();

    await readyButton("저장하기");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("공유할 영상을 생성하고 있어요")).toBeNull();
  });

  it("만들기에 실패하면 다시 시도로 다시 만든다", async () => {
    nativeApp();
    vi.mocked(buildTimelapseVideo)
      .mockRejectedValueOnce(new TimelapseVideoError("webcodecs", "encode"))
      .mockResolvedValueOnce(builtVideo());
    renderDialog();

    const dialog = await openedDialog();
    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent("영상을 만들지 못했어요"),
    );
    expect(within(dialog).getByRole("button", { name: "저장하기" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "다시 시도" }));

    await readyButton("저장하기");
    expect(buildTimelapseVideo).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByRole("status")).toBeEmptyDOMElement();
  });

  it("이 기기에서 만들 수 없으면 다시 시도 없이 비활성으로 둔다", async () => {
    nativeApp();
    vi.mocked(buildTimelapseVideo).mockRejectedValue(
      new TimelapseVideoError("none", "unsupported"),
    );
    renderDialog();

    const dialog = await openedDialog();
    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "이 기기에서는 영상을 만들 수 없어요",
      ),
    );
    expect(within(dialog).queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "더 보기" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("저장·공유", () => {
  it("요청 결과가 올 때까지 버튼을 모두 비활성으로 두고 두 번 보내지 않는다", async () => {
    nativeApp();
    const pending = deferred<"saved">();
    vi.mocked(saveVideoNatively).mockReturnValue(pending.promise);
    renderDialog();

    const save = await readyButton("저장하기");
    save.focus();
    fireEvent.click(save);
    fireEvent.click(save);

    for (const name of BUTTONS) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
    expect(saveVideoNatively).toHaveBeenCalledTimes(1);
    expect(trackTimelapseShareTapped).not.toHaveBeenCalled();
    await act(async () => pending.resolve("saved"));
    expect(save).toHaveAttribute("aria-disabled", "false");
    expect(save).toHaveFocus();
    expect(trackTimelapseShareTapped).toHaveBeenCalledTimes(1);
  });

  it("저장 요청이 결과 대신 바로 오류를 던져도 버튼을 풀고 실패로 알린다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockImplementationOnce(() => {
      throw new Error("bridge");
    });
    renderDialog();

    const save = await readyButton("저장하기");
    fireEvent.click(save);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("저장하지 못했어요. 다시 시도해 주세요"),
    );
    expect(save).toHaveAttribute("aria-disabled", "false");
    expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
      button: "save",
      result: "failed",
      entry: "list",
    });
  });

  it("브라우저 공유 창은 누른 그 자리에서 바로 연다", async () => {
    const share = stubWebShare(true);
    renderDialog();

    fireEvent.click(await readyButton("더 보기"));

    expect(share).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trackTimelapseShareTapped).toHaveBeenCalled());
  });

  it("앱 저장에 성공하면 사진 앱에 저장했다고 알린다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("saved");
    renderDialog();

    fireEvent.click(await readyButton("저장하기"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("사진 앱에 저장했어요"),
    );
  });

  it("사진 권한이 꺼져 있으면 설정 열기로 OS 설정을 연다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("denied");
    renderDialog();

    fireEvent.click(await readyButton("저장하기"));
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("사진 접근 권한이 꺼져 있어요"));
    fireEvent.click(within(status).getByRole("button", { name: "설정 열기" }));

    expect(trackOsSettingsOpened).toHaveBeenCalledWith("timelapse_share");
    expect(postToNative).toHaveBeenCalledWith({ type: "open-settings", atMs: expect.any(Number) });
    expect(vi.mocked(trackOsSettingsOpened).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(postToNative).mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ["인스타그램", "instagram"],
    ["카카오톡", "kakao"],
    ["더 보기", "more"],
  ] as const)(
    "%s는 OS 공유로 보내고 결과를 버튼·결과·진입 화면으로 남긴다",
    async (name, button) => {
      nativeApp();
      vi.mocked(shareVideoNatively).mockResolvedValue("shared");
      renderDialog();

      fireEvent.click(await readyButton(name));

      await waitFor(() =>
        expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
          button,
          result: "shared",
          entry: "list",
        }),
      );
      expect(vi.mocked(shareVideoNatively).mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    },
  );

  it("공유에 실패하면 다시 시도하라고 알린다", async () => {
    nativeApp();
    vi.mocked(shareVideoNatively).mockResolvedValue("failed");
    renderDialog();

    fireEvent.click(await readyButton("더 보기"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("공유하지 못했어요. 다시 시도해 주세요"),
    );
  });

  it("새로 누르면 앞 안내를 지운다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValueOnce("failed");
    renderDialog();

    fireEvent.click(await readyButton("저장하기"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장하지 못했어요"));
    vi.mocked(saveVideoNatively).mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("브라우저 다운로드는 안내 없이 saved로 남긴다", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:v" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderDialog();

    fireEvent.click(await readyButton("저장하기"));

    await waitFor(() =>
      expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
        button: "save",
        result: "saved",
        entry: "list",
      }),
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("브라우저 다운로드가 오류를 던지면 저장하지 못했다고 알린다", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => {
        throw new Error("quota");
      },
    });
    renderDialog();

    fireEvent.click(await readyButton("저장하기"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("저장하지 못했어요. 다시 시도해 주세요"),
    );
    expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
      button: "save",
      result: "failed",
      entry: "list",
    });
  });
});

describe("열고 닫기", () => {
  it("카드와 시트 밖 빈 곳을 누르면 닫고 시트 안을 누르면 닫지 않는다", async () => {
    nativeApp();
    const { onOpenChange } = renderDialog();

    const dialog = await openedDialog();
    fireEvent.click(within(dialog).getByRole("heading", { name: "공유하기" }));
    fireEvent.click(within(dialog).getByText("포커스 메이커스"));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc를 누르면 닫는다", async () => {
    nativeApp();
    const { onOpenChange } = renderDialog();

    fireEvent.keyDown(await openedDialog(), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("모달로 표시하고 네이티브 탭 바 자리를 덮는다고 알린다", async () => {
    renderDialog();

    const dialog = await openedDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-covers-tab-bar");
  });

  it("닫았다 다시 열면 앞 안내가 남지 않는다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("failed");
    const { reopen } = renderDialog();

    fireEvent.click(await readyButton("저장하기"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장하지 못했어요"));
    reopen(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    reopen(true);

    expect(within(await openedDialog()).getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("카드 크기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("375 폭 화면에서 세로 영상은 카드 테두리와 패딩을 뺀 293이다", async () => {
    // 화면 좌우 여백 16을 뺀 카드 자리 343을 돌려주는 측정기
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe() {
          this.callback(
            [{ contentRect: { width: 343, height: 700 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
      },
    );
    renderDialog();

    await openedDialog();
    expect(screen.getByTestId("player").parentElement).toHaveStyle({ width: "293px" });
  });
});

describe("결과 화면", () => {
  it("카드 없이 시트만 열고 사진을 읽지 않는다", async () => {
    nativeApp();
    const listPhotos = vi.spyOn(store, "listPhotos");
    const { onOpenChange } = renderDialog("result");

    const dialog = await openedDialog();
    await readyButton("저장하기");
    for (const name of BUTTONS) {
      expect(within(dialog).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(dialog).queryByText("포커스 메이커스")).toBeNull();
    expect(within(dialog).queryByTestId("player")).toBeNull();
    expect(listPhotos).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-covers-tab-bar");

    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("앱 저장에 성공하면 시트가 다 닫힌 뒤 토스트로 알린다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("saved");
    let dialogAtToast: HTMLElement | null | undefined;
    vi.mocked(showToast).mockImplementationOnce(() => {
      dialogAtToast = screen.queryByRole("dialog");
    });
    renderClosingDialog("result");

    fireEvent.click(await readyButton("저장하기"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith("사진 앱에 저장했어요");
    expect(dialogAtToast).toBeNull();
    expect(trackTimelapseShareTapped).toHaveBeenCalledTimes(1);
    expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
      button: "save",
      result: "saved",
      entry: "result",
    });
  });

  it("저장 중에 먼저 닫아도 저장되면 토스트로 알린다", async () => {
    nativeApp();
    const pending = deferred<"saved">();
    vi.mocked(saveVideoNatively).mockReturnValue(pending.promise);
    renderClosingDialog("result");

    fireEvent.click(await readyButton("저장하기"));
    fireEvent.keyDown(await openedDialog(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // 언마운트 뒤 포커스 복귀 타이머까지 흘려 보내 닫힘을 끝낸다.
    await act(() => new Promise((done) => setTimeout(done, 0)));
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => pending.resolve("saved"));

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith("사진 앱에 저장했어요");
  });

  it("사진 권한이 꺼져 있으면 시트에 남아 설정 열기를 보여준다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("denied");
    const { onOpenChange } = renderDialog("result");

    fireEvent.click(await readyButton("저장하기"));

    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("사진 접근 권한이 꺼져 있어요"));
    expect(within(status).getByRole("button", { name: "설정 열기" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("브라우저 다운로드가 시작되면 토스트 없이 시트만 닫는다", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:v" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderClosingDialog("result");

    fireEvent.click(await readyButton("저장하기"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // 닫힌 뒤 포커스 복귀 타이머까지 흘려 보낸다.
    await act(() => new Promise((done) => setTimeout(done, 0)));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("영상을 만드는 동안 시트 안내 줄에 문구와 진행률을 보여준다", async () => {
    nativeApp();
    vi.mocked(buildTimelapseVideo).mockImplementation((_ms, _store, onProgress) => {
      onProgress(0.4);
      return new Promise(() => {});
    });
    renderDialog("result");

    const status = within(await openedDialog()).getByRole("status");
    expect(status).toHaveTextContent("공유할 영상을 생성하고 있어요");
    await waitFor(() =>
      expect(within(status).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40"),
    );
    for (const name of BUTTONS) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    }
  });
});

describe("닫힘 애니메이션 중 다시 열기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("저장 뒤 다 닫히기 전에 다시 열면 그 뒤 닫아도 앞 토스트를 띄우지 않는다", async () => {
    nativeApp();
    vi.mocked(saveVideoNatively).mockResolvedValue("saved");
    animateDialogStates();
    const { setOpen } = renderClosingDialog("result");

    fireEvent.click(await readyButton("저장하기"));
    const dialog = await openedDialog();
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    await setOpen(true);
    expect(dialog).toHaveAttribute("data-state", "open");

    fireEvent.keyDown(dialog, { key: "Escape" });
    endExitAnimation(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // 언마운트 뒤 포커스 복귀 타이머까지 흘려 보낸다.
    await act(() => new Promise((done) => setTimeout(done, 0)));

    expect(showToast).not.toHaveBeenCalled();
  });

  it("앞 레코드 저장 중 닫고 다른 레코드로 다시 열면 앞 실패가 새 시트에 남지 않는다", async () => {
    nativeApp();
    const pending = deferred<"failed">();
    vi.mocked(saveVideoNatively).mockReturnValueOnce(pending.promise);
    const T1 = T0 + 86_400_000;
    await store.begin(T1, DEFAULT_TIMELAPSE_SETTINGS);
    await store.addPhoto(T1, new Uint8Array([2]).buffer, T1);
    await store.finalize(T1, { endedAtMs: T1 + 3_600_000, studySec: 3_600, focusSec: 2_880 });
    const other = (await store.get(T1))!;
    animateDialogStates();
    const { openWith } = renderClosingDialog("list");

    fireEvent.click(await readyButton("저장하기"));
    const dialog = await openedDialog();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toHaveAttribute("data-state", "closed");
    await openWith(other);
    expect(dialog).toHaveAttribute("data-state", "open");
    await act(async () => pending.resolve("failed"));

    const save = await readyButton("저장하기");
    expect(within(dialog).getByRole("status")).not.toHaveTextContent("저장하지 못했어요");
    expect(save).toHaveAttribute("aria-disabled", "false");
    expect(trackTimelapseShareTapped).toHaveBeenCalledTimes(1);
    expect(trackTimelapseShareTapped).toHaveBeenCalledWith({
      button: "save",
      result: "failed",
      entry: "list",
    });
  });

  it("저장 중 닫고 다시 열면 앞 저장이 끝나도 새 시트를 닫지 않고 그 시트가 닫힌 뒤 토스트를 띄운다", async () => {
    nativeApp();
    const pending = deferred<"saved">();
    vi.mocked(saveVideoNatively).mockReturnValueOnce(pending.promise);
    animateDialogStates();
    const { setOpen } = renderClosingDialog("result");

    fireEvent.click(await readyButton("저장하기"));
    const dialog = await openedDialog();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toHaveAttribute("data-state", "closed");
    await setOpen(true);
    await act(async () => pending.resolve("saved"));

    expect(trackTimelapseShareTapped).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("dialog", { name: "공유하기" })).toBe(dialog);
    expect(showToast).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: "Escape" });
    endExitAnimation(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // 언마운트 뒤 포커스 복귀 타이머까지 흘려 보낸다.
    await act(() => new Promise((done) => setTimeout(done, 0)));

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("사진 앱에 저장했어요");
  });
});
