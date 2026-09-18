import type { RtcStatRequest } from "@focusmakers/types";

import { API_BASE_URL, apiFetch } from "./api";
import { legacyUserId } from "./userId";

/**
 * WebRTC 연결 통계 보고 — fire-and-forget. keepalive로 페이지 이탈 중에도 전송을 마친다.
 * 실패는 삼킨다. 이 보고가 통화 화면 동작에 영향을 주면 안 된다.
 */
export function reportRtcStats(stat: RtcStatRequest): void {
  const legacy = legacyUserId();
  void apiFetch(`${API_BASE_URL}/api/rtc-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(legacy === null ? stat : { ...stat, userId: legacy }),
    keepalive: true,
  }).catch(() => undefined);
}
