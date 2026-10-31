# 소셜룸 얼굴 가림 합성 성능 비교

## 조건

| 조건      | 커밋       | 설명               |
| --------- | ---------- | ------------------ |
| 가림 없음 | `d66660b5` | 작업 전 dev        |
| 2D 캔버스 | `29421f32` | `drawImage`로 합성 |
| WebGL     | `13f71ea1` | 영상 텍스처로 합성 |

## 지표

- 보내는 영상 fps: 합성기 `fps`(초당 그린 수)와 받는 쪽 `inbound-rtp`의 `framesPerSecond`.
- 한 프레임 합성의 메인 스레드 시간: `videoMs` + `stickerMs`.
- CPU 사용률: adb `top`의 웹뷰 렌더러 프로세스.
- 발열: 20분 동안의 배터리 온도 변화와 최고 발열 단계(`dumpsys thermalservice`).
- 소비 전력: `current_now`·`voltage_now`로 계산한 20분 평균(mW). iPhone은 Performance Trace의 에너지 영향.
- 조건마다 보낸 프레임 하나당 값(전력 ÷ fps)을 함께 적는다.

## 환경 고정

- 측정 중 충전하지 않는다.
- 시작 온도를 조건마다 같게 맞춘다(직전 측정 뒤 기기를 식힌다).
- 화면 밝기, 배터리 잔량대(50~90%), 장소, 네트워크를 같게 둔다.

## 시나리오

1. Galaxy A23(보내는 쪽)과 iPhone 13 mini(받는 쪽)로 같은 소셜룸에 들어간다.
2. 보내는 쪽 카메라를 켜고 얼굴 가리기를 켠다(가림 없음 조건은 dev 빌드).
3. 정면 공부 자세로 20분 측정한다. 10분째에 1분 동안 자리를 비운다.
4. iPhone이 보내는 쪽일 때도 같은 순서로 반복한다.

## 실행

- A23: `node apps/web/scripts/perf/measure-face-mask-a23.mjs <라벨> 20`
- iPhone: 설정 > 개발자 > Performance Trace로 20분 기록 → Mac Instruments로 열어 Power Profiler 확인.

## H1 확인 (2D 캔버스가 느린 이유)

- A23 Chrome `chrome://gpu`의 Canvas 항목: (결과)
- 기본 2D / `willReadFrequently` 2D / `ImageBitmap` 그리기 시간: (결과)

## 결과

| 기기           | 조건      | fps(합성/수신) | 프레임당 ms | CPU % | 온도 변화 ℃ | 최고 발열 단계 | 평균 전력 mW | 프레임당 mJ |
| -------------- | --------- | -------------- | ----------- | ----- | ----------- | -------------- | ------------ | ----------- |
| A23            | 가림 없음 |                |             |       |             |                |              |             |
| A23            | 2D        |                |             |       |             |                |              |             |
| A23            | WebGL     |                |             |       |             |                |              |             |
| iPhone 13 mini | 가림 없음 |                |             |       |             |                |              |             |
| iPhone 13 mini | 2D        |                |             |       |             |                |              |             |
| iPhone 13 mini | WebGL     |                |             |       |             |                |              |             |
