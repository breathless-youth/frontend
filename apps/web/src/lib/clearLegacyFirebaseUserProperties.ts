import { postToNative } from "./bridge";

/**
 * 기기에 남은 옛 Firebase 유저 속성을 지우는 한시 코드.
 *
 * Firebase 유저 속성은 기기당 25개가 한도이고 26번째부터는 조용히 버려진다. 브리지 첫 버전이
 * 화이트리스트 없이 Amplitude 유저 속성을 전부 넘기는 동안 autocapture `attribution`이 만드는
 * `initial_*` 19개가 슬롯을 차지했다. 이제는 보내지 않지만 기기에 설정된 값은 지우기 전까지 남아,
 * 기존 사용자 기기에서는 푸시 타겟팅 속성이 한 칸도 들어가지 못한다(재설치 기기만 정상).
 *
 * - `Identify().unset()`을 쓰지 않는다. Amplitude가 먼저 처리해 Amplitude 쪽 유입 속성까지 지워진다.
 *   `postToNative`는 Amplitude 파이프라인을 타지 않아 Firebase 사본만 지운다.
 * - 영속 플래그를 두지 않는다. 브리지가 아직 없어 메시지가 유실돼도 플래그만 켜지는 상황이 생긴다.
 *   없는 속성에 null을 보내는 것은 무해하니 문서마다 다시 보낸다.
 * - 19개는 한 메시지에 들어간다(파서 상한 25개, 초과분은 조용히 버려진다). 키를 늘리면 쪼갠다.
 *   가장 긴 `initial_referring_domain`이 이름 길이 한도(24자)에 딱 맞는다.
 *
 * 제거 조건: 운영 배포 뒤 대부분의 기기가 앱을 한 번씩 열고 난 뒤(2주쯤) 이 파일과 호출부를 함께
 * 지운다. 기기마다 앱을 열어야 적용되므로 그 전에 지우면 미정리 기기가 남는다.
 */
const LEGACY_ATTRIBUTION_KEYS = [
  "initial_dclid",
  "initial_fbclid",
  "initial_gbraid",
  "initial_gclid",
  "initial_ko_click_id",
  "initial_li_fat_id",
  "initial_msclkid",
  "initial_rdt_cid",
  "initial_referrer",
  "initial_referring_domain",
  "initial_ttclid",
  "initial_twclid",
  "initial_utm_campaign",
  "initial_utm_content",
  "initial_utm_id",
  "initial_utm_medium",
  "initial_utm_source",
  "initial_utm_term",
  "initial_wbraid",
] as const;

let sent = false;

export function clearLegacyFirebaseUserProperties(): void {
  if (sent) return;
  sent = true;
  const properties: Record<string, null> = {};
  for (const key of LEGACY_ATTRIBUTION_KEYS) properties[key] = null;
  postToNative({ type: "analytics-user-properties", properties, atMs: Date.now() });
}
