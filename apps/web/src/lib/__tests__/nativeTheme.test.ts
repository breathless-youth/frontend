import { afterEach, expect, it } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { initNativeTheme } from "@/lib/nativeTheme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  window.history.replaceState(null, "", "/");
});

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

it("theme 쿼리가 있으면 data-theme을 설정한다", () => {
  window.history.replaceState(null, "", "/home?theme=dark");
  initNativeTheme();

  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("theme 쿼리가 없으면 건드리지 않는다 — iOS·브라우저는 미디어쿼리 경로 그대로다", () => {
  window.history.replaceState(null, "", "/home");
  initNativeTheme();

  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it("theme 쿼리가 계약 밖 값이면 무시한다", () => {
  window.history.replaceState(null, "", "/home?theme=sepia");
  initNativeTheme();

  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it("theme 메시지를 받으면 data-theme을 갱신한다", () => {
  window.history.replaceState(null, "", "/home?theme=light");
  initNativeTheme();

  nativeEntry()(JSON.stringify({ type: "theme", scheme: "dark", atMs: 1 }));

  expect(document.documentElement.dataset.theme).toBe("dark");
});
