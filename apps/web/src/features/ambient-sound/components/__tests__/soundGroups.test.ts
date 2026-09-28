import { describe, expect, it } from "vitest";

import type { AmbientSound } from "../../catalog";
import { soundGroups } from "../soundGroups";

const sound = (id: string, extra: Partial<AmbientSound> = {}): AmbientSound => ({
  id,
  kind: "synth",
  label: id,
  ...extra,
});

describe("soundGroups", () => {
  it("group 을 따라 노이즈·주변 소리·음악 순으로 나눈다", () => {
    const groups = soundGroups([
      sound("lofi-1", { kind: "file", file: "a.mp3", group: "music" }),
      sound("bonfire", { kind: "file", file: "b.mp3", group: "ambience" }),
      sound("binaural", { group: "noise" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["noise", "ambience", "music"]);
    expect(groups.map((g) => g.label)).toEqual(["노이즈", "주변 소리", "음악"]);
    expect(groups.map((g) => g.sounds.map((s) => s.id))).toEqual([
      ["binaural"],
      ["bonfire"],
      ["lofi-1"],
    ]);
  });

  it("group 이 없으면 합성은 노이즈, 파일은 주변 소리로 떨어진다", () => {
    const groups = soundGroups([sound("white"), sound("rain", { kind: "file", file: "r.mp3" })]);
    expect(groups.map((g) => g.id)).toEqual(["noise", "ambience"]);
    expect(groups[0].sounds.map((s) => s.id)).toEqual(["white"]);
    expect(groups[1].sounds.map((s) => s.id)).toEqual(["rain"]);
  });

  it("비어 있는 그룹은 내보내지 않는다", () => {
    expect(soundGroups([sound("white", { group: "noise" })]).map((g) => g.id)).toEqual(["noise"]);
    expect(soundGroups([])).toEqual([]);
  });

  it("같은 그룹 안에서는 카탈로그 순서를 지킨다", () => {
    const groups = soundGroups([
      sound("pink", { group: "noise" }),
      sound("white", { group: "noise" }),
    ]);
    expect(groups[0].sounds.map((s) => s.id)).toEqual(["pink", "white"]);
  });
});
