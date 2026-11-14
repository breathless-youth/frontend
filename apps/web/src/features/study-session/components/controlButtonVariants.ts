import { cva } from "class-variance-authority";

/** 세션 유리 버튼 바탕. 카메라 위에서도 버튼 경계가 보이게 흐림과 안쪽 하이라이트를 함께 쓴다. */
const GLASS =
  "pointer-events-auto border border-(--session-btn-default-border) bg-(--session-bar-glass-bg) shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]";

/**
 * 앱 glass 버튼 아이콘의 크기 비율
 *
 * SF Symbol은 같은 포인트 크기의 웹 아이콘보다 획이 굵고 넓어서 측정한 웹 아이콘 폭을 그대로 쓰면 원을 꽉 채운다.
 */
export const SESSION_SYMBOL_SCALE = 0.82;

export const controlButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,scale] duration-200 active:scale-95 active:opacity-80 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      /**
       * 유리 버튼은 세션 전용 테마 변수를 읽는다.
       * 세션 루트가 `theme-dark`라 항상 다크 값이다.
       */
      variant: {
        default: `${GLASS} text-(--session-btn-default-fg)`,
        resume: "pointer-events-auto bg-(--session-control-resume-bg) text-primary-foreground",
        /** 하단 바의 일시정지. 흰 원에 어두운 아이콘이다. */
        pause: "pointer-events-auto bg-white text-(--session-camera-base)",
        /** 하단 바의 종료. 빨간 원에 흰 아이콘이다. */
        stop: "pointer-events-auto bg-(--session-control-exit-bg) text-white",
        /** 심플 모드의 일시정지. 흰 원 대신 반투명 흰 유리 원이다(v3 시안 18i·31a). */
        pauseMuted: "pointer-events-auto bg-white/14 text-white/90",
        /** 심플 모드의 종료. 빨강 없이 일시정지와 같은 유리 원이다(v3 시안 18i·31a). */
        stopMuted: "pointer-events-auto bg-white/14 text-white/85",
      },
      /**
       * 하단의 일시정지·나가기는 공부를 멈추고 끝내는 주 조작이라 오른쪽 부가 버튼보다 한 단계 크게 둔다.
       */
      size: {
        default: "size-13.5 regular:size-16 short-side-lg:size-20",
        primary: "size-15 regular:size-18 short-side-lg:size-22",
        /** 싱글룸 하단 바의 두 버튼 */
        bar: "size-13 regular:size-15 short-side-lg:size-18",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
