import { type VariantProps, cva } from "class-variance-authority";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * 세션 위에 뜨는 확인 다이얼로그 (Figma `Dialog / Confirm` 40:104 · 화면 S3-7 `63:458`).
 *
 * ## 배치 — 반드시 세션 레이아웃 레이어의 **형제**로
 *
 * 이 컴포넌트는 스스로 `absolute inset-0` 전면 오버레이가 되고 `pointer-events-auto`를 직접
 * 갖는다. 호출부는 이것을 `RoomPage`의 `SESSION_LAYER_LAYOUT` div **안이 아니라 옆에** 놓아야
 * 한다 — 자식으로 넣으면 (1) 가로 그리드 자동 배치로 좌상단에 앉고 (2) row1 트랙이 커져 심플
 * 타이머가 밀리고 (3) 레이어의 `pointer-events-none`을 상속해 버튼이 클릭을 못 받는다
 * (qa-WG3 실측 재현, SCR-S3-5·S3-6 "WG4로의 인계").
 *
 * ## 항상 다크
 *
 * 카메라 위에 뜨는 오버레이라 **라이트/다크 테마를 따르지 않는다.** 색은 전부
 * `sessionTheme.ts`가 `<main>`에 주입한 `--session-dialog-*` 변수(= 토큰의 다크 값 고정)를 읽는다.
 * 같은 이유로 다크 SM 버튼 variant를 공용 `components/ui/button.tsx`에 올리지 않았다 —
 * 그 변수는 세션 서브트리 밖에 존재하지 않아 다른 화면에서 쓰면 색 없는 버튼이 된다.
 * 세션 밖에서도 쓰이는 날이 오면 그때 변수를 승격하고 함께 옮긴다.
 *
 * ## 접근성
 *
 * `role="alertdialog"` + `aria-modal` + 타이틀/본문 연결, **초기 포커스는 비파괴 버튼
 * (`계속하기`)**, 포커스 트랩, 닫힐 때 원래 요소로 포커스 복귀. 배경 세션 화면의 `inert`
 * 처리는 호출부가 담당한다(포커스 가능한 형제가 이 컴포넌트 밖에 있기 때문).
 *
 * 등장 모션은 넣지 않았다 — Figma에 정적 프레임만 있고 모션 스펙이 없다. 넣게 되면
 * `prefers-reduced-motion`에서 꺼야 한다(SCR-S3-7·S3-8 Accessibility).
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const dialogActionVariants = cva(
  // 136×48 r14 — 반경 14는 radius 스케일에 없는 Figma 실측값이라 12/16으로 반올림하지 않는다.
  // 폭은 고정하지 않고 flex로 나눈다: 330w 다이얼로그에서 정확히 136px이 되고, 더 좁은
  // 뷰포트에서는 최소 터치 타겟(높이 48)을 지키며 함께 줄어든다.
  "flex h-12 flex-1 items-center justify-center rounded-[14px] text-[15px] leading-[18px] font-semibold text-white transition-opacity duration-200 active:opacity-80 motion-reduce:transition-none",
  {
    variants: {
      tone: {
        /** 비파괴(`계속하기`) — Figma `Button / CTA` Dark Secondary SM. */
        cancel: "bg-[var(--session-dialog-cancel-bg)]",
        /** 종료(`공부 종료`) — Dark Primary SM. */
        confirm: "bg-[var(--session-dialog-confirm-bg)]",
      },
    },
    defaultVariants: { tone: "cancel" },
  },
);

export type SessionConfirmDialogTone = NonNullable<
  VariantProps<typeof dialogActionVariants>["tone"]
>;

export interface SessionConfirmDialogProps {
  title: string;
  description: string;
  /** 비파괴 액션 라벨. 초기 포커스가 여기에 놓인다. */
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}

const FOCUSABLE = "button:not([disabled])";

export function SessionConfirmDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  className,
}: SessionConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      // 세션이 그사이 끝나 종료 버튼이 사라졌을 수 있다 — 살아 있는 요소에만 되돌린다.
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // ⚠️ 디자인 미정(SCR-S3-7·S3-8 Interaction Contract). 종료는 되돌릴 수 없으므로
      // **비파괴 기본값**(= `계속하기`)으로 둔다. 이 경로로 세션을 끝내지 않는다.
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    // 포커스 트랩 — 배경은 호출부가 inert 처리하지만, 브라우저 크롬(주소창)으로 새어 나가는
    // 것까지 막으려면 양 끝에서 직접 감아 준다.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-0 flex items-center justify-center px-9",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {/* 딤 — 다이얼로그의 형제여야 다이얼로그가 딤 위에 온다. 탭하면 비파괴 닫힘(위 Escape와 같은
          미정 항목). 키보드·스크린리더에는 `계속하기` 버튼이 이미 같은 일을 하므로 여기서는
          숨긴다(같은 이름의 컨트롤이 두 번 읽히지 않게). */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-[var(--session-dim)]"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        // 폰트 확대에서 본문이 잘리지 않도록 높이를 고정하지 않는다 — 내용 기반으로 늘어난다.
        // 그림자는 Figma 실측값(그림자 토큰이 아직 없다).
        className="relative flex w-[330px] max-w-full flex-col gap-[18px] rounded-[20px] bg-[var(--session-dialog-bg)] p-6 shadow-[0_20px_50px_0_rgba(0,0,0,0.45)]"
      >
        <div className="flex flex-col gap-2">
          <p
            id={titleId}
            className="text-[18px] leading-[21px] font-bold text-[var(--session-dialog-title)]"
          >
            {title}
          </p>
          <p
            id={descriptionId}
            className="text-[14px] leading-[20px] text-[var(--session-dialog-body)]"
          >
            {description}
          </p>
        </div>
        <div className="flex gap-[10px]">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={dialogActionVariants({ tone: "cancel" })}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={dialogActionVariants({ tone: "confirm" })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
