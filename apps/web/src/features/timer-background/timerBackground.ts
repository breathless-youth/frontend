/** 고른 타이머 배경. 감시·자연 배경은 아직 출시 전이라 고를 수 없어 심플과 내 사진만 둔다. */
export type TimerBackgroundSelection = { kind: "simple" } | { kind: "photo"; photoId: string };

export const SIMPLE_BACKGROUND: TimerBackgroundSelection = { kind: "simple" };

/** 심플 배경과 그 타일의 바탕색. 심플 모드 화면과 같은 색이다. */
export const SIMPLE_BACKGROUND_COLOR = "#0b0f14";

/** 사진은 이 개수까지 담는다. */
export const MAX_BACKGROUND_PHOTOS = 10;

/** 아직 출시 전인 배경. 시안의 색 그라데이션을 타일 자리 표시로 쓴다. */
export interface UpcomingBackground {
  id: string;
  nameKey: "proctor" | "watchingCat" | "studyMate" | "foggyForest" | "sunsetField" | "snowyPeak";
  gradient: string;
}

export const WATCH_BACKGROUNDS: readonly UpcomingBackground[] = [
  {
    id: "w-proctor",
    nameKey: "proctor",
    gradient: "linear-gradient(180deg,#2a2f3a 0%,#5b6270 50%,#c9b79c 100%)",
  },
  {
    id: "w-cat",
    nameKey: "watchingCat",
    gradient: "linear-gradient(180deg,#3d3630 0%,#8a7560 55%,#e3d2bd 100%)",
  },
  {
    id: "w-mate",
    nameKey: "studyMate",
    gradient: "linear-gradient(180deg,#263238 0%,#4f6d7a 50%,#dfe7ea 100%)",
  },
];

export const NATURE_BACKGROUNDS: readonly UpcomingBackground[] = [
  {
    id: "forest",
    nameKey: "foggyForest",
    gradient: "linear-gradient(180deg,#a9bfb0 0%,#6f8f7e 40%,#3a574a 72%,#1f2f2a 100%)",
  },
  {
    id: "field",
    nameKey: "sunsetField",
    gradient: "linear-gradient(180deg,#3b2a4d 0%,#9a4a6a 40%,#d9705f 70%,#f3b27a 100%)",
  },
  {
    id: "snow",
    nameKey: "snowyPeak",
    gradient: "linear-gradient(180deg,#30415d 0%,#6f88a8 45%,#c9d6e4 80%,#eef3f8 100%)",
  },
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
