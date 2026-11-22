import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { AppState, type AppStateStatus, Platform } from "react-native";

import type { LiveActivitySnapshot } from "@focusmakers/types";

import {
  buildLiveActivityTexts,
  deriveActivity,
  type StudySessionActivityProps,
} from "./liveActivityModel";

/**
 * 잠금화면 공부 표시 컨트롤러
 *
 * 웹은 앱 밖에서 멈추므로 앱 밖 전환은 웹 메시지를 기다리지 않고 여기서 AppState로 처리한다.
 * 웹이 끝내라는 메시지를 보내기 전에 웹뷰가 사라질 수 있어 세션 화면이 닫힐 때도 끝낸다.
 */

type Activity = {
  update(props: StudySessionActivityProps, staleDate?: Date): Promise<void>;
  end(dismissalPolicy?: "default" | "immediate"): Promise<void>;
};
type Factory = {
  start(props: StudySessionActivityProps, url?: string, staleDate?: Date): Activity;
  getInstances(): Activity[];
};

const ICON_FILE_NAME = "live-activity-icon.png";

let activity: Activity | null = null;
let last: { snapshot: LiveActivitySnapshot; atMs: number } | null = null;
let backgroundSinceMs: number | null = null;
let appStateSub: { remove(): void } | null = null;
let iconUri: string | null = null;
let iconRequested = false;

// 네이티브 모듈이 없는 jest, Android, 이전 Dev Client에서는 불러오는 순간 throw하므로 쓸 때만 require한다.
function loadFactory(): Factory | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 조건부로 동기 로드하는 방법이 require뿐이다.
    return (require("../widgets/StudySessionActivity") as { default: Factory }).default;
  } catch {
    return null;
  }
}

/**
 * 이 바이너리가 잠금화면 공부 표시를 그릴 수 있는지
 *
 * 웹뷰 주소의 liveActivity 표시가 이 답을 따르고, 웹은 표시가 있을 때만 세션 상태를 보낸다.
 */
export function isLiveActivitySupported(): boolean {
  return loadFactory() !== null;
}

/**
 * 위젯이 읽을 수 있는 곳에 둔 앱 아이콘 주소
 *
 * 위젯 확장은 앱 번들을 읽지 못해 App Group 공유 폴더에 한 번 복사해 둔다.
 * 복사는 비동기라 첫 표시는 아이콘 없이 그리고, 복사가 끝나면 다시 그린다.
 */
function getIconUri(): string | null {
  if (!iconRequested) {
    iconRequested = true;
    copyIcon().then(
      (uri) => {
        iconUri = uri;
        if (uri !== null) render();
      },
      (error: unknown) => {
        console.warn("[live-activity] 아이콘 복사 실패", error);
      },
    );
  }
  return iconUri;
}

async function copyIcon(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 위젯 모듈이 있는 것을 확인한 뒤에만 불러온다.
  const { widgetsDirectory } = require("expo-widgets") as { widgetsDirectory: string | null };
  if (!widgetsDirectory) return null;
  const target = new File(widgetsDirectory, ICON_FILE_NAME);
  if (!target.exists) {
    const [asset] = await Asset.loadAsync(require("../assets/live-activity-icon.png") as number);
    await new File(asset.localUri ?? asset.uri).copy(target);
  }
  return target.uri;
}

function render(): void {
  if (last === null) return;
  const factory = loadFactory();
  if (factory === null) return;
  const { props, staleDate } = deriveActivity({
    snapshot: last.snapshot,
    atMs: last.atMs,
    backgroundSinceMs,
    texts: buildLiveActivityTexts(),
    iconUri: getIconUri(),
  });
  if (activity === null) {
    // 사용자가 실시간 현황을 끈 기기도 여기서 실패한다. 공부 기록과는 상관없어 경고만 남긴다.
    try {
      activity = factory.start(props, undefined, staleDate);
    } catch (error) {
      console.warn("[live-activity] 시작 실패", error);
    }
    return;
  }
  activity.update(props, staleDate).catch((error: unknown) => {
    console.warn("[live-activity] 갱신 실패", error);
  });
}

function onAppStateChange(state: AppStateStatus): void {
  if (state === "background") {
    if (backgroundSinceMs !== null) return;
    backgroundSinceMs = Date.now();
    render();
  } else if (state === "active") {
    if (backgroundSinceMs === null) return;
    backgroundSinceMs = null;
    render();
  }
}

/**
 * 웹이 보낸 세션 스냅샷 반영
 *
 * null이면 표시를 끝낸다.
 */
export function applyLiveActivitySnapshot(
  session: LiveActivitySnapshot | null,
  atMs: number,
): void {
  if (session === null) {
    endLiveActivity();
    return;
  }
  // 멈춘 상태에서 과목만 바뀌어 다시 온 스냅샷은 시각이 늦어도 처음 멈춘 시각부터 20분을 세야 해서 직전 시각을 둔다.
  const stoppedAtMs =
    last !== null && session.state !== "running" && session.state === last.snapshot.state
      ? last.atMs
      : atMs;
  last = { snapshot: session, atMs: stoppedAtMs };
  appStateSub ??= AppState.addEventListener("change", onAppStateChange);
  render();
}

export function endLiveActivity(): void {
  appStateSub?.remove();
  appStateSub = null;
  last = null;
  backgroundSinceMs = null;
  const ending = activity;
  activity = null;
  ending?.end("immediate").catch((error: unknown) => {
    console.warn("[live-activity] 종료 실패", error);
  });
}

/**
 * 앱이 꺼진 사이 남은 표시 정리
 *
 * 이어 갈 세션이 없는 표시가 OS가 걷을 때까지 몇 시간 남으므로 실행할 때 모두 끝낸다.
 */
export function endLeftoverLiveActivities(): void {
  const factory = loadFactory();
  if (factory === null) return;
  try {
    for (const leftover of factory.getInstances()) {
      leftover.end("immediate").catch((error: unknown) => {
        console.warn("[live-activity] 남은 표시 종료 실패", error);
      });
    }
  } catch (error) {
    console.warn("[live-activity] 남은 표시 조회 실패", error);
  }
}

/**
 * 테스트용 상태 초기화
 *
 * 아이콘 복사는 실행마다 한 번만 하므로 테스트마다 다시 하도록 비운다.
 */
export function __resetLiveActivityForTests(): void {
  endLiveActivity();
  iconUri = null;
  iconRequested = false;
}
