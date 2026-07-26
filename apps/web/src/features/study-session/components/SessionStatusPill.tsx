import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 세션 상단 중앙 상태 필 (Figma `Session / Status Pill` 34:14).
 *
 * S3-1(집중)·S3-2(비집중)·S3-3(일시정지)는 별개 화면이 아니라 이 컴포넌트의 세 state다.
 * 서브 문구는 필 **바깥 아래**에 렌더한다(Figma 구조 그대로 — 필 안이 아니다).
 *
 * **심플 모드(S3-4)에서도 이 필은 그대로 유지된다** — 상태를 색만으로 전달하지 않기 위한
 * 유일한 텍스트 경로이기 때문이다(SCR-S3-3·S3-4 Accessibility).
 *
 * 전환은 색만 200ms 크로스페이드하고 폭/여백은 건드리지 않는다 — 문구 길이가 바뀌어도
 * 레이아웃 시프트 없이 좌우로 균등 확장된다(Figma Spec 페이지 `14:7` 실측).
 *
 * 접근성: 색만으로 상태를 전달하지 않는다(항상 도트 + 문구). 자동 감지로 상태가 바뀌므로
 * `role="status"` + `aria-live="polite"`로 스크린리더에 알린다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const sessionStatusPillVariants = cva(
  "inline-flex items-center gap-2 rounded-full border px-4 py-[9px] backdrop-blur-[5px] transition-colors duration-200 motion-reduce:transition-none",
  {
    variants: {
      state: {
        focus: "border-white/12 bg-[var(--session-pill-bg)]",
        distract:
          "border-[var(--session-pill-border-distract)] bg-[var(--session-pill-bg-distract)]",
        /** S3-3 일시정지 — 그레이 도트 + white 14% 보더(Figma `Session / Status Pill` Paused 34:13). */
        paused: "border-white/14 bg-[var(--session-pill-bg-paused)]",
      },
    },
    defaultVariants: { state: "focus" },
  },
);

const dotVariants = cva(
  "size-2 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none",
  {
    variants: {
      state: {
        focus: "bg-state-focus",
        distract: "bg-state-distract",
        paused: "bg-text-tertiary",
      },
    },
    defaultVariants: { state: "focus" },
  },
);

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
