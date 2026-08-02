import type { StudySessionListResponse } from "@focusmakers/types";

import { formatDuration, formatFocusRate, formatSessionCount } from "./recordsFormat";

/**
 * S5 선택일 학습 요약 2×2(Figma `Record / Summary Tile` 46:131).
 * (`apps/mobile/components/records/SummaryTiles.tsx`에서 이식 — BY-330 기록 웹 이관)
 *
 * 라벨은 `glossary.md`의 노출 표기 그대로다(`순공시간` / `총 공부 시간` / `집중률` / `공부 횟수`).
 * 높이는 Figma 실측 66px을 고정값이 아니라 최소값으로 둔다 — 시스템 폰트 확대 시 한글 라벨이
 * 잘리지 않아야 한다(`SCR-S5-records.md` Accessibility Requirements).
 *
 * `longestFocusSec`는 이 화면에 노출 요소가 없다(홈 S1의 "최장 집중"용) — 쓰지 않는다.
 */
type SummaryTileProps = {
  label: string;
  value: string;
  /** Accent 변형 — 순공시간 값만 브랜드 컬러다. */
  accent?: boolean;
};

function SummaryTile({ label, value, accent = false }: SummaryTileProps) {
  return (
    <div className="flex min-h-[66px] flex-1 flex-col gap-1 rounded-2xl bg-muted px-[14px] py-3">
      <span className="text-xs leading-[14px] font-medium text-muted-foreground">{label}</span>
      <span
        className={
          accent
            ? "text-[18px] leading-[22px] font-bold text-primary"
            : "text-[18px] leading-[22px] font-bold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

type SummaryTilesProps = {
  stats: StudySessionListResponse;
};

export function SummaryTiles({ stats }: SummaryTilesProps) {
  return (
    // TODO(SCR-S5-records.md): 선택일에 기록이 없을 때 타일을 0값으로 둘지 숨길지 미확정 —
    // 확인 전까지 0값(`0분`/`0%`/`0회`)으로 그대로 노출한다.
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-row gap-2.5">
        <SummaryTile label="순공시간" value={formatDuration(stats.totalFocusSec)} accent />
        <SummaryTile label="총 공부 시간" value={formatDuration(stats.totalStudySec)} />
      </div>
      <div className="flex flex-row gap-2.5">
        <SummaryTile label="집중률" value={formatFocusRate(stats.focusRate)} />
        <SummaryTile label="공부 횟수" value={formatSessionCount(stats.sessionCount)} />
      </div>
    </div>
  );
}
