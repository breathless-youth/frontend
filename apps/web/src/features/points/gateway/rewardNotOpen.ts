import { ApiError } from "@/lib/api";

/**
 * 서버가 아직 포인트를 쌓지 않을 때 받기를 누른 거절
 *
 * 운영 서버는 포인트가 든 앱이 스토어에 나온 날부터 포인트를 주고, 그 전의 받기는 409 `REWARD_NOT_AVAILABLE`로 거절한다.
 * 하루 목표를 못 채웠을 때도 같은 코드가 오지만 그때는 받기 버튼을 그리지 않아서 같은 안내로 본다.
 */
export function isRewardNotOpenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "REWARD_NOT_AVAILABLE";
}
