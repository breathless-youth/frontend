import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { ProfileResponse } from "@focusmakers/types";

import {
  trackProfileImageRemoved,
  trackProfileImageUploaded,
  trackProfileImageUploadFailed,
  type ProfileImageUploadFailure,
} from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { pickNativeProfilePhoto } from "@/lib/nativeProfilePhoto";
import {
  deleteProfileImage,
  registerProfileImage,
  requestUploadUrl,
  uploadPhoto,
} from "@/lib/profileApi";
import { profileKeys } from "@/lib/profileQueries";
import { showCtaToast } from "@/lib/toast";

import type * as PreparePhoto from "../prepareProfilePhoto";
import { prepareProfilePhoto, UnusablePhotoError } from "../prepareProfilePhoto";
import { useProfilePhotoMutations } from "../useProfilePhotoMutations";

vi.mock("@/lib/profileApi", () => ({
  requestUploadUrl: vi.fn(),
  uploadPhoto: vi.fn(),
  registerProfileImage: vi.fn(),
  deleteProfileImage: vi.fn(),
}));

vi.mock("@/lib/amplitude", () => ({
  trackProfileImageUploaded: vi.fn(),
  trackProfileImageRemoved: vi.fn(),
  trackProfileImageUploadFailed: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showCtaToast: vi.fn() }));

vi.mock("@/lib/nativeProfilePhoto", () => ({ pickNativeProfilePhoto: vi.fn() }));

vi.mock("../prepareProfilePhoto", async (importOriginal) => ({
  ...(await importOriginal<typeof PreparePhoto>()),
  prepareProfilePhoto: vi.fn(),
}));

const profile: ProfileResponse = {
  nickname: "포메3721",
  goal: "합격",
  category: null,
  initial: "포",
  colorIndex: 0,
  profileImageUrl: null,
};
const withPhoto: ProfileResponse = { ...profile, profileImageUrl: "/avatars/7/old.jpg" };
const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
const file = new File(["raw"], "photo.heic", { type: "image/heic" });
const UNUSABLE = "이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요";
const UPLOAD_FAILED = "사진을 올리지 못했어요. 다시 시도해 주세요";

function setup(initial: ProfileResponse = profile) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(profileKeys.detail(7), initial);
  const { result, unmount } = renderHook(() => useProfilePhotoMutations(7), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { result, unmount, cached: () => queryClient.getQueryData(profileKeys.detail(7)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prepareProfilePhoto).mockResolvedValue(jpeg);
  vi.mocked(requestUploadUrl).mockResolvedValue({
    uploadUrl: "https://s3.example/put",
    key: "avatars/7/a.jpg",
    expiresAt: "2026-10-28T10:05:00Z",
  });
  vi.mocked(uploadPhoto).mockResolvedValue(undefined);
  // 응답의 다른 필드가 캐시로 새지 않는지 보려고 닉네임을 다르게 둔다.
  vi.mocked(registerProfileImage).mockResolvedValue({
    ...profile,
    nickname: "다른기기닉",
    profileImageUrl: "/avatars/7/a.jpg",
  });
});

