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

it("theme 메시지를 받으면 data-theme을 갱신한다", () => {
  initNativeTheme();

  nativeEntry()(JSON.stringify({ type: "theme", scheme: "dark", atMs: 1 }));

  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("URL의 theme 쿼리는 읽지 않는다", () => {
  window.history.replaceState(null, "", "/home?theme=dark");

  initNativeTheme();

  expect(document.documentElement.dataset.theme).toBeUndefined();
});
