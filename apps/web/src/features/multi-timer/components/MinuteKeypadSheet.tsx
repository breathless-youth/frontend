import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

import { clampBreakMin, clampFocusMin } from "../multiTimerSettings";

type KeypadKind = "focus" | "break";

const MAX_DIGITS = 3;
const BACKSPACE = "back";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", null, "0", BACKSPACE] as const;

const KIND_COPY: Record<
  KeypadKind,
  { title: string; range: string; clamp: (minutes: number) => number }
> = {
  focus: { title: "집중 시간", range: "1–180분", clamp: clampFocusMin },
  break: { title: "휴식 시간", range: "1–60분", clamp: clampBreakMin },
};

/** 앞자리 0은 값을 바꾸지 않아 버린다. */
function appendDigit(digits: string, digit: string): string {
  if (digits.length >= MAX_DIGITS) return digits;
  if (digits === "" && digit === "0") return digits;
  return digits + digit;
}

const KEY_CLASS =
  "flex h-12.5 items-center justify-center rounded-md bg-bg-layer-2 text-[22px] font-semibold text-foreground tabular-nums transition-[scale,opacity] duration-150 ease-out active:scale-[0.97] active:opacity-85 motion-reduce:transition-none motion-reduce:active:scale-100";

function KeypadBody({
  kind,
  current,
  onApply,
  onClose,
}: {
  kind: KeypadKind;
  current: number;
  onApply: (minutes: number) => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState("");
  const copy = KIND_COPY[kind];
  const typed = digits !== "";

  const apply = () => {
    const value = Number(digits);
    if (value > 0) onApply(copy.clamp(value));
    onClose();
  };

  return (
    <>
      <div className="flex items-baseline justify-between pt-3.5">
        <DrawerTitle className="text-[17px] leading-6.5 font-bold text-foreground">
          {copy.title}
        </DrawerTitle>
        <span className="text-[13px] leading-5 text-text-tertiary">{copy.range}</span>
      </div>

      <div
        aria-live="polite"
        className="mt-3.5 flex h-16 items-center justify-center gap-1.5 rounded-[14px] bg-background inset-ring-2 inset-ring-primary"
      >
        <span
          className={cn(
            "text-[34px] leading-10 font-bold tabular-nums",
            typed ? "text-foreground" : "text-text-tertiary",
          )}
        >
          {typed ? digits : current}
        </span>
        <span className="text-[17px] leading-6.5 font-semibold text-muted-foreground">분</span>
      </div>

      {/* iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려져서 시트 안 버튼은 끌기에서 뺀다. */}
      <div data-base-ui-swipe-ignore="" className="mt-3.5 grid grid-cols-3 gap-2">
        {KEYS.map((key) => {
          if (key === null) return <span key="empty" aria-hidden="true" />;
          if (key === BACKSPACE) {
            return (
              <button
                key={key}
                type="button"
                aria-label="지우기"
                onClick={() => setDigits((prev) => prev.slice(0, -1))}
                className={KEY_CLASS}
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDigits((prev) => appendDigit(prev, key))}
              className={KEY_CLASS}
            >
              {key}
            </button>
          );
        })}
      </div>

      <div data-base-ui-swipe-ignore="" className="mt-3.5">
        <Button size="xl" className="w-full" onClick={apply}>
          확인
        </Button>
      </div>
    </>
  );
}

/**
 * 분 키패드 시트
 *
 * 다이얼로 맞추기 번거로운 큰 값을 숫자로 바로 넣는다.
 * 비우거나 0만 넣고 확인하면 값을 바꾸지 않고 닫는다.
 * 세션 화면의 CSS 변수가 풀리도록 포털을 세션 영역 안에 둔다.
 */
export function MinuteKeypadSheet({
  open,
  kind,
  current,
  container,
  onApply,
  onOpenChange,
}: {
  open: boolean;
  kind: KeypadKind;
  current: number;
  container: HTMLElement | null;
  onApply: (minutes: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={(next) => onOpenChange(next)}>
      {/* 터치로 연 시트에 포커스 링이 남지 않게 첫 키로 포커스를 옮기지 않는다. */}
      <DrawerContent container={container} initialFocus={false} finalFocus={false}>
        {/* 칸이 바뀌면 입력하던 숫자를 버린다.
            닫힌 시트는 내용이 내려가 다음에 열 때 비어 있다. */}
        <KeypadBody
          key={kind}
          kind={kind}
          current={current}
          onApply={onApply}
          onClose={() => onOpenChange(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}
