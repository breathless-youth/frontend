import { ChevronLeft } from "lucide-react";
import { createContext, use, type ReactNode } from "react";

import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CtaToaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import { isTextEntry } from "../useLandscapeLayout";

export interface SessionPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 포털 자리. `--session-*` 변수가 풀리도록 세션 `main`을 넘긴다. */
  container: HTMLElement | null;
  /** 닫힌 뒤 포커스를 돌려줄 요소. Radix는 Trigger를 쓸 때만 스스로 되돌린다. */
  returnFocus: () => HTMLElement | null;
  title: string;
  headerExtras?: ReactNode;
  landscape: boolean;
  children: ReactNode;
}

/**
 * 페이지가 열려 있는가
 *
 * 닫히며 밀려 나가는 동안에도 내용은 남아 있어서, 푸터의 Toaster는 마운트 여부가 아니라 이 값으로 거둔다.
 * 닫는 순간 세션 화면의 Toaster가 다시 마운트되므로 둘이 함께 있는 때가 없다.
 */
const SessionPageOpenContext = createContext(false);

/**
 * 세션 위에 겹치는 전체 페이지
 *
 * 라우트를 바꾸면 세션이 언마운트되어 카메라와 측정이 멈추므로 같은 화면 위의 모달로 연다.
 * 바탕이 불투명해서 열린 동안 뒤의 세션 화면을 따로 숨기지 않고, 닫히며 밀려 나갈 때 실제 세션 화면이 드러난다.
 */
export function SessionPage({
  open,
  onOpenChange,
  container,
  returnFocus,
  title,
  headerExtras,
  landscape,
  children,
}: SessionPageProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        container={container}
        overlayClassName="bg-transparent"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus()?.focus();
        }}
        // Radix는 Escape를 문서 캡처 단계에서 받아서 이름 편집을 취소하려던 Escape가 페이지까지 닫는다.
        onEscapeKeyDown={(event) => {
          if (isTextEntry(event.target)) event.preventDefault();
        }}
        // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 페이지 안 탭이 씹힌다.
        onTouchMove={(event) => event.stopPropagation()}
        // touch-manipulation은 웹뷰의 더블탭 줌 인식기가 빠른 연속 탭을 삼키지 않게 한다.
        className={cn(
          "flex w-full touch-manipulation flex-col border-0 bg-(--session-dialog-bg) p-0 text-white shadow-none sm:max-w-none",
          landscape
            ? "gap-2 pr-[calc(env(safe-area-inset-right)+16px)] landscape-compact:pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pl-[calc(env(safe-area-inset-left)+16px)] regular:px-6 short-side-lg:px-8"
            : "page-column",
        )}
      >
        <div className="flex h-[calc(52px+env(safe-area-inset-top))] shrink-0 items-center px-1 pt-[env(safe-area-inset-top)]">
          <SessionPageBackButton label="뒤로 가기" />
          <SheetTitle className="truncate text-[17px] leading-5.25 font-bold tracking-normal text-(--session-dialog-title)">
            {title}
          </SheetTitle>
          {headerExtras}
        </div>
        <SessionPageOpenContext value={open}>{children}</SessionPageOpenContext>
      </SheetContent>
    </Sheet>
  );
}

/**
 * 세션 위 페이지의 왼쪽 위 뒤로 가기 버튼
 *
 * 배경음·과목 페이지와 타이머 화면이 같은 모양을 쓴다.
 * 타이머 화면은 이 버튼이 모드를 끄는 길이라 이름을 따로 받는다.
 */
export function SessionPageBackButton({ label, className }: { label: string; className?: string }) {
  return (
    <SheetClose
      aria-label={label}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
        className,
      )}
    >
      <ChevronLeft size={16} aria-hidden="true" />
    </SheetClose>
  );
}

export interface SessionPageFooterProps {
  landscape: boolean;
  /** 세로에서 타이머 위에 따로 두는 고정 줄. 패딩은 호출부가 정한다. */
  actions?: ReactNode;
  /** 타이머와 같은 줄의 왼쪽. */
  leading?: ReactNode;
  timer: ReactNode;
}

/**
 * 페이지 아래 고정 영역
 *
 * 토스트는 모달보다 아래 층이라 페이지가 열린 동안에는 이 영역 위에 따로 띄운다.
 * 세로는 홈 인디케이터를 비켜 아래 여백에 안전 영역을 더하고, 가로는 페이지가 여백을 맡는다.
 */
export function SessionPageFooter({ landscape, actions, leading, timer }: SessionPageFooterProps) {
  const open = use(SessionPageOpenContext);
  return (
    <div className="relative shrink-0">
      {open && <CtaToaster />}
      {!landscape && actions}
      <div
        className={cn(
          "flex justify-between gap-3",
          landscape
            ? "min-h-11 items-end"
            : "items-center pt-2 pr-5 pb-[calc(env(safe-area-inset-bottom)+8px)] pl-6",
        )}
      >
        {leading}
        <div className="ml-auto">{timer}</div>
      </div>
    </div>
  );
}
