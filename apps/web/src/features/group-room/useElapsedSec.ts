import { useNow } from "@/features/ranking/useNow";
import { useScreenVisible } from "@/lib/nativeTabFocus";

/**
 * 서버 값을 받은 뒤 흐른 초
 *
 * 순공이 쌓이는 사람이 없으면 다시 그릴 일이 없어 1초 타이머를 두지 않는다.
 * 앱의 탭 웹뷰는 가려져도 살아 있어서 화면이 보이는 동안에만 타이머를 두고, 다시 보이면 그 시각으로 따라잡는다.
 * 기기 시계가 받은 시각보다 늦어도 시간이 줄어 보이지 않게 0에서 멈춘다.
 */
export function useElapsedSec(fetchedAtMs: number, ticking: boolean): number {
  const visible = useScreenVisible();
  const nowMs = useNow(ticking && visible ? 1000 : null);
  return Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
}
