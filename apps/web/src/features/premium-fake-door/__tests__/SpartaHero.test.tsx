import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubImageLoad } from "@/test/imageStub";

import { SpartaHero } from "../SpartaHero";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** 불 그림이 읽히는 마이크로태스크를 흘려보낸다. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let raf: ReturnType<typeof vi.fn>;
let caf: ReturnType<typeof vi.fn>;

beforeEach(() => {
  let id = 0;
  raf = vi.fn(() => ++id);
  caf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  // jsdom에는 캔버스 그리기가 없다. 픽셀은 보지 않으므로 그리기 판이 없는 것으로 둔다.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  stubImageLoad("load");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("SpartaHero", () => {
  it("불 캔버스와 몸 그림을 꾸밈으로 그린다", () => {
    mockReducedMotion(false);
    const { container } = render(<SpartaHero />);

    const hero = container.firstElementChild;
    expect(hero).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("불 그림이 읽힌 뒤에 애니메이션을 시작하고, 화면을 떠나면 예약한 프레임을 취소한다", async () => {
    mockReducedMotion(false);
    const { unmount } = render(<SpartaHero />);
    expect(raf).not.toHaveBeenCalled();

    await flush();
    expect(raf).toHaveBeenCalled();
    const lastId = raf.mock.results.at(-1)?.value as number;

    unmount();
    expect(caf).toHaveBeenCalledWith(lastId);
  });

  it("모션 줄이기를 켠 기기에서는 한 장만 그리고 애니메이션을 돌리지 않는다", async () => {
    mockReducedMotion(true);
    render(<SpartaHero />);
    await flush();

    expect(raf).not.toHaveBeenCalled();
  });

  it("문서가 숨으면 프레임을 멈추고, 다시 보이면 이어 간다", async () => {
    mockReducedMotion(false);
    render(<SpartaHero />);
    await flush();
    const calls = raf.mock.calls.length;

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(caf).toHaveBeenCalled();

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(raf.mock.calls.length).toBe(calls + 1);
  });
});
