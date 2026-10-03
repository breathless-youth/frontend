import { toast } from "sonner";

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
  toast(message, { id: GLOBAL_TOAST_ID });
}

/** 전역 Toaster는 App.tsx에 상시 마운트라 화면이 바뀌어도 토스트가 그대로 남는다. 화면 전환 시점에 불러 지운다. */
export function dismissToast() {
  toast.dismiss(GLOBAL_TOAST_ID);
}

export function showCtaToast(message: string) {
  toast(message, { id: CTA_TOAST_ID, toasterId: CTA_TOASTER_ID });
}
