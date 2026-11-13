import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { sessionSurfaceStyle } from "../sessionTheme";

/**
 * 공부 시작 카운트다운 화면
 *
 * 숫자가 1초마다 줄고 다 세면 `onDone`을 부른다. 그동안 바깥 화면이 감지 모델을 준비한다.
 */
export function SessionCountdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const { t } = useTranslation("study-session");
  const [left, setLeft] = useState(seconds);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    let remaining = seconds;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        finish();
        return;
      }
      setLeft(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <main
      data-testid="session-countdown"
      className="theme-dark relative flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground"
      style={sessionSurfaceStyle}
    >
      <span aria-live="polite" className="text-7xl font-bold tabular-nums">
        {left}
      </span>
      <p className="text-base text-muted-foreground">{t("countdown.preparing")}</p>
    </main>
  );
}
