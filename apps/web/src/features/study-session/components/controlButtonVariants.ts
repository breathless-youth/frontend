import { cva } from "class-variance-authority";

export const controlButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,transform] duration-200 active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      /** 기본 버튼(일시정지/카메라 전환)만 라이트/다크를 따른다 — 재개·종료는 두 모드에서 색이 같다. */
      variant: {
        default:
          "border border-[var(--session-btn-default-border)] bg-[var(--session-btn-default-bg)] text-[var(--session-btn-default-fg)]",
        resume: "bg-[var(--session-control-resume-bg)] text-primary-foreground",
        exit: "bg-[var(--session-control-exit-bg)] text-primary-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
