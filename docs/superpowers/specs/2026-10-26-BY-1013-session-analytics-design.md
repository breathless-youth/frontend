# BY-1013 26.44.0 기능 Amplitude 계측 설계

26.44.0에 나간 멀티 타이머(BY-964·990·991)와 소셜룸 개편(BY-972~975)의 사용자 지표를 Amplitude로 보게 한다. 웹만 바꾸고 main으로 바로 배포한다(웹 `26.44.1`).

## 배경

- 멀티 타이머에는 계측이 하나도 없다.
- 과목·배경음 이벤트에 방 구분이 없어 싱글룸과 소셜룸 수치가 섞인다.
- 뽀모도로 휴식이 일시정지(`PAUSE`, trigger `BREAK`)로 기록돼 `study_session_ended`의 `pause_sec`에 휴식이 더해진다. 휴식은 26.44.0부터 생겼으므로, 휴식을 빼면 `pause_sec`이 그 전과 같은 뜻으로 돌아간다.

## 결정 (2026-10-26 사용자 승인: P1 전체와 P2의 15·16)

속성은 enum·boolean·숫자만 쓰고 이름은 snake_case다. 기존 이벤트 이름은 바꾸지 않는다.

| #   | 이벤트 / 속성                         | 보내는 때                                          | 속성                                                                                                                                  |
| --- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `study_session_ended`에 `break_sec`   | 세션 종료                                          | 휴식 구간 길이 합(없으면 0). `pause_sec`에서는 휴식을 뺀다                                                                            |
| 2   | `study_session_ended`에 `multi_timer` | 세션 종료                                          | 이 세션에서 한 번이라도 시작한 종류 `none`·`timer`·`pomodoro`·`both`. 소셜룸은 `none`                                                 |
| 3   | `multi_timer_opened`                  | 타이머 페이지를 열 때                              | `kind`(`timer`·`pomodoro`)                                                                                                            |
| 4   | `multi_timer_started`                 | 설정 화면에서 시작해 실제로 시작됐을 때            | `kind`, 타이머면 `timer_sec`, 뽀모도로면 `focus_min`·`break_min`, `sound_on`, `from_pause`(멈춘 세션 위에서 시작했는지)               |
| 5   | `multi_timer_phase_completed`         | 끝 알림 하나마다                                   | `phase`(`timer`·`focus`·`break`), `sound_on`                                                                                          |
| 6   | `multi_timer_closed`                  | 사용자가 닫을 때만(세션이 끝나 닫히는 경우는 제외) | `kind`, `state`(`setup`·`running`·`paused`), `started`(이번에 연 동안 시작했는지), `open_sec`, 뽀모도로면 `phase`(`focus`·`break`)    |
| 7   | 과목 이벤트에 `room_type`             | 기존과 같음                                        | `subject_sheet_opened`·`subject_sheet_closed`·`subject_item_selected`·`subject_item_added`(세션 과목 페이지에서만, 플래너에서는 생략) |
| 8   | 배경음 이벤트에 `room_type`           | 기존과 같음                                        | `ambient_sound_changed`·`ambient_sound_duck_toggled`                                                                                  |
| 9   | `invite_shared`에 `source`            | 기존과 같음                                        | `code_page`(초대코드 화면)·`room_menu`(방 안 더보기). Meta 전환 이벤트는 바꾸지 않는다                                                |
| 10  | `multi_timer_restarted`               | 진행 중(시작 전이 아닐 때) 처음부터를 누를 때      | `kind`, 뽀모도로면 `phase`                                                                                                            |
| 11  | 사용자 속성 `used_multi_timer`        | 처음 시작할 때 한 번(`setFlagOnce`)                | Firebase 사용자 속성 허용 목록에는 넣지 않는다                                                                                        |

- 낡은 주석 두 곳(`amplitude.ts`, `useStudyRoomSession.ts`의 "소셜룸은 배경음 생략")을 지금 동작에 맞게 고친다.
- 개인정보처리방침의 "서비스 이용 기록" 범위 안이라 처리방침은 고치지 않는다.
- 같은 PR에서 웹 버전을 `pnpm release:bump --web`으로 `26.44.1`로 올린다.

## 테스트

- 각 이벤트가 정한 때에 정한 속성으로 한 번 나간다(`amplitude.test.ts` 방식, 훅·화면 테스트에서 track 호출 확인).
- `study_session_ended`의 `break_sec`가 휴식 구간 합이고 `pause_sec`에는 휴식이 빠진다.
- `multi_timer`가 세션 동안 시작한 종류를 반영한다(안 썼으면 `none`).
- `multi_timer_closed`는 세션이 끝나 닫힐 때 나가지 않는다.
- `room_type`이 싱글룸과 소셜룸에서 각각 맞게 붙는다.
- 새 속성 값이 Firebase 전달 규칙(`ANALYTICS_PARAM_VALUE_PATTERN`)을 통과한다.

## 범위 밖

- P2의 나머지(`pomodoro_cycles`, `subject_used`, `session_more_menu_opened`, `controls_reveal_count`, `glass_chrome`)는 이번에 넣지 않는다.
- `eas.json` `ascAppId`는 이 PR에 넣지 않는다.
