# 진행 세션 스냅샷 보고 연동과 로컬 저장 복구 제거 (BY-449)

## 배경

지금은 세션 측정값을 10초마다 localStorage에 저장하고, 앱이 비정상 종료되면 다음 실행에서 클라이언트가 재제출한다.
저장과 재제출을 클라이언트가 모두 책임져서, 저장소가 비거나 재제출이 실패하면 기록이 사라진다.
탭과 세션 화면이 각각 별도 웹뷰라 같은 저장소를 함께 본다.
그래서 진행 중인 세션을 다른 화면의 재제출이 먼저 보내버리는 경합이 있다.

BY-447로 서버가 진행 스냅샷을 받아 세션을 자동 확정하는 경로가 생겼다.
마지막 보고가 5분 넘게 끊기면 서버가 `reportedAt`을 종료 시각으로 삼아 세션을 확정한다.
정상 종료로 최종 제출이 오면 서버가 draft를 함께 정리한다.
그래서 로컬 저장과 재제출을 걷어내고 서버 보고로 옮긴다.

## 목표

- 세션이 진행되는 동안 30초마다 `PUT /api/study-sessions/active`로 누적 스냅샷을 보고한다.
- 싱글룸과 소셜룸이 같은 경로를 쓴다.
- 로컬 저장(`sessionCheckpoint.ts`)과 재제출(`resubmitPendingSessions.ts`)을 제거한다.

## 범위 밖

- 진행 스냅샷을 서버에서 받아와 타이머를 이어 붙이는 복원은 다른 티켓에서 맡는다.
- 복원 조회 경로 `GET /api/study-sessions/active`는 이 티켓에서 구현하지 않는다.
- 최종 제출(`submitStudySession`)의 네이티브 대행 분기를 웹 직접 요청으로 옮기는 작업은 따로 진행한다.
- 복원 입장 구분은 다른 티켓에서 다룬다.

## API 규칙 (BY-447, ADR-0014)

`PUT /api/study-sessions/active`의 요청 본문은 다음과 같다.

```json
{
  "userId": 1,
  "startedAt": "2026-08-26T01:00:00Z",
  "reportedAt": "2026-08-26T01:00:30Z",
  "studySec": 30,
  "focusSec": 27,
  "events": []
}
```

- `startedAt`은 최종 제출의 `startedAt`과 같은 값이며 `userId`와 함께 draft의 멱등 키다.
- `reportedAt`은 이 스냅샷의 기준 시각이며 자동 확정 시 `endedAt`이 된다.
- `studySec`과 `focusSec`은 지금까지의 누적값이다.
- `events`는 지금까지의 비공부 이벤트 전체이며 진행 중인 이벤트는 `reportedAt`에서 닫아 보낸다.
- 스냅샷은 누적값이라 매 보고가 서버 draft를 통째로 덮어쓴다.
- 저장된 스냅샷보다 `reportedAt`이 과거인 보고는 서버가 조용히 무시한다.
- 검증은 최종 제출과 같은 규칙이며 `endedAt` 자리에 `reportedAt`을 둔다.

응답은 다음과 같다.

- `204` 반영 완료(역순 도착으로 무시된 경우 포함).
- `400` 검증 실패.
- `404` 존재하지 않는 `userId`.
- `409` Conflict(스펙에 상황 설명이 없어 백엔드 확인 대상이다).

## 아키텍처

### 보고 모듈

`apps/web/src/features/study-session/reportActiveSession.ts`를 새로 만든다.
`submitStudySession`을 본떠 요청을 조립하고 `PUT`을 직접 보낸다.
웹뷰에서도 CORS가 열려 있어 `API_BASE_URL`로 직접 요청한다(`statsApi.ts`·`roomApi.ts`와 같은 방식).
네이티브 대행 경로는 만들지 않는다.

클램프 로직은 `submitStudySession.ts`의 `buildSessionRequest`에서 공유 함수로 뽑아 제출과 스냅샷이 함께 쓴다.
공유 함수는 종료 시각 인자 하나만 받아 `0 ≤ focusSec ≤ studySec ≤ (기준시각 − startedAt) − PAUSE합`을 적용한다.
최종 제출은 그 인자로 `endedAt`을, 스냅샷은 `reportedAt`을 넘긴다.

### 세션 훅 연동

`useStudyRoomSession`에 스냅샷 보고를 붙인다.
`phase.name === "studying"`인 동안만 도는 30초 `setInterval` effect가 매 주기 스냅샷을 만들어 `reportActiveSession`을 직접 부른다.
스냅샷은 현재 `timelineRef.current`에서 `computeSessionTotals`와 `toStatusEvents`로 만든다.
첫 보고는 t=30부터 나간다.

