# Vision 벤치

공부 영상과 정답 라벨로 **지금 저장소에 있는 집중 판정 코드**를 그대로 돌려 순공 오차·판정 정확도를 재는 개발 도구다. 앱 번들과 따로 빌드되고, 영상은 브라우저 밖으로 나가지 않는다.

```bash
pnpm --filter web bench          # http://localhost:5173 (dev)
pnpm --filter web bench:build    # bench/dist — 정적 호스팅용
BENCH_MODEL_SUFFIX=.wasm pnpm --filter web bench:build  # .tflite·.task를 서빙하지 않는 호스팅(claude.ai 아티팩트)용
```

## 무엇을 그대로 쓰고 무엇을 바꾸나

- 그대로: `createVisionFocusDetector`(객체 검출·얼굴·내려다봄 게이트·눈 보정·졸음 규칙), `stepDetection`(유지시간), `transition`·`computeSessionTotals`·`toStatusEvents`(세션 타임라인).
- 다시 쓴 것: `useStudyRoomSession`의 배선 두 줄(신호 수신 시 `stepDetection`, 200ms 틱마다 `transition`) — `src/runner.ts`의 `createSessionSim`.
- 바꾼 것: `focusDetector.ts`의 `../vision/frameLoop` import만 `src/steppedFrameLoop.ts`로(vite alias). 빌드에서는 모델·wasm 경로를 산출물 기준 상대경로로 바꾼다.

## 실행 방식

- **프레임 단위**(기본): 영상을 `FRAME_INTERVAL_MS`마다 넘기고 추론이 끝나길 기다린다. 시각은 영상 시각이라 결과가 결정적이고, 2분 영상이 데스크톱에서 20초 안팎이다. 모델은 미리 데운 뒤 0초부터 잰다(실기기의 모델 로딩 공백은 빠진다). 신호 도착 지연은 `추론 지연 가정`(기본 300ms)으로 넣는다.
- **실시간 재생**: 프로덕션 루프 그대로 1배속 재생. 이 기기의 추론 시간·프레임 버림까지 들어간다.

## 정답 라벨

```csv
file,start,end,label
clip01.mp4,0,45,FOCUS
clip01.mp4,0:45,1:10,PHONE
```

라벨은 FOCUS·AWAY·PHONE·SLEEP(한글 집중·자리이탈·휴대폰·졸음도 됨). `file` 열이 없으면 라벨 파일 이름(`clip01.csv`)으로 영상을 찾는다. 라벨 없는 시간은 채점하지 않는다.

## 지표

- 시간 정확도·혼동 행렬·클래스별 P/R/F1 — 100ms 격자, 정답 경계 앞뒤 `경계 허용`초는 제외.
- 순공 과대 계상(비집중을 집중으로 센 시간) / 과소 계상(집중을 뺀 시간) — 경계 허용 없이 전체.
- 이벤트 단위 감지율·지연·오경보 — 졸음은 진입 유지시간이 10초라 `이벤트 유예` 기본 12초.

눈 보정(얼굴 15표본 ≈ 30초)과 졸음 비율 창(22표본 ≈ 44초)이 차야 졸음 판정이 나오므로 졸음 벤치 영상은 1분 이상이어야 한다. `DEVICE`(가속도 센서)는 영상으로 재현되지 않는다.
