import type { ReactNode } from "react";
import { Pause, Play, X } from "lucide-react";

import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import {
  CONTROL_ICON_SIZE,
  ControlButton,
  ICON_POP_CLASS,
} from "@/features/study-session/components/SessionControlButtons";
import { cn } from "@/lib/utils";

import { CloseIcon } from "../icons";
import type { ModeKind } from "../multiTimerMachine";
import type { ModePrimaryLabel } from "../useMultiTimer";

const KIND_OPTIONS = [
  { value: "timer", label: "기본" },
  { value: "pomodoro", label: "뽀모도로" },
] as const;

export interface MultiTimerScreenProps {
  open: boolean;
  kind: ModeKind;
  kindLocked: boolean;
  onSwitchKind: (kind: ModeKind) => void;
  /**
   * 포털 자리
   *
   * `--session-*` 변수가 풀리도록 세션 `main`을 넘긴다.
   */
  container: HTMLElement | null;
  /**
   * 닫힌 뒤 포커스를 돌려줄 요소
   *
   * Radix는 Trigger를 쓸 때만 스스로 되돌린다.
   */
  returnFocus: () => HTMLElement | null;
  onClose: () => void;
  primaryLabel: ModePrimaryLabel;
  primaryDisabled: boolean;
  onPrimary: () => void;
  restartDisabled: boolean;
  onRestart: () => void;
  children: ReactNode;
}

/**
 * 세션 위를 덮는 타이머·뽀모도로 모드 화면
 *
 * 라우트를 바꾸면 세션이 언마운트되어 카메라와 측정이 멈추므로 같은 화면 위의 모달로 연다.
 * 진행 중인 모드를 확인 없이 끄는 길은 ✕ 하나뿐이라 Escape와 바깥 누름으로는 닫지 않는다.
 */
export function MultiTimerScreen({
  open,
  kind,
  kindLocked,
  onSwitchKind,
  container,
  returnFocus,
  onClose,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  restartDisabled,
  onRestart,
  children,
}: MultiTimerScreenProps) {
  const running = primaryLabel === "일시정지";
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        container={container}
        overlayClassName="bg-transparent"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus()?.focus();
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 화면 안 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        // touch-manipulation은 웹뷰의 더블탭 줌 인식기가 빠른 연속 탭을 삼키지 않게 한다.
        className="flex w-full touch-manipulation flex-col border-0 bg-background p-0 text-foreground shadow-none sm:max-w-none"
      >
        <div className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+6px)]">
          <div className="flex min-h-11 items-center justify-between">
            <SheetClose
              aria-label="타이머 끄기"
              className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-muted-foreground transition-[scale,opacity] duration-150 ease-out outline-none before:absolute before:-inset-1 focus-visible:ring-2 focus-visible:ring-(--state-focus) active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <CloseIcon className="size-3.25" />
            </SheetClose>
            <SheetTitle className="text-[17px] leading-5.25 font-bold tracking-normal text-foreground">
              타이머
            </SheetTitle>
            <span aria-hidden="true" className="size-9 shrink-0" />
          </div>
        </div>

        {/* 태블릿에서도 휠과 다이얼이 휴대폰 폭으로 보이게 열을 가운데 둔다. */}
        <div className="mx-auto flex min-h-0 w-full max-w-100.5 flex-1 flex-col px-5 pt-3.75 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          {/* 시트 안 컨트롤은 앱 부품으로 등록하지 않아 웹으로만 그린다.
              세션 화면에는 트랙 색이 없어서 다크 카드 면과 한 단 밝은 면으로 트랙과 고른 칸을 나눈다. */}
          <SegmentedControl
            ariaLabel="타이머 종류"
            value={kind}
            // 진행 중에도 지금 모드는 또렷이 보이도록 다른 칸만 막는다.
            options={KIND_OPTIONS.map((option) => ({
              ...option,
              disabled: kindLocked && option.value !== kind,
            }))}
            onChange={onSwitchKind}
            nativeControlId={null}
            className="mb-4 flex w-full shrink-0 bg-muted"
            triggerClassName="flex-1 justify-center data-[state=active]:bg-bg-layer-2"
          />
          {/* 다이얼이 높아서 키 작은 휴대폰에서는 본문만 스크롤하고 큰 버튼은 아래에 남긴다.
              세로 스크롤만 켜도 가로가 함께 열려서, 본문이 옆으로 끌리지 않게 가로는 막는다. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {children}
          </div>
          {/* 세션 화면 하단과 같은 둥근 버튼 두 개를 양 끝에 둔다.
              시트 안 컨트롤이라 앱 부품으로 등록하지 않고 웹으로만 그린다. */}
          <div className="mt-3 flex shrink-0 items-center justify-between">
            <ControlButton
              label={primaryLabel}
              icon={
                running ? (
                  <Pause
                    key="pause"
                    data-testid="icon-pause"
                    aria-hidden="true"
                    fill="currentColor"
                    className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
                  />
                ) : (
                  <Play
                    key="play"
                    data-testid="icon-play"
                    aria-hidden="true"
                    fill="currentColor"
                    className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
                  />
                )
              }
              onClick={onPrimary}
              variant={running ? "default" : "resume"}
              disabled={primaryDisabled}
            />
            <ControlButton
              label="처음부터"
              icon={<X aria-hidden="true" className={CONTROL_ICON_SIZE} />}
              onClick={onRestart}
              disabled={restartDisabled}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
