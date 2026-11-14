import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { timerStartLabel } from "@/features/live-room/roomTimerCopy";
import { AlarmSoundToggle } from "@/features/multi-timer/components/AlarmSoundToggle";
import { TimerWheel } from "@/features/multi-timer/components/TimerWheel";
import type { MultiTimerControls } from "@/features/multi-timer/useMultiTimer";
import { haptic } from "@/lib/haptics";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

const SHEET_DIM = "bg-(--session-dim)/40";

export interface SessionTimerSheetProps {
  open: boolean;
  /** 가로에서는 아래 시트 대신 오른쪽 패널로 연다. */
  landscape: boolean;
  /** 포털 자리이고 세션 색 변수를 받으려면 세션 화면을 넘긴다. */
  container: HTMLElement | null;
  timer: MultiTimerControls;
  onClose: () => void;
}

/**
 * 싱글룸 타이머 시간 고르기 시트
 *
 * 휠로 고른 시간은 시작을 누를 때까지 시트 안에만 둔다.
 * 시작하면 돌던 타이머는 처음으로 돌려, 돌던 스톱워치는 끄고 고른 시간으로 시작한 뒤 시트를 닫는다.
 * 시작 전에 닫으면 타이머를 끄고, 이미 도는 타이머나 스톱워치는 그대로 두고 시트만 닫는다.
 * 가로에서는 오른쪽 패널, 세로에서는 화면 절반 높이의 아래 시트로 연다.
 */
export function SessionTimerSheet({
  open,
  landscape,
  container,
  timer,
  onClose,
}: SessionTimerSheetProps) {
  const { t } = useTranslation(["study-session", "common"]);
  const focusRestore = useDialogFocusRestore();
  const settings = timer.mode?.settings;
  const [draftSec, setDraftSec] = useState(settings?.timerSec ?? 0);
  // 열릴 때마다 지금 설정에서 다시 시작한다. 이전에 고르다 닫은 값은 남기지 않는다.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open && settings !== undefined) setDraftSec(settings.timerSec);
  }

  const cancel = () => {
    if (timer.mode?.status === "setup") timer.close();
    onClose();
  };
  const start = () => {
    // 스톱워치가 돌고 있었으면 끄고 타이머로 바꾼다. 돌던 타이머는 처음으로 돌려 새 시간으로 다시 시작한다.
    if (timer.mode?.kind !== "timer") {
      timer.close();
      timer.open("timer");
    } else if (timer.mode.status !== "setup") {
      timer.restart();
    }
    timer.changeSettings({ timerSec: draftSec });
    timer.pressPrimary();
    haptic("medium");
    onClose();
  };
  const handleOpenChange = (next: boolean) => {
    if (!next && open) cancel();
  };

  const body = settings !== undefined && (
    <div data-base-ui-swipe-ignore="" className="flex min-h-0 flex-1 flex-col gap-4 pt-2.5">
      {/* 휠은 원래 크기로는 이 높이에 들어가지 않아 줄여 그린다.
          휠은 끌 때 그려진 높이로 환산해서 줄여도 손가락을 그대로 따라간다. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="w-87 shrink-0 scale-75 regular:scale-100">
          <TimerWheel valueSec={draftSec} onChange={setDraftSec} />
        </div>
      </div>
      <AlarmSoundToggle
        soundOn={timer.soundOn}
        onChangeSoundOn={timer.setSoundOn}
        inline
        className="min-h-11 shrink-0 justify-end"
      />
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={cancel}
          className="h-13 w-26 shrink-0 rounded-lg bg-(--session-dialog-cancel-bg) text-base leading-5 font-bold text-foreground transition-opacity duration-200 active:opacity-80 motion-reduce:transition-none"
        >
          {t("actions.cancel", { ns: "common" })}
        </button>
        <button
          type="button"
          disabled={draftSec <= 0}
          onClick={start}
          className="h-13 min-w-0 flex-1 truncate rounded-lg bg-primary px-3 text-base leading-5 font-bold text-primary-foreground transition-opacity duration-200 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none"
        >
          {timerStartLabel("timer", { ...settings, timerSec: draftSec })}
        </button>
      </div>
    </div>
  );

  if (landscape) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          container={container}
          overlayClassName={SHEET_DIM}
          aria-describedby={undefined}
          onOpenAutoFocus={focusRestore.onOpenAutoFocus}
          onCloseAutoFocus={focusRestore.onCloseAutoFocus}
          // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 패널 안 탭이 씹힌다.
          onTouchMove={(event) => event.stopPropagation()}
          className="flex w-100 max-w-full touch-manipulation flex-col rounded-l-3xl border-0 bg-background pt-[calc(env(safe-area-inset-top)+20px)] pr-[calc(env(safe-area-inset-right)+20px)] pb-[calc(env(safe-area-inset-bottom)+20px)] pl-6 text-foreground sm:max-w-none"
        >
          <SheetTitle className="sr-only">{t("timerSheet.title")}</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        container={container}
        backdropClassName={SHEET_DIM}
        className="flex h-[50dvh] touch-manipulation flex-col bg-background"
      >
        <DrawerTitle className="sr-only">{t("timerSheet.title")}</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
