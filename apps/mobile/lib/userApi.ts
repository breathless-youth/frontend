import { ensureAuth } from "./auth";

/**
 * 익명 기기 유저 등록을 보장하고 userId만 돌려준다. 토큰 발급·보관·갱신은 `lib/auth.ts`가 맡고,
 * 이 함수는 호출부(`RootLayout`, `remoteQueryParams`)를 위해 남긴 얇은 래퍼다. 실패하면 null —
 * 다음 실행에서 재시도한다(등록 API는 멱등).
 */
export async function ensureUserRegistered(): Promise<number | null> {
  return (await ensureAuth())?.userId ?? null;
}
