# BY-459 기간 집계 조회 API 연동 설계

작성일: 2026-08-28
티켓: [BY-459](https://breathless-youth.atlassian.net/browse/BY-459)
브랜치: `feature/BY-459-period-stats-api` (base `dev`)

## 배경

백엔드가 `GET /api/stats/period`를 열었다. `from~to` 구간의 일별 순공·총공부 집계를 내려주고,
`compareFrom`과 `compareTo`를 함께 주면 비교 구간의 일별 배열도 같이 준다.

지금 웹은 하루 단위 `GET /api/stats`와 스트릭 조회만 연동돼 있다. 주간이나 월간처럼 구간으로
묶어 보는 화면을 만들 수 없는 상태다.

이 API를 쓸 화면의 디자인 시안은 아직 나오지 않았다. 그래서 이번 작업은 화면보다 먼저 조회
계층만 붙여 두고, 시안이 나오면 바로 쓸 수 있게 하는 것이 목적이다.

## 범위

- 타입, 조회 함수, react-query `queryOptions`까지만 만든다.
- 화면과 컴포넌트는 만들지 않는다.
- 백엔드 변경은 없다.
- 대상은 `apps/web`과 `packages/types`다. 모바일에는 `statsApi`가 없다(BY-329에서 웹으로 이관 완료).

## 서버 계약

Swagger `StudySessionStats > period` 기준이다.

### 요청

| 파라미터      | 필수 | 설명                                    |
| ------------- | ---- | --------------------------------------- |
| `userId`      | 필수 | 조회할 유저 ID                          |
| `from`        | 필수 | 구간 시작일, 포함                       |
| `to`          | 필수 | 구간 종료일, 포함                       |
| `compareFrom` | 선택 | 비교 구간 시작일, `compareTo`와 한 쌍   |
| `compareTo`   | 선택 | 비교 구간 종료일, `compareFrom`과 한 쌍 |

### 응답

`dailyList`는 `from~to`의 모든 날짜를 오름차순으로 담고 공부가 없는 날은 0이다.
`compareDailyList`는 비교 구간을 지정하지 않으면 빈 배열이고, `compareFrom`과 `compareTo`는
그때 `null`이다.

### 서버가 400을 주는 경우

- `from`이 `to`보다 뒤일 때
- `compareFrom`과 `compareTo` 중 한쪽만 보냈을 때
- 구간이 366일을 넘을 때. 메인 구간과 비교 구간 모두에 적용된다.

### 집계 규칙

순공 1분 미만 세션은 서버 집계에서 빠진다. 총합과 증감은 서버가 주지 않고 응답 배열을 합산해
계산해야 한다.

## 설계

### 타입

`packages/types/src/index.ts`에 두 개를 추가한다.

```ts
export interface DailyStudyStat {
  date: string;
  studySec: number;
  focusSec: number;
}

export interface StudyPeriodStatsResponse {
  from: string;
  to: string;
  compareFrom: string | null;
  compareTo: string | null;
  dailyList: DailyStudyStat[];
  compareDailyList: DailyStudyStat[];
}
```

`compareFrom`과 `compareTo`는 옵셔널(`?`)이 아니라 `string | null`로 쓴다. Swagger가 "compare
미지정 시 null"이라고 못 박았기 때문이다. 옵셔널로 쓰면 키가 아예 없을 수도 있다는 뜻이 되어
실제 응답과 어긋난다.

### 조회 함수

`apps/web/src/lib/statsApi.ts`에 추가한다.

```ts
export type DateRange = { from: string; to: string };

export async function getPeriodStats(
  userId: number,
  range: DateRange,
  compareRange?: DateRange,
): Promise<StudyPeriodStatsResponse>;
```

비교 구간을 `DateRange` 하나로 받는다. `compareFrom`만 채운 호출이 타입 단계에서 막힌다.
파라미터 객체 하나로 받는 방식은 그 조합을 통과시켜서 쓰지 않는다.

URL은 옆 함수 `getStreak`과 같이 문자열을 이어 붙인다. 비교 구간이 없으면 `compareFrom`과
`compareTo`가 URL에 아예 붙지 않는다.

### 범위 타입 개명

기존 `StreakRange`를 `DateRange`로 바꾸고 기존 호출처도 함께 고친다. 사용처는 `statsApi.ts`와
`statsQueries.ts` 두 파일 5줄뿐이다. 기간 조회 인자에 `StreakRange`라는 이름이 붙는 것을
피하려는 것이고, 별칭을 남기지 않는다. 남기면 같은 모양의 타입이 두 이름으로 돌아다닌다.

### 에러 처리

`parseErrorMessage`를 쓰고 fallback 문구는 `기간 집계 조회 실패`다. 같은 파일의 두 함수가 이미
그 헬퍼를 쓰고, `api.ts` 주석도 code 분기가 필요 없는 stats 호출처는 이쪽을 쓴다고 적어 뒀다.
화면이 없어 `code`로 분기할 곳도 없다.

### 쿼리 등록

`apps/web/src/lib/statsQueries.ts`에 키와 `queryOptions`를 추가한다.

```ts
period: (userId: number, range: DateRange, compareRange?: DateRange) =>
  compareRange
    ? ["stats", "period", userId, range.from, range.to, compareRange.from, compareRange.to]
    : ["stats", "period", userId, range.from, range.to],
```

비교 유무가 키를 가른다. 같은 `from~to`라도 비교를 낀 응답과 안 낀 응답은 `compareDailyList`가
다르다. 키를 합치면 비교 없는 화면이 비교 데이터를 물고 오거나 그 반대가 된다.

## 하지 않는 것

- 화면, 컴포넌트, 훅을 만들지 않는다.
- 합산과 증감 계산 헬퍼를 만들지 않는다. 시안이 없어 순공 기준인지 총공부 기준인지, 증감을 어떤
  단위로 보여줄지 정해지지 않았다.
- `from > to`와 366일 초과를 클라이언트에서 미리 막지 않는다. 서버가 400으로 판정하고 그 메시지를
  그대로 올리는 경로가 이미 있고, 규칙을 두 곳에 복제하면 서버 규칙이 바뀔 때 어긋난다.

## 테스트

`apps/web/src/lib/__tests__/statsApi.test.ts`의 기존 `describe` 두 개 옆에 `getPeriodStats`
블록을 붙인다. `fetch`를 mock해서 나가는 URL과 돌아오는 값을 검증한다.

## 완료 조건

- `getPeriodStats(7, { from: "2026-08-24", to: "2026-08-30" })`가
  `/api/stats/period?userId=7&from=2026-08-24&to=2026-08-30`으로 나간다.
- 비교 구간을 함께 주면 `compareFrom`과 `compareTo`가 붙어서 나간다.
- 비교 구간을 안 주면 `compareFrom`과 `compareTo`가 URL에 붙지 않는다.
- `compareDailyList`가 빈 배열인 응답을 오류 없이 그대로 돌려준다.
- 서버가 `{ message }`로 오류를 주면 그 메시지로 실패한다.
- 오류 본문을 읽지 못하면 `기간 집계 조회 실패 (HTTP 500)`으로 실패한다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과한다.
