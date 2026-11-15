import timiAvatar from "@/assets/mascot/timi-avatar.png";
import { MascotFigure } from "@/components/mascot/MascotFigure";
import type { MascotLook } from "@/components/mascot/types";

/**
 * 사진이 없을 때 보이는 기본 마스코트
 *
 * 모습을 넘기면 그 사람이 고른 마스코트를 소품과 함께, 넘기지 않으면 타이미를 그린다.
 * 고른 마스코트는 온몸 그림이라 원 안에 잘리지 않게 줄여 넣는다.
 * 크기와 원형 틀은 감싸는 아바타가 정한다.
 */
export function DefaultProfileMascot({ src, look }: { src?: string; look?: MascotLook | null }) {
  if (src === undefined && look != null) {
    return (
      <span data-default-mascot="" className="block size-full p-[14%] opacity-70">
        <MascotFigure id={look.id} accessories={look.accessories} className="size-full" />
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
