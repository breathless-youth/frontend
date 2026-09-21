import { useRef } from "react";

/**
 * Radix 다이얼로그의 포커스 복귀를 `Trigger` 없이 처리한다.
 *
 * Radix 는 `Trigger` 로 열 때만 스스로 포커스를 되돌린다. `open` prop 으로만 여는
 * 다이얼로그는 열리기 직전의 포커스를 직접 기억했다 닫힐 때 돌려줘야 한다.
 *
 * 반환한 두 핸들러를 `DialogContent` 의 `onOpenAutoFocus`·`onCloseAutoFocus` 에 그대로 건다.
 * `onOpenAutoFocus` 는 포커스가 Content 로 옮겨가기 직전에 불려 그 시점의 `activeElement`
 * 가 아직 트리거다. 닫힐 때는 세션이 그사이 끝나 요소가 사라졌을 수 있어 `isConnected` 인
 * 것에만 되돌린다.
 */
export function useDialogFocusRestore() {
  const restore = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      restore.current = active instanceof HTMLElement ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      if (restore.current?.isConnected) restore.current.focus();
    },
  };
}
