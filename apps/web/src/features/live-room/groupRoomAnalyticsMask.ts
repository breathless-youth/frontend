/**
 * 그룹 공부방의 Amplitude 클릭 분석 가림 속성
 *
 * 그룹 공부방 화면에는 그룹 멤버의 닉네임과 그룹 이름이 보여서 클릭 자동 수집이 글자와 aria-label을 싣지 않게 가린다.
 * 화면 탭은 조작을 숨기고 보이는 토글이라 타일의 닉네임 글자를 눌러도 화면이 바뀌어 그 글자가 클릭 이벤트로 나간다.
 * 포털로 뜨는 메뉴와 레이어는 놓인 자리와 상관없이 같은 속성을 직접 단다.
 * 초대코드 방은 지금 분석을 그대로 둬서 이 속성을 달지 않는다.
 */
export const GROUP_ROOM_ANALYTICS_MASK = {
  "data-amp-mask": true,
  "data-amp-mask-attributes": "aria-label",
} as const;
