import { cva } from "class-variance-authority";

export const controlButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,scale] duration-200 active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      /** 기본 버튼(일시정지/카메라 전환)만 테마 변수를 읽는다 — 세션 루트가 `theme-dark`라 항상 다크 값이다. */
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
