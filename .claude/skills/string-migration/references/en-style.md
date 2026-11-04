# FocusMakers 영어 표기 규칙 (초안)

사용자 검토 전 초안이다. 확정되면 위키 `.ai/product/voice-tone.md`의 영어 표기 규칙 절로 올린다. `en-copywriter`가 묶음마다 갱신한다.

## 기본

- 앱 이름은 FocusMakers다. 띄우거나 줄이지 않는다.
- 버튼·제목·탭은 sentence case다(`Start session`, `Start Session` 아님).
- 2인칭 you로 쓰고, 명령형 버튼은 동사로 시작한다.
- 느낌표는 축하 화면에서만 쓴다. 감사 토스트(`Thanks for your feedback`)에도 붙이지 않는다.
- 미국 영어 철자를 쓴다(`Cafe`, `canceled`).
- 말줄임은 한 글자 `…`를 쓴다(`Saving…`). 마침표 세 개를 쓰지 않는다.
- 범위는 en dash를 쓴다(`2–12 characters`, `8–10 PM`).

## 문장 유형별 (묶음 B에서 정함)

- 실패: `Couldn't load …`, `Couldn't copy`. `Failed to`, `Error:`로 시작하지 않는다.
- 다시 시도 권유: `Please try again in a moment`. 짧은 자리(토스트)는 `Try again`.
- 완료 토스트: 주어 없는 과거분사(`Profile saved`, `Version copied`, `Profile photo updated`). 사용자가 한 일을 시스템이 해 준 경우는 동사 과거형(`Blocked 3 distracting apps`).
- 자동 감지 상태(추정형 "~한 것 같아요"): `Looks like you're …`로 통일한다(`Looks like you're away`, `Looks like you're on your phone`, `Looks like you're moving your device`, `Looks like you're dozing off`).
- 툴팁 버튼 접근성 라벨: `About {{label}}`(ko `{{label}} 안내`).
- 설정 행 상태 값: `On` / `Off`.
- 업데이트 강제: `Update required` + `Update now`.

## 숫자·시간

- 시간 길이는 `3h 42m`, 1시간 미만은 `42m`, 1분 미만은 `42s`다. 한국어 규칙(1분 미만은 초)과 같은 단위를 쓴다(초안, 사용자 확인 필요).
- 시각은 로케일 기본 12시간제(`9:03 PM`)다. 시각 범위는 `8–10 PM`처럼 오전·오후 표기를 한 번만 쓴다.
- 날짜는 `Wednesday, October 1`, 월은 `October 2026`이다. 좁은 자리의 짧은 날짜는 `Wed, Oct 21`이다.
- 요일 한 글자 칸(히트맵)은 `M T W T F S S`다.
- 퍼센트는 숫자와 붙인다(`82%`).

## 복수형

- 개수가 붙는 문장은 en에 `_one`·`_other`를 둘 다 만들고 접미 없는 키는 en에서 지운다. ko는 접미 없는 키를 그대로 둔다(i18next가 ko에서 `_other`를 못 찾으면 기본 키로 떨어진다).
- 단수·복수 모양이 같은 문장(`{{count}} min`, `{{count}}-day streak`, `+{{count}} more`)은 접미 없는 키 하나로 둔다.
- 1회는 `once`로 쓴다(`Away once`, `#2, once`). `1 time`은 쓰지 않는다.

## 순위·횟수 (묶음 A에서 정함)

- 순위는 서수(1st, 2nd) 대신 `#{{rank}}`로 쓴다(`#2`, `You finished #1`, `Holding the #1 spot`). i18next 서수 복수형(`_ordinal_*`)은 쓰지 않는다. 코드가 `ordinal`을 넘기지 않고, 카탈로그 짝 검사도 `_ordinal_one`을 기본 키로 되돌리지 못한다.
- 상위 퍼센트는 `Top 10%`(라벨), 문장 안에서는 `top 10%`다.
- 남은 시간·마감은 `Ends in 3 days`, `Ends in 2h 30m`, `Ends at midnight`다.
- 순위 변동 낭독은 `Up 2 spots` / `Down 1 spot`이다.
- 큰 숫자 옆 작은 단위(`12` + `일`)는 en 값 앞에 공백을 둔다(`" days"`). 코드가 숫자와 단위를 붙여 그린다.

