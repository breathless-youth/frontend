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

/**
 * 내 카메라 작은 창의 자리
 *
 * 세로는 오른쪽 아래, 하단 바 위 34px이고 가로는 오른쪽 아래 하단 바와 같은 높이다.
 * 하단 바 위 끝은 레이어 아래 여백(12, 24, 27px) + 바 높이(68, 76, 88px)다.
 * 카메라 화면과 그 위의 누르는 버튼, 확대 중의 줄이기 버튼, 타이머 배경 미리보기의 가짜 카메라 창이 같은 자리를 쓴다.
 */
export const PIP_ANCHOR = [
  "absolute right-[calc(env(safe-area-inset-right)+16px)] bottom-[calc(env(safe-area-inset-bottom)+114px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+134px)] short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+149px)]",
  "landscape-compact:right-[max(env(safe-area-inset-right),16px)] landscape-compact:bottom-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))]",
].join(" ");

/** 내 카메라 작은 창의 크기. 세로 108×144, 가로 160×108이고 폭 600 이상 창은 144×192다. */
export const PIP_SIZE =
  "h-36 w-27 regular:h-48 regular:w-36 landscape-compact:h-27 landscape-compact:w-40";

/**
 * 월페이퍼 위 시간 묶음의 자리(v3 시안 28e·30a)
 *
 * 세로는 왼쪽 아래다. 묶음 아래 끝을 카메라 작은 창 아래 끝보다 18px 낮게 두고, 오른쪽은 작은 창 자리를 비운다.
 * 가로는 머리 줄과 같은 왼쪽에서 하단 바보다 4px 위이고, 가운데 하단 바 앞까지만 쓴다.
 * 양옆은 화면 끝까지 잡아서 묶음 위에 뜨는 토스트가 화면 가운데에 온다.
 */
export const WALLPAPER_CLOCK_ANCHOR = [
  "absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] pl-[calc(env(safe-area-inset-left)+24px)] pr-[calc(env(safe-area-inset-right)+140px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+116px)] regular:pr-[calc(env(safe-area-inset-right)+176px)]",
  "short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+131px)] short-side-lg:pl-[calc(env(safe-area-inset-left)+40px)]",
  "landscape-compact:bottom-[calc(max(env(safe-area-inset-bottom),(env(safe-area-inset-bottom)+14px)/2)+4px)] landscape-compact:pl-[max(env(safe-area-inset-left),16px)] landscape-compact:pr-[calc(50%+76px)]",
].join(" ");

/** 카메라 창이 없는 심플 모드에서 시간 묶음이 오른쪽 끝까지 쓰게 하는 여백(v3 시안 31b) */
export const WALLPAPER_CLOCK_WIDE =
  "pr-[calc(env(safe-area-inset-right)+24px)] regular:pr-[calc(env(safe-area-inset-right)+24px)] short-side-lg:pr-[calc(env(safe-area-inset-right)+40px)]";
