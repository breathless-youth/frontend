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
  it("합성 3종과 파일 3종을 정해진 id 와 순서로 담고 있다", () => {
    expect(catalog.map((s) => s.id)).toEqual([
      "white",
      "pink",
      "brown",
      "rain-trp",
      "rain-mm",
      "cafe-vec",
    ]);
    expect(catalog.filter((s) => s.kind === "file")).toHaveLength(3);
  });

  it("파일 항목은 같은 폴더에 실제 파일이 있다", () => {
    for (const sound of catalog) {
      if (sound.kind !== "file") continue;
      expect(existsSync(join(dir, sound.file as string)), sound.file).toBe(true);
    }
  });

  /**
   * 정적 자산은 Vercel 원본에서 바로 나가고 CDN 이 없어 첫 로드 비용이 그대로 사용자에게
   * 간다. 설계의 상한은 6MB 다. 소리를 더할 때 여기서 먼저 걸린다.
   */
  it("소리 파일 전체 용량이 6MB 를 넘지 않는다", () => {
    const total = catalog
      .filter((s) => s.kind === "file")
      .reduce((sum, s) => sum + statSync(join(dir, s.file as string)).size, 0);

    expect(total).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
