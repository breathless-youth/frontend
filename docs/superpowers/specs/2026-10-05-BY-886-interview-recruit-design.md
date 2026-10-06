# 인앱 인터뷰 모집 FE 설계

- 날짜: 2026-10-05
- 티켓: [BY-886](https://breathless-youth.atlassian.net/browse/BY-886) (FE), 짝 티켓 [BY-833](https://breathless-youth.atlassian.net/browse/BY-833) (BE, dev 배포 완료), 흡수 [BY-377](https://breathless-youth.atlassian.net/browse/BY-377)
- 명세: `.ai/product/specs/BY-821-인앱-인터뷰-모집.md`
- 시안: Figma `FocusMakers-V2-Design` › `S7 · 인터뷰 모집 (Soft Blue)` 섹션과 다크 섹션
- 브랜치: `feature/BY-821-interview-recruit` (base `dev`)

## 1. 목적

서버가 판정한 인터뷰 대상에게 홈 공지 모달, 완료 화면 카드, 설정 행을 보여주고 닉네임을 미리 채운 구글폼으로 신청을 받는다.
누가 대상인지는 서버가 정하고, 언제 얼마나 자주 띄울지는 웹이 정한다.
BY-377 공지 팝업을 새 공지 템플릿으로 다시 만들어 일반 공지도 같은 모달로 띄운다.

## 2. 확정 결정

| 항목                  | 결정                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 구조                  | 노출 판정 모듈 하나를 두고, 화면 세 곳은 그 결과만 그린다                                                         |
| 구글폼 열기           | 앱 안 화면 `/interview`에서 iframe으로 연다 (문의하기와 같은 방식, 웹 배포만으로 끝남)                            |
| 공지 우선순위         | 일반 공지(`ALL`)를 먼저 띄우고, 인터뷰 공지는 일반 공지가 없을 때만 띄운다                                        |
| 일반 공지 닫기        | BY-377 규칙을 유지한다 (`닫기`는 이번 방문만, `다시 보지 않기`만 영구)                                            |
| 기록 없는 기존 사용자 | 첫 방문으로 보고, 떠난 시각만 저장한 뒤 다음 재방문부터 1번 모달을 띄운다                                         |
| 설정 행 클릭          | 신청으로 친다 (이후 모달·카드 중단)                                                                               |
| 노출 순번             | source별로 따로 센다, 설정 행은 노출을 세지 않고 클릭만 남긴다                                                    |
| 완료 카드 위치        | 솔로 결과 화면과 소셜 룸 결과 화면 모두                                                                           |
| 카드 본문             | `15분 통화하면 스타벅스 기프티콘 100% 증정` (명세 기준, Figma의 `드려요` 문구는 이전 버전)                        |
| 설정 행 트레일링      | chevron (앱 안 화면이라 문의하기 행과 맞춘다, Figma는 외부 링크 아이콘)                                           |
| 마스코트 이미지       | Figma S7의 큰 이미지용 전화 마스코트를 2x PNG로 내보내 `apps/web/public/images/interview/mascot-phone.png`에 둔다 |
| 배포                  | dev에서 화면을 확인한 뒤 바로 release하고, main 머지 직전에 BE에 시각을 알린다                                    |
| 테스트 계정           | 2·3번 그룹 계정을 BE에 요청한다                                                                                   |

## 3. 서버 API

두 API 모두 JWT가 필요하고 `API-Version: 1`이다.

### `GET /api/notices/active`

```json
[
  {
    "id": 1,
    "title": "포메에 의견을 들려주실 분을 찾아요",
    "content": "아직 타이머를 안 써보셨어도 괜찮아요. ...",
    "imageUrl": "/images/interview/mascot-phone.png",
    "audience": "G1_NOT_STARTED",
    "badgeText": "스타벅스 기프티콘 100% 증정",
    "buttonText": "인터뷰 신청하기",
    "buttonUrl": "https://docs.google.com/forms/.../viewform?usp=pp_url&entry.1606714956=NICKNAME"
  }
]
```

- `audience`는 `ALL`, `G1_NOT_STARTED`, `G2_LAPSED` 중 하나다.
- `imageUrl`, `badgeText`, `buttonText`, `buttonUrl`은 없으면 `null`이다 (`buttonText`와 `buttonUrl`은 같이 있거나 같이 없다).
- 정렬은 최신 시작순이고 우선순위가 아니다.
- `imageUrl`은 웹 기준 상대 경로로 온다.

### `GET /api/interview/status`

```json
{
  "cardEligible": true,
  "cardUrl": "https://...",
  "settingsEnabled": true,
  "settingsUrl": "https://..."
}
```

- `cardEligible`은 3번 그룹이고 서버 설정이 켜져 있을 때 `true`다.
- `settingsEnabled`는 그룹과 무관하게 서버 설정이 켜져 있으면 `true`다.
- 꺼진 쪽의 URL은 `null`이다.
- 세션을 제출한 뒤 부르면 방금 끝낸 세션까지 반영된다.

### 구글폼 링크

- 공지 `buttonUrl`, `cardUrl`, `settingsUrl`은 모두 같은 링크다.
- 링크의 `NICKNAME`을 `encodeURIComponent(닉네임)`으로 바꿔서 연다.
- 닉네임을 가져오지 못하면 `NICKNAME`을 빈 값으로 바꾼다.

## 4. 구조

```
packages/types
  NoticeResponse        audience·badgeText·buttonText·buttonUrl 추가
  InterviewStatusResponse
  API_ENDPOINTS         notices·interview 추가 (version "1")

apps/web/src
  lib/noticeApi.ts, lib/noticeQueries.ts          GET /api/notices/active
  lib/interviewApi.ts, lib/interviewQueries.ts    GET /api/interview/status
  features/interview/
    interviewGate.ts       노출 판정 (순수 함수)
    interviewStore.ts      localStorage 어댑터
    interviewForm.ts       NICKNAME 치환
    lastHidden.ts          문서가 가려진 시각 기록
    InterviewCard.tsx      완료 화면 카드
  features/notice/
    noticeSelection.ts     홈에서 띄울 공지 하나 고르기 (순수 함수)
    noticeDismissStore.ts  일반 공지 다시 보지 않기 저장
    NoticeModal.tsx        공지 템플릿
    NoticeModalHost.tsx    홈 연결
  routes/GoogleFormPage.tsx   ContactPage를 일반화, /contact와 /interview가 같이 쓴다
```

- API 함수는 `apiFetch`와 `API_ENDPOINTS`를 쓴다 (BY-377의 생 `fetch`는 가져오지 않는다).
- 저장소 어댑터는 `onboardingGuideStore`와 같은 형태로, 인터페이스와 localStorage 구현과 테스트용 메모리 구현을 둔다.
- 홈 웹뷰와 세션 웹뷰는 서로 다른 문서지만 localStorage를 공유하므로 빈도 규칙이 화면을 가로질러 맞는다.

## 5. 노출 판정

### 저장값

localStorage `focuson.interview.v1` 하나에 JSON으로 둔다.

| 필드              | 쓰임                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `applied`         | 모달·카드·설정의 신청 버튼을 누르면 `true`, 이후 모달과 카드를 띄우지 않는다           |
| `modalCount`      | 지금까지 띄운 인터뷰 모달 수, 2가 되면 더 띄우지 않는다                                |
| `firstModalAt`    | 첫 모달 시각, 두 번째 모달은 이 시각부터 7일(168시간) 뒤에 가능하다                    |
| `modalNeverAgain` | 모달의 `다시 보지 않기`를 누르면 `true`, 모달만 멈추고 카드는 계속 뜬다                |
| `lastPromptDate`  | 모달이나 카드를 마지막으로 띄운 기기 날짜(`YYYY-MM-DD`), 같은 날 두 번째 안내를 막는다 |
| `cardShownDate`   | 카드를 마지막으로 띄운 기기 날짜                                                       |
| `cardShownCount`  | 지금까지 띄운 카드 수, 카드 노출 순번으로 쓴다                                         |

- 문서가 가려진 시각은 자주 바뀌므로 별도 키 `focuson.interview.lastHiddenAt`에 둔다.
- 일반 공지의 `다시 보지 않기`는 BY-377과 같은 `focuson.noticeDismissed.{id}` 키를 쓴다.

### 재방문 판정

- 앱의 모든 웹 문서가 `visibilitychange`로 가려질 때 `lastHiddenAt`에 현재 시각을 쓴다.
- 홈이 보이게 될 때 `지금 - lastHiddenAt`이 30분을 넘으면 재방문이다.
- `lastHiddenAt`이 없으면 첫 방문으로 보고 1번 모달을 띄우지 않는다.
- 탭을 바꾸면 떠나는 탭이 가려지며 시각을 바로 갱신하므로, 탭 이동은 재방문으로 세지 않는다.

### 모달 조건

모든 조건을 통과해야 인터뷰 모달을 띄운다.

- `applied`가 `false`다.
- `modalNeverAgain`이 `false`다.
- `modalCount`가 2 미만이다.
- `modalCount`가 1이면 `firstModalAt`에서 7일이 지났다.
- `lastPromptDate`가 오늘이 아니다.
- `G1_NOT_STARTED` 공지는 재방문일 때만 대상이다.

### 카드 조건

- 서버 `cardEligible`이 `true`다.
- `applied`가 `false`다.
- `cardShownDate`가 오늘이 아니다 (카드는 하루 한 번이고, X는 그날만 닫는 효과가 된다).
- `lastPromptDate`가 오늘이 아니다.

### 공통 규칙

- 저장소를 읽지 못하면 띄우지 않는다.
- 저장소에 쓰지 못하면 무시한다 (최악의 경우 한 번 더 뜬다).
- 날짜는 기기 로컬 날짜 기준이다.

## 6. 화면

### 홈 공지 모달

띄우는 시점은 홈이 보이게 될 때다 (처음 마운트될 때와 `visibilitychange`로 다시 보일 때).

홈에 겹칠 수 있는 창의 순서는 일반 공지(`ALL`), 인터뷰 모달(`G1`·`G2`), 세션 복구 창이다.

1. 이번 실행에서 이미 공지 모달을 띄웠으면 띄우지 않는다.
2. `다시 보지 않기`하지 않은 `ALL` 공지가 있으면 가장 최신 것을 띄운다.
3. 없으면 `G1_NOT_STARTED`·`G2_LAPSED` 공지 중 모달 조건을 통과한 가장 최신 것을 띄운다.
4. 응답이 왔을 때 홈이 가려져 있으면 아무것도 띄우거나 기록하지 않고, 다시 보일 때 정한다.

세션 복구 창은 공지를 막지 않고 공지 뒤에 뜬다.

- 이번 실행의 공지 판단이 끝나야 복구 창을 띄운다. 끝났다는 것은 띄울 공지가 없거나(조회 실패, 이미 띄운 실행, 사용자 정보 없음 포함) 띄운 공지를 어느 버튼으로든 닫은 경우다.
- 공지를 닫을 때 복구 결과가 이미 와 있으면 바로 띄우고, 나중에 오면 올 때 띄운다.
- 공지 조회가 3초 안에 끝나지 않고 띄운 공지도 없으면 판단이 끝난 것으로 본다. 그 조회의 늦은 응답은 띄우지도 기록하지도 않고, 다음에 홈이 보일 때 다시 정한다. 복구 창이 떠 있는 동안에는 그때도 띄우지 않는다.
- 복구 창이 떠 있는 동안 홈이 다시 보여도 그 위에 공지를 띄우지 않는다.

조립은 기존 컴포넌트로 한다.

- 틀은 `components/ui/dialog.tsx`를 쓰고 `SessionRecoveryDialog`처럼 `showCloseButton={false}`, 바깥 탭과 Esc 닫기를 막는다.
- 하단 탭바는 세션 복구 창과 같이 숨기지 않고 딤으로 덮어 터치만 막는다 (`aria-modal`을 `nativeModalOverlay`가 감지한다).
- 이미지는 `imageUrl`이 있을 때만 그리고, 비율은 310×174다.
- 배지는 `Badge variant="elevated"`를 쓰고 `badgeText`가 있을 때만 그린다.
- 신청 버튼은 `Button size="xl"`이고 인터뷰 공지에 `buttonText`가 있을 때만 그린다.
- 하단은 `다시 보지 않기 | 닫기` 두 텍스트 버튼이다.

버튼 동작은 공지 종류에 따라 다르다.

| 버튼             | 일반 공지                   | 인터뷰 공지                           |
| ---------------- | --------------------------- | ------------------------------------- |
| 신청(본 버튼)    | 그리지 않음                 | `applied = true`, `/interview`로 이동 |
| `다시 보지 않기` | `noticeDismissed.{id}` 저장 | `modalNeverAgain = true`              |
| `닫기`           | 이번 방문만 닫음            | 저장 없음 (이미 노출 횟수에 들어감)   |

- 인터뷰 모달을 띄우는 순간 `modalCount`, `firstModalAt`, `lastPromptDate`를 갱신한다.
- 일반 공지는 이번 범위에서 안내만 하므로 `buttonText`·`buttonUrl`이 있어도 본 버튼을 그리지 않는다.

### 완료 화면 카드

- 솔로 결과(`/room/:id/result`)와 소셜 룸 결과(`/social/room/:roomId/result`) 모두 `ResultPage`에 붙는다.
- 결과 연출이 끝나 요약 카드가 나타난 뒤 `GET /api/interview/status`를 부른다.
- 카드 조건을 통과하면 요약 카드와 하단 버튼 사이에 붙이고, 그 순간 `cardShownDate`, `cardShownCount`, `lastPromptDate`를 갱신한다.
- 제목은 `꾸준히 쓰는 이유를 들려주세요`, 본문은 `15분 통화하면 스타벅스 기프티콘 100% 증정`, 링크는 `인터뷰 신청하기 >`다.
- 틀은 `components/ui/card.tsx`, X는 44px 아이콘 `Button`이다.
- X를 누르면 카드를 숨긴다 (같은 날 다시 오지 않는 것은 `cardShownDate`가 보장한다).
- `인터뷰 신청하기`를 누르면 `applied = true`로 저장하고 `/interview`로 이동한다.

### 설정 행

- 설정 화면에 들어갈 때 `GET /api/interview/status`를 부르고 `settingsEnabled`가 `true`면 `지원` 섹션의 `문의하기` 아래에 `인터뷰 신청하기` 행을 둔다.
- `SettingsRow`에 배지 자리를 하나 추가하고 `기프티콘 증정`을 `Badge`로 그린다.
- 트레일링은 chevron이다.
- 누르면 `applied = true`로 저장하고 `/interview`로 이동한다.

### 신청 폼 화면 `/interview`

- `ContactPage`를 `GoogleFormPage`로 일반화하고, 제목과 폼 URL과 실패 문구만 받게 한다.
- 로딩, 실패 화면, 다시 시도, 뒤로 가기는 `ContactPage` 구현을 그대로 쓴다.
- 폼 URL은 `interview/status`의 링크에서 가져오고, 프로필 조회의 닉네임으로 `NICKNAME`을 바꾼다.
- 구글폼 iframe은 COEP 예외 문서에서만 뜨므로 `/interview`도 하드 내비게이션으로 들어가고 나간다.
- `vercel.json`의 COEP 예외에 `/interview`를 더하고, `nativeTabBar`의 전체 화면 경로에도 더한다.
- 결과 화면에서 열었다가 돌아오면 결과 화면 문서가 다시 열려 완료 연출이 한 번 더 재생될 수 있다 (세션 데이터는 기록 항목의 state에 남아 화면은 정상으로 돌아온다).

## 7. Amplitude

`lib/amplitude.ts`에 타입이 붙은 함수 세 개를 더한다.

| 이벤트                | 시점                                       | 속성                                  |
| --------------------- | ------------------------------------------ | ------------------------------------- |
| `interview_shown`     | 인터뷰 모달이 열릴 때, 카드가 붙을 때      | `source`, `exposure`                  |
| `interview_clicked`   | 신청 버튼을 누를 때                        | `source`, `exposure` (설정 행은 없음) |
| `interview_dismissed` | `닫기`, `다시 보지 않기`, 카드 X를 누를 때 | `source`, `exposure`, `action`        |

- `source`는 `g1_revisit`, `g2_return`, `g3_complete`, `settings` 중 하나다.
- `exposure`는 source별 순번이다 (모달은 `modalCount`, 카드는 `cardShownCount`).
- `action`은 `close`, `never_again`, `x` 중 하나다.
- 일반 공지는 이 이벤트를 남기지 않는다.

## 8. 에러 처리

- 공지·인터뷰 상태 조회가 실패하면 아무것도 띄우지 않고 `console.warn`만 남긴다 (Sentry로 보내지 않는다).
- 토큰을 아직 받지 못했으면(`useIdentityPending`) 조회하지 않는다.
- 닉네임 조회가 실패하면 `NICKNAME`을 빈 값으로 바꿔 연다.
- 저장소 오류는 5장 공통 규칙을 따른다.

## 9. 테스트

TDD로 진행하고, 케이스 목록은 5-1 게이트에서 다시 승인받는다.

- `interviewGate` 단위: 7일 경계, 2번 제한, 같은 날 두 번째 차단, 신청 후 중단, 다시 보지 않기 후 카드는 유지, 재방문 30분 경계, 기록 없음은 첫 방문.
- `noticeSelection` 단위: 일반 공지 우선, 숨긴 일반 공지 건너뜀, G1은 재방문일 때만, 가려진 사이 온 응답은 기록하지 않음. 홈 순서: 공지가 닫히거나 띄울 공지가 없을 때만 세션 복구 창.
- `interviewForm` 단위: 한글·띄어쓰기·이모지 인코딩, 닉네임 없음.
- 컴포넌트: 모달의 이미지·배지·버튼 유무, 카드 X와 신청, 설정 행 on/off, `GoogleFormPage`의 URL.
- Amplitude: 이벤트 세 개의 호출 인자.
- 화면 확인: 라이트·다크 스크린샷, reduced-motion, 44px 터치 타겟과 aria 점검.

## 10. 범위 밖

- 그룹 판정과 on/off는 서버(BY-833)가 맡는다.
- 푸시는 Firebase 콘솔에서 보낸다.
- 외부 브라우저로 링크를 여는 브리지는 만들지 않는다.
- 폼 제출 여부를 앱이 돌려받는 연동은 하지 않는다.

## 11. 남은 일

- BE에 Swagger의 `USER_ID` 예시와 "사용자 ID 자리는 앱이 채운다" 설명을 닉네임 기준으로 고쳐 달라고 요청한다.
- Figma 카드 문구를 `증정`으로 맞춰 달라고 디자인 쪽에 알린다.
- 10단계 완료 처리 전에 BY-886 본문의 "사용자 ID 임시값 치환"을 닉네임 치환으로 고친다.
