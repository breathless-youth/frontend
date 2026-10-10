import type { VideoResultStatus } from "@focusmakers/types";

import { trackOsSettingsOpened, trackTimelapseShareTapped } from "@/lib/amplitude";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import {
  canUseNativeVideo,
  saveVideoNatively,
  shareVideoNatively,
  timelapseShareText,
} from "@/lib/nativeVideo";

import type { TimelapseAspect } from "./timelapseSettings";

export type ShareTapped = Parameters<typeof trackTimelapseShareTapped>[0];

const MP4 = "video/mp4";

/** 다운로드가 시작되기 전에 주소가 사라지지 않을 만큼 기다렸다 푼다. */
const REVOKE_DELAY_MS = 60_000;

/** 시안의 영상 폭 */
const SHARE_VIDEO_WIDTH: Record<TimelapseAspect, number> = { "9:16": 296, "16:9": 312 };

/** 저장·공유를 맡길 곳 */
export type ShareRoute = "native" | "browser";

export interface ShareRoutes {
  /** null이면 저장하기 버튼을 숨긴다. */
  readonly save: ShareRoute | null;
  /** null이면 인스타그램·카카오톡·더 보기 버튼을 숨긴다. */
  readonly share: ShareRoute | null;
}

export interface ShareNotice {
  readonly text: string;
  /** 설정 열기 글자 버튼을 함께 둔다. */
  readonly openSettings?: boolean;
}

/**
 * 이 환경에서 저장과 공유를 보낼 곳
 *
 * 영상이 나오기 전에 빈 mp4 파일로 공유 가능 여부를 물어 버튼이 나타났다 사라지지 않게 한다.
 * 브리지만 있고 영상 메시지를 모르는 구 버전 앱은 웹뷰가 다운로드를 처리하지 않아 저장을 숨긴다.
 */
export function shareRoutes(): ShareRoutes {
  if (canUseNativeVideo()) {
    return { save: "native", share: "native" };
  }
  return {
    save: isNativeBridgeAvailable() ? null : "browser",
    share: canShareVideoFile() ? "browser" : null,
  };
}

function canShareVideoFile(): boolean {
  try {
    const probe = new File([], "timelapse.mp4", { type: MP4 });
    return navigator.canShare?.({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

/** 공부를 시작한 날짜로 짓는 영상 파일 이름 */
export function timelapseFileName(startedAtMs: number): string {
  const date = new Date(startedAtMs);
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  return `focusmakers-timelapse-${day}.mp4`;
}

export function saveTimelapse(
  route: ShareRoute,
  video: Blob,
  startedAtMs: number,
): Promise<VideoResultStatus> {
  if (route === "native") {
    return saveVideoNatively(video);
  }
  downloadVideo(video, timelapseFileName(startedAtMs));
  return Promise.resolve("saved");
}

/**
 * 영상 공유
 *
 * 브라우저 공유 창은 누른 직후에만 열리므로 navigator.share 앞에서 기다리지 않는다.
 * 사용자가 공유 창을 닫으면 AbortError가 온다.
 */
export async function shareTimelapse(
  route: ShareRoute,
  video: Blob,
  startedAtMs: number,
): Promise<VideoResultStatus> {
  if (route === "native") {
    return shareVideoNatively(video);
  }
  const file = new File([video], timelapseFileName(startedAtMs), { type: MP4 });
  try {
    await navigator.share({ files: [file], text: timelapseShareText(window.location.origin) });
    return "shared";
  } catch (error) {
    return (error as Error | null)?.name === "AbortError" ? "dismissed" : "failed";
  }
}

/**
 * 저장·공유를 보내고 결과를 기록
 *
 * 결과 대신 오류가 와도 실패로 돌려주고 실패로 기록한다.
 * 브라우저 공유 창은 누른 직후에만 열리므로 보내기 앞에서 기다리지 않는다.
 */
export async function sendTimelapse({
  button,
  route,
  video,
  startedAtMs,
  entry,
}: {
  button: ShareTapped["button"];
  route: ShareRoute;
  video: Blob;
  startedAtMs: number;
  entry: ShareTapped["entry"];
}): Promise<VideoResultStatus> {
  const send = button === "save" ? saveTimelapse : shareTimelapse;
  let result: VideoResultStatus = "failed";
  try {
    result = await send(route, video, startedAtMs);
  } catch {
    // 위의 실패 기본값을 그대로 쓴다.
  }
  trackTimelapseShareTapped({ button, result, entry });
  return result;
}

/**
 * 브라우저 다운로드
 *
 * 링크를 문서에 붙이지 않아 클릭 자동 수집에 blob 주소가 실리지 않는다.
 */
function downloadVideo(video: Blob, fileName: string): void {
  const url = URL.createObjectURL(video);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/**
 * 저장·공유 결과 안내
 *
 * 공유했거나 공유 창을 닫았으면 사용자가 결과를 이미 봤으므로 알리지 않는다.
 * 브라우저 다운로드가 시작되면 브라우저가 다운로드 표시를 띄워 따로 알리지 않는다.
 */
export function shareResultNotice(
  action: "save" | "share",
  route: ShareRoute,
  result: VideoResultStatus,
): ShareNotice | null {
  if (action === "share") {
    return result === "shared" || result === "dismissed"
      ? null
      : { text: "공유하지 못했어요. 다시 시도해 주세요" };
  }
  if (route === "browser" && result === "saved") {
    return null;
  }
  switch (result) {
    case "saved":
      return { text: "사진 앱에 저장했어요" };
    case "denied":
      return { text: "사진 접근 권한이 꺼져 있어요", openSettings: true };
    case "failed":
      return { text: "저장하지 못했어요. 다시 시도해 주세요" };
    default:
      return null;
  }
}

/** 사진 접근 권한 안내의 설정 열기 */
export function openTimelapseSettings(): void {
  trackOsSettingsOpened("timelapse_share");
  postToNative({ type: "open-settings", atMs: Date.now() });
}

/**
 * 공유 다이얼로그 영상 폭
 *
 * 카드가 시트 위에 남은 자리를 넘지 않도록 비율을 지키며 줄인다.
 * 높이는 캔버스 고유 비율이 폭에서 정하므로 폭만 계산한다.
 * chrome은 카드 안에서 영상 말고 차지하는 가로·세로 길이다.
 */
export function shareVideoWidth(
  aspect: TimelapseAspect,
  space: { width: number; height: number },
  chrome: { x: number; y: number },
): number {
  const ratio = aspect === "9:16" ? 9 / 16 : 16 / 9;
  const fit = Math.min(
    SHARE_VIDEO_WIDTH[aspect],
    space.width - chrome.x,
    (space.height - chrome.y) * ratio,
  );
  return Math.max(0, Math.floor(fit));
}
