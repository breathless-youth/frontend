/**
 * 그룹 화면 맨 아래 버튼 줄의 여백
 *
 * 내용이 짧으면 화면 아래에 붙고 길면 내용을 따라 내려가도록 위쪽을 auto로 둔다.
 */
export const BOTTOM_CTA_BAR_CLASS = "mt-auto px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+24px)]";

/**
 * 그룹 화면 아래 버튼의 글자와 모서리
 *
 * 시안의 아래 버튼은 공용 큰 버튼보다 글자가 크고 굵어서 그룹 화면들이 같은 덮어쓰기를 이곳에서 가져간다.
 */
export const BOTTOM_CTA_CLASS = "w-full rounded-xl text-[17px] leading-5.25 font-bold";

/**
 * 누를 수 없는 아래 버튼의 바탕과 글자
 *
 * 흐린 파란 버튼은 보내는 중처럼 보여서, 자리가 없거나 신청할 수 없을 때는 회색 바탕에 이유 글자를 또렷하게 둔다.
 */
export const BOTTOM_CTA_UNAVAILABLE_CLASS =
  "disabled:bg-border disabled:text-state-pause disabled:opacity-100 disabled:shadow-none";
