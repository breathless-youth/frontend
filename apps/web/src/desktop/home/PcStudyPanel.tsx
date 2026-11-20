import { Minus, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { homeClock } from "@/features/home-v3/homeV3Model";

import { markStudyPanelEvent } from "./studyPanelEvents";
import { useStudyPanel } from "./useStudyPanel";

/**
 * 끌어 옮기는 공부시간 패널
 *
 * 폰 홈 가운데 묶음을 받아 그리고, 머리줄을 끌거나 머리줄에서 방향키로 옮긴다.
 * 접어도 내용을 지우지 않고 숨겨서 펼치면 고르던 과목과 메뉴 상태가 그대로다.
 * 바탕이 불투명해 어떤 월페이퍼 위에서도 글자 대비가 유지된다.
 */
export function PcStudyPanel({
  studySeconds,
  children,
}: {
  studySeconds: number | null;
  children: ReactNode;
}) {
  const { t } = useTranslation("desktop");
  const titleId = useId();
  const bodyId = useId();
  const { ref, right, top, minimized, toggleMinimized, handleProps } = useStudyPanel();
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      // 패널을 끌거나 누르는 일이 열린 공간 플라이아웃을 닫지 않도록 패널에서 시작한 누름과 포커스를 표시한다.
      onPointerDownCapture={(event) => markStudyPanelEvent(event.nativeEvent)}
      onFocusCapture={(event) => markStudyPanelEvent(event.nativeEvent)}
      style={{ right, top }}
      className="pc-study-panel absolute z-10 flex max-h-[calc(100%-2rem)] w-100 flex-col rounded-xl bg-muted shadow-sb-card"
    >
      <div
        role="group"
        tabIndex={0}
        aria-label={t("home.panel.move")}
        {...handleProps}
        className="flex min-h-14 shrink-0 cursor-grab touch-none items-center justify-between gap-2 rounded-xl pr-1.5 pl-5 select-none focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none active:cursor-grabbing"
      >
        <h2
          id={titleId}
          className="flex items-baseline gap-2 text-[15px] leading-5 font-bold text-foreground"
        >
          {t("home.panel.title")}
          {minimized && studySeconds !== null && (
            <>
              {/* 화면 낭독기가 제목과 시간을 붙여 읽지 않게 띄운다. */}{" "}
              <span className="font-extrabold tabular-nums">{homeClock(studySeconds)}</span>
            </>
          )}
        </h2>
        <button
          type="button"
          aria-expanded={!minimized}
          aria-controls={bodyId}
          aria-label={t(minimized ? "home.panel.expand" : "home.panel.minimize")}
          onClick={toggleMinimized}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none"
        >
          {minimized ? (
            <Plus aria-hidden="true" className="size-5" />
          ) : (
            <Minus aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
      <div
        id={bodyId}
        hidden={minimized}
        // 진행 띠가 폰과 같은 362폭이 되도록 400폭에서 양옆 19px을 둔다.
        className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4.75 pb-5"
      >
        {children}
      </div>
    </section>
  );
}
