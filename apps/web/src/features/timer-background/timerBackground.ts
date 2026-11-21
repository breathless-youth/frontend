import type { SpaceItemTrack, SpaceKind } from "@/lib/amplitude";

import { clearWatcherAssets } from "./watcher/watcherAssets";

export type SpaceAssetType = "VIDEO" | "IMAGE";
export type SpaceVideoMode = "LOOP" | "WATCH";

/**
 * 서버 공간 선택 값
 *
 * 서버 답이 오기 전에도 기기 값만으로 그릴 수 있게 그리는 데 필요한 것을 모두 든다.
 * 상품 코드는 계측에만 쓰고 그리는 방법은 종류와 영상 방식으로 고른다.
 */
export type SpaceSelection = {
  kind: "space";
  itemId: number;
  code: string;
  assetKey: string;
  assetType: SpaceAssetType;
  videoMode: SpaceVideoMode | null;
};

/** 고른 타이머 배경 */
export type TimerBackgroundSelection =
  { kind: "simple" } | { kind: "photo"; photoId: string } | SpaceSelection;

export const SIMPLE_BACKGROUND: TimerBackgroundSelection = { kind: "simple" };

/** 심플 배경과 그 타일의 바탕색. 심플 모드 화면과 같은 색이다. */
export const SIMPLE_BACKGROUND_COLOR = "#0b0f14";

/** 사진은 이 개수까지 담는다. */
export const MAX_BACKGROUND_PHOTOS = 3;

/**
 * 서버 공간 정보를 선택 값으로 바꾸기
 *
 * 파일 위치가 없거나 앱이 그릴 수 없는 종류와 방식이면 null이다.
 * 서버가 새 종류나 방식을 먼저 더해도 옛 앱이 깨진 공간을 그리지 않게 한다.
 * 그림 공간은 영상 방식이 없어 null로 둔다.
 * 기기 저장값도 같은 검사를 거쳐 읽는다.
 */
export function toSpaceSelection(raw: {
  itemId?: unknown;
  code?: unknown;
  assetKey?: unknown;
  assetType?: unknown;
  videoMode?: unknown;
}): SpaceSelection | null {
  const { itemId, code, assetKey, assetType, videoMode } = raw;
  if (typeof itemId !== "number" || typeof code !== "string") return null;
  if (typeof assetKey !== "string" || assetKey === "") return null;
  if (assetType === "IMAGE") {
    return { kind: "space", itemId, code, assetKey, assetType, videoMode: null };
  }
  if (assetType === "VIDEO" && (videoMode === "LOOP" || videoMode === "WATCH")) {
    return { kind: "space", itemId, code, assetKey, assetType, videoMode };
  }
  return null;
}

/**
 * 세션에서 그릴 공간
 *
 * 내 사진은 이 기기에만 있어 기기 값을 따르고 나머지는 서버 값을 따른다.
 * server가 undefined면 서버 답을 받지 못한 것(응답 전, 실패, 비회원)이라 기기 값을 그대로 쓴다.
 * 판매를 멈춘 공간이어도 서버가 적용해 둔 값으로 주면 그대로 그린다.
 */
export function resolveSpace(
  local: TimerBackgroundSelection,
  server: SpaceSelection | null | undefined,
  photoExists: boolean,
): TimerBackgroundSelection {
  if (local.kind === "photo" && photoExists) return local;
  if (server === undefined) return local;
  return server ?? SIMPLE_BACKGROUND;
}

// 영상 탭을 닫았던 동안 남은 독서실 감독관 값이다.
// 어떤 상품인지 몰라 읽을 때 심플로 바꾼다.
type LegacySelection = { kind: "proctor" };

// 설정 화면과 세션 화면은 다른 웹뷰라 같은 주소끼리 공유되는 localStorage에 둔다.
const KEY = "focusmakers.timerBackground";

function parse(raw: string | null): TimerBackgroundSelection | LegacySelection {
  if (raw === null) return SIMPLE_BACKGROUND;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return SIMPLE_BACKGROUND;
    const fields = value as Record<string, unknown>;
    if (fields.kind === "proctor") return { kind: "proctor" };
    if (fields.kind === "photo" && typeof fields.photoId === "string" && fields.photoId !== "") {
      return { kind: "photo", photoId: fields.photoId };
    }
    if (fields.kind === "space") return toSpaceSelection(fields) ?? SIMPLE_BACKGROUND;
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
    const selection = parse(localStorage.getItem(KEY));
    if (selection.kind === "proctor") {
      // 다음에도 옛 값을 읽지 않게 저장값을 심플로 바꾸고 받아 둔 감시 파일도 지운다.
      writeTimerBackground(SIMPLE_BACKGROUND);
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
  try {
    localStorage.setItem(KEY, JSON.stringify(selection));
    return true;
  } catch {
    return false;
  }
}

/** 계측에 싣는 공간 종류와 서버 공간 정보 */
export function spaceTrack(selection: TimerBackgroundSelection): {
  kind: SpaceKind;
  item?: SpaceItemTrack;
} {
  return selection.kind === "space"
    ? { kind: "space", item: { itemCode: selection.code, videoMode: selection.videoMode } }
    : { kind: selection.kind };
}
