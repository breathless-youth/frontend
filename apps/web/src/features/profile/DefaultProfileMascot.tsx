import type { CSSProperties } from "react";

import timiAvatar from "@/assets/mascot/timi-avatar.png";
import { MascotFigure } from "@/components/mascot/MascotFigure";
import { MASCOT_EYE_CENTER } from "@/components/mascot/mascotSources";
import type { MascotLook } from "@/components/mascot/types";

/**
 * 사진이 없을 때 보이는 기본 마스코트
 *
 * 모습을 넘기면 그 사람이 고른 마스코트를 소품과 함께, 넘기지 않으면 타이미를 그린다.
 * 고른 마스코트도 타이미 그림과 같은 구도가 되도록 얼굴을 기준으로 키우고 기울여 넣는다.
 * 원 밖으로 나가는 몸 아래쪽과 소품은 잘리며, 얼굴을 크게 두려고 일부러 줄이지 않는다.
 * 크기와 원형 틀은 감싸는 아바타가 정한다.
 */
// 타이미 그림에서 측정한 구도이며 원 지름에 대한 비율이다.
const FRAME_ZOOM = 128.16;
const FRAME_TILT = "rotate(-10deg)";
const FRAME_EYE_AT = { x: 49.76, y: 54.76 };

/** 퍼센트 글자로 바꾸며 둘째 자리에서 끊는다. */
function percent(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

/** 눈 사이 가운데가 원의 정해진 자리에 오도록 마스코트 상자를 키우고 밀고 돌리는 값 */
function mascotFrame(eye: { x: number; y: number }): CSSProperties {
  return {
    width: percent(FRAME_ZOOM),
    left: percent(FRAME_EYE_AT.x - eye.x * FRAME_ZOOM),
    top: percent(FRAME_EYE_AT.y - eye.y * FRAME_ZOOM),
    transformOrigin: `${percent(eye.x * 100)} ${percent(eye.y * 100)}`,
    transform: FRAME_TILT,
  };
}

export function DefaultProfileMascot({ src, look }: { src?: string; look?: MascotLook | null }) {
  if (src === undefined && look != null) {
    return (
      <span data-default-mascot="" className="relative block size-full opacity-70">
        <span
          data-mascot-frame=""
          className="absolute block aspect-square"
          style={mascotFrame(MASCOT_EYE_CENTER[look.id])}
        >
          <MascotFigure id={look.id} accessories={look.accessories} className="size-full" />
        </span>
      </span>
    );
  }
  return (
    <img
      src={src ?? timiAvatar}
      alt=""
      draggable={false}
      data-default-mascot=""
      className="size-full object-cover opacity-70"
    />
  );
}
