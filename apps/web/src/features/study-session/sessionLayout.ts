/**
 * 혼자 공부 세션 레이어의 안전 영역 여백
 *
 * 하단 버튼 줄(일시정지·종료)은 이 여백의 아래·양옆 끝에 놓인다.
 * RoomPage 세션 레이어와 도움말 화면의 가짜 하단 줄이 함께 써서 두 자리가 어긋나지 않는다.
 * 세로는 위 13px·아래 8px·옆 24px, 폭 600 이상 창은 아래 24px, 큰 태블릿은 아래 27px·옆 32px,
 * 가로(`landscape-compact`)는 위 18px·옆 16px이고 아래는 홈 인디케이터에 반쯤 걸친다.
 */
export const SESSION_LAYER_INSET = [
  "pt-[calc(env(safe-area-inset-top)+13px)] pb-[calc(env(safe-area-inset-bottom)+8px)]",
  "pl-[calc(env(safe-area-inset-left)+24px)] pr-[calc(env(safe-area-inset-right)+24px)]",
  "regular:pb-[calc(env(safe-area-inset-bottom)+24px)]",
  "short-side-lg:pb-[calc(env(safe-area-inset-bottom)+27px)] short-side-lg:pl-[calc(env(safe-area-inset-left)+32px)] short-side-lg:pr-[calc(env(safe-area-inset-right)+32px)]",
  "landscape-compact:pt-[calc(env(safe-area-inset-top)+18px)] landscape-compact:pb-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))]",
  "landscape-compact:pl-[calc(env(safe-area-inset-left)+16px)] landscape-compact:pr-[calc(env(safe-area-inset-right)+16px)]",
].join(" ");
