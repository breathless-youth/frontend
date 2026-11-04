/**
 * 6자리 초대코드 칸이 놓이는 줄
 *
 * 칸 여섯 개와 8px 간격이 328px이라 그보다 넓으면 그 폭으로 가운데에 두고, 좁은 폰에서는 줄 폭만큼만 차지한다.
 */
export const INVITE_CODE_ROW_CLASS = "flex w-full max-w-82 justify-center gap-2";

/**
 * 6자리 초대코드 칸
 *
 * 숫자 4자리 칸은 60px 폭이라 여섯 칸이 402px 폰에 들어가지 않아서 48×60 칸에 글자를 줄여 둔다.
 * 360px 폰은 좌우 여백을 빼면 328px보다 좁아서 칸이 줄 폭을 나눠 가지며 같은 비율로 줄어든다.
 * 코드를 입력하는 칸과 코드를 보여 주는 칸이 같은 모양을 쓰도록 한곳에 둔다.
 */
export const INVITE_CODE_CELL_CLASS =
  "relative flex aspect-4/5 min-w-0 max-w-12 flex-1 items-center justify-center rounded-lg bg-muted text-[26px] font-bold text-foreground tabular-nums shadow-sb-card";
