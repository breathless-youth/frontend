import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeVideoForTests,
  canUseNativeVideo,
  saveVideoNatively,
  shareVideoNatively,
  timelapseShareText,
} from "@/lib/nativeVideo";

const CHUNK_BYTES = 384 * 1024;
const postMessage = vi.fn();

interface SentMessage {
  type: string;
  id?: string;
  seq?: number;
  data?: string;
  chunks?: number;
  text?: string;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  postMessage.mockClear();
  window.history.replaceState(null, "", "/");
  __resetNativeVideoForTests();
});

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

/**
 * 표시와 브리지를 함께 둔다.
 * 전송은 둘 다 있어야 시작되므로 보내는 테스트는 이 조합이 필요하다.
 */
function enableNativeVideo() {
  window.history.replaceState(null, "", "/?videoShare=1");
  __resetNativeVideoForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

function sent(): SentMessage[] {
  return postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string) as SentMessage);
}

/** jsdom의 Blob에는 arrayBuffer가 없어 조각 읽기만 흉내 내는 대역을 쓴다. */
function fakeBlob(bytes: Uint8Array): Blob {
  return {
    size: bytes.length,
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  } as unknown as Blob;
}

function bytesOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => index % 251);
}

function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function replyResult(id: string, action: "save" | "share", status: string) {
  nativeEntry()(JSON.stringify({ type: "video-result", id, action, status, atMs: 1 }));
}

async function lastMessageIs(type: string) {
  await vi.waitFor(() => expect(sent().at(-1)?.type).toBe(type));
}

describe("canUseNativeVideo", () => {
  it("videoShare 표시와 브리지가 모두 있을 때만 참이다", () => {
    window.history.replaceState(null, "", "/?videoShare=1");
    __resetNativeVideoForTests();
    expect(canUseNativeVideo()).toBe(false);

    vi.stubGlobal("ReactNativeWebView", { postMessage });
    expect(canUseNativeVideo()).toBe(true);
  });

  it("브리지가 있어도 표시가 없으면 거짓이다 (이 메시지를 모르는 구버전 앱)", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    expect(canUseNativeVideo()).toBe(false);
  });

  it("처음 읽은 표시를 유지한다 (앱 안 이동이 쿼리를 지워도 바뀌지 않는다)", () => {
    window.history.replaceState(null, "", "/?videoShare=1");
    __resetNativeVideoForTests();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    expect(canUseNativeVideo()).toBe(true);

    window.history.replaceState(null, "", "/records");
    expect(canUseNativeVideo()).toBe(true);
  });
});

describe("saveVideoNatively", () => {
  it("384KB씩 잘라 순서대로 보내고 마지막에 조각 수와 함께 저장을 요청한다", async () => {
    enableNativeVideo();
    const bytes = bytesOf(CHUNK_BYTES * 2 + 10);

    const pending = saveVideoNatively(fakeBlob(bytes));
    await lastMessageIs("video-save");

    const messages = sent();
    const chunkMessages = messages.filter((message) => message.type === "video-chunk");
    const parts = chunkMessages.map((message) => decode(message.data ?? ""));
    expect(chunkMessages.map((message) => message.seq)).toEqual([0, 1, 2]);
    expect(parts.map((part) => part.length)).toEqual([CHUNK_BYTES, CHUNK_BYTES, 10]);
    const joined = new Uint8Array(bytes.length);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    // 786KB 배열을 toEqual로 훑으면 이 단언 하나가 1초 가까이 걸려 바이트 단위로 직접 비교한다.
    expect(joined.findIndex((byte, index) => byte !== bytes[index])).toBe(-1);

    const id = String(messages[0]?.id);
    expect(messages.every((message) => message.id === id)).toBe(true);
    expect(messages.at(-1)).toMatchObject({ type: "video-save", id, chunks: 3 });

    replyResult(id, "save", "saved");
    await expect(pending).resolves.toBe("saved");
  });

  it("다른 id의 결과는 무시하고 같은 id의 결과로 끝난다", async () => {
    enableNativeVideo();
    const pending = saveVideoNatively(fakeBlob(bytesOf(10)));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await lastMessageIs("video-save");

    replyResult("00000000-0000-4000-8000-000000000000", "save", "saved");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    replyResult(String(sent()[0]?.id), "save", "denied");
    await expect(pending).resolves.toBe("denied");
  });

  it("120초 안에 결과가 없으면 failed로 끝낸다", async () => {
    vi.useFakeTimers();
    enableNativeVideo();
    const pending = saveVideoNatively(fakeBlob(bytesOf(10)));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await lastMessageIs("video-save");

    await vi.advanceTimersByTimeAsync(119_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe("failed");
  });

  it("videoShare 표시가 있어도 브리지가 없으면 보내지 않고 failed다", async () => {
    window.history.replaceState(null, "", "/?videoShare=1");
    __resetNativeVideoForTests();

    await expect(saveVideoNatively(fakeBlob(bytesOf(10)))).resolves.toBe("failed");
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("crypto.randomUUID가 없는 비보안 문서에서는 throw하지 않고 failed다", async () => {
    enableNativeVideo();
    vi.stubGlobal("crypto", {});

    await expect(saveVideoNatively(fakeBlob(bytesOf(10)))).resolves.toBe("failed");
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("브리지가 있어도 videoShare 표시가 없으면 보내지 않고 failed다", async () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    await expect(saveVideoNatively(fakeBlob(bytesOf(10)))).resolves.toBe("failed");
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("영상을 읽지 못하면 failed다", async () => {
    enableNativeVideo();
    const broken = {
      size: 10,
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error("read failed")) }),
    } as unknown as Blob;

    await expect(saveVideoNatively(broken)).resolves.toBe("failed");
    expect(sent().some((message) => message.type === "video-save")).toBe(false);
  });
});

describe("shareVideoNatively", () => {
  it("설치 링크가 든 본문을 실어 공유를 요청하고 시간 제한 없이 결과를 기다린다", async () => {
    vi.useFakeTimers();
    enableNativeVideo();
    const pending = shareVideoNatively(fakeBlob(bytesOf(10)));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await lastMessageIs("video-share");

    const request = sent().at(-1);
    expect(request).toMatchObject({
      type: "video-share",
      chunks: 1,
      text: timelapseShareText(window.location.origin),
    });
    expect(request).not.toHaveProperty("title");

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled).toBe(false);

    replyResult(String(request?.id), "share", "dismissed");
    await expect(pending).resolves.toBe("dismissed");
  });
});

describe("timelapseShareText", () => {
  it("문구 다음 줄에 타임랩스 공유 UTM이 붙은 설치 링크를 둔다", () => {
    expect(timelapseShareText("https://web.sunqstudio.kr")).toBe(
      "포커스 메이커스와 함께한 공부 모습이에요\nhttps://web.sunqstudio.kr/download?utm_source=timelapse&utm_medium=share&utm_campaign=timelapse_share",
    );
  });
});
