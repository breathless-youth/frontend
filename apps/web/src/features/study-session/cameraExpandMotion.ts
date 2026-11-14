interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const px = (value: number) => `${Number(value.toFixed(2))}px`;

/**
 * 내 카메라 키우기·줄이기 키프레임. [작은 창 모양, 전체 화면 모양]이다.
 *
 * 카메라 상자의 실제 위치와 크기를 움직인다. 영상이 매 프레임 그 상자에 맞게 다시 잘려 끝 장면이 실제 작은 창과 똑같고, 바뀌는 순간 영상이 튀지 않는다.
 * transform으로 줄이면 전체 화면에서 잘려 그려지지 않은 영상 좌우를 작은 창이 보여 주지 못해 끝에서 영상이 튄다.
 * 좌표는 전체 화면 상자(세션 화면) 안의 값이고, 평소 위치를 정하는 right·bottom은 움직이는 동안 풀어 둔다.
 */
export function cameraBoxFrames(pip: Box, full: Box, radius: number): [Keyframe, Keyframe] {
  return [
    {
      top: px(pip.top - full.top),
      left: px(pip.left - full.left),
      width: px(pip.width),
      height: px(pip.height),
      right: "auto",
      bottom: "auto",
      borderRadius: px(radius),
    },
    {
      top: "0px",
      left: "0px",
      width: px(full.width),
      height: px(full.height),
      right: "auto",
      bottom: "auto",
      borderRadius: "0px",
    },
  ];
}

/** 유튜브 작은 화면처럼 빠르게 시작해 부드럽게 멈춘다. 페이지 전환과 같은 곡선이다. */
export const CAMERA_EXPAND_TIMING: KeyframeAnimationOptions = {
  duration: 400,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
};
