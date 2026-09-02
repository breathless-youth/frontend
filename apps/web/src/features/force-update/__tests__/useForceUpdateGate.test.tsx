import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useForceUpdateGate } from "../useForceUpdateGate";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36";
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

function stubNavigator(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

function wrapper(path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useForceUpdateGate", () => {
  it("Android UA + appVersion이 최소 버전 미만이면 forced=true", () => {
    stubNavigator(ANDROID_UA, 5);

    const { result } = renderHook(() => useForceUpdateGate(), {
      wrapper: wrapper("/?appVersion=0.9.0"),
    });

    expect(result.current.forced).toBe(true);
  });

  it("iOS UA + appVersion이 최소 버전 미만이면 forced=true", () => {
    stubNavigator(IOS_UA, 5);

    const { result } = renderHook(() => useForceUpdateGate(), {
      wrapper: wrapper("/?appVersion=0.9.0"),
    });

    expect(result.current.forced).toBe(true);
  });

  it("appVersion이 최소 버전 미만이어도 스토어 플랫폼을 못 정하면(데스크톱 등) forced=false", () => {
    stubNavigator(DESKTOP_UA, 0);

    const { result } = renderHook(() => useForceUpdateGate(), {
      wrapper: wrapper("/?appVersion=0.9.0"),
    });

    expect(result.current.forced).toBe(false);
  });

  it("appVersion 쿼리가 없으면 forced=false", () => {
    stubNavigator(ANDROID_UA, 5);

    const { result } = renderHook(() => useForceUpdateGate(), {
      wrapper: wrapper("/"),
    });

    expect(result.current.forced).toBe(false);
  });

  it("onUpdate는 스토어 스킴 URL로 이동시킨다", () => {
    stubNavigator(ANDROID_UA, 5);
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" },
    });

    const { result } = renderHook(() => useForceUpdateGate(), {
      wrapper: wrapper("/?appVersion=0.9.0"),
    });
    result.current.onUpdate();

    expect(window.location.href).toBe("market://details?id=com.breathlessyouth.mobile");

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("첫 렌더의 appVersion을 고정한다 — 쿼리를 잃는 이동 뒤에도 forced가 유지된다", () => {
    stubNavigator(ANDROID_UA, 5);
    let forced: boolean | undefined;
    function Probe() {
      forced = useForceUpdateGate().forced;
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate("/terms")}>
          go
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={["/?appVersion=0.9.0"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(forced).toBe(true);

    // /terms에는 appVersion 쿼리가 없다. 매 렌더 URL을 읽었다면 여기서 forced가 false로 풀린다.
    fireEvent.click(screen.getByText("go"));
    expect(forced).toBe(true);
  });
});
