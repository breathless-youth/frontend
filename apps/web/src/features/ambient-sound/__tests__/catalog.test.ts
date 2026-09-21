import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadCatalog, parseCatalog } from "../catalog";

const VALID = {
  version: 1,
  sounds: [
    { id: "white", kind: "synth", label: "백색소음" },
    { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3", bytes: 1080000 },
  ],
};

describe("parseCatalog", () => {
  it("정상 카탈로그를 순서대로 파싱한다", () => {
    expect(parseCatalog(VALID)).toEqual([
      { id: "white", kind: "synth", label: "백색소음" },
      { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3" },
    ]);
  });

  it("최상위가 배열이어도 받는다", () => {
    expect(parseCatalog(VALID.sounds)).toHaveLength(2);
  });

  it("알 수 없는 kind 는 그 항목만 버린다", () => {
    const raw = [...VALID.sounds, { id: "lofi", kind: "stream", label: "lofi" }];
    expect(parseCatalog(raw).map((s) => s.id)).toEqual(["white", "rain"]);
  });

  it("id·label 누락, file kind 인데 file 없음은 그 항목만 버린다", () => {
    const raw = [
      { kind: "synth", label: "이름만" },
      { id: "noLabel", kind: "synth" },
      { id: "cafe", kind: "file", label: "카페" },
      { id: "pink", kind: "synth", label: "핑크노이즈" },
    ];
    expect(parseCatalog(raw).map((s) => s.id)).toEqual(["pink"]);
  });

  it("배열도 객체도 아니면 빈 목록이다", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog("white")).toEqual([]);
    expect(parseCatalog({ version: 1 })).toEqual([]);
    expect(parseCatalog({ sounds: "nope" })).toEqual([]);
  });

  it("group 을 읽어 그대로 담는다", () => {
    const raw = [
      { id: "binaural", kind: "synth", group: "noise", label: "바이노럴 비트" },
      { id: "lofi-1", kind: "file", group: "music", label: "lofi", file: "lofi-1.mp3" },
    ];
    expect(parseCatalog(raw).map((s) => s.group)).toEqual(["noise", "music"]);
  });

  it("모르는 group 이나 group 없음은 항목을 버리지 않고 group 만 비운다", () => {
    const raw = [
      { id: "white", kind: "synth", group: "beat", label: "백색소음" },
      { id: "pink", kind: "synth", label: "핑크노이즈" },
      { id: "rain", kind: "file", group: 7, label: "빗소리", file: "rain.mp3" },
    ];
    const parsed = parseCatalog(raw);
    expect(parsed.map((s) => s.id)).toEqual(["white", "pink", "rain"]);
    expect(parsed.map((s) => s.group)).toEqual([undefined, undefined, undefined]);
  });
});

describe("loadCatalog", () => {
  it("/sounds/catalog.json 을 받아 파싱한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(VALID),
    } as unknown as Response);
    const result = await loadCatalog(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/sounds/catalog.json");
    expect(result.map((s) => s.id)).toEqual(["white", "rain"]);
  });

  it("깨진 JSON 이면 빈 목록이고 throw 하지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response);
    await expect(loadCatalog(fetchImpl)).resolves.toEqual([]);
  });

  it("응답이 실패이거나 fetch 가 throw 해도 빈 목록이다", async () => {
    const notOk = vi.fn().mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    await expect(loadCatalog(notOk)).resolves.toEqual([]);
    const throwing = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(loadCatalog(throwing)).resolves.toEqual([]);
  });
});

describe("public/sounds/catalog.json", () => {
  const dir = join(__dirname, "../../../../public/sounds");
  const catalog = parseCatalog(JSON.parse(readFileSync(join(dir, "catalog.json"), "utf8")));

  /**
   * 실리기로 한 목록 전체를 잠근다. 파일이 존재하는지만 보면 항목이 사라지거나 id 가 바뀐
   * 것을 못 잡고, `soundIcons.ts` 의 아이콘 표와도 어긋난다.
   */
  it("합성 5종과 파일 3종을 정해진 id 와 순서로 담고 있다", () => {
    expect(catalog.map((s) => s.id)).toEqual([
      "white",
      "pink",
      "brown",
      "binaural",
      "monaural",
      "rain-trp",
      "rain-mm",
      "cafe-vec",
    ]);
    expect(catalog.filter((s) => s.kind === "file")).toHaveLength(3);
  });

  it("모든 항목이 group 을 갖는다", () => {
    expect(catalog.every((s) => s.group !== undefined)).toBe(true);
  });

  it("파일 항목은 같은 폴더에 실제 파일이 있다", () => {
    for (const sound of catalog) {
      if (sound.kind !== "file") continue;
      expect(existsSync(join(dir, sound.file as string)), sound.file).toBe(true);
    }
  });

  /**
   * 정적 자산은 Vercel 원본에서 바로 나가고 CDN 이 없다. 다만 소리 파일은 사용자가 그
   * 소리를 켤 때 받으므로 한 사람이 무는 비용은 파일 하나 크기다. 총량은 배포 크기
   * 문제라 BY-683 에서 12MB 로 올렸다. 파일 하나의 상한은 1.2MB 그대로다.
   */
  it("파일마다 1.2MB, 전체 12MB 를 넘지 않는다", () => {
    const files = catalog.filter((s) => s.kind === "file");
    let total = 0;
    for (const sound of files) {
      const size = statSync(join(dir, sound.file as string)).size;
      expect(size, sound.file).toBeLessThanOrEqual(1.2 * 1024 * 1024);
      total += size;
    }

    expect(total).toBeLessThanOrEqual(12 * 1024 * 1024);
  });
});
