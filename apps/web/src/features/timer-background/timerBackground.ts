import { useSyncExternalStore } from "react";

import { spaceKey } from "./spaceCatalog";
import { VIDEO_SPACES_OPEN } from "./videoSpaces";
import { clearWatcherAssets } from "./watcher/watcherAssets";
import { WATCHER_ASSET_DIR } from "./watcher/watcherClips";

/** 고른 타이머 배경. 감시 배경은 독서실 감독관만 나와 있고, 나머지 감시·자연 배경은 아직 고를 수 없다. */
export type TimerBackgroundSelection =
  { kind: "simple" } | { kind: "proctor" } | { kind: "photo"; photoId: string };

export const SIMPLE_BACKGROUND: TimerBackgroundSelection = { kind: "simple" };

/** 심플 배경과 그 타일의 바탕색. 심플 모드 화면과 같은 색이다. */
export const SIMPLE_BACKGROUND_COLOR = "#0b0f14";

/** 사진은 이 개수까지 담는다. */
export const MAX_BACKGROUND_PHOTOS = 3;

/** 아직 출시 전인 배경. 타일에는 `public/images/timer-background/{nameKey}.jpg` 장면을 흐리게 보인다. 이미지 모델로 만든 그림이다. */
export interface UpcomingBackground {
  id: string;
  nameKey: "libraryCapybara" | "peepholeDog" | "grass" | "mountain" | "rain";
}

export const PROCTOR_BACKGROUND: TimerBackgroundSelection = { kind: "proctor" };

/** 감독관 타일 그림. 감독관이 들어오기 전 빈 방이다. */
export const PROCTOR_TILE_URL = `${WATCHER_ASSET_DIR}/poster/phone_portrait.jpg`;

/** 감독관 말고 아직 출시 전인 감시 배경 */
export const WATCH_BACKGROUNDS: readonly UpcomingBackground[] = [
  { id: "w-capybara", nameKey: "libraryCapybara" },
  { id: "w-dog", nameKey: "peepholeDog" },
];

export const NATURE_BACKGROUNDS: readonly UpcomingBackground[] = [
  { id: "grass", nameKey: "grass" },
  { id: "mountain", nameKey: "mountain" },
  { id: "rain", nameKey: "rain" },
];

// 설정 화면과 세션 화면은 다른 웹뷰라 같은 주소끼리 공유되는 localStorage에 둔다.
const KEY = "focusmakers.timerBackground";

function parse(raw: string | null): TimerBackgroundSelection {
  if (raw === null) return SIMPLE_BACKGROUND;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === "proctor"
    ) {
      return PROCTOR_BACKGROUND;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === "photo" &&
      "photoId" in value &&
      typeof value.photoId === "string" &&
      value.photoId !== ""
    ) {
      return { kind: "photo", photoId: value.photoId };
    }
  } catch {
    // 깨진 값은 아래 기본값으로 돌린다.
  }
  return SIMPLE_BACKGROUND;
}

const CHANGE_EVENT = "timer-background-change";

function store(selection: TimerBackgroundSelection): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(selection));
    return true;
  } catch {
    return false;
  }
}

/**
 * 고른 타이머 배경 읽기
 *
 * 프라이버시 모드처럼 저장소 접근이 막히거나 값이 깨졌으면 심플로 본다.
 */
export function readTimerBackground(): TimerBackgroundSelection {
  try {
    const selection = parse(localStorage.getItem(KEY));
    if (selection.kind === "proctor" && !VIDEO_SPACES_OPEN) {
      // 감독관을 고른 채 남은 사용자가 다음에도 영상을 받지 않게 저장값을 심플로 바꾸고 받아 둔 소재도 지운다.
      // 구독 스냅샷을 읽는 렌더 중에도 불리므로 여기서는 변경 알림을 보내지 않는다.
      store(SIMPLE_BACKGROUND);
      void clearWatcherAssets();
      return SIMPLE_BACKGROUND;
    }
    return selection;
  } catch {
    return SIMPLE_BACKGROUND;
  }
}

/**
 * 고른 타이머 배경 저장
 *
 * 저장소가 막혀 저장하지 못하면 false다. 호출부는 적용됐다고 알리지 않는다.
 */
export function writeTimerBackground(selection: TimerBackgroundSelection): boolean {
  if (!store(selection)) return false;
  // 같은 탭은 storage 이벤트를 받지 못해 구독자에게 따로 알린다.
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

let snapshot: TimerBackgroundSelection = SIMPLE_BACKGROUND;

// 읽을 때마다 새 객체라 같은 값이면 앞 객체를 돌려줘야 구독자가 끝없이 다시 그리지 않는다.
function readSnapshot(): TimerBackgroundSelection {
  const next = readTimerBackground();
  if (spaceKey(next) !== spaceKey(snapshot)) snapshot = next;
  return snapshot;
}

function subscribe(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

/**
 * 고른 타이머 배경 구독
 *
 * PC 홈은 월페이퍼와 공간 플라이아웃이 같은 값을 보며, 다른 탭에서 바꿔도 바로 따라간다.
 * 세션 화면은 열 때 한 번 읽은 값을 원본으로 쓰므로 이 구독을 쓰지 않는다.
 */
export function useTimerBackground(): TimerBackgroundSelection {
  return useSyncExternalStore(subscribe, readSnapshot, () => SIMPLE_BACKGROUND);
}
