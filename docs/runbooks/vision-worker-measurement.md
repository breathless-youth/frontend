# Vision 워커 전후 측정 런북

Vision 추론을 워커로 옮긴 뒤(BY-768) 세션 화면의 메인 스레드가 덜 막히는지 워커를 끈 빌드와 켠 빌드로 비교한다. 설계는 `docs/superpowers/specs/2026-09-28-by768-vision-web-worker-design.md`.

지표

| 지표                  | 정의                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 시작 직후 최장 멈춤 | 문서 시작 뒤 30초 안에 끝난 `requestAnimationFrame` 간격의 최댓값. 기록은 세션 화면(측정 패널)이 뜬 순간부터라 앱이 처음 뜨는 구간은 빠진다. 검출기 생성·첫 추론은 그 뒤라 범위 안이고, 빠지는 구간은 두 빌드가 같다 |
| ② 안정 구간 막힘      | 검출기 준비 뒤 60초 동안 Long Task의 50 ms 초과분 합계와 건수(Chromium만)                                                                                                                                            |
| ③ 프레임 누락         | 같은 60초 동안 rAF 간격이 50 ms를 넘은 횟수                                                                                                                                                                          |
| 판정 일치             | 같은 녹화 프레임에서 워커 경로와 메인 스레드 경로의 사람·휴대폰 판정이 같은 비율                                                                                                                                     |

CPU 사용량은 지표가 아니다. 계산량은 같고 그 부담을 워커가 진다.

## 준비

- ffmpeg가 필요하다(`brew install ffmpeg`).
- 녹화본: 1280×720 카메라 원본으로 앉아 있기, 휴대폰 들기, 자리 비우기가 들어간 45초 안팎 영상. 얼굴이 담기므로 저장소 밖에 둔다.
- 가짜 카메라용 MJPEG을 만든다(Chromium은 mp4를 가짜 카메라로 못 쓴다): `ffmpeg -i sample.mp4 -an -q:v 3 sample.mjpeg`
- 측정 빌드 두 벌을 만든다(`apps/web`에서).

```bash
pnpm perf:build:worker-off
pnpm perf:build:worker-on
```

## 데스크톱 측정

```bash
FAKE_VIDEO=/절대경로/sample.mjpeg SAMPLE_VIDEO=/절대경로/sample.mp4 pnpm perf:measure:worker
```

- 변형마다 예열 1회 뒤 5회씩, ABBA 순서로 세션 화면(`/room/1`)을 CPU 4배 감속으로 90초 안팎 돌린다.
- 매 회 `runtime`이 빌드와 맞는지(끔=`main`, 켬=`worker`), 가짜 카메라가 녹화본인지(640×480이 아닌지) 확인하고 어긋나면 멈춘다.
- 마지막에 `/perf/worker-parity`에서 판정 일치를 잰다.
- 결과는 `apps/web/.perf/results/worker-<시각>.{json,jsonl,md}`. 박스 좌표는 없다.
- CDP CPU 감속은 메인 스레드에만 걸리고 전용 워커(Dedicated Worker)에는 걸리지 않는다. 그래서 속도가 섞인 ①과 로딩→준비는 데스크톱에서 워커 쪽이 유리하게 나오고, 공정한 비교는 실기기 결과로 한다. ②·③(메인 스레드 막힘)은 그대로 유효하다.

## Android 실기기 (폰 Chrome)

Dev Client 재빌드 없이 폰의 Chrome으로 연다. 카메라는 실제 카메라다.

1. 서버 두 개를 띄운다.

```bash
PORT=4610 pnpm perf:serve .perf/dist-worker-off
PORT=4611 pnpm perf:serve .perf/dist-worker-on
```

2. `adb reverse tcp:4610 tcp:4610 && adb reverse tcp:4611 tcp:4611`
3. 폰 Chrome의 시크릿 탭에서 `http://localhost:4610/room/1?userId=7`을 열고 카메라를 허용한다. 화면 왼쪽 위 패널의 "안정 구간"이 "완료"가 될 때까지(검출기 준비 뒤 60초) 폰을 그대로 두고 앉아 있는다.
4. 패널의 런타임·①·②·③을 기록하고 탭을 닫는다. 4611로 같은 절차를 한다.
5. 끔·켬을 번갈아 3회씩 한다. 매 회 새 시크릿 탭을 연다.

## iOS (동작 확인만)

iOS Dev Client가 없어 수치 비교는 하지 않는다. `runtime`이 무엇으로 잡히는지와 세션 검출이 도는지만 본다.

- 시뮬레이터 Safari: 카메라가 없으므로 가짜 카메라 빌드를 쓴다. `VITE_FAKE_CAMERA=1 pnpm perf:build:worker-on` 후 `PORT=4611 pnpm perf:serve .perf/dist-worker-on`, 시뮬레이터 Safari에서 `http://localhost:4611/room/1?userId=7`. 끝나면 가짜 카메라 없이 다시 빌드한다.
- 실기기 Safari: 평문 LAN 주소는 카메라가 막히므로 `cloudflared tunnel --url http://localhost:4611`의 https 주소로 연다. 자리를 비웠다 돌아오며 상태가 바뀌는지 본다.
- 패널 런타임이 `main`이면 워커를 못 써 넘어간 것이다. Mac Safari 개발자 메뉴로 붙어 콘솔의 `[vision]` 경고에서 이유를 적는다.
