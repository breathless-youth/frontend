import { useRef } from "react";
import type { TouchEvent } from "react";

// 사람이 화면 끝을 잡는 폭이고, 이보다 넓히면 페이지 안 줄을 옆으로 미는 손가락까지 받는다.
const EDGE_ZONE_PX = 32;
// 탭하다 살짝 밀린 손가락으로 닫히지 않을 만큼만 민 뒤에 닫는다.
const CLOSE_DISTANCE_PX = 48;
// 이만큼 움직일 때까지는 세로인지 가로인지 정하지 않는다.
const DIRECTION_SLOP_PX = 16;

/**
 * 왼쪽 가장자리에서 오른쪽으로 밀어 페이지 닫기
 *
 * 공부방은 뒤로 가기로 방을 나가면 측정이 사라져서 세션 내내 iOS 웹뷰의 가장자리 스와이프를 꺼 둔다.
 * 싱글룸처럼 페이지가 열린 동안만 그 제스처를 켜면, 닫은 직후 다시 끄는 신호가 앱에 닿기 전의 두 번째 스와이프가 방을 나간다.
 * 그래서 제스처는 끈 채로 두고 웹이 터치를 직접 읽는다.
 * history를 건드리지 않아 이 길로는 방을 나갈 수 없다.
 * 슬라이더와 글자 입력은 옆으로 끄는 것이 자기 조작이라 거기서 시작한 터치는 받지 않는다.
 */
export function useEdgeSwipeClose(enabled: boolean, onClose: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const stop = () => {
    startRef.current = null;
  };

  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      const touch = event.touches[0];
      const onOwnDrag = event.target instanceof Element && event.target.closest("input, textarea");
      startRef.current =
        enabled &&
        event.touches.length === 1 &&
        touch !== undefined &&
        touch.clientX <= EDGE_ZONE_PX &&
        !onOwnDrag
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      const start = startRef.current;
      const touch = event.touches[0];
      if (start === null) {
        return;
      }
      if (event.touches.length !== 1 || touch === undefined) {
        stop();
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (dy > DIRECTION_SLOP_PX && dy * 2 > dx) {
        stop();
        return;
      }
      if (dx >= CLOSE_DISTANCE_PX) {
        stop();
        onClose();
      }
    },
    onTouchEnd: stop,
    onTouchCancel: stop,
  };
}
