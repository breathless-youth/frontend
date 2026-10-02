/**
 * [측정 빌드 전용]
 * 시뮬레이터처럼 카메라가 없는 환경에서도 검출기 로딩을 시작시키기 위한 가짜 카메라다.
 * 캔버스 영상을 스트림으로 흘려 `getUserMedia`를 대체할 뿐이고,
 * 검출 결과 자체는 의미가 없다.
 * — 여기서 보는 건 준비 시간(로딩→준비)뿐이다.
 *
 * `main.tsx`의 `VITE_FAKE_CAMERA` 조건이 운영 빌드에서는 false로 접혀 이 모듈은 Rollup이
 * 트리셰이킹으로 번들에서 제외한다(그래서 이 파일에는 최상위 부수효과가 없어야 한다).
 */
export function installFakeCamera(): void {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;

  // rAF는 탭이 숨겨지면 멈춘다(백그라운드 스로틀). 시뮬레이터 화면이 꺼져도 프레임이
  // 계속 바뀌어야 검출기가 실제 입력을 받는 것처럼 동작하므로 setInterval을 쓴다.
  let x = 0;
  setInterval(() => {
    x = (x + 8) % canvas.width;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(x, canvas.height / 2 - 20, 40, 40);
  }, 1000 / 15);

  // 어댑터(mediaStreamCamera.ts)가 stop() 때 트랙을 정지시키므로 호출마다 새 스트림을
  // 내려준다. constraints는 무시한다 — 어차피 진짜 카메라가 아니다.
  navigator.mediaDevices.getUserMedia = () => Promise.resolve(canvas.captureStream(15));
}
