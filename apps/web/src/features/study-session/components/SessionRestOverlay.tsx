import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { createAlarmSound } from "@/features/multi-timer/alarmSound";
import type { AlarmSound } from "@/features/multi-timer/alarmSound";
import { formatPomodoroRemaining } from "@/features/multi-timer/multiTimerFormat";
import { ALARM_HAPTIC_GAP_MS, alarmHaptics } from "@/features/multi-timer/useMultiTimer";
import { trackSessionRestAlarmFired, trackSessionRestAlarmSet } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { toKoreanDuration } from "../formatDuration";
import { SessionMascot } from "../mascot/SessionMascot";
import { pauseState } from "../sessionState";

/** 고를 수 있는 휴식 알림(분) */
const ALARM_MINUTES = [5, 10] as const;

/** 이보다 늦게 알아챈 알림은 앱을 나가 있던 동안 지난 것으로 보고 앱 안에서 다시 울리지 않는다. */
const MISSED_ALARM_MS = 2000;

const TICK_MS = 250;

const PAUSED = pauseState("MANUAL");

export interface RestAlarm {
  minutes: number;
  fireAtMs: number;
}

/**
 * 일시정지 휴식 화면
 *
 * 공부 화면을 흐리게 덮고 흑백 마스코트와 쉰 시간을 보인다. 하단 바는 이 화면 위에 남는다.
 * 우하단 말풍선(하나만 눌리는 버튼 묶음)에서 5분·10분 뒤 알림을 고르면 고른 때부터 남은 시간을 거꾸로 세고, 시간이 되면 소리와 진동으로 알린다.
 * 알림이 울리면 `휴식이 끝났어요`와 함께 다시 일시정지부터 센 쉰 시간을 보이고 말풍선은 `알림 없음`으로 돌아간다.
 * 앱을 나가 있던 동안 지난 알림은 OS 알림이 대신 울린 것이라 돌아와서 다시 울리지 않는다.
 * 일시정지할 때마다 새로 그려져서 알림은 늘 `알림 없음`에서 시작한다.
 * 닫힐 때는 고른 알림이 없어도 알림 취소를 알린다.
 */
