import { describe, expect, it, vi } from "vitest";

import { loadSpaceScenes, SILENT_SCENES } from "../spaceManifest";

const KEY = "rain/1a2b3c4d";

function respond(body: string, status = 200) {
  return vi.fn(() => Promise.resolve(new Response(body, { status })));
}

describe("loadSpaceScenes", () => {
  it("version 1에서 sound가 true면 집중 장면에 반복 소리가 있다", async () => {
    const scenes = await loadSpaceScenes(KEY, respond('{"version": 1, "sound": true}'));

    expect(scenes).toEqual({ ...SILENT_SCENES, focus: { loopSound: true } });
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
    await expect(loadSpaceScenes(KEY, make())).resolves.toEqual(SILENT_SCENES);
  });

  it.each([
    ["네트워크 실패", () => vi.fn(() => Promise.reject(new TypeError("offline")))],
    ["서버 오류", () => respond("", 503)],
  ])("%s처럼 잠깐의 실패는 결과로 남기지 않게 실패로 돌려준다", async (_, make) => {
    await expect(loadSpaceScenes(KEY, make())).rejects.toThrow();
  });
  const V2 = {
    version: 2,
    timing: { distractAfterSec: 9, returnAfterSec: 3 },
    focus: { visual: "video", loop: true },
    distract: { visual: "video", loop: "own", cue: false, approach: true },
  };

  it("version 2는 시간과 집중 소리, 비집중 장면을 읽는다", async () => {
    const scenes = await loadSpaceScenes(KEY, respond(JSON.stringify(V2)));

    expect(scenes).toEqual({
      timing: { distractAfterMs: 9_000, returnAfterMs: 3_000 },
      focus: { loopSound: true },
      distract: { visual: "video", loop: "own", cue: false, approach: true },
    });
  });

  it("version 1은 기본 시간이고 비집중 장면이 없다", async () => {
    const scenes = await loadSpaceScenes(KEY, respond('{"version": 1, "sound": true}'));

    expect(scenes.timing).toEqual({ distractAfterMs: 9_000, returnAfterMs: 3_000 });
    expect(scenes.distract).toBeNull();
  });

  it("version 2의 모르는 필드는 무시한다", async () => {
    const manifest = {
      ...V2,
      transition: "crossfade",
      timing: { ...V2.timing, curve: "ease" },
      distract: { ...V2.distract, visual: null, returnCue: true },
    };

    const scenes = await loadSpaceScenes(KEY, respond(JSON.stringify(manifest)));

    expect(scenes.timing).toEqual({ distractAfterMs: 9_000, returnAfterMs: 3_000 });
    expect(scenes.distract).toEqual({ visual: null, loop: "own", cue: false, approach: true });
  });

  it.each([
    ["timing이 없음", { ...V2, timing: undefined }],
    ["비집중까지 시간이 3초보다 짧음", { ...V2, timing: { ...V2.timing, distractAfterSec: 2 } }],
    ["비집중까지 시간이 60초보다 김", { ...V2, timing: { ...V2.timing, distractAfterSec: 61 } }],
    ["비집중까지 시간이 정수가 아님", { ...V2, timing: { ...V2.timing, distractAfterSec: 4.5 } }],
    ["돌아오기 시간이 1초보다 짧음", { ...V2, timing: { ...V2.timing, returnAfterSec: 0 } }],
    ["돌아오기 시간이 30초보다 김", { ...V2, timing: { ...V2.timing, returnAfterSec: 31 } }],
    ["focus가 없음", { ...V2, focus: undefined }],
    ["집중 소리 표시가 참거짓이 아님", { ...V2, focus: { visual: "video", loop: "yes" } }],
    ["집중 화면 종류가 없음", { ...V2, focus: { loop: true } }],
    ["집중 화면이 영상이 아님", { ...V2, focus: { visual: "image", loop: true } }],
    ["비집중 장면이 없음", { ...V2, distract: null }],
    ["비집중 화면 종류를 모름", { ...V2, distract: { ...V2.distract, visual: "gif" } }],
    ["비집중 소리 방식을 모름", { ...V2, distract: { ...V2.distract, loop: "mute" } }],
    ["신호 소리 표시가 없음", { ...V2, distract: { ...V2.distract, cue: undefined } }],
    ["예고 소리 표시가 참거짓이 아님", { ...V2, distract: { ...V2.distract, approach: 1 } }],
  ])("version 2에서 %s이면 소리 없는 집중 장면으로 본다", async (_, manifest) => {
    await expect(loadSpaceScenes(KEY, respond(JSON.stringify(manifest)))).resolves.toEqual(
      SILENT_SCENES,
    );
  });
});
