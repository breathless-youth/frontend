import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 하단 토스트 — 2026-07-26 6차 인터뷰에서 확정된 신규 컴포넌트.
 *
 * ⚠️ 문구는 voice-tone.md에 확정돼 있으나 **위치·지속시간·모션 스펙은 여전히 Figma에 없다.**
 * 색만은 2026-08-24에 확정 — **라이트/다크 모두 "다크 알약 + 흰 글자"**를 쓴다.
 * 하단 중앙·글래스 다크·3초로 두되, 나머지 스펙이 확정되면 이 파일만 교체하면 되게 단일 컴포넌트로 둔다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const toastVariants = cva(
  "rounded-full border border-white/10 px-4 py-2 text-center text-[13px] leading-[20px] text-white shadow-lg backdrop-blur-[7px]",
  {
    variants: {
      tone: {
        // `--session-toast-bg`는 sessionSurfaceStyle(sessionTheme.ts)이 세션/룸 서브트리에만
        // inline style로 주입한다 — 초대코드 공유·소셜 홈 등 세션 밖 화면에는 변수가 없어
        // 배경이 투명해지고, 라이트 모드에서 흰 배경 + 흰 글자로 완전히 안 보였다.
        // 그래서 CSS 변수 폴백으로 같은 값을 박아 전 화면 다크 알약을 보장한다
        // (2026-08-24 결정 · 2026-08-25 토스풍 회색으로 개정). 폴백 값은 sessionTheme.ts의
        // `--session-toast-bg`와 동기 유지.
        session: "bg-[var(--session-toast-bg,rgba(78,89,104,0.96))]",
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

/**
 * 토스트를 띄우는 표준 자리 — 하단 안전영역 + 16px, 화면 중앙.
 *
 * 이 오프셋이 화면마다 복붙돼 어긋났다: 소셜 홈·설정은 탭 바를 피하려던 옛 +96px에 남아
 * 있는데 앱 전역 부팅 토스트만 2026-08-25에 +16px로 옮겨졌고, 그 차이가 실기기에서
 * "토스트가 너무 위에 뜬다"로 드러났다(BY-436). 위치를 여기 한 곳에만 둔다 —
 * 새 화면에서 `fixed bottom-...`을 직접 쓰지 말고 이 컴포넌트를 쓸 것.
 */
export function ToastViewport({
  message,
  tone,
}: { message: string | null } & VariantProps<typeof toastVariants>) {
  if (message === null) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] flex justify-center">
      <Toast message={message} tone={tone} />
    </div>
  );
}
