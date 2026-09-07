import { QueryClient } from "@tanstack/react-query";

/**
 * staleTime 30초: 같은 문서 안에서 날짜 이동이나 재마운트로 같은 통계를 짧은 간격에
 * 다시 받지 않게 하는 창이다. 세션 종료 뒤 홈 갱신은 네이티브가 모달을 닫으며 보내는
 * session-closed 신호가 무효화로 보장한다(lib/nativeSessionClosed.ts). 신호가 없던 때는
 * 재노출 재조회에만 기대야 해서 통계를 바꾸는 최소 세션 길이 60초 미만으로 잡은 값인데,
 * 지금은 그 제약이 없고 30초는 중복 방지 창으로만 남는다.
 *
 * retry 1: 오류 UI에 재시도 버튼이 있어 자동 재시도를 길게 잡지 않았다.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
