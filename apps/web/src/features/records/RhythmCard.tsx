// TODO: 백엔드 시간대별 집계 API 연동 시 이 준비 중 카드를 크로노타입 문구로 교체한다.

/** 준비 중 자리에 그리는 연한 비활성 막대 개수(플레이스홀더, 실제 데이터 없음). */
const PLACEHOLDER_BAR_HEIGHTS = [
  20, 24, 18, 30, 26, 38, 34, 44, 40, 52, 48, 58, 54, 60, 56, 50, 46, 40, 36, 30, 26, 22, 18, 16,
] as const;

/**
 * 나의 공부 리듬 카드
 */
export function RhythmCard() {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-muted shadow-sb-card p-[18px]">
      <div className="flex flex-row items-center justify-between">
        <span className="text-[17px] leading-[21px] font-bold text-foreground">나의 공부 리듬</span>
        <span className="text-[13px] leading-4 text-text-tertiary">최근 4주 기준</span>
      </div>

      <p className="text-[15px] leading-[22px] text-muted-foreground">
        공부 기록을 모으는 중이에요
      </p>

      <div
        role="img"
        aria-label="공부 기록을 모으는 중"
        className="flex h-16 flex-row items-end justify-between gap-[3px]"
      >
        {PLACEHOLDER_BAR_HEIGHTS.map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-full bg-border"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}
