/**
 * 공부시간 패널에서 시작한 이벤트 표시
 *
 * 비모달 공간 플라이아웃은 바깥을 누르거나 바깥으로 포커스가 가면 닫히는데, 패널을 끌거나 누를 때는 닫히면 안 된다.
 * 패널이 연 과목 메뉴처럼 body로 나간 포털도 React 트리로는 패널 안이라, DOM 위치 대신 패널의 React 이벤트에서 표시한다.
 * React의 이벤트가 문서에 건 플라이아웃의 바깥 감지보다 먼저 돌아 플라이아웃이 판단할 때 표시가 이미 붙어 있다.
 */
const panelEvents = new WeakSet<Event>();

/** 패널 React 트리에서 지나간 이벤트로 표시한다. */
export function markStudyPanelEvent(event: Event) {
  panelEvents.add(event);
}

/** 공부시간 패널에서 시작한 이벤트인지 여부 */
export function isStudyPanelEvent(event: Event): boolean {
  return panelEvents.has(event);
}
