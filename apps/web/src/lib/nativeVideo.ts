import type { ToNativeMessage, VideoResultStatus } from "@focusmakers/types";

import type { InstallUtm } from "@/features/social-room/storeLink";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

/**
 * 원본 조각 크기
 *
 * base64로 바꾸면 512KB가 된다.
 * 3의 배수라 조각마다 패딩 없이 끊겨 앱이 조각을 따로 풀어 이어 써도 원본과 같다.
 */
const CHUNK_BYTES = 384 * 1024;

/**
 * 저장 결과를 기다리는 한도
 *
 * 처음 저장할 때 뜨는 사진 권한 창 앞에서 고민하는 시간이 이 안에 들어간다.
 * 앱이 끝내 답하지 않아도 호출한 쪽이 영원히 기다리지 않게 하는 안전장치다.
 */
const SAVE_TIMEOUT_MS = 120_000;

/**
 * `String.fromCharCode`에 한 번에 넘기는 바이트 수
 *
 * 엔진의 인자 개수 한도를 넘지 않게 나눈다.
 */
const CHAR_CODE_BATCH = 0x8000;

const TIMELAPSE_SHARE_UTM = {
  utm_source: "timelapse",
  utm_medium: "share",
  utm_campaign: "timelapse_share",
} satisfies InstallUtm;

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readVideoShareFlag(): boolean {
  return new URLSearchParams(window.location.search).get("videoShare") === "1";
}

let videoShareCache: boolean | null = readVideoShareFlag();

/**
 * 앱에 영상 저장·공유를 맡길 수 있는지
 *
 * 앱이 웹뷰 URL에 `videoShare=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 구버전 앱에도 바로 배포되므로 브리지만 있고 표시가 없으면 이 메시지를 모르는 앱으로 본다.
 */
export function canUseNativeVideo(): boolean {
  videoShareCache ??= readVideoShareFlag();
  return videoShareCache && isNativeBridgeAvailable();
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetNativeVideoForTests(): void {
  videoShareCache = null;
}

/**
 * 공유 본문
 *
 * 설치 링크에 타임랩스 공유에서 온 유입이라는 표시를 붙인다.
 */
export function timelapseShareText(origin: string): string {
  const query = new URLSearchParams(TIMELAPSE_SHARE_UTM).toString();
  return `포커스 메이커스와 함께한 공부 모습이에요\n${origin}/download?${query}`;
}

export function saveVideoNatively(blob: Blob): Promise<VideoResultStatus> {
  return sendVideo(
    blob,
    (id, chunks) => ({ type: "video-save", id, chunks, atMs: Date.now() }),
    SAVE_TIMEOUT_MS,
  );
}

export function shareVideoNatively(blob: Blob): Promise<VideoResultStatus> {
  const text = timelapseShareText(window.location.origin);
  // 공유는 사용자가 시트에서 고르는 동안 끝나지 않으므로 시간 제한을 두지 않는다.
  return sendVideo(
    blob,
    (id, chunks) => ({ type: "video-share", id, chunks, text, atMs: Date.now() }),
    null,
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHAR_CODE_BATCH) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHAR_CODE_BATCH));
  }
  return btoa(binary);
}

/**
 * 영상을 조각으로 보내고 같은 id의 결과를 기다리는 흐름
 *
 * 영상 전체를 문자열 하나로 만들지 않도록 조각마다 읽고 바꿔 바로 보낸다.
 * 구독은 첫 조각을 보내기 전에 건다.
 * 결과를 기다리는 동안 화면을 막지 않으므로 호출한 쪽은 결과를 버려도 된다.
 * 읽다가 실패하면 `failed`로 끝낸다.
 */
function sendVideo(
  blob: Blob,
  request: (id: string, chunks: number) => ToNativeMessage,
  timeoutMs: number | null,
): Promise<VideoResultStatus> {
  // LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
  // 앱 파서가 UUID 형식만 받으므로 다른 형식으로 대신하지 않고 failed로 끝낸다.
  if (!canUseNativeVideo() || typeof crypto?.randomUUID !== "function") {
    return Promise.resolve("failed");
  }
  // 같은 다이얼로그에서 저장과 공유가 겹칠 수 있어 요청마다 새 id로 결과를 가른다.
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (status: VideoResultStatus) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(status);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "video-result" && message.id === id) {
        settle(message.status);
      }
    });
    void (async () => {
      const chunks = Math.ceil(blob.size / CHUNK_BYTES);
      for (let seq = 0; seq < chunks; seq += 1) {
        const start = seq * CHUNK_BYTES;
        const bytes = new Uint8Array(await blob.slice(start, start + CHUNK_BYTES).arrayBuffer());
        postToNative({ type: "video-chunk", id, seq, data: toBase64(bytes), atMs: Date.now() });
      }
      if (timeoutMs !== null) {
        timer = setTimeout(() => settle("failed"), timeoutMs);
      }
      postToNative(request(id, chunks));
    })().catch(() => settle("failed"));
  });
}
