/**
 * Vision 파이프라인의 튜닝 상수.
 *
 * `ai-wiki/product/mvp-scope.md`가 "하드코딩하지 말고 설정 파라미터로 구현"하라고 명시한
 * 값들이 여기 모인다 — M1 테스트에서 실측으로 조정된다(설계 문서 §12).
 *
 * 이 파일에는 **모델·추론 상수도 함께 들어온다**(프레임 주기·score 임계). 후속 계획이
 * 채우며, 지금은 카메라 제약만 있다.
 */

/**
 * `getUserMedia` 제약.
 *
 * 모델 입력은 320×320이라 해상도는 **프리뷰 화질용**이다(설계 §3). 낮으면 풀스크린
 * 프리뷰가 뭉개지고, 높으면 배터리·발열이 늘어난다. 720×1280로 시작해 스파이크에서 조정한다.
 * `ideal`을 쓰는 이유는 지원하지 않는 기기에서 `getUserMedia`가 실패하지 않게 하기 위해서다.
 */
export const CAMERA_CONSTRAINTS = {
  front: {
    video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
    audio: false,
  },
  back: {
    video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 1280 } },
    audio: false,
  },
} as const satisfies Record<"front" | "back", MediaStreamConstraints>;
