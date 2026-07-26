import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 하단 토스트 — 2026-07-26 6차 인터뷰에서 확정된 신규 컴포넌트.
 *
 * ⚠️ 문구는 voice-tone.md에 확정돼 있으나 **시각 스펙(위치·배경·지속시간·모션)이 Figma에 없다.**
 * 하단 중앙·글래스 다크·3초로 두되, 스펙이 확정되면 이 파일만 교체하면 되게 단일 컴포넌트로 둔다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const toastVariants = cva(
  "rounded-full border border-white/10 px-4 py-2 text-center text-[13px] leading-[20px] text-white shadow-lg backdrop-blur-[7px]",
  {
    variants: {
      tone: {
        session: "bg-[var(--session-toast-bg)]",
      },
    },
    defaultVariants: { tone: "session" },
  },
);

export interface ToastProps extends VariantProps<typeof toastVariants> {
  message: string;
  className?: string;
}

export function Toast({ message, tone, className }: ToastProps) {
  return (
    <div role="status" aria-live="polite" className={cn(toastVariants({ tone }), className)}>
      {message}
    </div>
  );
}
