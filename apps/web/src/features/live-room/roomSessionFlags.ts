import type { SessionState } from "@/features/study-session/sessionState";
import { isBreak, isSessionHeld } from "@/features/study-session/sessionState";

export interface RoomSessionFlags {
  /** 카메라를 꺼서 멈춘 동안이고 화면의 카메라 꺼짐 표시와 마이크 잠금이 이 값을 따른다. */
  cameraHeld: boolean;
  /** 상대에게 보내는 영상 트랙을 켜 둘지 */
  trackEnabled: boolean;
  /** 집중 감지를 돌릴지 */
  detecting: boolean;
  /** 서버에 알리는 휴식 여부 */
  onBreak: boolean;
}

/**
 * 공부방 세션 상태에서 카메라, 송신, 감지, 휴식 값 고르기
 *
 * 뽀모도로 휴식은 측정만 멈추고 카메라와 마이크는 그대로 두어서 카메라를 끈 일시정지와 따로 본다.
 * 초대코드 방에는 휴식이 없어서 두 값 모두 지금처럼 일시정지 여부와 같다.
 */
export function roomSessionFlags(state: SessionState): RoomSessionFlags {
  const cameraHeld = isSessionHeld(state);
  return {
    cameraHeld,
    trackEnabled: !cameraHeld,
    detecting: state.kind !== "PAUSE",
    onBreak: isBreak(state),
  };
}
