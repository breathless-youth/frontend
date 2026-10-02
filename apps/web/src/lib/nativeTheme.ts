import { subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브 셸이 실행 중에 알리는 테마 변경을 <html data-theme>에 반영한다.
 * main.tsx가 렌더 전에 부른다.
 *
 * 초기값은 index.html의 인라인 스크립트가 첫 페인트 전에 붙인다. 모듈 번들이 평가되는
 * 시점은 이미 첫 페인트 뒤라, 여기서 URL을 읽으면 라이트 화면이 한 프레임 보인다.
 *
 * Android WebView는 시스템 다크를 prefers-color-scheme에 전달하지 않아 미디어쿼리가 항상 light로 평가된다.
 * - 그래서 셸이 값을 알려 준다. 다크 스타일 자체는 index.css의 :root[data-theme="dark"] 블록이 담당한다.
 *
 * iOS와 브라우저 단독 모드에서는 메시지가 오지 않아 아무것도 하지 않는다.
 * - 기존 미디어쿼리 경로가 그대로 동작한다.
 */
export function initNativeTheme(): void {
  subscribeToNativeMessages((message) => {
    if (message.type === "theme") {
      document.documentElement.dataset.theme = message.scheme;
    }
  });
}
