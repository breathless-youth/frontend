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

// 보내는 중인 값. 응답 전에 홈이 다시 열려도 같은 값을 두 번 보내지 않게 한다.
let inFlight: string | null = null;

/**
 * 기기 시간대를 프로필에 알리기
 *
 * 서버는 세션을 제출하지 않은 날에도 사용자 시간대로 하루를 나눠야 해서 홈을 열 때 미리 알린다.
 * 같은 문서에서 같은 사용자의 같은 값은 성공할 때까지만 보낸다.
 * 실패해도 화면에 알리지 않고, 다음 홈 진입에서 다시 보낸다.
 */
export function useTimeZoneSync(userId: number | null, identityPending: boolean): void {
  useEffect(() => {
    if (userId === null || identityPending) {
      return;
    }
    const timeZone = deviceTimeZone();
    const sent = `${userId}:${timeZone}`;
    if (readSent() === sent || inFlight === sent) {
      return;
    }
    inFlight = sent;
    updateProfile({ timeZone })
      .then(() => writeSent(sent))
      .catch((error: unknown) => {
        console.warn("[profile] could not send the device time zone", error);
      })
      .finally(() => {
        if (inFlight === sent) {
          inFlight = null;
        }
      });
  }, [userId, identityPending]);
}
