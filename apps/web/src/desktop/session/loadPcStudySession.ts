/**
 * 공부 세션 화면 모듈 불러오기
 *
 * 시작을 누르면 카메라 확인과 옛 세션 마감을 기다리는 동안 함께 받으려고 지연 로딩과 미리 받기가 이 함수 하나를 쓴다.
 */
export const loadPcStudySession = () => import("./PcStudySession");
