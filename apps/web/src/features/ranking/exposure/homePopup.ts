/**
 * 랭킹 팝업을 띄울 수 있는 실행
 *
 * 공지·인터뷰·복구 창이 먼저이고 마감 메달 모달은 그다음이다.
 * 한 실행에 팝업은 하나라 공지·인터뷰·복구 창 중 하나라도 떴으면 쉰다.
 */
export function rankingPopupAllowed(input: {
  noticeShown: boolean;
  recoveryShown: boolean;
}): boolean {
  return !input.noticeShown && !input.recoveryShown;
}
