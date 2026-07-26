import { toKoreanDurationLength } from "../formatDuration";
import { RESULT_COPY, focusRateLabel } from "../resultCopy";
import type { SessionResultView } from "../sessionResult";

/**
 * S4 헤더 (Figma `64:552`~`64:560`) — 타이틀 · 닫기 · 순공시간 대형값 · 집중률 필 · 메타 라인.
 *
 * 형식은 `design.md` 6차 "S4 헤더" 행에 고정돼 있다:
 * **"공부 결과" 타이틀 · 순공시간 대형 + "N% 집중" 필 · "총 공부 N · HH:MM–HH:MM" · CTA "확인"**.
 *
 * ## 시각 범위 ≠ 총 공부 시간 (버그가 아니다)
 *
 * `HH:MM – HH:MM`은 **벽시계** 범위(`startedAt`~`endedAt`)이고 `총 공부`는 일시정지를 뺀
 * 값이라 일시정지가 있었던 세션에서는 **서로 다르다**. 이 차이를 화면에서 맞추려 들지 않는다 —
 * 오히려 같게 나오면 제출 경로(`buildSessionRequest`)가 깨졌다는 신호다(SCR-S4 QA 회부 규칙).
 *
 * ## 절대 좌표를 베끼지 않는다
 *
 * Figma는 대형값(`64:557`)과 필(`64:558`)을 같은 줄에 절대 배치하지만, 폰트 확대 시 겹친다.
 * `flex-wrap`으로 두어 필이 아래 줄로 떨어져도 깨지지 않게 한다(SCR-S4 Accessibility).
 */
export function ResultHeader({ view, onClose }: { view: SessionResultView; onClose: () => void }) {
  return (
    <header>
      {/* 타이틀은 중앙, 닫기는 우상단. 닫기를 흐름에서 빼면 긴 타이틀에서도 중앙이 유지된다. */}
      <div className="relative flex h-9 items-center justify-center">
        <h1 className="text-[17px] leading-[20px] font-semibold text-foreground">
          {RESULT_COPY.title}
        </h1>
        <CloseButton onClose={onClose} />
      </div>

      <p className="mt-[22px] text-[13px] leading-[15px] font-medium text-muted-foreground">
        {RESULT_COPY.focusLabel}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[33px] leading-[40px] font-bold tracking-[-0.3px] text-foreground tabular-nums">
          {toKoreanDurationLength(view.focusSec)}
        </p>
        <span className="rounded-full bg-brand-subtle px-[9px] py-[3px] text-[12px] leading-[14px] font-semibold text-primary tabular-nums">
          {focusRateLabel(view.focusRatePercent)}
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-[16px] text-text-tertiary tabular-nums">
        {`${RESULT_COPY.totalPrefix} ${toKoreanDurationLength(view.studySec)} · ${view.clockRange}`}
      </p>
    </header>
  );
}

/**
 * 닫기 버튼 (Figma `btn-close` 64:553 + `icon/close` 64:554).
 *
 * 시각 크기는 Figma 실측 36px 그대로 두되 **히트 영역만 44×44로 넓힌다**(`before:-inset-1` =
 * 사방 4px 확장 → 44×44) — 36px는 최소 터치 타겟 미달이다(SCR-S4 Accessibility).
 *
 * 동작은 CTA `확인`과 **같다** — Figma에 둘 다 있지만 design.md 6차 S4 헤더 행은 CTA만 규정한다.
 * 서로 다른 동작을 상상해 부여하지 않는다(SCR-S4 Review Checklist에 확인 항목으로 등재).
 */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={RESULT_COPY.close}
      className="absolute right-0 flex size-9 items-center justify-center rounded-full bg-bg-layer-2 text-muted-foreground transition-opacity duration-200 before:absolute before:-inset-1 before:content-[''] active:opacity-70 motion-reduce:transition-none"
    >
      <CloseIcon />
    </button>
  );
}

/**
 * `icon/close`(`64:554`)의 Figma 익스포트 그대로. path·viewBox·stroke-width는 손대지 않았고
 * **유일한 변경은 `stroke`를 `#6B7684`에서 `currentColor`로 바꾼 것**이다 — 이 화면은 라이트/
 * 다크를 모두 따라가므로 색을 박아 두면 다크에서 어두운 회색 X가 남는다. 색은 부모가 준다.
 *
 * PNG로 내보내지 않는 이유: Figma PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 아이콘이
 * 흰 네모로 보인다(S1 구현에서 실제 발생).
 */
function CloseIcon() {
  return (
    <svg
      width="10.9571"
      height="10.9571"
      viewBox="0 0 10.9571 10.9571"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0.835714 0.835714L10.1214 10.1214M10.1214 0.835714L0.835714 10.1214"
        stroke="currentColor"
        strokeWidth="1.67143"
        strokeLinecap="round"
      />
    </svg>
  );
}
