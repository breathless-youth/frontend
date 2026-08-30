# QA용 EAS 빌드 프로필 추가 (BY-485)

- 대상: `apps/mobile`
- 관련 티켓: BY-485 (BY-482 하위)
- 작성일: 2026-08-30

## 배경

EAS 빌드 프로필은 `production`·`preview`(둘 다 운영 주소)와 `development`(로컬 개발용)뿐이라, 개발 환경(`web-dev.focusmakers.app`·`api-dev.focusmakers.app`)을 여는 배포 가능한 QA 빌드가 없다. 그래서 QA와 팀 내부 검증이 TestFlight의 운영 빌드로 이뤄져 테스트 데이터가 운영 DB에 쌓였다. 현업 표준처럼 출시 후보 검증용(preview, 운영)과 일상 QA용(qa, 개발)을 분리한다.

BY-482에서 `web-dev.focusmakers.app`(dev 브랜치 자동 배포)과 개발 API CORS가 준비됐다.

## 변경 1: `eas.json`에 `qa` 프로필

```json
"qa": {
  "distribution": "internal",
  "env": {
    "API_BASE_URL": "https://api-dev.focusmakers.app",
    "WEB_BASE_URL": "https://web-dev.focusmakers.app"
  }
}
```

- `APP_VARIANT`를 넣지 않는다. `app.config.ts`의 개발 분기가 env 값을 읽고, 개발 빌드 가드가 두 주소를 통과시킨다 (`api-dev`·`web-dev`는 운영 호스트 목록에 없다). `app.config.ts`는 변경하지 않는다.
- `distribution: internal`은 기존 `preview`와 같은 내부 배포 방식이다. iOS는 기기 UDID 등록이 필요하다 (코드가 아니라 운영 절차).
- `autoIncrement`는 넣지 않는다. 스토어에 나가지 않는 빌드라 버전 자동 증가가 필요 없다.
- 주소를 커밋해도 새로 노출되는 것이 없다. `api-dev` 주소는 이미 공개 저장소의 `apps/web/scripts/resolveApiBase.ts`에 있다.

## 변경 2: 테스트 (`appConfigVariant.test.ts` 확장)

- `eas.json`의 `qa` 프로필이 존재하고 `APP_VARIANT`를 선언하지 않는다 (선언되면 운영 주소 빌드가 되는 회귀를 막는 핀).
- `qa` 프로필의 env 주소 두 개가 개발 분기 가드를 통과해 `extra`에 그대로 반영된다 (`resolveExtra`로 실검증 — 가드 목록에 dev 호스트가 잘못 추가되면 여기서 걸린다).

## 완료 조건

- `eas.json`에 위 형태의 `qa` 프로필이 있다.
- 테스트 2건이 통과하고 기존 모바일 테스트가 깨지지 않는다.
- `eas build --profile qa`로 만든 빌드가 `web-dev.focusmakers.app`를 열고 그 API 호출이 `api-dev`로 나간다 (실빌드 확인은 다음 QA 빌드 시점).

## 하지 않는 것

- 번들 ID·앱 이름 분기 (운영 앱과 나란히 설치는 필요해질 때 별도 작업).
- `production`·`preview` 프로필 변경.
- CI 자동 빌드 트리거 (QA 빌드는 필요할 때 수동 실행).
