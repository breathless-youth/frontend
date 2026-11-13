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
 * 해시는 폴더 안 파일별 sha256 목록의 sha256 앞 8자다: `find . -type f | sort | xargs shasum -a 256 | shasum -a 256`.
 *
 * 원본(v2)은 HEVC에 소리가 든 mov라 Android 일부 기기가 못 풀어서 H.264로 바꾸고 소리를 뺀다. 해상도는 원본 그대로다.
 * `ffmpeg -i <원본> -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart <클립>/<기기>_<방향>.mp4`
 * 빈 방 포스터(`poster/`)는 원본과 함께 받은 빈 방 PNG(`00_empty_room`)를 JPEG 품질 2로 바꾼 것이다.
 * enter 첫 프레임·exit 마지막 프레임과 PSNR 46~48dB로 같은 장면이다.
 * 발소리(`sound/`)는 등장·퇴장 원본 소리에서 뽑는다. 네 화면 모두 소리가 같아 하나만 쓴다.
 * 걸음마다 크기(50ms RMS 최댓값)를 맞추고 첫 걸음 0.2초 앞까지는 원래 크기로 둔 뒤 AAC 96k로 담았다.
 * - enter: 0.10초부터 6걸음 모두 -26dB, exit: 2.95초부터 7걸음 -26dB, 마지막 둘은 -27dB (원본은 -40~-21dB)
 * - approach: 원본과 함께 받은 `footsteps_approach.wav`(9걸음, 0.7초 간격, -41에서 -23dB로 커짐)를 걸음마다
 *   -32에서 -26dB로 고르게 키우고 앞에 0.4초 무음을 넣은 7초 소리. `WATCHER_APPROACH_LEAD_MS`와 길이가 같고,
 *   마지막 걸음(6.40초)에서 등장 첫 발(0.10초)까지 같은 0.7초 간격이 이어진다. 마지막 걸음을 등장 발소리 크기에 맞춰
 *   들어오는 순간 소리가 작아지지 않게 하고, 먼 걸음도 폰 스피커로 들리게 했다.
 * 이음매는 클립 끝과 다음 클립 첫 프레임의 PSNR이 모두 40dB 이상이고, 루프 B 중간과 퇴장 첫 프레임도 31~43dB라
 * 루프 B에서 바로 퇴장해도 튀지 않는다.
 */
export const WATCHER_ASSET_DIR = "/watcher/9c8d9f19";

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
