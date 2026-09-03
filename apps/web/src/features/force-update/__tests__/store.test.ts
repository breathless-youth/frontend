import { describe, expect, it, vi } from "vitest";

import { openAppStore } from "../store";

describe("openAppStore", () => {
  it("Android면 market:// 스킴으로 이동시킨다", () => {
    const navigate = vi.fn();

    openAppStore("android", navigate);

    expect(navigate).toHaveBeenCalledWith("market://details?id=com.breathlessyouth.mobile");
  });

  it("iOS면 itms-apps:// 스킴으로 이동시킨다", () => {
    const navigate = vi.fn();

    openAppStore("ios", navigate);

    expect(navigate).toHaveBeenCalledWith("itms-apps://apps.apple.com/app/id6797220287");
  });
});
