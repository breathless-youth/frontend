import type { ReactNode } from "react";
import { Pause, Play, X } from "lucide-react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import { SessionPageBackButton } from "@/features/study-session/components/SessionPage";
import {
  CONTROL_ICON_SIZE,
  ControlButton,
  ICON_POP_CLASS,
} from "@/features/study-session/components/SessionControlButtons";
import { cn } from "@/lib/utils";

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
 * 진행 중인 모드를 확인 없이 끄는 길은 왼쪽 위 뒤로 가기 버튼 하나뿐이라 Escape와 바깥 누름으로는 닫지 않는다.
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
        {/* 폰 가로에서는 머리 줄이 높이를 차지하지 않도록 본문 위에 띄워 끄기 버튼은 왼쪽 위, 토글은 오른쪽 위 구석에 둔다.
            가운데 다이얼이 머리 줄 높이까지 올라오므로 빈 곳의 터치는 아래로 흘려보낸다. */}
        <div className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+6px)] landscape-compact:pointer-events-none landscape-compact:absolute landscape-compact:inset-x-0 landscape-compact:top-0 landscape-compact:z-10 landscape-compact:pr-[calc(env(safe-area-inset-right)+16px)] landscape-compact:pl-[calc(env(safe-area-inset-left)+16px)]">
          {/* 토글이 지금 모드를 보여 주어 제목은 화면 낭독기에만 남긴다. */}
          <SheetTitle className="sr-only">타이머</SheetTitle>
          <div className="flex min-h-11 items-center justify-between">
            {/* 아래 처음부터 버튼과 헷갈리지 않게 배경음·과목 페이지와 같은 뒤로 가기 모양을 쓴다.
                자리도 그 페이지들의 버튼과 맞춘다. */}
            <SessionPageBackButton
              label="타이머 끄기"
              className="pointer-events-auto -ml-4 landscape-compact:ml-1"
            />
            {/* 시트 안 컨트롤은 앱 부품으로 등록하지 않아 웹으로만 그린다.
                세션 화면에는 트랙 색이 없어서 다크 카드 면과 한 단 밝은 면으로 트랙과 고른 칸을 나눈다.
                폭을 고정해 좁은 폰에서도 왼쪽 끄기 버튼과 겹치지 않고, 옆 구역이 좁은 폰 가로에서는 한 단계 줄인다. */}
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
              className="pointer-events-auto flex w-50 bg-muted landscape-compact:w-40"
              triggerClassName="flex-1 justify-center data-[state=active]:bg-bg-layer-2"
            />
            <span aria-hidden="true" className="-mr-4 size-11 shrink-0 landscape-compact:hidden" />
          </div>
        </div>

        {/* 태블릿에서도 휠과 다이얼이 휴대폰 폭으로 보이게 열을 가운데 둔다.
            폰 가로에서는 같은 요소들을 3×3 그리드에 다시 놓아 회전해도 고른 칸과 휠이 그대로 남는다.
            가운데 칸은 두 모드가 함께 쓰는 정사각형 무대라서, 무대 아래 양 모서리에 붙인 두 버튼이 모드를 바꿔도 움직이지 않는다.
            무대 크기는 위아래 여백 8px씩을 뺀 화면 높이와, 양쪽에서 여백 16px, 칸 168px, 간격 8px씩을 뺀 화면 폭 중 작은 값이다. */}
        <div className="mx-auto flex min-h-0 w-full max-w-100.5 flex-1 flex-col px-5 pt-3.75 pb-[calc(env(safe-area-inset-bottom)+20px)] landscape-compact:grid landscape-compact:max-w-none landscape-compact:[--timer-stage:min(370px,calc(100svh-16px-env(safe-area-inset-top)-env(safe-area-inset-bottom)),calc(100vw-384px-env(safe-area-inset-left)-env(safe-area-inset-right)))] landscape-compact:grid-cols-[1fr_var(--timer-stage)_1fr] landscape-compact:grid-rows-[1fr_var(--timer-stage)_1fr] landscape-compact:pt-[calc(env(safe-area-inset-top)+8px)] landscape-compact:pr-[calc(env(safe-area-inset-right)+16px)] landscape-compact:pb-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))] landscape-compact:pl-[calc(env(safe-area-inset-left)+16px)]">
          {/* 다이얼이 높아서 키 작은 휴대폰에서는 본문만 스크롤하고 큰 버튼은 아래에 남긴다.
              세로 스크롤만 켜도 가로가 함께 열려서, 본문이 옆으로 끌리지 않게 가로는 막는다. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto landscape-compact:contents">
            {children}
          </div>
          {/* 세션 화면 하단과 같은 둥근 버튼 두 개를 양 끝에 둔다.
              폰 가로에서는 무대의 왼쪽 아래와 오른쪽 아래 모서리에서 버튼 한 폭만큼 바깥으로 빼 다이얼 숫자와 휠 줄에 닿지 않게 하고, 위치를 가진 다이얼과 휠보다 위에 그린다.
              시트 안 컨트롤이라 앱 부품으로 등록하지 않고 웹으로만 그린다. */}
          <div className="mt-3 flex shrink-0 items-center justify-between landscape-compact:contents">
            <div className="landscape-compact:relative landscape-compact:z-10 landscape-compact:col-start-2 landscape-compact:row-start-2 landscape-compact:-translate-x-15 landscape-compact:self-end landscape-compact:justify-self-start">
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
            </div>
            <div className="landscape-compact:relative landscape-compact:z-10 landscape-compact:col-start-2 landscape-compact:row-start-2 landscape-compact:translate-x-15 landscape-compact:self-end landscape-compact:justify-self-end">
              <ControlButton
                label="처음부터"
                icon={<X aria-hidden="true" className={CONTROL_ICON_SIZE} />}
                onClick={onRestart}
                disabled={restartDisabled}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
