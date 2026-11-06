import { createElement, type ReactNode } from "react";
import { toast } from "sonner";

import { NotificationToast } from "@/components/NotificationToast";

export const CTA_TOASTER_ID = "cta";
/** `showCtaToast`와 언마운트 정리가 같은 id를 써야 해서 여기 둔다. */
export const CTA_TOAST_ID = "focusmakers-cta-toast";

/**
 * 고정 id로 부르면 Sonner가 기존 토스트를 제자리에서 갱신하고 5초 타이머를 다시 시작한다.
 * `visibleToasts={1}`만으로는 이전 토스트가 숨겨진 채 남아 있어서, 새 토스트를 밀어 닫으면
 * 이전 토스트가 다시 나타난다.
 */
const GLOBAL_TOAST_ID = "focusmakers-toast";

export function showToast(message: string) {
  // 같은 id로 갱신하면 Sonner가 이전 옵션에 덮어 합친다. 위치를 빼면 떠 있던 위쪽 토스트 자리를 물려받는다.
  toast(message, { id: GLOBAL_TOAST_ID, position: "bottom-center" });
}

/** Render the icon inside the message so subsequent string toasts replace it completely. */
export function showIconToast(message: string, icon: ReactNode) {
  toast(
    createElement(
      "span",
      { className: "inline-flex items-center gap-1.5" },
      icon,
      createElement("span", null, message),
    ),
    { id: GLOBAL_TOAST_ID, position: "bottom-center" },
  );
}

/** 세션 화면은 아래에 컨트롤 바가 떠 있어서, 위쪽 상태 필 바로 아래에 띄운다. */
export function showTopToast(message: string) {
  toast(message, { id: GLOBAL_TOAST_ID, position: "top-center" });
}

/** 전역 Toaster는 App.tsx에 상시 마운트라 화면이 바뀌어도 토스트가 그대로 남는다. 화면 전환 시점에 불러 지운다. */
export function dismissToast() {
  toast.dismiss(GLOBAL_TOAST_ID);
}

export function showCtaToast(message: string) {
  toast(message, { id: CTA_TOAST_ID, toasterId: CTA_TOASTER_ID });
}

/**
 * 앱을 쓰는 중에 온 그룹 알림 토스트
 *
 * 위쪽 가운데에 제목과 본문 두 줄로 띄우고, 누르면 받은 일을 한 뒤 닫는다.
 * 전역 토스트 id를 써서 떠 있던 토스트를 대체하고, 화면이 바뀌면 다른 토스트처럼 닫힌다.
 * Sonner는 같은 id로 다시 띄운 토스트를 새로 만들지 않고 이전 토스트의 값에 새 값을 합친다.
 * `toast.custom`으로 그리면 그 내용이 합친 값에 남아서, 뒤이어 `showToast`를 불러도 알림 내용이 계속 보인다.
 * 그래서 내용을 문구 자리에 넘겨 다음 토스트의 문구가 덮어쓰게 한다.
 */
export function showNotificationToast({
  title,
  body,
  onOpen,
}: {
  title: string;
  body: string;
  onOpen: () => void;
}) {
  toast(
    createElement(NotificationToast, {
      title,
      body,
      onOpen: () => {
        onOpen();
        dismissToast();
      },
    }),
    { id: GLOBAL_TOAST_ID, position: "top-center" },
  );
}
