/**
 * 고른 날짜의 과목 완료 읽기·쓰기
 *
 * 홈 과목 카드의 완료 표시·취소는 모두 이 값을 거친다.
 * 날짜별 완료 API가 아직 없어 null을 돌려주고, null이면 완료 버튼과 오른쪽 스와이프가 보이지 않는다.
 * 서버 명세가 나오면 이 훅 안에서 그날 완료 목록을 받고 저장하도록 채운다.
 */
export interface SubjectCompletion {
  isDone: (subjectId: number) => boolean;
  setDone: (subjectId: number, done: boolean) => void;
}

// 날짜별 완료 API가 생기면 userId·dateKey로 조회하고 저장하는 쿼리 훅으로 바꾼다.
export function useSubjectCompletion(_userId: number, _dateKey: string): SubjectCompletion | null {
  return null;
}
