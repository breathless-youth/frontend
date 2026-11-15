import { useEffect } from "react";

import type { ProfileUpdateRequest } from "@focusmakers/types";

import { setDeviceLocaleUserProperties } from "@/lib/amplitude";
import { deviceTimeZone } from "@/lib/dateKey";
import { deviceRegion } from "@/lib/deviceRegion";
import { updateProfile } from "@/lib/profileApi";
import { assertCurrentUserId } from "@/lib/userId";

const SENT_KEY = "focuson.profile.timeZoneSent";

function readSent(): string | null {
  try {
    return sessionStorage.getItem(SENT_KEY);
  } catch {
    return null;
  }
}

function writeSent(value: string): void {
  try {
    sessionStorage.setItem(SENT_KEY, value);
  } catch {
    // 적지 못하면 다음 홈 진입에서 한 번 더 보낼 뿐이다.
  }
}

// 같은 요청은 공유하고, 같은 계정의 시간대 변경은 앞선 전송 뒤에 보내 순서가 뒤집히지 않게 한다.
const inFlight = new Map<number, { timeZone: string; request: Promise<void> }>();

/**
 * 통계처럼 프로필의 시간대가 먼저 반영되어야 하는 조회는 이 Promise를 기다린다.
 *
 * 기기 지역도 같은 요청에 실어 보낸다. 광고 나라별 분석에서 서버와 Amplitude가 같은 값을 보게
 * 서버 저장에 성공한 뒤에만 Amplitude 속성을 남긴다.
 */
export function syncProfileTimeZone(userId: number, timeZone: string): Promise<void> {
  try {
    assertCurrentUserId(userId);
  } catch (error) {
    return Promise.reject(error);
  }
  const region = deviceRegion();
  const sent = region === null ? `${userId}:${timeZone}` : `${userId}:${timeZone}:${region}`;
  const pending = inFlight.get(userId);
  if (pending?.timeZone === timeZone) return pending.request;
  if (!pending && readSent() === sent) return Promise.resolve();
  const request = (pending?.request.catch(() => undefined) ?? Promise.resolve())
    .then(async () => {
      assertCurrentUserId(userId);
      if (readSent() === sent) return;
      const patch: ProfileUpdateRequest = region === null ? { timeZone } : { timeZone, region };
      await updateProfile(patch);
      assertCurrentUserId(userId);
      writeSent(sent);
      setDeviceLocaleUserProperties(patch);
    })
    .finally(() => {
      if (inFlight.get(userId)?.request === request) inFlight.delete(userId);
    });
  inFlight.set(userId, { timeZone, request });
  return request;
}

/**
 * 기기 시간대와 지역을 프로필에 알리기
 *
 * 서버는 세션을 제출하지 않은 날에도 사용자 시간대로 하루를 나눠야 해서 홈을 열 때 미리 알린다.
 * 같은 문서에서 같은 사용자의 같은 값은 성공할 때까지만 보낸다.
 * 실패해도 화면에 알리지 않고, 다음 홈 진입에서 다시 보낸다.
 */
export function useTimeZoneSync(userId: number | null, identityPending: boolean): void {
  const timeZone = deviceTimeZone();
  useEffect(() => {
    if (userId === null || identityPending) {
      return;
    }
    syncProfileTimeZone(userId, timeZone).catch((error: unknown) => {
      console.warn("[profile] could not send the device time zone", error);
    });
  }, [userId, identityPending, timeZone]);
}
