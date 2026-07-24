# SCRUM-259 [FE] 익명 기기 유저 등록 API 연동 — 설계

- 날짜: 2026-07-24
- Jira: [SCRUM-259](https://breathless-youth.atlassian.net/browse/SCRUM-259)
- 브랜치: `feature/SCRUM-259-FE-익명-기기-유저-등록-API-연동` (dev에서 분기)
- 근거 결정: `.ai/notes/2026-07-23-로그인-도입-시점-변경.md` — 로그인(Google/Apple)은 V1.2로 연기, V1.0~V1.1은 익명 기기 계정으로 서버 동기화

## 목표

앱 최초 실행 시 기기 UUID를 발급해 보안 저장소에 보관하고, `POST /api/users`로 서버에 등록해 `userId`를 발급받아 로컬에 저장한다. 이후 모든 API 호출이 이 `userId`를 사용한다.

## API 계약 (BE Swagger 확인 완료)

`POST {apiBaseUrl}/api/users` — 인증 불필요 (이 호출 자체가 최초 유저 식별 수단)

| 항목 | 내용                                                                                |
| ---- | ----------------------------------------------------------------------------------- |
| 요청 | `{ "deviceId": string }` — UUID 형식 (`[0-9a-fA-F]{8}-...`), 서버가 소문자로 정규화 |
| 201  | 신규 등록 — `{ "userId": number, "isNew": true }`                                   |
| 200  | 재등록(멱등) — `{ "userId": number, "isNew": false }`                               |
| 400  | deviceId 누락/형식 오류 — `{ "message": string }`                                   |

## 구조

```
packages/types/src/index.ts        (수정) UserRegisterRequest / UserRegisterResponse 타입 추가
apps/mobile/lib/deviceId.ts        (신규) 기기 UUID get-or-create
apps/mobile/lib/userApi.ts         (신규) POST /api/users 호출 + userId 보관
apps/mobile/app/_layout.tsx        (수정) 부팅 시 등록 1회 실행
apps/mobile/app.json               (수정) extra.apiBaseUrl 추가 (기존 extra.webAppUrl 패턴과 동일)
```

## 데이터 흐름

1. 앱 부팅(`app/_layout.tsx`) → `getOrCreateDeviceId()`: SecureStore에 UUID가 있으면 반환, 없으면 `expo-crypto`의 `randomUUID()`로 생성 후 SecureStore에 저장.
2. SecureStore에 `userId`가 이미 있으면 네트워크 호출 생략(등록 완료 상태).
3. 없으면 `registerUser(deviceId)`: `POST /api/users` → `{ userId, isNew }` 수신 → `userId`를 SecureStore에 저장.

## 에러 처리 — fail-soft

- 등록 실패(네트워크 오류, 400 등) 시 앱은 정상 진입시키고, 다음 앱 실행 때 자동 재시도한다.
  - 근거: API가 멱등이라 재시도가 안전하고, V1.0에서 userId를 소비하는 화면이 아직 없어 부팅을 막을 이유가 없다.
- 에러는 콘솔 로그만 남긴다. 400 응답의 `{ message }`는 파싱해 로그에 포함한다.
- 원본 프레임·얼굴 데이터 등 개인정보 이슈 없음 — 전송 값은 기기 UUID뿐.

## 의존성 (신규 2개)

- `expo-secure-store`, `expo-crypto` — 둘 다 Expo 공식 SDK 모듈로 Expo Go(SDK 54)에 기본 포함. "검증 안 된 네이티브 라이브러리 추측 설치 금지" 규칙에 저촉되지 않는다.
- HTTP 클라이언트는 내장 `fetch` 사용 (axios 등 추가하지 않음).

## 테스트

`apps/mobile/lib/__tests__/` 기존 패턴(jest-expo, `formatDuration.test.ts` 참고)을 따른다.

- `deviceId.test.ts`: SecureStore mock — 저장된 UUID 재사용 / 없으면 생성·저장.
- `userApi.test.ts`: fetch mock — 201(신규), 200(재등록), 400(에러 메시지 파싱), 네트워크 오류(throw 없이 실패 반환) 케이스.

## 범위 밖 (YAGNI)

- 온보딩 분기(`isNew` 활용 UI) → 별도 티켓
- 기록/설정 탭, 공부 세션 API(`/api/study-sessions`) 연동 → 별도 티켓
- WebView(`apps/web`)로 userId 전달 → 세션 제출 티켓에서 다룬다
- 로그인(Google/Apple)·계정 병합 → V1.2+
