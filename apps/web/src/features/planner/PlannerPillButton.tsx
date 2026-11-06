import { useId } from "react";
import { useTranslation } from "react-i18next";

import { IconPlanner } from "@/features/records/icons";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import { type PlannerEntry, useOpenPlanner } from "./useOpenPlanner";

/**
 * 홈과 기록 탭 머리 오른쪽의 플래너 원형 버튼.
 * 두 탭이 같은 입구로 보이도록 모양을 한 곳에서 정한다.
 * 놓이는 줄마다 맞춤이 달라 `className`으로 여백·정렬만 받는다.
 */
export function PlannerPillButton({
  via,
  dateKey,
  className,
  showUpdateDot = false,
  onOpen,
}: {
  via: PlannerEntry;
  dateKey?: string;
  className?: string;
  showUpdateDot?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation("planner");
  const updateDescriptionId = useId();
  const openPlanner = useOpenPlanner(via);
  const open = () => {
    onOpen?.();
    openPlanner(dateKey);
  };
  // 현재 앱 부품은 배지를 지원하지 않고 웹보다 위에 그려진다.
  // 점이 있는 동안은 버튼도 웹으로 그려 점을 가리지 않으며, 확인 뒤에는 앱 부품으로 돌아간다.
  const { ref } = useNativeControl<HTMLButtonElement>(
    showUpdateDot
      ? null
      : {
          id: `button-planner-${via}`,
          kind: "button",
          title: null,
          systemImage: "calendar",
          image: "planner",
          shape: "circle",
          disabled: false,
          accessibilityLabel: t("pillButton.aria.open"),
        },
    open,
  );
  return (
    <span className={cn("relative inline-flex size-11 shrink-0", className)}>
      <button
        ref={ref}
        type="button"
        aria-label={t("pillButton.aria.open")}
        aria-describedby={showUpdateDot ? updateDescriptionId : undefined}
        onClick={open}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground shadow-[0_2px_10px_0_rgba(15,23,42,0.06)]"
      >
        <IconPlanner size={24} />
      </button>
      {showUpdateDot && (
        <>
          {/* 네이티브 버튼이 웹 원본을 숨겨도 점은 남도록 형제 요소로 둔다. */}
          <span
            aria-hidden="true"
            data-testid="planner-update-dot"
            className="pointer-events-none absolute top-0.5 right-0.5 z-1 size-2 rounded-full bg-primary"
          />
          <span id={updateDescriptionId} className="sr-only">
            {t("pillButton.aria.updated")}
          </span>
        </>
      )}
    </span>
  );
}
