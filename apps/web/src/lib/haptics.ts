/**
 * 짧은 햅틱 — 과목 시트의 임계 스냅·선택에 쓴다(시안 "임계 스냅 + 햅틱").
 *
 * 웹이라 Android WebView·Chrome의 `navigator.vibrate`만 된다. iOS WKWebView에는 API가 없어
 * 조용히 아무 일도 하지 않는다 — 네이티브 브리지 메시지를 만들면 여기서 함께 보낸다.
 */
export function vibrate(ms: number) {
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // 사용자 제스처 밖 호출 등은 브라우저가 거부한다 — 장식이라 무시한다.
    }
  }
}
