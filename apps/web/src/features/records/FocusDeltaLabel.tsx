import { formatDuration } from "./recordsFormat";

/**
 * 지난 기간 대비 순공 증감 문구 — 기록 탭 월간·주간 헤더 공용
 *
 * 증가는 초록·▲, 감소는 빨강·▼, 동일은 회색으로 통일한다.
 * `delta`는 `focusDeltaSec`의 초 단위 값(양수면 늘었다).
 * `unit`으로 "지난주"/"지난달"을 가른다.
 */
export function FocusDeltaLabel({ delta, unit }: { delta: number; unit: "주" | "달" }) {
  const className =
    delta > 0
      ? "text-[13px] leading-4 font-bold text-feedback-success"
      : delta < 0
        ? "text-[13px] leading-4 font-bold text-feedback-danger"
        : "text-[13px] leading-4 font-bold text-muted-foreground";

  return (
    <p className={className}>
      {delta > 0
        ? `▲ 지난${unit}보다 ${formatDuration(delta)} 늘었어요`
        : delta < 0
          ? `▼ 지난${unit}보다 ${formatDuration(-delta)} 줄었어요`
          : `지난${unit}${unit === "달" ? "과" : "와"} 같아요`}
    </p>
  );
}
