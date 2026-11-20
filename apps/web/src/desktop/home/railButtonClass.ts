/**
 * PC 홈 레일 버튼 모양
 *
 * D-Day 버튼은 첫 화면 묶음에 있고 레일은 나눠 받아서, 두 쪽이 같은 모양을 쓰도록 문자열만 따로 둔다.
 * 열린 창의 버튼은 aria-expanded로 눌린 모양을 보인다.
 */
export const RAIL_BUTTON_CLASS =
  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-2 text-center text-foreground transition-colors duration-150 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none aria-expanded:bg-brand-subtle aria-expanded:text-brand-subtle-text motion-reduce:transition-none";
