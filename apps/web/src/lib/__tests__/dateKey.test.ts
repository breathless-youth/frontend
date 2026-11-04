import { describe, expect, it } from "vitest";

import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { dayStartMs, deviceTimeZone, localDateKey, zonedTimeMs } from "../dateKey";

const SEOUL = "Asia/Seoul";
const NEW_YORK = "America/New_York";
const HOUR_MS = 3_600_000;

describe("테스트 환경", () => {
  it("기본 시간대가 서울로 고정돼 있다", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(SEOUL);
  });
});

describe("deviceTimeZone", () => {
  it("기기 시간대를 읽는다", () => {
    mockDeviceTimeZone(NEW_YORK);
    expect(deviceTimeZone()).toBe(NEW_YORK);
  });

  it("값이 없으면 서울이다", () => {
    mockDeviceTimeZone(undefined);
    expect(deviceTimeZone()).toBe(SEOUL);
  });
});

describe("localDateKey", () => {
  it("KST 기준 날짜 키를 만든다", () => {
    // UTC 2026-07-25 16:00 = KST 2026-07-26 01:00
    expect(localDateKey(new Date("2026-07-25T16:00:00Z"))).toBe("2026-07-26");
  });

  it("KST 자정 직전은 같은 날로 남는다", () => {
    // UTC 2026-07-25 14:59 = KST 2026-07-25 23:59
    expect(localDateKey(new Date("2026-07-25T14:59:00Z"))).toBe("2026-07-25");
  });

  it("월·일을 2자리로 패딩한다", () => {
    expect(localDateKey(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
  });

  it("넘긴 시간대로 읽는다", () => {
    // UTC 2026-07-26 03:00 = 서울 7월 26일 12:00, 뉴욕 7월 25일 23:00
    const at = new Date("2026-07-26T03:00:00Z");
    expect(localDateKey(at, SEOUL)).toBe("2026-07-26");
    expect(localDateKey(at, NEW_YORK)).toBe("2026-07-25");
  });

  it("기본값은 기기 시간대다", () => {
    mockDeviceTimeZone(NEW_YORK);
    expect(localDateKey(new Date("2026-07-26T03:00:00Z"))).toBe("2026-07-25");
  });
});

describe("dayStartMs", () => {
  it("서울 자정은 +09:00이다", () => {
    expect(dayStartMs("2026-09-21", SEOUL)).toBe(Date.parse("2026-09-21T00:00:00+09:00"));
  });

  it("뉴욕 자정은 그날의 오프셋을 따른다", () => {
    expect(dayStartMs("2026-07-25", NEW_YORK)).toBe(Date.parse("2026-07-25T00:00:00-04:00"));
    expect(dayStartMs("2026-12-25", NEW_YORK)).toBe(Date.parse("2026-12-25T00:00:00-05:00"));
  });

  it("서머타임이 시작하는 날은 23시간이다", () => {
    expect(dayStartMs("2026-03-09", NEW_YORK) - dayStartMs("2026-03-08", NEW_YORK)).toBe(
      23 * HOUR_MS,
    );
  });

  it("서머타임이 끝나는 날은 25시간이다", () => {
    expect(dayStartMs("2026-11-02", NEW_YORK) - dayStartMs("2026-11-01", NEW_YORK)).toBe(
      25 * HOUR_MS,
    );
  });
});

describe("zonedTimeMs", () => {
  it("서머타임이 시작하는 날의 05:00은 EDT다", () => {
    expect(zonedTimeMs("2026-03-08", 5 * 60, NEW_YORK)).toBe(Date.parse("2026-03-08T09:00:00Z"));
  });

  it("서머타임이 끝나는 날의 05:00은 EST다", () => {
    expect(zonedTimeMs("2026-11-01", 5 * 60, NEW_YORK)).toBe(Date.parse("2026-11-01T10:00:00Z"));
  });

  it("서머타임으로 건너뛴 시각은 그만큼 앞으로 민다", () => {
    // 뉴욕 3월 8일 02:00~03:00은 없는 시각이라 02:30은 03:30 EDT가 된다.
    expect(zonedTimeMs("2026-03-08", 2 * 60 + 30, NEW_YORK)).toBe(
      Date.parse("2026-03-08T03:30:00-04:00"),
    );
  });

  it("두 번 오는 시각은 먼저 오는 쪽이다", () => {
    // 뉴욕 11월 1일 01:00~02:00은 EDT로 한 번, EST로 한 번 더 온다.
    expect(zonedTimeMs("2026-11-01", 90, NEW_YORK)).toBe(Date.parse("2026-11-01T01:30:00-04:00"));
  });

  it("서머타임이 시작한 직후와 끝난 직후도 그 시각 그대로다", () => {
    expect(zonedTimeMs("2026-03-08", 3 * 60, NEW_YORK)).toBe(
      Date.parse("2026-03-08T03:00:00-04:00"),
    );
    expect(zonedTimeMs("2026-11-01", 2 * 60, NEW_YORK)).toBe(
      Date.parse("2026-11-01T02:00:00-05:00"),
    );
  });

  it("서울은 고정 오프셋이다", () => {
    expect(zonedTimeMs("2026-11-04", 23 * 60 + 30, SEOUL)).toBe(
      Date.parse("2026-11-04T23:30:00+09:00"),
    );
  });
});
