/**
 * 그룹 화면 메뉴의 바탕
 *
 * 그룹 홈의 그룹 메뉴와 멤버 줄의 메뉴가 같은 모양이어야 해서 한곳에 둔다.
 * 메뉴는 body로 나가므로 Soft Blue 테마를 메뉴에도 단다.
 * 터치 팬을 끄는 까닭은 메뉴마다 단 touchmove 처리기의 주석에 있다.
 */
export const GROUP_MENU_CONTENT_CLASS =
  "theme-soft-blue touch-none rounded-lg border-0 p-1.5 shadow-sb-card";

/** 그룹 화면 메뉴 항목의 크기와 글자. */
export const GROUP_MENU_ITEM_CLASS =
  "min-h-12 gap-2.5 rounded-md px-3 py-2 text-[15px] leading-4.5 font-semibold text-foreground";
