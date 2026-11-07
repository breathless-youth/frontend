import { cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  __resetAuthSuccessToastForTests,
  notifyLoginSuccess,
  useAuthSuccessToast,
} from "@/lib/authSuccessToast";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import i18n from "@/lib/i18n";
import { useNativeAnalyticsRelay } from "@/lib/nativeAnalytics";
import { showToast } from "@/lib/toast";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
// 분석 SDK를 쓰지 않아도 완료 안내는 브리지 메시지만으로 동작한다.
vi.mock("@/lib/amplitude", () => ({ trackNativeShellEvent: vi.fn() }));
vi.mock("@/lib/installAttribution", () => ({
  flushInstallAttribution: vi.fn(async () => {}),
  handleInstallAttribution: vi.fn(),
}));

let atMs = 0;
function emit(message: Record<string, unknown>) {
  const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receive?.(JSON.stringify({ atMs: ++atMs, ...message }));
}

beforeEach(() => {
  __resetAuthSuccessToastForTests();
});
afterEach(async () => {
  cleanup();
  __resetAuthSuccessToastForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  await i18n.changeLanguage("ko");
});

it.each([
  ["logout_completed", "로그아웃 되었어요"],
  ["account_deleted", "계정이 삭제되었어요"],
])("%s는 새 문서의 ready 직후 큐가 비워져도 한 번만 보인다", (name, text) => {
  const event = { type: "track-event", name, atMs: ++atMs };
  vi.stubGlobal("ReactNativeWebView", {
    postMessage: vi.fn((raw: string) => {
      if (JSON.parse(raw).type === "analytics-ready") emit(event);
    }),
  });
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  renderHook(
    () => {
      useAuthSuccessToast();
      useNativeAnalyticsRelay();
    },
    { wrapper },
  );
  emit(event);
  expect(showToast).toHaveBeenCalledExactlyOnceWith(text, { persistOnNavigation: true });
});

it("원래 요청 응답과 실패·취소·다른 분석 이벤트는 완료 토스트가 아니다", () => {
  renderHook(() => useAuthSuccessToast());
  emit({ type: "logout-result", id: "logout" });
  for (const status of ["success", "cancelled", "failed"]) {
    emit({ type: "delete-account-result", id: "delete", status, code: "NETWORK" });
  }
  emit({ type: "track-event", name: "account_deletion_failed" });
  emit({ type: "track-event", name: "tab_pressed" });
  expect(showToast).not.toHaveBeenCalled();
});

it("그룹 로그인 성공은 현재 문서에서 한 번 알린다", () => {
  notifyLoginSuccess();
  expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
    persistOnNavigation: true,
  });
});

it("설정 로그인 성공은 저장소와 다른 웹뷰 전달 없이 현재 설정에 보인다", () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  renderHook(() => useAuthSuccessToast());
  notifyLoginSuccess();
  expect(showToast).toHaveBeenCalledExactlyOnceWith("로그인을 성공했어요!", {
    persistOnNavigation: true,
  });
  expect(write).not.toHaveBeenCalled();
});

it.each([
  ["en", "Signed in successfully!", "You’ve been signed out", "Your account has been deleted"],
  ["ja", "ログインしました！", "ログアウトしました", "アカウントを削除しました"],
  ["zh-Hant", "登入成功！", "已登出", "帳號已刪除"],
])("%s 성공 안내는 현재 언어를 따른다", async (locale, login, logout, deleted) => {
  await i18n.changeLanguage(locale);
  renderHook(() => useAuthSuccessToast());
  notifyLoginSuccess();
  emit({ type: "track-event", name: "logout_completed" });
  emit({ type: "track-event", name: "account_deleted" });
  expect(vi.mocked(showToast).mock.calls.map(([text]) => text)).toEqual([login, logout, deleted]);
});
