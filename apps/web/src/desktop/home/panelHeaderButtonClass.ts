/**
 * 공부시간 패널 머리줄 버튼 모양
 *
 * 머리줄을 44px로 두려고 버튼은 24px 높이로 그리고, 누르는 영역과 hover 바탕만 가상 요소로 머리줄 높이까지 넓힌다.
 * 가상 요소는 버튼 안 쌓임 맥락의 맨 뒤에 깔려 아이콘과 글자를 가리지 않는다.
 */
const HIT_AREA =
  "relative isolate flex h-6 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-y-2.5 after:-z-10 after:rounded-full after:transition-colors after:duration-150 hover:after:bg-bg-layer-2 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-(--state-focus) motion-reduce:after:transition-none";

export const PANEL_HEADER_ICON_BUTTON_CLASS = `${HIT_AREA} w-6 text-muted-foreground after:-inset-x-2.5`;

export const PANEL_HEADER_TEXT_BUTTON_CLASS = `${HIT_AREA} px-2 text-sm leading-5 font-semibold text-primary after:inset-x-0`;
