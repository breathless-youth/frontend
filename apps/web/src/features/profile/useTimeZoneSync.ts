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

/**
 * 기기 시간대를 프로필에 알리기
 *
 * 서버는 세션을 제출하지 않은 날에도 사용자 시간대로 하루를 나눠야 해서 홈을 열 때 미리 알린다.
 * 같은 문서에서 같은 사용자의 같은 값은 한 번만 보낸다.
 * 실패해도 화면에 알리지 않는다. 다음 세션 제출의 시간대로도 서버가 맞춰진다.
 */
export function useTimeZoneSync(userId: number | null, identityPending: boolean): void {
  useEffect(() => {
    if (userId === null || identityPending) {
      return;
    }
    const timeZone = deviceTimeZone();
    const sent = `${userId}:${timeZone}`;
    if (readSent() === sent) {
      return;
    }
    writeSent(sent);
    updateProfile({ timeZone }).catch((error: unknown) => {
      console.warn("[profile] could not send the device time zone", error);
    });
  }, [userId, identityPending]);
}
