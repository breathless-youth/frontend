import { QueryClient } from "@tanstack/react-query";

/**
 * staleTime 30초: 통계는 세션 종료로만 바뀌는데 세션은 다른 웹뷰 문서에서 돌아 홈 캐시를
 * 직접 무효화할 수 없고, 홈은 다시 보일 때의 refetchOnWindowFocus에만 의존한다.
 * 그 재조회는 stale일 때만 나간다. 순공 1분 미만 세션은 합산에서 빠지므로 통계를 실제로 바꾸는 세션은
 * 60초 이상 걸리고, staleTime이 60초 미만이면 돌아온 시점에 반드시 stale이다.
 * 30초는 그 절반으로 여유를 잡은 시간이다.
 *
 * retry 1: 오류 UI에 재시도 버튼이 있어 자동 재시도를 길게 잡지 않았다.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
