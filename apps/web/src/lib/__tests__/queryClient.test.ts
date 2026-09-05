import { describe, expect, it } from "vitest";

import { queryClient } from "../queryClient";

describe("queryClient 기본값", () => {
  it("staleTime 30초, retry 1이다", () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: 1,
    });
  });
});
