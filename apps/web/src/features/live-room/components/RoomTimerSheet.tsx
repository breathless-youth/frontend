import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ModeCard } from "@/features/multi-timer/components/ModeCard";
import { TimerWheel } from "@/features/multi-timer/components/TimerWheel";
import type { ModeKind, ModeState } from "@/features/multi-timer/multiTimerMachine";
import { BREAK_MIN_LIMIT, FOCUS_MIN_LIMIT } from "@/features/multi-timer/multiTimerSettings";
import type { MultiTimerControls } from "@/features/multi-timer/useMultiTimer";
import { haptic } from "@/lib/haptics";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

import { GROUP_ROOM_ANALYTICS_MASK } from "../groupRoomAnalyticsMask";
import { pomodoroIntro, timerStartLabel } from "../roomTimerCopy";

const KIND_OPTIONS = [
  { value: "timer", labelKey: "roomTimerSheet.kind.timer" },
  { value: "pomodoro", labelKey: "roomTimerSheet.kind.pomodoro" },
] as const satisfies ReadonlyArray<{ value: ModeKind; labelKey: string }>;

// 시트가 열린 동안에도 다른 멤버 타일이 보이게 세션 딤을 옅게 쓴다.
const SHEET_DIM = "bg-(--session-dim)/40";

function noop() {}

export interface RoomTimerSheetProps {
  open: boolean;
  /** 가로에서는 아래 시트 대신 오른쪽 패널로 연다. */
  landscape: boolean;
  /** 포털 자리이고 세션 색 변수를 받으려면 세션 화면을 넘긴다. */
  container: HTMLElement | null;
  timer: MultiTimerControls;
  /**
   * 시트 열림을 거둔다.
   *
   * 시작과 취소가 모드에 할 일은 시트가 먼저 하고 부른다.
   */
  onClose: () => void;
}

/**
 * 공부방 타이머 설정 시트
 *
 * 다른 멤버 화면을 계속 볼 수 있게 세로는 화면 절반 높이의 아래 시트, 가로는 오른쪽 패널로 연다.
 * 싱글룸 타이머와 같은 상태 기계와 설정 저장을 쓰고, 고르는 부품도 싱글룸의 휠과 분 칸을 그대로 쓴다.
 * 싱글룸 패널은 화면 전체 배치에 맞춰져 있어 이 높이에 들어가지 않아서 고르는 부품만 가져와 시트에 맞게 놓는다.
 * 시작하면 시트를 닫고 캡슐로 계속 돌며, 시작하지 않고 닫는 길은 모두 취소라 모드를 끈다.
 * 시트가 닫히며 밀려 나가는 동안에는 모드가 이미 꺼져 있어도 마지막 설정을 그린다.
 */
