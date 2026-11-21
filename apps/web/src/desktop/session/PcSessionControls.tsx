import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * 공부 중 패널 아래 버튼 줄
 *
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
    <div data-pc-guide="controls" className="flex gap-2">
      <Button
        ref={pauseRef}
        variant="secondary"
        disabled={disabled}
        onClick={onTogglePause}
        className="h-auto flex-1 border border-border py-3.5 text-base leading-6 font-bold"
      >
        {t(paused ? "session.resume" : "session.pause")}
      </Button>
      <Button
        ref={exitRef}
        disabled={disabled}
        aria-busy={saving}
        onClick={onExit}
        className="h-auto flex-1 py-3.5 text-base leading-6 font-bold"
      >
        {saving ? t("study-session:submit.saving") : t("session.exit")}
      </Button>
    </div>
  );
}
