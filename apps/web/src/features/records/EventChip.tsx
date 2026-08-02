import type { StudyEventStatus } from "@focusmakers/types";

/**
 * S5 기록 리스트의 이벤트 칩(Figma `Chip / Event Tag` 46:93).
 * (`apps/mobile/components/records/EventChip.tsx`에서 이식 — BY-330 기록 웹 이관)
 *
 * 색만으로 뜻을 전달하지 않는다 — 도트는 보조 표시이고 라벨 텍스트가 항상 함께 온다
 * (`design.md` 상태 컬러 보조 규칙 ①). 라벨 문구는 `recordsFormat.ts`의
 * `eventChipItems`가 만든다(축약형 · 횟수만).
 *
 * RN판은 `useColorScheme`으로 라이트/다크 색을 JS에서 골랐지만, 웹은 `index.css`의
 * CSS 변수가 `prefers-color-scheme`에 따라 자동으로 갈리므로 스킴 분기 없이 토큰 클래스만 쓴다.
 */
type EventChipProps = {
  status: StudyEventStatus;
  /** 예: `자리 이탈 2회` — 시간을 붙이지 않는다(S4 표기와 다름). */
  label: string;
};

export function EventChip({ status, label }: EventChipProps) {
  // 비집중 3종은 오렌지, 일시정지는 회색(`design.md` 6차 확정 · eventStatusColors).
  const isPause = status === "PAUSE";

  return (
    // 반경 7px은 표준 스케일 밖 실측값이라 그대로 쓴다(S1 선례와 동일 방침).
    // TODO(SCR-S5-records.md): 일시정지 칩 배경 토큰 미확정 — `state.distractSubtle`의 회색 대응물이
    // 없어 임시로 `bg/layer-2`를 쓴다. 회색 subtle 토큰 신설 여부를 디자이너/토큰 담당이 확정하면 교체한다.
    <span
      className={`flex flex-row items-center gap-[5px] rounded-[7px] px-2 py-[3px] ${
        isPause ? "bg-bg-layer-2" : "bg-state-distract-subtle"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-[5px] rounded-full ${isPause ? "bg-text-tertiary" : "bg-state-distract"}`}
      />
      {/* 라이트 모드 소형 오렌지 텍스트는 `state/distract-text`(#b36100)를 쓴다 — 색각 안전 규칙 ② */}
      <span
        className={`text-[11px] font-medium leading-[13px] ${
          isPause ? "text-text-tertiary" : "text-state-distract-text"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