## 개인정보 문구 (묶음 C2에서 정함)

- 싱글룸 영상 안내와 소셜룸 영상 안내를 같은 영어로 쓰지 않는다. 소셜룸 영상은 같은 방 참여자에게 P2P로 전송된다.
- 소셜룸 카메라 안내는 "누가 보는지"와 "녹화·저장 안 함"만 말한다(`Only people in this room can see your video. It isn't recorded or saved.`). `never leaves your device`, `isn't sent to any server`는 소셜룸에 쓰지 않는다.
- 두 방이 같이 쓰는 화면은 AI 분석 범위로 한정한다(`Video used for AI analysis is processed only on your device`).
- 싱글룸 카메라 안내는 `Your camera video stays on your device`다(묶음 C1). 현재형으로 쓰고 `never`·`any server` 같은 강조는 붙이지 않는다. 사용자가 직접 공유하는 타임랩스 영상까지 부정하는 말로 읽히지 않게 한다.

## 세션 화면 (묶음 C1에서 정함)

- 세션 제출 오류는 `Couldn't save your session`으로 시작하고, 다시 시도하면 풀릴 수 있는 오류는 뒤에 `Please try again in a moment`를 붙인다. 이미 저장된 세션(`This session is already saved`)과 계정 확인 실패(`Couldn't verify your account`)는 이 틀을 따르지 않는다. 서버 `message`를 옮기지 않는다.
- 도움말의 `<hl>` 태그는 ko와 개수·이름을 같게 둔다. `whitespace-pre` 자리는 고정 줄바꿈 한 줄을 25자 안팎으로 둔다.
- 스크린리더용 시간 길이(`duration.sr*`)는 단위를 풀어 쓴다(`1 hour 24 minutes 8 seconds`). 화면 표기 `1h 24m`의 `m`을 미터로 읽지 않게 하려는 것이다.
- 1분 미만 화면 표기는 `Under 1 min`이다.
- 토글 버튼(`aria-pressed`)의 접근성 라벨은 동작이 아니라 상태 이름으로 쓴다(`Simple Mode`, `Switch to …` 아님).

## 외부로 나가는 문구 (묶음 C2에서 정함)

- 초대 공유 본문(`social-room:inviteMessage.*`)은 보내는 사람이 문자·메신저로 보내는 말이다. 1인칭 권유형(`Come study with me on FocusMakers!`)으로 쓴다. 느낌표는 ko 원문을 따라 여기서만 허용한다.

## 용어 표