export function RoomTimerSheet({
  open,
  landscape,
  container,
  timer,
  onClose,
}: RoomTimerSheetProps) {
  const { t } = useTranslation("live-room");
  const [shownMode, setShownMode] = useState(timer.mode);
  if (timer.mode !== null && timer.mode !== shownMode) {
    setShownMode(timer.mode);
  }
  const mode = timer.mode ?? shownMode;
  const focusRestore = useDialogFocusRestore();

  const cancel = () => {
    timer.close();
    onClose();
  };
  const start = () => {
    timer.pressPrimary();
    haptic("medium");
    onClose();
  };
  const handleOpenChange = (next: boolean) => {
    if (!next && open) {
      cancel();
    }
  };

  if (landscape) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          container={container}
          overlayClassName={SHEET_DIM}
          aria-describedby={undefined}
          data-placement="side"
          {...GROUP_ROOM_ANALYTICS_MASK}
          onOpenAutoFocus={focusRestore.onOpenAutoFocus}
          onCloseAutoFocus={focusRestore.onCloseAutoFocus}
          // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 패널 안 탭이 씹힌다.
          onTouchMove={(event) => event.stopPropagation()}
          // 패널은 화면 오른쪽 끝에 붙어서 오른쪽 안전 영역만큼 안쪽 여백을 더 둔다.
          className="flex w-100 max-w-full touch-manipulation flex-col rounded-l-3xl border-0 bg-background pt-[calc(env(safe-area-inset-top)+20px)] pr-[calc(env(safe-area-inset-right)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)] pl-6 text-foreground sm:max-w-none"
        >
          <SheetTitle className="sr-only">{t("roomTimerSheet.title")}</SheetTitle>
          {mode !== null && (
            <TimerSheetBody
              mode={mode}
              timer={timer}
              onCancel={cancel}
              onStart={start}
              className="gap-3.5"
            />
          )}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        container={container}
        backdropClassName={SHEET_DIM}
        data-placement="bottom"
        {...GROUP_ROOM_ANALYTICS_MASK}
        className="flex h-[50dvh] touch-manipulation flex-col bg-background"
      >
        <DrawerTitle className="sr-only">{t("roomTimerSheet.title")}</DrawerTitle>
        {mode !== null && (
          <TimerSheetBody
            mode={mode}
            timer={timer}
            onCancel={cancel}
            onStart={start}
            className="gap-4 pt-2.5"
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * 시트 본문
 *
 * 맨 위 종류 토글, 고르는 부품, 알림음 줄, 취소와 시작 버튼 순서다.
 * 시트를 끌어 닫는 것은 손잡이에서만 받아서, 휠을 굴리거나 칸을 누르다 살짝 움직인 손가락이 시트를 닫지 않는다.
 */
function TimerSheetBody({
  mode,
  timer,
  onCancel,
  onStart,
  className,
}: {
  mode: ModeState;
  timer: MultiTimerControls;
  onCancel: () => void;
  onStart: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["live-room", "common"]);
  const alarmLabelId = useId();
  const { kind, settings } = mode;
  return (
    <div data-base-ui-swipe-ignore="" className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <KindToggle kind={kind} locked={timer.kindLocked} onChange={timer.switchKind} />
      {/* 휠은 원래 크기로는 이 높이에 들어가지 않아 줄여 그린다.
          휠은 끌 때 그려진 높이로 환산해서 줄여도 손가락을 그대로 따라간다.
          위아래로 흐려지는 가장자리 줄은 칸 밖으로 넘치면 잘라 낸다. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {kind === "timer" ? (
          <div className="w-87 shrink-0 scale-75 regular:scale-100">
            <TimerWheel
              valueSec={settings.timerSec}
              onChange={(timerSec) => timer.changeSettings({ timerSec })}
            />
          </div>
        ) : (
          // 분 칸을 누르면 OS의 분 선택 휠이 열린다.
          <div className="grid w-full grid-cols-2 gap-2.5">
            <ModeCard
              kind="focus"
              minutes={settings.focusMin}
              max={FOCUS_MIN_LIMIT.max}
              selected={false}
              onSelect={noop}
              onChangeMinutes={(focusMin) => timer.changeSettings({ focusMin })}
            />
            <ModeCard
              kind="break"
              minutes={settings.breakMin}
              max={BREAK_MIN_LIMIT.max}
              selected={false}
              onSelect={noop}
              onChangeMinutes={(breakMin) => timer.changeSettings({ breakMin })}
            />
          </div>
        )}
      </div>
      {kind === "pomodoro" && (
        <p className="-mt-1.5 text-[13px] leading-4.5 text-muted-foreground">
          {pomodoroIntro(settings)}
        </p>
      )}
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3">
        <span id={alarmLabelId} className="text-[15px] leading-5.5 text-foreground">
          {kind === "timer" ? t("roomTimerSheet.alarm.timer") : t("roomTimerSheet.alarm.pomodoro")}
        </span>
        <Switch
          checked={timer.soundOn}
          onCheckedChange={timer.setSoundOn}
          aria-labelledby={alarmLabelId}
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-13 w-26 shrink-0 rounded-lg bg-(--session-dialog-cancel-bg) text-base leading-5 font-bold text-foreground transition-opacity duration-200 active:opacity-80 motion-reduce:transition-none"
        >
          {t("common:actions.cancel")}
        </button>
        <button
          type="button"
          disabled={timer.primaryDisabled}
          onClick={onStart}
          className="h-13 min-w-0 flex-1 truncate rounded-lg bg-primary px-3 text-base leading-5 font-bold text-primary-foreground transition-opacity duration-200 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none"
        >
          {timerStartLabel(kind, settings)}
        </button>
      </div>
    </div>
  );
}

/**
 * 기본과 뽀모도로 토글
 *
 * 시트 폭을 꽉 채우는 두 칸이고, 화살표 키로 고르는 라디오 묶음이다.
 * 칸 높이는 시안대로 두고 누르는 자리만 위아래로 넓혀 44px을 넘긴다.
 */
function KindToggle({
  kind,
  locked,
  onChange,
}: {
  kind: ModeKind;
  /** 진행 중인 모드는 다른 모드로 바꿀 수 없다. */
  locked: boolean;
  onChange: (kind: ModeKind) => void;
}) {
  const { t } = useTranslation("live-room");
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const choose = (index: number) => {
    const option = KIND_OPTIONS[index];
    if (option === undefined || (locked && option.value !== kind)) {
      return;
    }
    onChange(option.value);
    radios.current[index]?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = KIND_OPTIONS.findIndex((option) => option.value === kind);
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    choose((current + step + KIND_OPTIONS.length) % KIND_OPTIONS.length);
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("roomTimerSheet.aria.kind")}
      onKeyDown={handleKeyDown}
      className="grid shrink-0 grid-cols-2 rounded-full bg-(--session-sheet-surface) p-0.75"
    >
      {KIND_OPTIONS.map((option, index) => {
        const checked = option.value === kind;
        return (
          <button
            key={option.value}
            ref={(node) => {
              radios.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={locked && !checked}
            onClick={() => choose(index)}
            className={cn(
              "relative h-10 rounded-full text-[15px] leading-5 transition-colors duration-200 before:absolute before:inset-x-0 before:-inset-y-0.75 before:content-[''] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none",
              checked
                ? "bg-(--session-dialog-cancel-bg) font-bold text-white"
                : "font-semibold text-white/55",
            )}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
