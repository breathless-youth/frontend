import { useEffect } from "react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

import { CTA_TOAST_ID, CTA_TOASTER_ID } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * 라이트·다크 모두 다크 회색 알약에 흰 글자다. 배경 변수는 세션 화면 서브트리에만 주입되므로
 * 폴백에 같은 값을 둔다. 폴백은 sessionTheme.ts의 `--session-toast-bg`와 같아야 한다.
 * Sonner는 600px 이하에서 토스트를 화면 폭으로 늘리므로 폭을 문구에 맞추고 가운데 둔다.
 */
export const TOAST_PILL_CLASS =
  "inset-x-0 mx-auto w-fit! rounded-3xl border border-white/10 bg-[var(--session-toast-bg,rgba(78,89,104,0.96))] px-4 py-2 text-center text-[13px] leading-[20px] whitespace-pre-line text-white shadow-lg backdrop-blur-[7px]";

export function Toaster({
  bottom,
  className,
  toastOptions,
  ...props
}: Omit<ToasterProps, "offset" | "mobileOffset"> & { bottom?: string }) {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      duration={5000}
      visibleToasts={1}
      customAriaLabel="알림"
      {...props}
      offset={{ bottom }}
      // Sonner 모바일 규칙은 토스터 틀을 왼쪽 여백만큼 민 채 폭 100%로 두고 토스트 폭을 줄여 가운데를
      // 맞춘다. 폭을 문구에 맞춘 알약은 그 보정을 못 받아 오른쪽으로 치우치므로 좌우 여백을 0으로 둔다.
      mobileOffset={{ bottom, left: 0, right: 0 }}
      // Sonner 기본 CSS는 unstyled여도 z-index 999999999를 걸어서 Sheet·Dialog(z-50)의 딤 위로
      // 뜬다. 모달보다 아래에 둔다.
      className={cn("z-40!", className)}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn(TOAST_PILL_CLASS, toastOptions?.classNames?.toast),
        },
      }}
    />
  );
}

const CTA_BOTTOM = "calc(100% + 12px)";

/**
 * 하단 버튼 바로 위에 띄우는 Toaster. `relative` 부모 안에 두면 부모 윗변에서 12px 위에 뜬다.
 * 가로 모드 격자에서도 버튼 영역을 따라가야 해서 화면 고정이 아니라 부모 기준으로 둔다.
 */
export function CtaToaster() {
  // Sonner의 5초 타이머는 토스트 컴포넌트 안에 있다. 토스트가 떠 있을 때 이 Toaster가 먼저
  // 사라지면 토스트가 스토어에 남았다가, 다음에 마운트되는 CtaToaster에서 다시 뜬다.
  useEffect(() => {
    return () => {
      toast.dismiss(CTA_TOAST_ID);
    };
  }, []);

  return (
    <Toaster
      id={CTA_TOASTER_ID}
      className="absolute!"
      // 전역 Toaster도 빈 알림 영역을 늘 그리므로, 스크린리더에서 이름이 겹치지 않게 한다.
      customAriaLabel="화면 알림"
      bottom={CTA_BOTTOM}
      toastOptions={{ classNames: { toast: "whitespace-nowrap" } }}
    />
  );
}
