import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 세션 상단 중앙 상태 필 (Figma `Session / Status Pill` 34:14).
 *
 * S3-1(집중)·S3-2(비집중)는 별개 화면이 아니라 이 컴포넌트의 두 state다.
 * 서브 문구는 필 **바깥 아래**에 렌더한다(Figma 구조 그대로 — 필 안이 아니다).
 *
 * 접근성: 색만으로 상태를 전달하지 않는다(항상 도트 + 문구). 자동 감지로 상태가 바뀌므로
 * `role="status"` + `aria-live="polite"`로 스크린리더에 알린다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const sessionStatusPillVariants = cva(
  "inline-flex items-center gap-2 rounded-full border px-4 py-[9px] backdrop-blur-[5px]",
  {
    variants: {
      state: {
        focus: "border-white/12 bg-[var(--session-pill-bg)]",
        distract:
          "border-[var(--session-pill-border-distract)] bg-[var(--session-pill-bg-distract)]",
        /** TODO(WG2): 일시정지 프레젠테이션(S3-3)은 WG2가 채운다 — variant 자리만 만들어 둔다. */
        paused: "border-white/14 bg-[var(--session-pill-bg)]",
      },
    },
    defaultVariants: { state: "focus" },
  },
);

const dotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    state: {
      focus: "bg-state-focus",
      distract: "bg-state-distract",
      paused: "bg-text-tertiary",
    },
  },
  defaultVariants: { state: "focus" },
});

export type SessionStatusPillState = NonNullable<
  VariantProps<typeof sessionStatusPillVariants>["state"]
>;

export interface SessionStatusPillProps {
  state: SessionStatusPillState;
  label: string;
  subLabel?: string;
  className?: string;
}

export function SessionStatusPill({ state, label, subLabel, className }: SessionStatusPillProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-2", className)}
      role="status"
      aria-live="polite"
    >
      <div className={sessionStatusPillVariants({ state })}>
        <span className={dotVariants({ state })} aria-hidden="true" />
        {/* 폰트 확대에서 잘리지 않도록 폭을 고정하지 않는다 — Figma의 120/218px은 결과값이다. */}
        <span className="text-[14px] leading-[18px] font-medium text-white">{label}</span>
      </div>
      {subLabel !== undefined && (
        <p className="text-center text-[12px] leading-[14px] text-white/60">{subLabel}</p>
      )}
    </div>
  );
}
