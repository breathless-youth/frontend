import { subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브 셸이 전달하는 테마를 `<html data-theme>`에 반영한다 — `main.tsx`가 렌더 전에 부른다.
 *
 * Android WebView는 시스템 다크를 `prefers-color-scheme`에 전달하지 않아 미디어쿼리가 항상
 * light로 평가된다. 그래서 초기 테마는 셸이 URL `theme` 쿼리로 싣고(첫 페인트 전에 반영해
 * 라이트 화면이 잠깐 보이는 깜빡임을 막는다), 앱 실행 중 변경은 `theme` 브리지 메시지로
 * 온다. 다크 스타일 자체는 `index.css`의 `:root[data-theme="dark"]` 블록이 담당한다.
 *
 * iOS·브라우저 단독 모드에서는 쿼리도 메시지도 없어 아무것도 하지 않는다 — 기존 미디어쿼리
 * 경로가 그대로 동작한다.
 */
export function initNativeTheme(): void {
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  }
  subscribeToNativeMessages((message) => {
    if (message.type === "theme") {
      document.documentElement.dataset.theme = message.scheme;
    }
  });
}
