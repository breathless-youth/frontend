import { formatDuration } from "./recordsFormat";

/**
 * 지난 기간 대비 순공 증감 문구 — 기록 탭 월간·주간 헤더 공용
 *
 * 증가는 초록·▲, 감소는 빨강·▼만 표시한다. 증감이 0이면 문구를 아예 그리지 않는다
 * (`null` 반환) — "같아요" 문구는 걷어냈고, 렌더해도 빈 공간이 생기지 않는다.
 * `delta`는 `focusDeltaSec`의 초 단위 값(양수면 늘었다).
 * `unit`으로 "지난주"/"지난달"을 가른다.
 */
export function FocusDeltaLabel({ delta, unit }: { delta: number; unit: "주" | "달" }) {
  if (delta === 0) {
    return null;
  }

  const className =
    delta > 0
      ? "text-[13px] leading-4 font-bold text-feedback-success"
      : "text-[13px] leading-4 font-bold text-feedback-danger";

  return (
    <p className={className}>
      {delta > 0
        ? `▲ 지난${unit}보다 ${formatDuration(delta)} 늘었어요`
        : `▼ 지난${unit}보다 ${formatDuration(-delta)} 줄었어요`}
    </p>
  );
}
