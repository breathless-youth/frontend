import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { mockAllIsIntersecting } from "react-intersection-observer/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import { TimelapsePlayer } from "../TimelapsePlayer";
import { useTimelapsePlayer } from "../useTimelapsePlayer";

/** 한 장이 넘어가는 데 넉넉한 시간. rAF는 16ms 단위라 83ms에 딱 맞춰 넘기지 않는다. */
const STEP_MS = 100;

interface FakeBitmap {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly close: ReturnType<typeof vi.fn>;
}

let bitmaps: FakeBitmap[];
let broken: Set<number>;

function photos(count: number): ArrayBuffer[] {
  return Array.from({ length: count }, (_, index) => new Uint8Array([index]).buffer);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  bitmaps = [];
  broken = new Set();
  // 컴포넌트 테스트는 브라우저 디코더를 거친다. jsdom에는 없어 흉내 낸다.
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => Promise.resolve(fakeBitmap(-1))),
  );
});

function fakeBitmap(index: number): FakeBitmap {
  const bitmap = { index, width: 405, height: 720, close: vi.fn() };
  bitmaps.push(bitmap);
  return bitmap;
}

/** 사진 바이트 첫 값이 번호다. 번호가 `broken`에 있으면 디코드에 실패한다. */
function decode(bytes: ArrayBuffer): Promise<ImageBitmap> {
  const index = new Uint8Array(bytes)[0] ?? -1;
  if (broken.has(index)) {
    return Promise.reject(new Error("decode failed"));
  }
  return Promise.resolve(fakeBitmap(index) as unknown as ImageBitmap);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 디코드 promise를 비우고 타이머를 진행한다. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function drawnIndexes(draw: ReturnType<typeof vi.fn>): number[] {
  return draw.mock.calls.map(([, index]) => index as number);
}

describe("useTimelapsePlayer", () => {
  it("멈춰 있으면 첫 장만 그린다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: false, draw, decode }));

    await advance(STEP_MS * 5);

    expect(drawnIndexes(draw)).toEqual([0]);
  });

  it("재생하면 한 장씩 넘기고 마지막 장 다음에는 처음으로 돌아간다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(STEP_MS * 4);

    expect(drawnIndexes(draw).slice(0, 4)).toEqual([0, 1, 2, 0]);
  });

  it("초당 12장보다 빨리 넘기지 않는다", async () => {
    const draw = vi.fn();
    const list = photos(30);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(1_000);

    // 첫 장을 그린 뒤 1초 동안 넘긴 장 수
    expect(draw.mock.calls.length - 1).toBeLessThanOrEqual(12);
    expect(draw.mock.calls.length - 1).toBeGreaterThanOrEqual(10);
  });

  it("풀지 못하는 사진은 건너뛰고 계속 재생한다", async () => {
    broken.add(1);
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(STEP_MS * 4);

    expect(drawnIndexes(draw).slice(0, 3)).toEqual([0, 2, 0]);
  });

  it("첫 사진을 풀지 못하면 멈춰 있어도 다음 사진을 그린다", async () => {
    broken.add(0);
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: false, draw, decode }));

    await advance(STEP_MS);

    expect(drawnIndexes(draw)).toEqual([1]);
  });

  it("다음 사진이 먼저 풀린 뒤 첫 사진이 실패해도 멈춘 화면에 다음 사진을 그린다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    const lateFailure = (bytes: ArrayBuffer): Promise<ImageBitmap> =>
      new Uint8Array(bytes)[0] === 0
        ? new Promise((_, reject) => setTimeout(() => reject(new Error("decode failed")), 50))
        : decode(bytes);
    renderHook(() =>
      useTimelapsePlayer({ photos: list, playing: false, draw, decode: lateFailure }),
    );

    await advance(STEP_MS);

    expect(drawnIndexes(draw)).toEqual([1]);
  });

  it("다음 장을 그린 뒤 앞 장의 비트맵을 닫는다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(0);
    const first = draw.mock.calls[0]?.[0] as FakeBitmap;
    await advance(STEP_MS * 2);

    expect(first.close).toHaveBeenCalled();
  });

  it("다시 그릴 값이 바뀌면 멈춰 있어도 지금 장을 다시 그린다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    const { rerender } = renderHook(
      ({ redrawKey }) =>
        useTimelapsePlayer({ photos: list, playing: false, draw, decode, redrawKey }),
      { initialProps: { redrawKey: "a" } },
    );
    await advance(0);

    rerender({ redrawKey: "b" });

    expect(drawnIndexes(draw)).toEqual([0, 0]);
  });

  it("여러 바퀴를 돌아도 열린 비트맵은 미리 받는 장 수만큼만 남는다", async () => {
    const draw = vi.fn();
    const list = photos(30);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(8_000);

    expect(draw.mock.calls.length).toBeGreaterThan(60);
    const open = bitmaps.filter((bitmap) => bitmap.close.mock.calls.length === 0);
    // 지금 보이는 장 하나와 앞으로 미리 푼 6장
    expect(open.length).toBeLessThanOrEqual(7);
  });

  it("사진을 하나도 풀지 못하면 아무것도 그리지 않는다", async () => {
    broken.add(0).add(1).add(2);
    const draw = vi.fn();
    const list = photos(3);
    renderHook(() => useTimelapsePlayer({ photos: list, playing: true, draw, decode }));

    await advance(STEP_MS * 5);

    expect(draw).not.toHaveBeenCalled();
  });

  it("깨진 사진은 일시정지했다 다시 재생해도 다시 풀지 않는다", async () => {
    broken.add(1);
    const spy = vi.fn(decode);
    const list = photos(3);
    const { rerender } = renderHook(
      ({ playing }) => useTimelapsePlayer({ photos: list, playing, draw: vi.fn(), decode: spy }),
      { initialProps: { playing: true } },
    );
    await advance(STEP_MS * 2);
    const attemptsForBroken = () =>
      spy.mock.calls.filter(([bytes]) => new Uint8Array(bytes)[0] === 1).length;
    const before = attemptsForBroken();

    rerender({ playing: false });
    rerender({ playing: true });
    await advance(STEP_MS * 3);

    expect(before).toBe(1);
    expect(attemptsForBroken()).toBe(1);
  });

  it("StrictMode에서도 순서대로 넘기고 언마운트하면 비트맵을 모두 닫는다", async () => {
    const draw = vi.fn();
    const list = photos(3);
    const { unmount } = renderHook(
      () => useTimelapsePlayer({ photos: list, playing: true, draw, decode }),
      { wrapper: StrictMode },
    );

    await advance(STEP_MS * 3);
    unmount();

    expect(
      drawnIndexes(draw)
        .filter((index, i, all) => index !== all[i - 1])
        .slice(0, 3),
    ).toEqual([0, 1, 2]);
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length > 0)).toBe(true);
  });

  it("언마운트하면 남은 비트맵을 모두 닫는다", async () => {
    const list = photos(10);
    const { unmount } = renderHook(() =>
      useTimelapsePlayer({ photos: list, playing: false, draw: vi.fn(), decode }),
    );
    await advance(0);

    unmount();

    expect(bitmaps.length).toBeGreaterThan(1);
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length > 0)).toBe(true);
  });
});

