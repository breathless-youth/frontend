# SCRUM-147: 최소 타이머 룸 + 공부 세션 제출 API 연동 설계

- 날짜: 2026-07-25
- 티켓: SCRUM-147 (에픽 "공부 세션") — UI 디자인 미완성이므로 검증 가능한 최소 UI로만 구현
- 브랜치: `feature/SCRUM-147-FE-공부-세션-제출-API-연동` (2026-07-25 기능 리셋 이후의 dev에서 분기)
- 백엔드: `POST /api/study-sessions` (개발 서버 http://52.78.219.53:8080 — 직접 테스트 허용)

## 목표

기능 리셋으로 스터디룸 화면이 없는 상태에서, **측정 원천을 최소 타이머로 재구축**하고
방 퇴장 시 세션을 서버에 제출해 저장 결과(총공부·순공·집중률·귀속날짜)를 사용자가 화면에서
직접 확인할 수 있게 한다. Vision AI·이벤트 생성은 이 티켓 범위가 아니다.

## API 계약 (Swagger 기준, 2026-07-25 갱신 반영)

`POST /api/study-sessions` — 배치 제출. 서버는 세션을 실시간 추적하지 않고,
총공부·순공 시간은 앱이 잰 값을 그대로 저장한다(검증·`statDate` 계산·저장만 서버 담당).

| 항목 | 내용 |
|---|---|
| 요청 | `{userId, startedAt, endedAt, studySec, focusSec, events[]}` — 전부 필수, 시각은 UTC ISO-8601 |
| `studySec` | 총 공부 시간(초). 0 ≤ studySec ≤ (endedAt−startedAt)−PAUSE 시간 합 |
| `focusSec` | 순공 시간(초). 0 ≤ focusSec ≤ studySec |
| `events[]` | 비공부 상태 이벤트(`PHONE`/`DEVICE`/`AWAY`/`PAUSE`)만 `{status, startedAt, endedAt}`. **이번 티켓에서는 항상 빈 배열 []** (발생 원천 없음) |
| 201 | `StudySessionResponse[]` — **항상 배열**. KST 자정을 넘으면 날짜별 2개로 분할. `id/userId/statDate/startedAt/endedAt/studySec/focusSec/focusRate/events` |
| 400 | `{message}` — 시간 규칙 위반(종료<시작, 24h 초과, 미래 시각(5분 허용)), studySec·focusSec 범위 등 |
| 404 | `{message}` — 미등록 userId (선행: POST /api/users) |

## 데이터 흐름

```
[웹 /room/:id]  ?userId=N 읽음 (없으면 제출 불가 안내)
   입장 시각 기록 → 경과 타이머 표시 (1초 간격)
        ↓ "공부 종료" 버튼
   endedAt = now, studySec = focusSec = floor((endedAt−startedAt)/1000), events = []
        ↓
   POST /api/study-sessions
        ↓
   인라인 결과 패널: 배열의 각 세션별 statDate·studySec·focusSec·focusRate 표시
   (실패 시: 서버 message + 재시도 버튼 / userId 없으면 로컬 요약 + "서버 저장 안 됨")
```

- Vision이 없으므로 이번 티켓에서 순공=총공부(전 구간 집중으로 간주)이다. Vision 도입 시
  focusSec 계산과 events 생성이 이 제출 경로에 꽂힌다 — 제출 함수는 값을 계산하지 않고
  받기만 하도록 분리해 그 확장 지점을 만든다.
- userId는 쿼리 파라미터로 받는다(모바일 WebView 재구축 시 SecureStore의 userId를
  `?userId=N`으로 부착하는 기존 승인 설계 그대로). 브라우저 단독 검증은 주소창에 직접 붙인다.

## 변경 파일 (전부 apps/web + packages/types — 모바일 무수정)

| 파일 | 변경 |
|---|---|
| `packages/types/src/index.ts` | `StudyEventStatus`, `StatusEventPayload`, `StudySessionCreateRequest`, `StudySessionResponse` 추가 (Swagger 그대로) |
| `apps/web/src/features/study-session/submitStudySession.ts` (신규) | 요청 값 검증·클램프(`focusSec ≤ studySec ≤ 세션길이`) + fetch POST. API 주소는 `import.meta.env.VITE_API_BASE_URL ?? "http://52.78.219.53:8080"` |
| `apps/web/src/routes/RoomPage.tsx` (신규) | 타이머 + 종료 버튼 + 결과/에러 패널 (한 파일, 최소 UI) |
| `apps/web/src/App.tsx` | `/room/:id` 라우트 재추가 |
| `apps/web/src/routes/HomePage.tsx` | 룸 진입 링크 복원(`/room/demo`) — 검증 편의 |

## 에러 처리

- 400/404: 서버 `message`를 결과 패널 자리에 표시 + 재시도 버튼(시작/종료 시각은 메모리 유지 — 종료 시각은 최초 종료 클릭 시점으로 고정해 멱등 재시도).
- 네트워크 실패: 동일.
- userId 없음: 종료는 동작, 제출 없이 로컬 요약 + "서버 저장 안 됨(userId 없음)" 안내.

## 테스트 + 수동 검증

- vitest: 요청 조립(ISO 변환·초 내림·클램프), fetch 201 배열 파싱, 400 message 추출.
- **수동 검증**: `pnpm --filter web dev` → 브라우저에서 `localhost:5173/room/1?userId=1` →
  잠시 대기 → 종료 클릭 → 결과 패널의 statDate·시간·집중률이 서버 응답과 일치하는지 확인.
  (userId 1은 이미 dev 서버에 등록돼 있음 — 다른 값으로 404 경로도 확인 가능.)

## 범위 밖 (YAGNI)

- Vision AI 감지·AWAY/PHONE/DEVICE/PAUSE 이벤트 생성 (후속 티켓 — 제출 함수의 입력만 확장)
- 모바일 WebView 룸 라우트 재구축·userId 자동 부착 (후속 티켓)
- GET 목록/스트릭 API, 일시정지 UI, 오프라인 큐, 디자인 적용 화면
