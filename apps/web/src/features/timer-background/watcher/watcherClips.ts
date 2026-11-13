/** 감시자 영상 클립. 네 클립 모두 멈춰 선 자세의 시작·끝 프레임이 맞아 하드컷으로 이어 붙인다. */
export type WatcherClip = "enter" | "loop-a" | "loop-b" | "exit";

/**
 * 나가야 할 때 클립 끝을 기다리지 않고 바로 퇴장으로 넘어가도 되는 클립
 *
 * 루프 B는 퇴장 첫 장면과 같은 자세로 가만히 서 있어서 어디서 끊어도 이음매가 원래 클립 사이 이음매만큼 매끄럽다.
 * 루프 A는 시계를 보는 동작이라 중간에 끊으면 팔이 튀고, 등장은 다 들어와 서야 퇴장 자세와 맞는다.
 */
export function canLeaveMidClip(clip: WatcherClip): boolean {
  return clip === "loop-b";
}

/**
 * 지금 클립이 끝났을 때 이어 재생할 클립
 *
 * 재생 중인 클립은 끝까지 재생하고, 끝나는 순간의 비집중 여부로만 다음을 고른다.
 * 그래서 집중으로 돌아와도 클립 중간에 끊지 않고, 짧게 오가는 상태 변화에도 흔들리지 않는다.
 * null이면 빈 방으로 멈춘다.
 */
export function nextWatcherClip(ended: WatcherClip, present: boolean): WatcherClip | null {
  switch (ended) {
    case "enter":
      return present ? "loop-a" : "exit";
    case "loop-a":
      return present ? "loop-b" : "exit";
    case "loop-b":
      return present ? "loop-a" : "exit";
    case "exit":
      return present ? "enter" : null;
  }
}

/**
 * 감시자 소재 폴더. 폴더 이름은 소재 묶음 전체의 내용 해시라 소재를 바꾸면 주소도 바뀌어 1년 캐시를 걸 수 있다.
 *
 * 원본 HEVC는 Android 일부 기기가 못 풀어서 H.264로 바꿔 둔다.
 * `ffmpeg -i <원본> -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart <클립>/<기기>_<방향>.mp4`
 * 빈 방 포스터(`poster/`)는 enter 첫 프레임이다.
 * 발소리(`sound/`)는 소리를 입힌 등장·퇴장 원본에서 뽑는다. 네 화면 모두 소리가 같아 하나만 쓴다.
 * 멀 때는 잘 들리고 가까울 때는 덜 크게, 걸음마다 크기(50ms RMS 최댓값)를 맞춘 뒤 AAC 96k로 담았다.
 * - enter: 모두 -29dB, exit: -29 -29 -29 -29 -29 -30 -30dB (원본은 -34~-22dB)
 * - approach: 등장 첫 두 발을 번갈아 0.22초부터 6.82초까지 9번(0.825초 간격) -31에서 -29dB로 키워 놓고
 *   5kHz 저역 통과를 건 7초 소리. `WATCHER_APPROACH_LEAD_MS`와 길이가 같고, 등장 첫 발(0.62초)까지 0.8초 간격이 이어진다.
 */
export const WATCHER_ASSET_DIR = "/watcher/1d51e502";

/** 태블릿 영상을 쓰는 짧은 변 기준. 휴대폰은 가로로 돌려도 짧은 변이 500을 넘지 않는다. */
const TABLET_SHORT_SIDE_PX = 600;

type Viewport = { width: number; height: number };

/** 휴대폰·태블릿 구분. 돌려도 바뀌지 않는다. */
export function watcherDevice(viewport: Viewport): "phone" | "tablet" {
  return Math.min(viewport.width, viewport.height) >= TABLET_SHORT_SIDE_PX ? "tablet" : "phone";
}

/** 화면 크기에 맞는 클립 주소. 클립을 시작할 때마다 고르므로 회전하면 다음 클립부터 새 방향을 쓴다. */
export function watcherClipUrl(clip: WatcherClip, viewport: Viewport): string {
  const orientation = viewport.width > viewport.height ? "landscape" : "portrait";
  return `${WATCHER_ASSET_DIR}/${clip}/${watcherDevice(viewport)}_${orientation}.mp4`;
}