describe("TimelapsePlayer", () => {
  const FIVE = photos(5);
  const overlay = {
    info: DEFAULT_TIMELAPSE_SETTINGS.info,
    text: { date: "", focusTime: "", focusRate: "", dday: null, streak: null },
    flow: null,
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  function progressWidth() {
    return (screen.getByTestId("timelapse-progress") as HTMLElement).style.width;
  }

  it("보이지 않으면 넘기지 않고 보이면 넘긴다", async () => {
    render(<TimelapsePlayer aspect="9:16" photos={FIVE} overlay={overlay} />);
    act(() => mockAllIsIntersecting(false));
    await advance(STEP_MS * 3);
    expect(progressWidth()).toBe("0%");

    act(() => mockAllIsIntersecting(true));
    await advance(STEP_MS * 2);

    expect(progressWidth()).not.toBe("0%");
  });

  it("일시정지를 누르면 멈추고 버튼이 재생으로 바뀐다", async () => {
    render(<TimelapsePlayer aspect="9:16" photos={FIVE} overlay={overlay} />);
    // 글꼴을 기다린 뒤 보이게 해야 가짜 관찰자가 지금 요소에 신호를 보낸다.
    await advance(0);
    act(() => mockAllIsIntersecting(true));
    await advance(STEP_MS * 2);
    expect(progressWidth()).not.toBe("0%");

    fireEvent.click(screen.getByRole("button", { name: "타임랩스 일시정지" }));
    const stopped = progressWidth();
    await advance(STEP_MS * 3);

    expect(progressWidth()).toBe(stopped);
    expect(screen.getByRole("button", { name: "타임랩스 재생" })).toBeInTheDocument();
  });

  it("움직임 줄이기 설정이면 보여도 멈춰 있고 버튼으로 재생한다", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    render(<TimelapsePlayer aspect="9:16" photos={FIVE} overlay={overlay} />);
    await advance(0);
    act(() => mockAllIsIntersecting(true));
    await advance(STEP_MS * 3);
    expect(progressWidth()).toBe("0%");

    fireEvent.click(screen.getByRole("button", { name: "타임랩스 재생" }));
    await advance(STEP_MS * 2);

    expect(progressWidth()).not.toBe("0%");
  });

  it("캔버스 픽셀 크기를 사진 크기에 맞춘다", async () => {
    const { container } = render(<TimelapsePlayer aspect="9:16" photos={FIVE} overlay={overlay} />);

    await advance(0);
    const canvas = container.querySelector("canvas")!;

    expect([canvas.width, canvas.height]).toEqual([405, 720]);
  });

  it("뒤 사진의 크기가 달라도 캔버스는 첫 사진 크기를 유지한다", async () => {
    let call = 0;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => {
        call += 1;
        const bitmap = fakeBitmap(-1);
        return Promise.resolve(
          call > 1 ? Object.assign(bitmap, { width: 400, height: 700 }) : bitmap,
        );
      }),
    );
    const { container } = render(<TimelapsePlayer aspect="9:16" photos={FIVE} overlay={overlay} />);
    await advance(0);
    act(() => mockAllIsIntersecting(true));

    await advance(STEP_MS * 3);
    const canvas = container.querySelector("canvas")!;

    expect(progressWidth()).not.toBe("0%");
    expect([canvas.width, canvas.height]).toEqual([405, 720]);
  });

  it("캔버스와 진행 막대는 스크린리더에서 숨긴다", () => {
    const { container } = render(
      <TimelapsePlayer aspect="16:9" photos={photos(2)} overlay={overlay} />,
    );

    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("timelapse-progress").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
