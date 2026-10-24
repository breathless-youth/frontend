import type { ReactNode, Ref } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { CloseIcon } from "../icons";
import type { ModeKind } from "../multiTimerMachine";
import type { ModePrimaryLabel } from "../useMultiTimer";

const MODE_TITLE: Record<ModeKind, string> = { timer: "타이머", pomodoro: "뽀모도로" };

export interface MultiTimerScreenProps {
  open: boolean;
  kind: ModeKind;
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
  primaryTone: "primary" | "secondary";
  primaryDisabled: boolean;
  onPrimary: () => void;
  showRestart: boolean;
  onRestart: () => void;
  /**
   * 화면 본체를 받을 ref
   *
   * 본문 안의 시트는 이 요소를 포털 자리로 써야 한다.
   * 모달 바깥에 그린 시트는 Radix가 바깥 누름과 포커스를 막아 누를 수 없다.
   */
  contentRef?: Ref<HTMLDivElement>;
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
  container,
  returnFocus,
  onClose,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  onPrimary,
  showRestart,
  onRestart,
  contentRef,
  children,
}: MultiTimerScreenProps) {
  const title = MODE_TITLE[kind];
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        ref={contentRef}
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
              aria-label={`${title} 끄기`}
              className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-muted-foreground transition-[scale,opacity] duration-150 ease-out outline-none before:absolute before:-inset-1 focus-visible:ring-2 focus-visible:ring-(--state-focus) active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <CloseIcon className="size-3.25" />
            </SheetClose>
            <SheetTitle className="text-[17px] leading-5.25 font-bold tracking-normal text-foreground">
              {title}
            </SheetTitle>
            <span aria-hidden="true" className="size-9 shrink-0" />
          </div>
        </div>

        {/* 태블릿에서도 휠과 다이얼이 휴대폰 폭으로 보이게 열을 가운데 둔다. */}
        <div className="mx-auto flex min-h-0 w-full max-w-100.5 flex-1 flex-col px-5 pt-3.75 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          {/* 다이얼이 높아서 키 작은 휴대폰에서는 본문만 스크롤하고 큰 버튼은 아래에 남긴다.
              세로 스크롤만 켜도 가로가 함께 열려서, 본문이 옆으로 끌리지 않게 가로는 막는다. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {children}
          </div>
          <Button
            variant={primaryTone === "primary" ? "default" : "secondary"}
            disabled={primaryDisabled}
            onClick={onPrimary}
            className="mt-3 h-14 w-full shrink-0 rounded-xl px-6 text-[17px] leading-5.25 font-bold disabled:opacity-40"
          >
            {primaryLabel}
          </Button>
          {showRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="mt-1.5 h-11 shrink-0 text-sm font-semibold text-text-tertiary transition-opacity duration-150 ease-out active:opacity-70 motion-reduce:transition-none"
            >
              처음부터
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
