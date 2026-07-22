# 도메인 용어집

## 시간·지표

| 용어         | 영문/코드 표현                         | 설명                                                                                                          |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 총 공부 시간 | `totalStudyTime` / `totalStudySeconds` | 세션 시작~종료 전체 경과 시간 중 집계에 포함되는 시간(공부 중 + 자리 비움). 일시정지·카메라 꺼짐 구간은 제외. |
| 순공시간     | `focusStudyTime` / `pureStudySeconds`  | `STUDYING`(공부 중) 판정 구간만 누적한 시간.                                                                  |
| 집중률       | `focusRate`                            | 순공시간 / 총공부시간. 총공부시간이 0이면 0. 범위 0~1.                                                        |

## 공부 상태 (`StudyStatus`)

순간적인 Vision AI 판정 상태. `@focuson/study-core`가 소유한다.

| 상태        | 코드         | 한글 표기   | 집계 반영                 |
| ----------- | ------------ | ----------- | ------------------------- |
| 공부 중     | `STUDYING`   | 공부 중     | 총공부시간 ○ / 순공시간 ○ |
| 자리 비움   | `AWAY`       | 자리 비움   | 총공부시간 ○ / 순공시간 ✕ |
| 일시정지    | `PAUSED`     | 일시정지    | 총공부시간 ✕ / 순공시간 ✕ |
| 카메라 꺼짐 | `CAMERA_OFF` | 카메라 꺼짐 | 총공부시간 ✕ / 순공시간 ✕ |

## 세션·타임라인

| 용어            | 영문/코드 표현        | 설명                                                                                                                 |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 스터디 모드     | `StudyMode`           | `"single"`(싱글) / `"multi"`(멀티 종일룸).                                                                           |
| 세션            | `FocusSession`        | 사용자가 스터디를 시작해서 종료할 때까지의 한 단위(서버 레코드).                                                     |
| 세션 생명주기   | `SessionStatus`       | 세션 전체 생명주기 상태(`"active"`/`"paused"`/`"ended"`). 순간 `StudyStatus`와 다른 축.                              |
| 타임라인 이벤트 | `FocusTimelineEvent`  | 클라이언트 내부 시간 계산용 순수 이벤트(상태 + 시각). `study-core` 소유.                                             |
| 세션 요약       | `StudySessionSummary` | 총공부시간/순공시간/집중률 집계 결과. `study-core` 소유.                                                             |
| 포커스 이벤트   | `FocusEvent`          | **서버로 전송되는** 이벤트 레코드(API 계약, `sessionId` 포함). 클라이언트 시간 계산에는 `FocusTimelineEvent`를 쓴다. |
| 스터디룸        | `StudyRoom`           | 멀티 모드에서 여러 참가자가 모이는 공간(LiveKit 방).                                                                 |
| 참가자          | `Participant`         | 스터디룸에 참여한 사용자.                                                                                            |
| 캠스터디        | Cam-study             | 카메라를 켠 채로 공부하는 서비스 형태.                                                                               |

## 타입 소유권

- `StudyStatus`, `FocusTimelineEvent`, `StudySessionSummary`와 모든 계산 함수 → `@focuson/study-core` (순수 TS).
- `FocusSession`, `FocusEvent`, `StudyRoom`, `Participant`, `StudyMode`, `SessionStatus` → `@focuson/types` (서버 전송용/API 계약).
- `@focuson/types`는 `StudyStatus`/`StudySessionSummary`를 `@focuson/study-core`에서 재노출한다(한 곳에서 import 가능).

`FocusEvent`(서버 전송용)와 `FocusTimelineEvent`(클라이언트 계산용)는 이름이 비슷하지만 의도가
다르다. 자세한 경계 결정은 [ADR 0002](./adr/0002-native-mobile-study-room-and-independent-web.md) 참고.