| 한국어 | 영어 | 메모 |
|---|---|---|
| 순공 시간 | focus time | 측정된 실제 공부 시간. study time과 섞어 쓰지 않는다. 라벨은 `Focus time` |
| 순공시간 측정 중 | Measuring focus time | 세션 상태 필 |
| 이번 주 순공 | Focus time this week | |
| 총 공부시간 | total study time | 세션 화면의 "총 HH:MM:SS"는 `Total` |
| 집중률 | focus rate | |
| 소셜룸 | Social Room | 기능 이름이라 대문자 |
| 싱글룸 | Solo Room | 사용자 확인 필요 |
| 공부 기록 | records | 탭 이름은 `Records` |
| 나의 공부 리듬 | Your study rhythm | 기록 탭 카드 제목. `My`가 아니라 `Your` |
| 일간 / 주간 | Daily / Weekly | 기록 탭 토글 |
| 플래너 | Planner | |
| 휴식 (플래너 범례·뽀모도로) | Break | rest가 아니다 |
| 과목 없음 | No subject | |
| 타임랩스 | timelapse | 설정 행 `Timelapse` |
| D-Day | D-Day | 영어권에서도 통하지만 사용자 확인 필요 |
| 집중 시작 (홈 버튼) | Start Focus | 버튼 라벨이라 두 단어 모두 대문자 |
| 측정 (카메라 동작 동사) | measure | track·detect·monitor는 쓰지 않는다(감시 뉘앙스) |
| 설정 (탭·화면) | Settings | |
| 카메라 권한 | Camera access | permission이 아니라 access |
| 시스템 설정 | system settings | 소문자 |
| 방해 앱 잠금 | App blocking | 기능 이름. "App lock"은 영어권에서 앱 비밀번호 잠금으로 읽혀서 피했다. 사용자 확인 필요 |
| 잠긴 앱 | Blocked apps | 동사는 block / unblock |
| 방해 앱 | distracting apps | |
| 배경음 | Ambient sound | 버튼·시트 제목 공통. 사용자 확정(11-03). Background noise는 잡음으로 읽혀 쓰지 않는다 |
| 집중 연동 (배경음) | Sync with focus | 비집중 때 소리를 낮추는 스위치 |
| 노이즈 / 배경 소리 / 음악 | Noise / Ambience / Music | 배경음 탭 |
| 백색소음 | White noise | 핑크·브라운도 `Pink noise`, `Brown noise` |
| 프로필 수정 | Edit profile | |
| 닉네임 | Nickname | |
| 목표 문구 | Goal | 프로필 필드 |
| 목표 카테고리 | Studying for | 프로필 필드 라벨. 사용자 확인 필요 |
| 수능 (카테고리 값) | College entrance | 목업 시험 이름은 `Finals`. 사용자 확인 필요 |
| 전문직 / 취업 / 자격증 / 공무원 / 어학 / 기타 | Professional exam / Job hunting / Certification / Civil service / Language / Other | 프로필 카테고리 칩 |
| 문의하기 | Contact us | |
| 이용약관 / 개인정보처리방침 / 오픈소스 라이선스 | Terms of service / Privacy policy / Open-source licenses | |
| 버전 정보 | Version | |
| 측정 결과 피드백 선택지 | Good / Okay / Not great | |
| 새로고침 | Reload | |
| 불러오는 중 | Loading | |
| 순공 (탭·칩 짧은 꼴) | Focus time | 랭킹 종목 탭. 타임랩스 프레임처럼 값 앞 라벨은 `Focus {{duration}}` |
| 총 공부 (값 앞) | Total | `Total 1h 20m`. 타임랩스 목록 요약도 같다 |
| N% 집중 (필) | `{{rate}} focus` | 지표 라벨형 "집중률 N%"는 `Focus rate 82%` |
| 공부 (기록 단위, N회) | session | `3 sessions` |
| 최대 집중 시간 | Longest focus | 세션 행 펼침 |
| 직접 입력 (수동 기록 배지) | Manual | 행 배지. 버튼은 `Add time manually`, 화면 제목은 `Add time` |
| 기록 뱃지 축약형 | Away / On phone / Device moved / Dozed off / Paused | 기록 탭 칩. `Away once`, `On phone 2 times` |
| 이번 주 / 지난주 / N주 전 (추이 범례) | this week / last week / N weeks ago | 문장 안에 끼워 쓰므로 소문자 |
| 연속 공부 | streak | 라벨 `Streak`, 값 `12 days`, 배너 `12-day streak`, 최대 `Longest streak` |
| 최고 기록 / 지금 (연속 공부 카드) | Best / Now | |
| 랭킹 | Rankings | 화면 제목·모드 탭. 기록은 `Ranking records` |
| 명예의 전당 | Hall of Fame | 기능 이름이라 대문자 |
| 종목 | category | 랭킹 종목 필터 `Category: …`, `All categories` |
| 일간 / 주간 / 월간 (랭킹 기간) | Daily / Weekly / Monthly | 기록 탭 토글과 같다 |
| 오늘 / 이번 주 / 이번 달 (랭킹 기간 호칭) | Today / This week / This month | `Top 3 · Today`, `Today's focus time from …` |
| 시간대 (랭킹 종목) | Time slot | 구간 이름 `Night`·`Morning`·`Afternoon`·`Evening`, 판 이름 `Morning slot` |
| 랭킹 진입 | get ranked | `Study now to get ranked` |
| N위 | #N | 서수 금지. 위 "순위·횟수" 절 |
| 상위 N% | Top N% | |
| 마감 | Ends / Closed | 남은 시간 `Ends in …`, 지난 마감 `Closed …` |
| 메달 | medal | `You won 2 medals` |
| 순공 시작 (랭킹 버튼) | Start Focus | 홈 버튼과 같다 |
| 타이머 / 뽀모도로 (토글) | Timer / Pomodoro | ko 토글의 `기본`은 `Timer` |
| 집중 / 휴식 (뽀모도로 구간) | Focus / Break | `Focus time`이라 쓰지 않는다(순공과 섞인다) |
| N바퀴째 | Round N | 서수를 피했다 |
| 처음부터 | Restart | |
| 시간 단위 (휠·큰 숫자 옆) | h / m / s | |
| 타임랩스 목록·카드 | Recent timelapses | 복수형은 timelapses |
| 얼굴 가림 | Hide face | 타임랩스 설정 |
| 영상 비율 | Aspect ratio | `Portrait 9:16` / `Landscape 16:9` |
| 사진 앱에 저장 | Saved to Photos | |
| 카카오톡 / 인스타그램 | KakaoTalk / Instagram | 서비스 고유 이름 |
| 다시 보지 않기 | Don't show again | |
| 이름 변경 / 삭제 (행 메뉴) | Rename / Delete | |
| 과목 이름 / 할 일 이름 | Subject name / Task name | 플래너 입력칸 |
| 기기 등록 전 안내 | This device isn't registered yet. Open the app to save your records | 기록·플래너·수동 기록·랭킹 공통 |
| 소셜 (탭·화면 제목) | Social | `Back to Social` |
| 그룹 스터디 | Social Room / study together | 기능을 가리키면 `Social Room`, 문장에서는 `study together`. `group study`는 쓰지 않는다 |
| 초대코드 | invite code | 라벨은 `Invite code` |
| 방 만들기 / 입장하기 / 참여하기 | Create room / Enter room / Join | |
| 나가기 (라이브룸) | Leave | |
| 공부를 종료할까요? / 계속하기 / 공부 종료 | End your session? / Keep going / End session | 싱글룸(study-session)과 같게 맞춘다 |
| 1분 미만 공부 안내 | Sessions under 1 minute don't appear in your records | |
| 카메라 켜기 / 끄기 | Turn on camera / Turn off camera | 확인 창 제목은 `Turn on your camera?` |
| 얼굴 가리기 (소셜룸) | Hide face | 타임랩스와 같다 |
| 집중 중 / 휴식 / 카메라 꺼짐 (타일 상태) | Focusing / On a break / Camera off | |
| 목표 날짜 (D-Day) | target date | `Set target date` |
| 빠른 이동 (D-Day 달력) | +1 month / +6 months / +1 year | 13px 알약 세 개 |
| 나 (내 타일) | Me | |
| 심플 모드 | Simple Mode | 기능 이름이라 문장 안에서도 대문자. 토글 라벨 `Simple Mode`, 시작 버튼은 `Start in` 뒤에서 줄을 바꾼다(`Start in\nSimple Mode`, 버튼 폭에 한 줄로 들어가지 않는다) |
| 도움말 (세션) | guide | `Session guide`, 메뉴 `View guide`. help와 섞지 않는다 |
| 더보기 | More | 메뉴 버튼·도움말 `the More menu` |
| 카메라 전환 | Switch camera | 토스트 `Camera switched` |
| 일시정지 / 다시 시작 (버튼) | Pause / Resume | 상태 필 `Measuring paused` |
| 자동 멈춤 (범례) | Auto-paused | 범례 `Focus` / `Auto-paused` / `Paused` |
| 공부 타임라인 | Study timeline | |
| 오늘 누적 순공시간 | Focus time today | |
| 누적 공부 일 수 | Days studied | 값 `{{count}} day(s)` |
| 오늘 공부 완료 | Session complete | 결과 히어로 |
| 과목 추가 / 할 일 추가 | Add subject / Add task | |
| 추천 과목 | Suggested subjects | 플래너와 같다. 칩은 카탈로그가 아니라 `subjectSuggestions()`의 언어별 목록이다(en `Math` / `English` / `Science` / `History`) |
| 저장되지 않은 기록 복구 | Unsaved session recovered | 복구 창 제목 |
