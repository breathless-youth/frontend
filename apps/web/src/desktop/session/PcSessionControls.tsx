import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * 공부 중 패널 아래 버튼 줄
 *
 * 홈의 공부 시작 분할 버튼 자리에 같은 높이로 들어가 공부를 시작해도 패널 높이가 거의 그대로다.
 * 가이드가 이 줄을 비추도록 표식을 단다.
 */
export function PcSessionControls({
  paused,
  saving,
  disabled,
  onTogglePause,
  onExit,
  pauseRef,
  exitRef,
}: {
  paused: boolean;
  saving: boolean;
  disabled: boolean;
  onTogglePause: () => void;
  onExit: () => void;
  pauseRef?: Ref<HTMLButtonElement>;
  exitRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation(["desktop", "study-session"]);
  return (
    <div data-pc-guide="controls" className="flex gap-1">
      <Button
        ref={pauseRef}
        variant="secondary"
        disabled={disabled}
        onClick={onTogglePause}
        className="min-h-16 flex-1 rounded-[22px] rounded-r-xs text-xl leading-6 font-bold"
      >
        {t(paused ? "session.resume" : "session.pause")}
      </Button>
      <Button
        ref={exitRef}
        disabled={disabled}
        aria-busy={saving}
        onClick={onExit}
        className="min-h-16 flex-1 rounded-[22px] rounded-l-xs text-xl leading-6 font-bold shadow-sb-cta"
      >
        {saving ? t("study-session:submit.saving") : t("session.exit")}
      </Button>
    </div>
  );
}
