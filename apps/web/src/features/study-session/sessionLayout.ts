/**
 * 혼자 공부 세션 레이어의 안전 영역 여백
 *
 * 머리 줄은 이 여백의 위·양옆 끝에, 하단 바는 아래 끝에 놓인다.
 * RoomPage 세션 레이어와 도움말 화면의 가짜 화면이 함께 써서 두 자리가 어긋나지 않는다.
 * 세로는 위 22px·아래 12px·옆 16px(v3 시안: 402×874 폰에서 머리 줄 y=84, 하단 바 아래 46px),
 * 폭 600 이상 창은 아래 24px, 큰 태블릿은 아래 27px·옆 32px,
 * 가로(`landscape-compact`)는 위 18px이고, 옆은 안전 영역과 16px 중 큰 값이다(v3 시안: 노치 쪽 안전 영역 64px에 바로 붙인다).
 * 가로 아래는 홈 인디케이터에 반쯤 걸친다.
 */
export const SESSION_LAYER_INSET = [
  "pt-[calc(env(safe-area-inset-top)+22px)] pb-[calc(env(safe-area-inset-bottom)+12px)]",
  "pl-[calc(env(safe-area-inset-left)+16px)] pr-[calc(env(safe-area-inset-right)+16px)]",
  "regular:pb-[calc(env(safe-area-inset-bottom)+24px)]",
  "short-side-lg:pb-[calc(env(safe-area-inset-bottom)+27px)] short-side-lg:pl-[calc(env(safe-area-inset-left)+32px)] short-side-lg:pr-[calc(env(safe-area-inset-right)+32px)]",
  "landscape-compact:pt-[calc(env(safe-area-inset-top)+18px)] landscape-compact:pb-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))]",
  "landscape-compact:pl-[max(env(safe-area-inset-left),16px)] landscape-compact:pr-[max(env(safe-area-inset-right),16px)]",
].join(" ");
