import type { SessionState } from "@/features/study-session/sessionState";
import { isBreak, isSessionHeld } from "@/features/study-session/sessionState";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";

export interface RoomSessionFlags {
  /** 카메라를 꺼서 멈춘 동안이고 화면의 카메라 꺼짐 표시가 이 값을 따른다. */
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
 * 뽀모도로 휴식은 측정만 멈추고 카메라는 그대로 두어서 카메라를 끈 일시정지와 따로 본다.
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

/**
 * 마이크를 끄고 켜지 못하게 막을지
 *
 * 카메라와 측정 상태는 보지 않아서 카메라를 끈 일시정지와 휴식에도 켜 둔 마이크는 그대로다.
 * 앱을 떠난 동안에는 사용자가 듣지도 보지도 못해서, 카메라를 끈 채 떠나 일시정지 사유가 바뀌지 않아도 소리가 나가지 않게 막는다.
 * 나가기나 자동 종료로 세션이 끝나기 시작하면 측정 중이었어도 소리가 더 나가지 않게 막는다.
 */
export function micHeld(appHidden: boolean, phaseName: StudyRoomPhase["name"]): boolean {
  return appHidden || phaseName !== "studying";
}

/**
 * 측정 없이 얼굴 자리만 구하는 미리보기 감지를 돌릴지
 *
 * 얼굴 가림의 이모지는 감지가 구한 얼굴 자리에 그려서, 감지를 멈추면 보내는 영상 전체가 흐려진다.
 * 카메라 켜기 창의 미리보기와 영상이 그대로 나가는 휴식 중에는 얼굴 자리만 계속 구한다.
 * 이 감지는 집중 신호를 내지 않아서 측정을 멈춘 상태가 그대로다.
 */
export function visionPreview({
  detectionEnabled,
  faceMaskOn,
  cameraDialogOpen,
  onBreak,
  studying,
}: {
  /** 측정용 전체 감지가 돌고 있으면 이모지 자리도 거기서 구한다. */
  detectionEnabled: boolean;
  faceMaskOn: boolean;
  cameraDialogOpen: boolean;
  onBreak: boolean;
  studying: boolean;
}): boolean {
  return !detectionEnabled && faceMaskOn && (cameraDialogOpen || (onBreak && studying));
}
