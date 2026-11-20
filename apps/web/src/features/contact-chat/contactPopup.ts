/**
 * PC 홈 문의 창 표시 쿼리
 *
 * 홈 문서와 상담 문서는 COOP가 달라 브라우저가 문의 창을 다른 창 그룹으로 떼어 낸다.
 * 그래서 상담 문서에서는 창 이름과 연 창을 볼 수 없어 주소에 표시를 실어 알린다.
 * 분석 허용 목록에 없어 분석 도구로 나가는 주소에서는 지워진다.
 */
const POPUP_PARAM = "popup";

/**
 * 문의 창으로 열 주소
 *
 * 받은 쿼리는 그대로 두고 표시만 더한다.
 */
export function contactPopupHref(href: string): string {
  const url = new URL(href, window.location.origin);
  url.searchParams.set(POPUP_PARAM, "1");
  return `${url.pathname}${url.search}`;
}

/** 이 상담 문서가 PC 홈이 띄운 문의 창인지 여부 */
export function isContactPopup(search: string): boolean {
  return new URLSearchParams(search).get(POPUP_PARAM) === "1";
}
