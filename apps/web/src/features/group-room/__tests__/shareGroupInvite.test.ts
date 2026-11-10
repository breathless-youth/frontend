import { afterEach, describe, expect, it, vi } from "vitest";

import * as toast from "@/lib/toast";

import { sharePublicGroupInvite } from "../shareGroupInvite";

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
  vi.restoreAllMocks();
});

const PUBLIC_BODY = () =>
  `그룹 스터디에 초대받았어요!\n\n${window.location.origin}/social/join?code=go-12`;

describe("sharePublicGroupInvite", () => {
  it("공유 시트에 공개 그룹 링크를 싣고 초대코드 줄은 넣지 않는다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    await sharePublicGroupInvite(12);

    expect(share).toHaveBeenCalledWith({
      title: "포커스 메이커스 그룹 스터디",
      text: PUBLIC_BODY(),
    });
    expect((share.mock.calls[0]![0] as { text: string }).text).not.toContain("초대코드");
  });

  it("공유 기능이 없으면 같은 본문을 복사하고 복사했다고 알린다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const showToast = vi.spyOn(toast, "showToast").mockImplementation(() => undefined);

    await sharePublicGroupInvite(12);

    expect(writeText).toHaveBeenCalledWith(PUBLIC_BODY());
    expect(showToast).toHaveBeenCalledOnce();
  });
});
