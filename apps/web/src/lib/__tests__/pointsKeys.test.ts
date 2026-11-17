import { describe, expect, it } from "vitest";

import { pointsKeys } from "@/lib/pointsQueries";

describe("pointsKeys", () => {
  it("기록 앞머리 키로 다시 받으면 필터마다의 기록 조회가 모두 걸린다", () => {
    const prefix = pointsKeys.histories(7);
    for (const filter of ["all", "earned", "spent"] as const) {
      expect(pointsKeys.history(7, filter).slice(0, prefix.length)).toEqual([...prefix]);
    }
  });
});
