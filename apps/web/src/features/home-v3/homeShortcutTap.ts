import { trackHomeShortcutTapped, type HomeShortcutTarget } from "@/lib/amplitude";

/**
 * 홈 바로가기 탭 계측
 *
 * 바로가기를 누르면 화면을 열기 전에 어느 바로가기였는지 남긴다.
 */
export function tapped(target: HomeShortcutTarget, open: () => void) {
  return () => {
    trackHomeShortcutTapped(target);
    open();
  };
}
