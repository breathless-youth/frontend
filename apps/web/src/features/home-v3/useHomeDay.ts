import { useEffect, useState } from "react";

import { dayStartMs, deviceTimeZone, localDateKey } from "@/lib/dateKey";
import { subscribeToNativeMessages } from "@/lib/bridge";

function readDay() {
  const timeZone = deviceTimeZone();
  return { dateKey: localDateKey(new Date(), timeZone), timeZone };
}

export function useHomeDay() {
  const [day, setDay] = useState(readDay);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const next = readDay();
      setDay((previous) =>
        previous.dateKey === next.dateKey && previous.timeZone === next.timeZone ? previous : next,
      );
      // 날짜 키에 달력 하루를 더한다. 실제 시각에 24시간을 더하면 서머타임 경계에서 어긋난다.
      const followingDate = new Date(Date.parse(next.dateKey) + 86400000)
        .toISOString()
        .slice(0, 10);
      timer = setTimeout(
        refresh,
        Math.max(1, dayStartMs(followingDate, next.timeZone) - Date.now()),
      );
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const unsubscribeNative = subscribeToNativeMessages((message) => {
      if (
        (message.type === "tab-focus" && message.focused) ||
        (message.type === "app-visibility" && message.visible)
      )
        refresh();
    });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      unsubscribeNative();
    };
  }, []);
  return day;
}
