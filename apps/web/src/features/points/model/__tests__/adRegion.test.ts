import { afterEach, describe, expect, it, vi } from "vitest";

import { adsHiddenForRegion, isAdsHiddenHere } from "../adRegion";

describe("광고를 숨기는 지역", () => {
  it("유럽연합 나라의 기기는 광고를 숨기고 한국 기기는 보인다", () => {
    expect(adsHiddenForRegion({ region: "DE", timeZone: "Asia/Seoul" })).toBe(true);
    expect(adsHiddenForRegion({ region: "KR", timeZone: "Asia/Seoul" })).toBe(false);
  });

  it("영국과 스위스도 숨긴다", () => {
    expect(adsHiddenForRegion({ region: "GB", timeZone: null })).toBe(true);
    expect(adsHiddenForRegion({ region: "CH", timeZone: null })).toBe(true);
  });

  it("EEA의 아이슬란드·리히텐슈타인·노르웨이와 EU 최외곽 지역도 숨긴다", () => {
    for (const region of ["IS", "LI", "NO", "GF", "GP", "MQ", "RE", "YT", "MF"]) {
      expect([region, adsHiddenForRegion({ region, timeZone: null })]).toEqual([region, true]);
    }
  });

  it("지역이 한국이어도 시간대가 유럽이면 숨긴다", () => {
    expect(adsHiddenForRegion({ region: "KR", timeZone: "Europe/Berlin" })).toBe(true);
  });

  it("유럽 대서양 섬과 스발바르의 시간대도 숨긴다", () => {
    for (const timeZone of [
      "Atlantic/Canary",
      "Atlantic/Madeira",
      "Atlantic/Azores",
      "Atlantic/Reykjavik",
      "Atlantic/Faroe",
      "Arctic/Longyearbyen",
    ]) {
      expect([timeZone, adsHiddenForRegion({ region: null, timeZone })]).toEqual([timeZone, true]);
    }
  });

  it("유럽 밖의 대서양 시간대는 숨기지 않는다", () => {
    expect(adsHiddenForRegion({ region: null, timeZone: "Atlantic/Bermuda" })).toBe(false);
  });

  it("지역과 시간대를 모두 읽지 못하면 보인다", () => {
    expect(adsHiddenForRegion({ region: null, timeZone: null })).toBe(false);
  });
});

describe("이 기기에서 광고를 숨기는지", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockDevice(language: string, timeZone: string | undefined) {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([language]);
    vi.spyOn(navigator, "language", "get").mockReturnValue(language);
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone,
    } as Intl.ResolvedDateTimeFormatOptions);
  }

  it("기기 언어의 지역과 시간대를 읽어 판정한다", () => {
    mockDevice("de-DE", "Asia/Seoul");
    expect(isAdsHiddenHere()).toBe(true);
    mockDevice("ko-KR", "Europe/Berlin");
    expect(isAdsHiddenHere()).toBe(true);
    mockDevice("ko-KR", "Asia/Seoul");
    expect(isAdsHiddenHere()).toBe(false);
  });

  it("지역 없는 언어 태그에 시간대도 읽지 못하면 보인다", () => {
    mockDevice("ko", undefined);
    expect(isAdsHiddenHere()).toBe(false);
  });

  it("시간대를 읽다가 throw해도 보인다", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ko"]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("ko");
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(() => {
      throw new RangeError("no time zone");
    });
    expect(isAdsHiddenHere()).toBe(false);
  });
});
