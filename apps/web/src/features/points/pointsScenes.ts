/**
 * 가짜 포인트 경계의 장면 이름
 *
 * 앱이 주소의 장면 이름을 읽을 때 고정 데이터를 함께 불러오지 않게 이름만 따로 둔다.
 */
export const POINTS_SCENES = [
  "default",
  "empty",
  "allCollected",
  "firstDay",
  "allDone",
  "noMedal",
  "adUnavailable",
  "payFail",
  "loadError",
  "newMascot",
] as const;

export type PointsScene = (typeof POINTS_SCENES)[number];
