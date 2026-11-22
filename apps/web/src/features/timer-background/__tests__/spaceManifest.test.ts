import { describe, expect, it, vi } from "vitest";

import { loadSpaceScenes } from "../spaceManifest";

const KEY = "rain/1a2b3c4d";

function respond(body: string, status = 200) {
  return vi.fn(() => Promise.resolve(new Response(body, { status })));
}

describe("loadSpaceScenes", () => {
  it("version 1에서 sound가 true면 집중 장면에 반복 소리가 있다", async () => {
    const scenes = await loadSpaceScenes(KEY, respond('{"version": 1, "sound": true}'));

    expect(scenes).toEqual({ focus: { loopSound: true }, distract: null });
  });

  it("매니페스트는 공간 폴더에서 받는다", async () => {
    const fetcher = respond('{"version": 1, "sound": false}');

    await loadSpaceScenes(KEY, fetcher);

    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/spaces/rain/1a2b3c4d/manifest.json");
  });

  it.each([
    ["sound가 false", () => respond('{"version": 1, "sound": false}')],
    ["파일이 없음", () => respond("", 404)],
    ["모르는 version", () => respond('{"version": 99, "sound": true}')],
    ["깨진 JSON", () => respond("{version")],
    ["sound가 참거짓이 아님", () => respond('{"version": 1, "sound": "yes"}')],
    ["버킷이 없는 파일을 막음(403)", () => respond("", 403)],
  ])("%s이면 소리 없는 공간으로 본다", async (_, make) => {
    await expect(loadSpaceScenes(KEY, make())).resolves.toEqual({
      focus: { loopSound: false },
      distract: null,
    });
  });

  it.each([
    ["네트워크 실패", () => vi.fn(() => Promise.reject(new TypeError("offline")))],
    ["서버 오류", () => respond("", 503)],
  ])("%s처럼 잠깐의 실패는 결과로 남기지 않게 실패로 돌려준다", async (_, make) => {
    await expect(loadSpaceScenes(KEY, make())).rejects.toThrow();
  });
});
