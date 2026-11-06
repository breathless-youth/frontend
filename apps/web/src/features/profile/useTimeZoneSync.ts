import { useEffect } from "react";

import { deviceTimeZone } from "@/lib/dateKey";
import { updateProfile } from "@/lib/profileApi";

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

// 같은 값은 함께 기다리고, 다른 값은 앞선 요청 뒤에 보내 서버에서 순서가 뒤집히지 않게 한다.
let inFlight: { sent: string; promise: Promise<void> } | null = null;

/** 통계를 조회하기 전에 서버의 날짜 기준을 기기 시간대와 맞춘다. */
export function syncProfileTimeZone(userId: number, timeZone: string): Promise<void> {
  const sent = `${userId}:${timeZone}`;
  if (inFlight?.sent === sent) return inFlight.promise;
  if (inFlight === null && readSent() === sent) return Promise.resolve();

  const previous = inFlight?.promise.catch(() => {});
  const promise = Promise.resolve(previous)
    .then(async () => {
      if (readSent() === sent) return;
      await updateProfile({ timeZone });
      writeSent(sent);
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { sent, promise };
  return promise;
}

/**
 * 기기 시간대를 프로필에 알리기
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
    void syncProfileTimeZone(userId, timeZone).catch((error: unknown) => {
      console.warn("[profile] could not send the device time zone", error);
    });
  }, [userId, identityPending, timeZone]);
}
