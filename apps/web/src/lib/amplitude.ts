import { add, Identify, identify, init, track } from "@amplitude/analytics-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";

import { sanitizePagePath } from "./sanitizePath";

let initialized = false;

/**
 * Amplitude 초기화. `VITE_AMPLITUDE_API_KEY`가 없으면 아무것도 하지 않는다 —
 * 로컬 개발·테스트는 키 없이 그대로 돌아간다.
 *
 * autocapture는 `sessions`만 켠다. `pageViews`·`attribution` 등 나머지는 정제 없이
 * 원본 URL(네이티브 셸 계약 `?userId=N`)을 그대로 담아 전송하므로 전부 명시적으로
 * 끄고, 페이지뷰는 GA4와 동일하게 `AnalyticsRouteTracker`가 정제된 경로로 보낸다.
 *
 * Session Replay는 카메라 영상 요소만 차단하고 수집한다(2026-08-07 결정, CLAUDE.md) —
 * `video` 전체를 blockSelector로 막아 현재 프리뷰뿐 아니라 이후 멀티룸(LiveKit) 참가자
 * 영상도 자동으로 차단된다. 블록된 요소는 기록 시점에 직렬화 자체가 안 되므로 단말
 * 밖으로 나가지 않는다.
 */
export function initAmplitude() {
  const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
  if (!apiKey || initialized) return;
  initialized = true;

  // init보다 먼저 등록해야 세션 시작부터 리플레이가 붙는다.
  add(
    sessionReplayPlugin({
      sampleRate: 1,
      privacyConfig: { blockSelector: ["video", ".amp-block"] },
    }),
  );
  init(apiKey, {
    autocapture: {
      sessions: true,
      pageViews: false,
      attribution: false,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
    },
    // 사용자 식별자를 제3자로 보내지 않는 원칙 — IP도 수집하지 않는다.
    // 기기 식별은 SDK가 자체 생성하는 익명 device_id(쿠키)로 충분하다.
    trackingOptions: { ipAddress: false },
    // 기본값 true면 Amplitude 콘솔의 Autocapture 설정이 위 로컬 설정을 원격으로
    // 덮어쓴다 — 콘솔 토글 하나로 원본 URL 전송이 다시 켜질 수 있어 차단한다.
    remoteConfig: { fetchRemoteConfig: false },
  });
}

/** 현재 라우트의 페이지뷰를 전송한다. 경로는 정제를 거치며, 미초기화면 no-op. */
export function trackAmplitudePageView(pathname: string, search: string) {
  if (!initialized) return;
  const path = sanitizePagePath(pathname, search);
  track("[Amplitude] Page Viewed", {
    "[Amplitude] Page Path": path,
    // 원본 location.href에는 userId 쿼리가 그대로 있어 쓰지 않는다.
    "[Amplitude] Page Location": window.location.origin + path,
    "[Amplitude] Page Title": document.title,
  });
}

/**
 * 유입 채널(`preregister`·`ads` 등)을 user property로 저장한다. 이후 모든 차트를
 * 이 속성으로 세그먼트해 타겟/논타겟 활성도를 비교한다. 호출처는 온보딩 채널
 * 문항(예정)이다. 미초기화면 no-op.
 */
export function setAcquisitionChannel(channel: string) {
  if (!initialized) return;
  const id = new Identify();
  id.set("acquisition_channel", channel);
  identify(id);
}
