import { useEffect } from "react";

/**
 * iOS WKWebView 자동재생 방어 — 동적으로 마운트된 `<video>`는 `autoplay` 속성만으로는
 * 재생이 시작되지 않은 채 남을 수 있다(WebKit이 autoplay를 페이지 로드 시점 요소에만
 * 평가하는 동작 + MediaStream 자동재생 회귀들, 예: WebKit #230922). 그 상태로는 타일이
 * 검게/빈 채 남고, 회전 같은 리레이아웃이 재생 재평가를 트리거해야 살아난다 — 3기기
 * 동시 입장 실기기에서 확인한 증상이다(2026-08-26: 본인+참가자 1명 영상이 안 보이다가
 * 가로 회전 시 복구).
 *
 * srcObject를 붙인 뒤 **매 렌더 호출해도 안전하다** — 이미 재생 중이면 무동작이고,
 * 정책 거부(저전력 모드 등)는 삼켜 다음 렌더에서 자연 재시도된다(세션 화면은 타이머
 * 틱으로 초 단위 재렌더가 있어 별도 재시도 타이머가 필요 없다).
 */
export function kickVideoPlayback(video: HTMLVideoElement): void {
  // falsy 검사인 이유: 실브라우저는 미할당 srcObject가 null이지만 jsdom은 srcObject를
  // 구현하지 않아 undefined다 — === null이면 스트림 없는 video를 테스트에서만 킥한다.
  if (!video.srcObject || !video.paused) {
    return;
  }
  // jsdom은 play()가 Promise를 돌려주지 않으므로 Promise일 때만 실패를 잡는다.
  const result: unknown = video.play();
  if (result instanceof Promise) {
    result.catch(() => undefined);
  }
}

/**
 * 저전력 모드 방어 — iOS 저전력 모드는 muted·playsinline이어도 스크립트 단독 play()를
 * 거부한다(NotAllowedError). 단 **사용자 제스처 핸들러 안에서 동기 호출한 play()는
 * 허용**되므로, 마운트 동안 화면의 모든 탭(click·pointerup)마다 멈춰 있는 video 전부에
 * 재생을 다시 건다. 룸은 입장·카메라 켜기·바 토글이 전부 탭이라 사용자가 조작하는 순간
 * 자연스럽게 복구된다 — 다만 화면을 한 번도 만지지 않으면 그때까지는 멈춰 있다는 한계는
 * 남는다(그 완전한 해결은 저전력 모드 감지 + 안내 UI가 필요해 별도 결정).
 *
 * kickVideoPlayback이 재생 중이면 무동작이라 정상 상태에서 이 리스너는 사실상 공짜다.
 */
export function useGestureVideoPlaybackKick(): void {
  useEffect(() => {
    const kickAll = () => {
      for (const video of document.querySelectorAll("video")) {
        kickVideoPlayback(video);
      }
    };
    // click은 사용자 활성화가 보장되는 대표 이벤트, pointerup은 룸 서피스의 바 토글처럼
    // click으로 승격되지 않을 수 있는 터치 조작을 함께 덮는다.
    document.addEventListener("click", kickAll);
    document.addEventListener("pointerup", kickAll);
    return () => {
      document.removeEventListener("click", kickAll);
      document.removeEventListener("pointerup", kickAll);
    };
  }, []);
}
