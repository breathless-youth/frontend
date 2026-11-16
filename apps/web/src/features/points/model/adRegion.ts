import { deviceRegion } from "@/lib/deviceRegion";

// 광고 동의 창(Google UMP)이 없어서 동의가 필요한 유럽(EEA·영국·스위스)에는 보상형 광고 입구를 그리지 않는다.
const HIDDEN_REGIONS: ReadonlySet<string> = new Set([
  // EU 27개국
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // EU 밖의 EEA, 영국, 스위스
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
  // 따로 코드를 받는 EU 최외곽 지역
  "GF",
  "GP",
  "MQ",
  "RE",
  "YT",
  "MF",
]);

// `Europe/` 밖에 있는 유럽 지역의 시간대
const HIDDEN_TIME_ZONES: ReadonlySet<string> = new Set([
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
  "Atlantic/Faroe",
  "Arctic/Longyearbyen",
]);

/**
 * 지역과 시간대로 광고를 숨길지 판정
 *
 * 놓치는 기기가 없게 넓게 잡아서 지역과 시간대 가운데 하나만 맞아도 숨긴다.
 * 둘 다 읽지 못하면 보인다.
 */
export function adsHiddenForRegion({
  region,
  timeZone,
}: {
  region: string | null;
  timeZone: string | null;
}): boolean {
  if (region !== null && HIDDEN_REGIONS.has(region)) {
    return true;
  }
  return timeZone !== null && (timeZone.startsWith("Europe/") || HIDDEN_TIME_ZONES.has(timeZone));
}

function deviceTimeZone(): string | null {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** 이 기기의 언어 지역과 시간대로 본 광고 숨김 여부 */
export function isAdsHiddenHere(): boolean {
  return adsHiddenForRegion({ region: deviceRegion(), timeZone: deviceTimeZone() });
}
