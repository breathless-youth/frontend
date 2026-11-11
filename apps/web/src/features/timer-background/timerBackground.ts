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

/**
 * 고른 타이머 배경 읽기
 *
 * 프라이버시 모드처럼 저장소 접근이 막히거나 값이 깨졌으면 심플로 본다.
 */
export function readTimerBackground(): TimerBackgroundSelection {
  try {
    return parse(localStorage.getItem(KEY));
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
  try {
    localStorage.setItem(KEY, JSON.stringify(selection));
    return true;
  } catch {
    return false;
  }
}
