import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isFullScreenPath, useNativeTabBarSync } from "@/lib/nativeTabBar";

/**
 * 전체 화면 웹 라우트에서 네이티브 탭 바를 감추는 동기화(`set-tab-bar`).
 *
 * 온보딩 가이드·문의·약관·방침은 탭 웹뷰 **안에서** 웹 라우팅으로 열려 네이티브 스택을
 * 건너므로, 이 신호가 없으면 탭 바가 그대로 남는다(Figma G1~G5에는 탭 바가 없다).
 */

function Harness({ to }: { to?: string }) {
  useNativeTabBarSync();
  const navigate = useNavigate();
  return to === undefined ? null : (
    <button
      type="button"
      onClick={() => {
        navigate(to);
      }}
    >
      이동
    </button>
  );
}

function renderAt(path: string, to?: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Harness to={to} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function sentVisibility(postMessage: ReturnType<typeof vi.fn>): boolean[] {
  return postMessage.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as { type: string; visible: boolean })
    .filter((message) => message.type === "set-tab-bar")
    .map((message) => message.visible);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isFullScreenPath", () => {
  it("탭 바 없는 전체 화면 라우트 4종을 가린다", () => {
    for (const path of ["/onboarding-guide", "/contact", "/terms", "/privacy"]) {
      expect(isFullScreenPath(path)).toBe(true);
    }
  });

  it("탭 라우트는 가리지 않는다", () => {
    for (const path of ["/home", "/records", "/settings", "/"]) {
      expect(isFullScreenPath(path)).toBe(false);
    }
  });

  it("세션은 전체 화면이지만 목록에 없다 — 네이티브 모달이 이미 탭 바를 덮고, 탭 라우트로 돌아오지 않아 복귀 신호를 보낼 기회가 없다", () => {
    expect(isFullScreenPath("/room/1")).toBe(false);
    expect(isFullScreenPath("/room/1/result")).toBe(false);
  });
});

describe("useNativeTabBarSync", () => {
  it("전체 화면 라우트로 들어가면 감추라고 알린다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt("/onboarding-guide");

    expect(sentVisibility(postMessage)).toEqual([false]);
  });

  it("탭 라우트에서는 보이라고 알린다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderAt("/settings");

    expect(sentVisibility(postMessage)).toEqual([true]);
  });

  it("가이드를 닫고 홈으로 돌아오면 복귀 신호를 보낸다 — 안 보내면 탭 바가 영영 사라진다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const { getByText } = renderAt("/onboarding-guide", "/home");

    act(() => {
      fireEvent.click(getByText("이동"));
    });

    expect(sentVisibility(postMessage)).toEqual([false, true]);
  });

  it("브라우저 단독 모드(브리지 없음)에서도 죽지 않는다", () => {
    expect(() => renderAt("/onboarding-guide")).not.toThrow();
  });

  /**
   * 문의(/contact)가 문서 단위 내비게이션이 되면서(COEP 예외 — `ContactPage` 주석) 뒤로
   * 스와이프가 이전 문서를 bfcache에서 복원할 수 있다 — 복원은 effect를 다시 돌리지 않으므로
   * `pageshow(persisted)`가 유일한 복귀 신호다.
   */
  it("bfcache 복원(pageshow persisted)이면 가시성을 다시 알린다 — 안 보내면 탭 바가 사라진 채 남는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderAt("/settings");
    postMessage.mockClear();

    act(() => {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });

    expect(sentVisibility(postMessage)).toEqual([true]);
  });

  it("일반 로드의 pageshow(persisted=false)에는 중복 신호를 보내지 않는다 — 마운트 effect가 이미 보냈다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderAt("/settings");
    postMessage.mockClear();

    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });

    expect(sentVisibility(postMessage)).toEqual([]);
  });
});
