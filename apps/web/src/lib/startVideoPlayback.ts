/**
 * 세션 영상 재생을 자동재생 정책에 맡기지 않고 직접 시작한다.
 *
 * iOS 저전력 모드에서는 autoplay 속성이 무시되어 영상이 재생 대기 상태로 남고,
 * 그 위에 네이티브 재생/일시정지 컨트롤이 뜬다. srcObject를 붙인 직후 play()를
 * 호출하면 그 대기 상태를 거치지 않는다. 실패는 삼킨다 — 정책이 거부해도 화면은
 * 계속 살아야 하고, 여기서 던지면 srcObject를 붙인 effect가 함께 죽는다.
 */
export function startVideoPlayback(video: HTMLVideoElement): void {
  try {
    const played: Promise<void> | undefined = video.play();
    void played?.catch(() => undefined);
  } catch {
    // play 미구현 환경(jsdom 등)이나 동기 예외 — 재생 실패는 치명적이지 않다
  }
}

/**
 * 재생이 멈추는 신호마다 다시 거는 이벤트 핸들러 묶음 — 세션 `<video>`에 스프레드로 단다.
 *
 * 이 묶음을 다는 영상에는 `autoPlay` 속성을 달지 않는다 — iOS 저전력 모드는 autoplay
 * 속성이 달린 영상 위에 숨길 수 없는 네이티브 재생 컨트롤을 강제로 띄운다
 * (WebKit 219889, Won't Fix). 재생 시작은 아래 핸들러와 srcObject 부착 시의
 * `startVideoPlayback` 호출이 전담한다.
 *
 * srcObject 부착 직후의 첫 play()만으로는 부족하다 — iOS 저전력 모드가 그 호출을 거부하거나
 * 재생을 중간에 세우면 영상이 대기 상태로 남고 그 위에 네이티브 재생 컨트롤이 뜬다.
 * 이 앱의 세션 영상은 코드가 pause()를 부르는 곳이 없으므로
 * 멈춤 신호는 전부 "의도치 않은 정지"이고, 무조건 재개해도 안전하다.
 * 스트림이 없는 video는 걸지 않는다 — 재생할 것이 없는 재시도 루프를 만들지 않는다.
 */
export const VIDEO_PLAYBACK_KICK_PROPS = {
  onLoadedMetadata: restartVideoPlayback,
  onSuspend: restartVideoPlayback,
  onPause: restartVideoPlayback,
} as const;

function restartVideoPlayback(event: { currentTarget: HTMLVideoElement }): void {
  const video = event.currentTarget;
  if (video.srcObject !== null && video.srcObject !== undefined) {
    startVideoPlayback(video);
  }
}
