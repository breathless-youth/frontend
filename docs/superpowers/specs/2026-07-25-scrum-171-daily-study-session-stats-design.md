# SCRUM-171 일일 공부 세션 통계 조회 설계

## 목표와 범위

모바일 앱이 백엔드의 `GET /api/stats`를 호출해 특정 사용자의 특정 날짜 공부 세션 통계를 조회할 수 있게 한다. 이 작업은 SCRUM-163이 제공하는 실제 Swagger 계약만 사용한다.

포함 범위는 API 계약 타입, 모바일 API 클라이언트, 자동 테스트다. 일일 기록 화면 UI와 그래프(SCRUM-174)는 포함하지 않는다.

## API 계약

- 요청: `GET {apiBaseUrl}/api/stats?userId=<number>&date=<YYYY-MM-DD>`
- 성공: 세션 요약 목록, 일일 합계, 최장 집중 시간, 집중률, 상태별 이벤트 수, 해당 월 공부일을 담은 객체
- 오류: 비성공 HTTP 응답의 JSON `message`를 우선 사용하고, 없으면 HTTP 상태를 포함한 오류 메시지를 사용한다.

`UserRegisterResponse`와 마찬가지로 서버 전송 계약은 `@focusmakers/types`에 정의한다. 상태 키는 Swagger enum인 `PHONE`, `DEVICE`, `AWAY`, `PAUSE`로 제한한다.

## 구현 경계

- `apps/mobile/lib/statsApi.ts`는 Expo 설정의 `extra.apiBaseUrl`을 사용해 네트워크 호출과 오류 변환만 담당한다.
- 화면·상태 관리·날짜 선택은 후속 UI 티켓의 책임으로 남긴다.
- API 호출은 `listStudySessionStats(userId, date)`로 노출한다. 날짜 형식이나 응답 집계를 클라이언트에서 재계산하지 않는다.

## 개발 중 응답 확인

개발 단계에서는 실제 반환값을 확인하기 위해 API 호출 직후 임시 `console.log`를 사용한다. 이 로그는 테스트로 응답 매핑을 검증한 뒤 최종 커밋 전에 반드시 제거한다. 오류 로그나 개인정보 데이터를 추가로 기록하지 않는다.

## 테스트

Jest에서 기존 `userApi` 패턴을 따라 다음을 검증한다.

1. 정확한 URL 및 GET 요청으로 Swagger 응답을 반환한다.
2. 세션이 없는 0값 응답을 그대로 반환한다.
3. JSON 오류 메시지가 있는 비성공 응답은 해당 메시지로 실패한다.
4. 네트워크 실패는 호출자에게 전달된다.

## 제외 및 완료 조건

- UI 렌더링, 월간 그래프, streak API는 구현하지 않는다.
- 완성 시 임시 응답 로그가 소스에 남아 있지 않아야 한다.
- API 클라이언트 단위 테스트, 모바일 타입 검사, 린트, 전체 테스트가 통과해야 한다.
