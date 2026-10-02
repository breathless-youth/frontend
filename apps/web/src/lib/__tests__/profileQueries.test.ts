import { describe, expect, it } from "vitest";

import { profileKeys, profileQuery } from "../profileQueries";

describe("profileQuery", () => {
  it("profileKeys.detail과 같은 키를 쓴다", () => {
    expect(profileQuery(7).queryKey).toEqual(profileKeys.detail(7));
  });

  it("staleTime 5분을 정의처에서 싣는다", () => {
    expect(profileQuery(7).staleTime).toBe(5 * 60 * 1000);
  });
});
