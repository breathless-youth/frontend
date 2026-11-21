import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useMeasureMode } from "@/features/measure-mode/measureMode";
import { trackStudyMeasureModeChanged } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { showToast } from "@/lib/toast";

import { HomeDesignIcon } from "./HomeDesignIcon";

const MODE_ICONS = [
  ["camera", "camera"],
  ["timer", "cameraOff"],
] as const;

/**
 * 공부 시작 버튼과 측정 방식 전환 버튼
 *
 * 전환 버튼은 지금 방식을 이름으로 읽어 주고, 바뀐 방식은 시작 버튼의 아이콘으로 보인다.
 */
export function HomeStartButtons({
  starting,
  onStart,
}: {
  starting: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation("home");
  const [mode, setMode] = useMeasureMode();

  function toggleMode() {
    const next = mode === "camera" ? "timer" : "camera";
    haptic("light");
    setMode(next);
    trackStudyMeasureModeChanged(next, "home");
    showToast(t(`v3.measureMode.toast.${next}`));
  }

  return (
    <div className="flex gap-1">
      <Button
        className="min-h-16 flex-1 gap-4.5 rounded-[22px] rounded-r-xs text-xl leading-6 font-semibold tracking-[0.9px] shadow-sb-cta"
        disabled={starting}
        aria-busy={starting}
        onClick={onStart}
      >
        {/* 두 아이콘을 겹쳐 두고 전환으로 바꿔야 연달아 눌러도 지금 상태에서 이어서 바뀐다. */}
        <span className="grid">
          {MODE_ICONS.map(([iconMode, icon]) => (
            <span
              key={iconMode}
              data-mode={iconMode}
              data-state={mode === iconMode ? "on" : "off"}
              className="col-start-1 row-start-1 flex transition-[opacity,scale] duration-200 ease-overlay motion-reduce:transition-none data-[state=off]:scale-90 data-[state=off]:opacity-0"
            >
              <HomeDesignIcon name={icon} />
            </span>
          ))}
        </span>
        {t(starting ? "v3.startingStudy" : "v3.startStudy")}
      </Button>
      <Button
        className="min-h-16 w-16 shrink-0 rounded-[22px] rounded-l-xs p-0 shadow-sb-cta"
        disabled={starting}
        aria-label={t(`v3.measureMode.toggle.${mode}`)}
        onClick={toggleMode}
      >
        <HomeDesignIcon name="swap" />
      </Button>
    </div>
  );
}
