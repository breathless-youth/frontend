import timiAvatar from "@/assets/mascot/timi-avatar.png";

/**
 * 사진이 없을 때 보이는 기본 마스코트
 *
 * 나중에 고른 마스코트로 바꿀 수 있게 그림 주소를 받는다.
 * 크기와 원형 틀은 감싸는 아바타가 정한다.
 */
export function DefaultProfileMascot({ src = timiAvatar }: { src?: string }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-default-mascot=""
      className="size-full object-cover opacity-70"
    />
  );
}
