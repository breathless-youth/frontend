import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNativeShellClass } from "@/lib/nativeShell";

/**
 * 웹뷰 안에서만 페이지 드래그·길게 눌러 선택을 막는 클래스(`index.css`의 `.native-shell`).
 *
 * 브라우저 단독 배포에서는 걸리지 않아야 한다 — 약관·방침을 읽는 사용자에게서 선택·복사를
 * 빼앗는 건 앱처럼 보이게 하는 것과 무관한 손해다.
 */

function Harness() {
  useNativeShellClass();
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("native-shell");
});

describe("useNativeShellClass", () => {
  it("웹뷰(브리지 있음)에서는 문서 루트에 클래스를 건다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    render(<Harness />);

    expect(document.documentElement.classList.contains("native-shell")).toBe(true);
  });

  it("브라우저 단독 모드에서는 걸지 않는다 — 선택·복사가 살아 있어야 한다", () => {
    render(<Harness />);

    expect(document.documentElement.classList.contains("native-shell")).toBe(false);
  });

  it("언마운트되면 걷어낸다 — 문서 전역 상태를 남기지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    const { unmount } = render(<Harness />);

    unmount();

    expect(document.documentElement.classList.contains("native-shell")).toBe(false);
  });
});