export function SessionRestOverlay({
  pausedSinceMs,
  showAlarms,
  alarm: injectedAlarm,
  onAlarmChange,
  onAlarmFired,
  now = Date.now,
}: {
  pausedSinceMs: number;
  /** 알림 말풍선을 보일지. OS 알림을 예약할 수 없는 구버전 앱은 숨긴다. */
  showAlarms: boolean;
  alarm?: AlarmSound;
  /** 고른 알림이 바뀔 때. OS 알림 예약과 취소가 쓴다. `null`은 알림 없음이다. */
  onAlarmChange?: (alarm: RestAlarm | null) => void;
  onAlarmFired?: (channel: "in_app" | "os") => void;
  /** 벽시계. 테스트가 바꿔 끼운다. */
  now?: () => number;
}) {
  const { t } = useTranslation("study-session");
  const [sound] = useState(() => injectedAlarm ?? createAlarmSound());
  const [nowMs, setNowMs] = useState(now);
  const [restAlarm, setRestAlarm] = useState<RestAlarm | null>(null);
  const [ended, setEnded] = useState(false);
  const alarmRef = useRef<RestAlarm | null>(null);
  const hapticTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const changeAlarm = (next: RestAlarm | null) => {
    alarmRef.current = next;
    setRestAlarm(next);
    onAlarmChange?.(next);
  };

  const ring = () => {
    sound.play();
    alarmHaptics().forEach((style, index) => {
      if (index === 0) {
        haptic(style);
        return;
      }
      const timer = setTimeout(() => {
        hapticTimersRef.current.delete(timer);
        haptic(style);
      }, index * ALARM_HAPTIC_GAP_MS);
      hapticTimersRef.current.add(timer);
    });
  };

  const tick = useEffectEvent(() => {
    const atMs = now();
    setNowMs(atMs);
    const due = alarmRef.current;
    if (due === null || atMs < due.fireAtMs) return;
    const missed = atMs - due.fireAtMs > MISSED_ALARM_MS;
    if (!missed) ring();
    const channel = missed ? "os" : "in_app";
    trackSessionRestAlarmFired({ channel });
    onAlarmFired?.(channel);
    setEnded(true);
    changeAlarm(null);
  });

  useEffect(() => {
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const cleanUp = useEffectEvent(() => {
    // 고른 알림이 없어도 거둔다. 웹뷰가 다시 떠서 화면이 고른 알림을 잊어도 앞서 예약한 OS 알림은 남아 있을 수 있다.
    onAlarmChange?.(null);
    hapticTimersRef.current.forEach(clearTimeout);
    sound.dispose();
  });
  useEffect(() => () => cleanUp(), []);

  const choose = (minutes: number | null) => {
    // 알림음은 사용자가 누른 순간에 깨워 둬야 나중에 소리를 낼 수 있다.
    sound.prime();
    const atMs = now();
    setNowMs(atMs);
    setEnded(false);
    trackSessionRestAlarmSet({ minutes });
    changeAlarm(minutes === null ? null : { minutes, fireAtMs: atMs + minutes * 60_000 });
  };

  const counting = restAlarm !== null;
  const shownMs = counting
    ? formatPomodoroRemaining(restAlarm.fireAtMs - nowMs)
    : formatPomodoroRemaining(Math.floor((nowMs - pausedSinceMs) / 1000) * 1000);
  const srMs = counting ? restAlarm.fireAtMs - nowMs : nowMs - pausedSinceMs;
  const label = counting
    ? t("rest.labelWithAlarm", { minutes: restAlarm.minutes })
    : ended
      ? t("rest.ended")
      : t("rest.label");
  const selected = restAlarm?.minutes ?? null;

  return (
    <div
      data-testid="session-rest-overlay"
      className="absolute inset-0 z-10 bg-[rgba(16,18,24,0.45)] backdrop-blur-[18px]"
    >
      <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-3.5 pb-27.5">
        <SessionMascot
          state={PAUSED}
          className="static translate-y-0 grayscale [--mascot-box:8.75rem] regular:[--mascot-box:8.75rem] short-side-lg:[--mascot-box:10rem]"
        />
        <p className="text-xs leading-4 font-semibold text-(--session-state-color) regular:text-sm regular:leading-5">
          {label}
        </p>
        <p
          role="timer"
          className="text-[52px] leading-15 font-bold tracking-[-0.5px] text-white tabular-nums"
        >
          <span aria-hidden="true">{shownMs}</span>
          <span className="sr-only">
            {t(counting ? "rest.srRemaining" : "rest.srElapsed", {
              duration: toKoreanDuration(Math.max(0, Math.round(srMs / 1000))),
            })}
          </span>
        </p>
      </div>
      {showAlarms && (
        <div
          role="group"
          aria-label={t("rest.alarmGroup")}
          className="absolute right-[calc(env(safe-area-inset-right)+16px)] bottom-[calc(env(safe-area-inset-bottom)+148px)] flex flex-col items-end gap-2"
        >
          {[...ALARM_MINUTES, null].map((minutes) => {
            const checked = selected === minutes;
            return (
              <button
                key={minutes ?? "none"}
                type="button"
                aria-pressed={checked}
                onClick={() => choose(minutes)}
                className={cn(
                  "h-10 rounded-[20px_20px_4px_20px] border px-4 text-sm leading-5 font-medium whitespace-nowrap",
                  checked
                    ? "border-transparent bg-white font-semibold text-(--session-camera-base)"
                    : "border-white/18 bg-white/10 text-white",
                )}
              >
                {minutes === null ? t("rest.alarmNone") : t("rest.alarm", { minutes })}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
