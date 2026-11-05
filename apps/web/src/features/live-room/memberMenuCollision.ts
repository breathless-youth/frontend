/**
 * 세로 공부방의 아래쪽 바가 차지하는 높이(px)
 *
 * 가장 큰 바인 큰 태블릿 바 110px, 바 아래 여백 37px, 메뉴와의 간격 8px을 합한 155px보다 조금 크게 둔다.
 */
export const MEMBER_MENU_BAR_CLEARANCE_PX = 160;

const SCREEN_EDGE_PX = 8;

/**
 * 멤버 메뉴가 피할 화면 가장자리
 *
 * 앱의 유리 버튼은 웹 화면 위에 그려져서 아래로 펼친 메뉴가 바 자리에 닿으면 메뉴 항목이 버튼 밑에 깔린다.
 * 그래서 세로에서는 바 자리를 화면 끝처럼 비워 두고, 메뉴가 거기 닿으면 버튼 위로 뒤집는다.
 * 가로는 이미 버튼 위로 펼쳐서 화면 가장자리만 피한다.
 */
export function memberMenuCollisionPadding(
  placement: "below" | "above",
): number | { top: number; right: number; bottom: number; left: number } {
  if (placement === "above") {
    return SCREEN_EDGE_PX;
  }
  return {
    top: SCREEN_EDGE_PX,
    right: SCREEN_EDGE_PX,
    bottom: MEMBER_MENU_BAR_CLEARANCE_PX,
    left: SCREEN_EDGE_PX,
  };
}