react-query는 쓰지 않는다.
`useMutation`은 interval 의존성과 안 맞아 겹침·정지 가드를 결국 ref로 관리해야 하고, 그러면 `QueryClientProvider` 의존성만 남고 이점은 사라진다.
싱글룸(`RoomPage`)이 아직 react-query를 쓰지 않아 provider를 새로 끌어들이는 비용도 있다.

### 가드

- 겹침 가드는 in-flight ref로 한다. 요청 시작 전에 세우고 끝나면 내린다.
- 정지 가드는 stop ref로 한다. `400`·`404`를 받으면 그 세션 동안 보고를 멈춘다.
- Sentry 중복 방지 가드는 reported ref로 한다. 첫 오류에만 `reportHandled`를 부른다.
- `userId`가 `null`이면 애초에 보고하지 않는다.

### 오류 분기

- 네트워크 실패는 `ApiError`가 아니다. 조용히 넘기고 다음 주기에 다시 보낸다.
- `ApiError`의 `400`·`404`·`409`는 stop ref를 세워 그 세션 보고를 멈춘다.
- `ApiError` 전부 첫 1회만 `reportHandled(error, "session-snapshot")`으로 남긴다.
- 나머지 `ApiError`(`5xx` 등)는 stop 없이 다음 주기에 다시 보낸다.

## 데이터 흐름

```text
studying 진입
  → 30초 interval 시작
  → 매 30초: in-flight 아니고 stop 아니면 스냅샷 PUT
  → 서버가 draft를 덮어쓰거나(204) 역순이면 무시(204)
종료(정상)
  → interval 정리
  → submitStudySession으로 최종 제출
  → 서버가 draft 정리
비정상 종료(강제종료·크래시)
  → interval 멈춤(마지막 스냅샷이 서버에 남아 있음)
  → 5분 뒤 서버가 마지막 스냅샷으로 자동 확정
```

## 실패 처리

- 네트워크 실패는 다음 주기에 저절로 회복된다. 스냅샷이 누적값이라 한 번 놓쳐도 다음 것이 전부 담는다.
- 재시도 큐를 두지 않는다. 놓친 스냅샷을 따로 모아 보낼 이유가 없다.
- `400`·`404`·`409`는 그 세션 동안 보고를 멈추고 Sentry에 한 번 남긴다. `409`는 세션이 이미 확정된 상태로 보고 재시도하지 않는다.

## 제거 대상

- `apps/web/src/features/study-session/sessionCheckpoint.ts`를 삭제한다.
- `apps/web/src/features/study-session/resubmitPendingSessions.ts`를 삭제한다.
- `App.tsx`에서 재제출 실행과 저장 완료 토스트를 걷어낸다.
- `useStudyRoomSession`의 `writeCheckpoint`·`deleteCheckpoint`·`lastCheckpointMsRef`와 틱 안의 10초 저장을 걷어낸다.
- 관련 테스트를 정리한다.
- `SUB_MINUTE_SEC`은 결과 화면과 문구에서 계속 쓰므로 남긴다.

## 테스트

### reportActiveSession 모듈

- 요청 본문이 `reportedAt`을 기준 시각으로 조립되는지 확인한다.
- 클램프가 최종 제출과 같은 규칙으로 걸리는지 확인한다.
- `204`를 성공으로 처리하는지 확인한다.
- `400`·`404`·`409`가 호출부에서 구분되도록 상태를 실어 던지는지 확인한다.

### 세션 훅 연동

- studying 동안 30초마다 스냅샷이 나가는지 확인한다.
- 첫 보고가 t=30에 나가는지 확인한다.
- 진행 중인 요청이 안 끝났으면 다음 주기를 건너뛰는지 확인한다.
- `400`·`404`·`409` 이후 그 세션 보고가 멈추는지 확인한다.
- 네트워크 실패 이후에도 보고가 계속되는지 확인한다.
- `userId`가 `null`이면 보고하지 않는지 확인한다.
- studying이 끝나면 interval이 정리되는지 확인한다.

### 제거 검증

- `App.tsx`가 더 이상 재제출을 실행하지 않는지 확인한다.
- 세션이 localStorage에 기록을 쌓지 않는지 확인한다.

## 백엔드 확인 사항

- 운영 API 호스트에서도 개발 서버와 같은 CORS 허용 목록이 걸려 있는지 확인한다.
