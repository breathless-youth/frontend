import { describe, expect, it } from "vitest";

import { appIdentityFor } from "../appIdentity";

describe("appIdentityFor", () => {
  it.each([
    ["production", "focusmakers", "com.breathlessyouth.mobile"],
    ["preview", "focusmakers-staging", "com.breathlessyouth.mobile.staging"],
    ["development", "focusmakers-dev", "com.breathlessyouth.mobile.dev"],
  ] as const)("%s → 스킴 %s, 패키지 %s", (env, scheme, androidPackage) => {
    expect(appIdentityFor(env)).toEqual({ scheme, androidPackage });
  });
});
