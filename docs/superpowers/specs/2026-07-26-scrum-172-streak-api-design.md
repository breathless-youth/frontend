# SCRUM-172: 연속 공부일(스트릭) 조회 API 연동 — 설계

- Jira: [SCRUM-172](https://breathless-youth.atlassian.net/browse/SCRUM-172)
- Swagger: http://52.78.219.53:8080/swagger-ui/index.html#/StudySessionStats/streak
- 브랜치: `feature/SCRUM-172-FE-연속-공부일-스트릭-조회-API-연동` (origin/dev에서 분기, PR #4 머지 이후)

## 목표

`GET /api/stats/streak?userId={userId}`를 연동해 현재 연속 공부일(`streak`)과 역대 최장
연속 공부일(`maxStreak`)을 조회한다. 스트릭은 서버가 세션 이력에서 매번 계산한다 —
오늘 기록이 없어도 어제까지 이어졌으면 유지 중, 어제·오늘 모두 없으면 0, 기록/유저
없음이면 둘 다 0. 앱은 값을 그대로 표시만 한다(로컬 계산 없음).

## API 계약 (Swagger 그대로)

```
GET /api/stats/streak?userId={int64}
200 → { "streak": int32, "maxStreak": int32 }
400/404 → { "message": string }
```

## 변경 파일

### `packages/types/src/index.ts`

```ts
/** 연속 공부일(스트릭) 조회 API 계약 (GET /api/stats/streak) — Swagger 기준. */
export interface StudySessionStreakResponse {
  /** 현재 연속 공부일 — 오늘 기록이 없어도 어제까지 이어졌으면 유지 중으로 본다 */
  streak: number;
  /** 역대 최장 연속 공부일 */
  maxStreak: number;
}
```

### `apps/mobile/lib/statsApi.ts`

`getStreak(userId: number): Promise<StudySessionStreakResponse>` 추가.
기존 `listStudySessionStats`와 동일 패턴: `fetch` GET, `!res.ok`면 서버 `{message}`
파싱 후 throw(파싱 실패 시 `스트릭 조회 실패 (HTTP {status})`). 새 추상화 없음.

### `apps/mobile/lib/__tests__/statsApi.test.ts`

기존 테스트 스타일 그대로 3케이스 추가:
1. 성공 — 쿼리스트링·응답 파싱 확인
2. 에러 응답의 `message`로 throw
3. 비-JSON 에러 응답이면 HTTP 상태 fallback 메시지로 throw

### `apps/mobile/app/(tabs)/index.tsx` — 임시 확인용 UI

홈 탭에서 `ensureUserRegistered()`(멱등) → `getStreak()` 호출.
`console.log("[streak] ...")` + 화면에 "🔥 연속 N일 · 최장 M일" Text 한 줄.
`임시 확인용 — 확정 디자인 화면 나오면 교체` 주석으로 표시하고 커밋에 포함.
로딩/에러 상태 UI는 만들지 않는다(실패 시 로그만, Text 미표시).

## 범위 밖

- 확정 디자인 기반 스트릭 화면 (임시 UI는 확인용)
- 스트릭 로컬 계산, 캐싱, 로딩/에러 UI 상태 처리
- React Query 등 데이터 계층 도입

## 검증

1. `pnpm typecheck` / `pnpm test`
2. Expo Go(`pnpm --filter mobile dev`) 실행 → 홈 탭에서 스트릭 Text와 콘솔 로그 확인