describe("useProfilePhotoMutations 올리기", () => {
  it("준비한 사진 크기로 주소를 받아 올리고 등록한 뒤 캐시의 사진 주소만 바꾼다", async () => {
    const { result, cached } = setup();

    act(() => result.current.upload(file));

    await waitFor(() => expect(showCtaToast).toHaveBeenCalledWith("프로필 사진을 바꿨어요"));
    expect(prepareProfilePhoto).toHaveBeenCalledWith(file);
    expect(requestUploadUrl).toHaveBeenCalledWith(jpeg.size);
    expect(uploadPhoto).toHaveBeenCalledWith("https://s3.example/put", jpeg);
    expect(registerProfileImage).toHaveBeenCalledWith("avatars/7/a.jpg");
    expect(cached()).toEqual({ ...profile, profileImageUrl: "/avatars/7/a.jpg" });
    expect(trackProfileImageUploaded).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => void, ProfileImageUploadFailure, string]>([
    [
      "읽을 수 없거나 너무 큰 사진",
      () => {
        vi.mocked(prepareProfilePhoto).mockRejectedValue(new UnusablePhotoError());
      },
      "unusable",
      UNUSABLE,
    ],
    [
      "응답을 받지 못한 요청",
      () => {
        vi.mocked(requestUploadUrl).mockRejectedValue(new TypeError("Failed to fetch"));
      },
      "network",
      UPLOAD_FAILED,
    ],
    [
      "S3의 거절",
      () => {
        vi.mocked(uploadPhoto).mockRejectedValue(new ApiError("사진 업로드 실패 (HTTP 403)", 403));
      },
      "server",
      UPLOAD_FAILED,
    ],
    [
      "등록 거절",
      () => {
        vi.mocked(registerProfileImage).mockRejectedValue(
          new ApiError("없는 키", 400, "VALIDATION_FAILED"),
        );
      },
      "server",
      UPLOAD_FAILED,
    ],
  ])(
    "%s는 실패 분류를 남기고 안내하며 캐시는 그대로 둔다",
    async (_label, arrange, reason, message) => {
      arrange();
      const { result, cached } = setup();

      act(() => result.current.upload(file));

      await waitFor(() => expect(trackProfileImageUploadFailed).toHaveBeenCalledWith(reason));
      expect(showCtaToast).toHaveBeenCalledWith(message);
      expect(cached()).toEqual(profile);
      expect(trackProfileImageUploaded).not.toHaveBeenCalled();
    },
  );
});

describe("useProfilePhotoMutations 앱 선택기로 올리기", () => {
  it("앱이 준 JPEG는 다시 줄이지 않고 그 크기로 올려 등록한다", async () => {
    vi.mocked(pickNativeProfilePhoto).mockResolvedValue(jpeg);
    const { result, cached } = setup();

    act(() => result.current.upload("native"));

    await waitFor(() => expect(showCtaToast).toHaveBeenCalledWith("프로필 사진을 바꿨어요"));
    expect(prepareProfilePhoto).not.toHaveBeenCalled();
    expect(requestUploadUrl).toHaveBeenCalledWith(jpeg.size);
    expect(uploadPhoto).toHaveBeenCalledWith("https://s3.example/put", jpeg);
    expect(cached()).toEqual({ ...profile, profileImageUrl: "/avatars/7/a.jpg" });
    expect(trackProfileImageUploaded).toHaveBeenCalledTimes(1);
  });

  it("선택기가 열려 있는 동안 진행 중이고, 닫으면 아무것도 바꾸지 않고 알리지도 않는다", async () => {
    let picked!: (blob: Blob | null) => void;
    vi.mocked(pickNativeProfilePhoto).mockReturnValue(
      new Promise((resolve) => {
        picked = resolve;
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.upload("native"));
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => {
      picked(null);
    });

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(showCtaToast).not.toHaveBeenCalled();
    expect(trackProfileImageUploaded).not.toHaveBeenCalled();
    expect(trackProfileImageUploadFailed).not.toHaveBeenCalled();
    expect(cached()).toEqual(profile);
  });

  it("오프라인이어도 멈추지 않고 바로 선택기를 열어 요청 실패를 안내한다", async () => {
    onlineManager.setOnline(false);
    onTestFinished(() => onlineManager.setOnline(true));
    vi.mocked(pickNativeProfilePhoto).mockResolvedValue(jpeg);
    vi.mocked(requestUploadUrl).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = setup();

    act(() => result.current.upload("native"));

    await waitFor(() => expect(trackProfileImageUploadFailed).toHaveBeenCalledWith("network"));
    expect(pickNativeProfilePhoto).toHaveBeenCalledTimes(1);
    expect(showCtaToast).toHaveBeenCalledWith(UPLOAD_FAILED);
    expect(result.current.busy).toBe(false);
  });

  it("앱이 읽지 못한 사진은 unusable로 남기고 다른 사진을 고르라고 안내한다", async () => {
    vi.mocked(pickNativeProfilePhoto).mockRejectedValue(new UnusablePhotoError());
    const { result, cached } = setup();

    act(() => result.current.upload("native"));

    await waitFor(() => expect(trackProfileImageUploadFailed).toHaveBeenCalledWith("unusable"));
    expect(showCtaToast).toHaveBeenCalledWith(UNUSABLE);
    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(cached()).toEqual(profile);
  });
});

describe("useProfilePhotoMutations 삭제", () => {
  it("지우면 캐시의 사진 주소를 비우고 알린다", async () => {
    vi.mocked(deleteProfileImage).mockResolvedValue({ ...withPhoto, profileImageUrl: null });
    const { result, cached } = setup(withPhoto);

    act(() => result.current.remove());

    await waitFor(() => expect(showCtaToast).toHaveBeenCalledWith("프로필 사진을 삭제했어요"));
    expect(cached()).toEqual({ ...withPhoto, profileImageUrl: null });
    expect(trackProfileImageRemoved).toHaveBeenCalledTimes(1);
  });

  it("지우지 못하면 다시 시도하라고 알리고 사진을 그대로 둔다", async () => {
    vi.mocked(deleteProfileImage).mockRejectedValue(new ApiError("서버 오류", 500));
    const { result, cached } = setup(withPhoto);

    act(() => result.current.remove());

    await waitFor(() => expect(showCtaToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(cached()).toEqual(withPhoto);
    expect(trackProfileImageRemoved).not.toHaveBeenCalled();
    expect(trackProfileImageUploadFailed).not.toHaveBeenCalled();
  });
});

describe("useProfilePhotoMutations 화면을 떠난 뒤", () => {
  it("올리기가 끝나도 토스트는 띄우지 않고 캐시와 기록은 남긴다", async () => {
    let registered!: (value: ProfileResponse) => void;
    vi.mocked(registerProfileImage).mockReturnValue(
      new Promise((resolve) => {
        registered = resolve;
      }),
    );
    const { result, unmount, cached } = setup();

    act(() => result.current.upload(file));
    await waitFor(() => expect(registerProfileImage).toHaveBeenCalled());
    unmount();
    await act(async () => {
      registered({ ...profile, profileImageUrl: "/avatars/7/a.jpg" });
    });

    await waitFor(() => expect(trackProfileImageUploaded).toHaveBeenCalledTimes(1));
    expect(cached()).toEqual({ ...profile, profileImageUrl: "/avatars/7/a.jpg" });
    expect(showCtaToast).not.toHaveBeenCalled();
  });

  it("올리기가 실패해도 토스트는 띄우지 않고 실패 분류는 남긴다", async () => {
    let failed!: (error: unknown) => void;
    vi.mocked(registerProfileImage).mockReturnValue(
      new Promise((_resolve, reject) => {
        failed = reject;
      }),
    );
    const { result, unmount } = setup();

    act(() => result.current.upload(file));
    await waitFor(() => expect(registerProfileImage).toHaveBeenCalled());
    unmount();
    await act(async () => {
      failed(new ApiError("서버 오류", 500));
    });

    await waitFor(() => expect(trackProfileImageUploadFailed).toHaveBeenCalledWith("server"));
    expect(showCtaToast).not.toHaveBeenCalled();
  });

  it("삭제가 끝나도 토스트는 띄우지 않고 캐시와 기록은 남긴다", async () => {
    let removed!: (value: ProfileResponse) => void;
    vi.mocked(deleteProfileImage).mockReturnValue(
      new Promise((resolve) => {
        removed = resolve;
      }),
    );
    const { result, unmount, cached } = setup(withPhoto);

    act(() => result.current.remove());
    await waitFor(() => expect(deleteProfileImage).toHaveBeenCalled());
    unmount();
    await act(async () => {
      removed({ ...withPhoto, profileImageUrl: null });
    });

    await waitFor(() => expect(trackProfileImageRemoved).toHaveBeenCalledTimes(1));
    expect(cached()).toEqual({ ...withPhoto, profileImageUrl: null });
    expect(showCtaToast).not.toHaveBeenCalled();
  });
});
