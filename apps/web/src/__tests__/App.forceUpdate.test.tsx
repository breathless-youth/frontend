import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { FORCE_UPDATE_CONFIRM_LABEL, FORCE_UPDATE_TITLE } from "@/features/force-update/copy";
import { MIN_SUPPORTED_VERSION } from "@/features/force-update/version";
import type * as AmplitudeModule from "@/lib/amplitude";

/** 강제 업데이트 계측(BY-616)의 관찰점 — 나머지 amplitude 함수는 원본(미초기화 no-op)이다. */
const analytics = vi.hoisted(() => ({
  trackForceUpdatePrompted: vi.fn(),
  trackForceUpdateStoreOpened: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof AmplitudeModule>()),
  trackForceUpdatePrompted: analytics.trackForceUpdatePrompted,
  trackForceUpdateStoreOpened: analytics.trackForceUpdateStoreOpened,
}));

/** 스토어 이동은 실제 내비게이션이라 jsdom에서 막는다 — 계측 호출만 본다. */
vi.mock("@/features/force-update/store", () => ({ openAppStore: vi.fn() }));

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36";
/** 라우트가 실제로 마운트됐는지 확인하는 표식 — HomePage의 h1 텍스트. */
const HOME_TEXT = "FocusMakers";

/**
 * `tabPages.test.tsx`와 같은 이유로 fetch를 스텁한다 — `App` 전체 렌더는 홈 탭 쿼리가
 * 실 네트워크를 태운다. 강제 업데이트 gate가 스토어 플랫폼 판정을 타므로(BY-537 리뷰 반영)
 * navigator도 스토어가 있는 UA로 스텁한다.
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
  );
  vi.stubGlobal("navigator", { userAgent: ANDROID_UA, maxTouchPoints: 5 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  analytics.trackForceUpdatePrompted.mockClear();
  analytics.trackForceUpdateStoreOpened.mockClear();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App 강제 업데이트 게이트(BY-537)", () => {
  it("appVersion이 최소 버전 미만이면 강제 업데이트 모달만 뜨고 라우트는 마운트하지 않는다", () => {
    renderAt("/?appVersion=0.9.0");

    expect(screen.getByText(FORCE_UPDATE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(HOME_TEXT)).not.toBeInTheDocument();
  });

  it("appVersion 쿼리가 없으면(브라우저 단독 접속) 모달 없이 라우트가 렌더된다", () => {
    renderAt("/");

    expect(screen.queryByText(FORCE_UPDATE_TITLE)).not.toBeInTheDocument();
    expect(screen.getByText(HOME_TEXT)).toBeInTheDocument();
  });

  it("appVersion이 최소 버전 이상이면 모달 없이 라우트가 렌더된다", () => {
    renderAt("/?appVersion=1.0.1");

    expect(screen.queryByText(FORCE_UPDATE_TITLE)).not.toBeInTheDocument();
    expect(screen.getByText(HOME_TEXT)).toBeInTheDocument();
  });
});

describe("App 강제 업데이트 게이트 — 계측 (BY-616 최종 검토)", () => {
  it("모달 노출을 문서당 한 번 남기고, 스토어 이동 버튼은 클릭마다 남긴다", () => {
    renderAt("/?appVersion=0.9.0");

    expect(analytics.trackForceUpdatePrompted.mock.calls).toEqual([
      [{ appVersion: "0.9.0", minVersion: MIN_SUPPORTED_VERSION }],
    ]);

    fireEvent.click(screen.getByRole("button", { name: FORCE_UPDATE_CONFIRM_LABEL }));

    expect(analytics.trackForceUpdateStoreOpened).toHaveBeenCalledTimes(1);
    expect(analytics.trackForceUpdatePrompted).toHaveBeenCalledTimes(1);
  });

  it("막히지 않으면 노출 이벤트가 없다", () => {
    renderAt("/?appVersion=1.0.1");

    expect(analytics.trackForceUpdatePrompted).not.toHaveBeenCalled();
  });
});
