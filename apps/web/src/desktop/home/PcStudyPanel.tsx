import { Minus, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import { homeClock } from "@/features/home-v3/homeV3Model";

import { PANEL_HEADER_ICON_BUTTON_CLASS } from "./panelHeaderButtonClass";
import { markStudyPanelEvent } from "./studyPanelEvents";
import { useStudyPanel } from "./useStudyPanel";

/**
 * 끌어 옮기는 공부시간 패널
 *
 * 폰 홈 가운데 묶음을 받아 그리고, 머리줄을 끌거나 머리줄에서 방향키로 옮긴다.
 * 접어도 내용을 지우지 않고 숨겨서 펼치면 고르던 과목과 메뉴 상태가 그대로다.
 * 제목은 화면에서 숨기고 패널 이름으로만 읽히며, 접으면 머리줄에 오늘 공부시간과 집중률이 나란히 남는다.
 * 바탕이 불투명해 어떤 월페이퍼 위에서도 글자 대비가 유지된다.
 */
export function PcStudyPanel({
  stats,
  headerActions,
  layer,
  onActivate,
  children,
}: {
  /** 공부 카드와 같은 오늘 통계. 접었을 때 머리줄에 보인다. */
  stats: HomeV3ContentProps["stats"];
  /** 머리줄 접기 버튼 왼쪽에 둘 버튼 */
  headerActions?: ReactNode;
  /** 겹친 창 사이의 층. 없으면 기본 층이다. */
  layer?: number;
  /** 누르거나 포커스가 들어오면 부른다. 겹친 카메라 창보다 위로 올릴 때 쓴다. */
  onActivate?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(["desktop", "home"]);
  const titleId = useId();
  const bodyId = useId();
  const { ref, right, top, minimized, toggleMinimized, handleProps } = useStudyPanel();
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      // 패널을 끌거나 누르는 일이 열린 공간 플라이아웃을 닫지 않도록 패널에서 시작한 누름과 포커스를 표시한다.
      onPointerDownCapture={(event) => {
        markStudyPanelEvent(event.nativeEvent);
        onActivate?.();
      }}
      onFocusCapture={(event) => {
        markStudyPanelEvent(event.nativeEvent);
        onActivate?.();
      }}
      style={{ right, top, zIndex: layer }}
      className="pc-study-panel absolute z-10 flex max-h-[calc(100%-2rem)] w-100 flex-col rounded-xl bg-muted shadow-sb-card"
    >
      <div
        role="group"
        tabIndex={0}
        aria-label={t("home.panel.move")}
        {...handleProps}
        className="flex min-h-11 shrink-0 cursor-grab touch-none items-center justify-between gap-2 rounded-xl py-2.5 pr-2.5 pl-5 select-none focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none active:cursor-grabbing"
      >
        <h2 id={titleId} className="sr-only">
          {t("home.panel.title")}
        </h2>
        {minimized && stats.status === "success" && (
          <p className="flex items-baseline gap-2.5 text-[15px] leading-5 font-extrabold text-foreground tabular-nums">
            <span>
              <span className="sr-only">{t("home.panel.title")} </span>
              {homeClock(stats.value.studySeconds)}
            </span>
            <span className="text-primary">
              <span className="sr-only">{t("home:stats.focusRate")} </span>
              {Math.round(Math.min(100, Math.max(0, stats.value.focusRate)))}%
            </span>
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {headerActions}
          <button
            type="button"
            aria-expanded={!minimized}
            aria-controls={bodyId}
            aria-label={t(minimized ? "home.panel.expand" : "home.panel.minimize")}
            onClick={toggleMinimized}
            className={PANEL_HEADER_ICON_BUTTON_CLASS}
          >
            {minimized ? (
              <Plus aria-hidden="true" className="size-5" />
            ) : (
              <Minus aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
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
