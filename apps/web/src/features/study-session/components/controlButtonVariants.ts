import { cva } from "class-variance-authority";

/** 세션 유리 버튼 바탕. 카메라 위에서도 버튼 경계가 보이게 흐림과 안쪽 하이라이트를 함께 쓴다. */
const GLASS =
  "pointer-events-auto border border-(--session-btn-default-border) bg-(--session-bar-glass-bg) shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]";

export const controlButtonVariants = cva(
  "flex size-13.5 shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,scale] duration-200 active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100 regular:size-16 short-side-lg:size-20",
  {
    variants: {
      /**
       * 유리 버튼은 세션 전용 테마 변수를 읽는다.
       * 세션 루트가 `theme-dark`라 항상 다크 값이다.
       */
      variant: {
        default: `${GLASS} text-(--session-btn-default-fg)`,
        resume: "pointer-events-auto bg-(--session-control-resume-bg) text-primary-foreground",
        exit: `${GLASS} text-(--session-control-exit-bg)`,
      },
    },
    defaultVariants: { variant: "default" },
  },
);
