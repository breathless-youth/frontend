import type { ProfileResponse, PublicGroupDetailResponse } from "@focusmakers/types";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Location } from "react-router-dom";
import { toast } from "sonner";
import { onTestFinished, vi } from "vitest";
import type { Mock } from "vitest";

import { App } from "@/App";
import * as groupRoomApi from "@/lib/groupRoomApi";
import type { GroupRoomApi } from "@/lib/groupRoomApi";
import { __resetGroupRoomsForTests } from "@/lib/groupRoomCapability";
import { createGroupMockServer } from "@/lib/groupRoomMock";
import type { GroupMockServer } from "@/lib/groupRoomMock";
import { GROUP_MOCK_DEFAULT_ME, seedGroupData } from "@/lib/groupRoomMockData";
import type { GroupMockScene } from "@/lib/groupRoomMockData";
import { getProfile } from "@/lib/profileApi";
import { queryClient } from "@/lib/queryClient";
import { useIdentityPending, useUserId } from "@/lib/userId";

import { LocationProbe } from "./LocationProbe";

/**
 * 그룹 라우트 테스트 도우미
 *
 * 그룹 라우트 테스트는 앱 전체를 주소 하나로 그리고, 자동 mock한 그룹 API에 개발용 가짜 서버를 구현으로 넣는다.
 * 쓰는 테스트 파일은 맨 위에 `vi.mock("@/lib/groupRoomApi")`와 `useUserId`, `useIdentityPending`을 바꾸는 `vi.mock("@/lib/userId", ...)`를 둔다.
 * `mockProfile`을 쓰면 `vi.mock("@/lib/profileApi")`도 둔다.
 */

type GroupApiName = keyof GroupRoomApi;

export type MockedGroupApi = { [Name in GroupApiName]: Mock<GroupRoomApi[Name]> } & {
  server: GroupMockServer;
};

// 그룹 표시는 라우터가 아니라 창의 주소에서 읽어서 테스트가 끝나면 창 주소와 기억한 판정을 처음으로 돌린다.
function resetGroupRoute(): void {
  window.history.replaceState(null, "", "/");
  __resetGroupRoomsForTests();
  queryClient.clear();
  localStorage.clear();
  // sonner 토스트는 모듈 전역 상태라 화면을 내려도 다음 테스트로 넘어간다.
  act(() => {
    toast.dismiss();
  });
}

/**
 * 주소 하나로 앱 전체 그리기
 *
 * 그룹 표시를 읽도록 주소를 창 기록에도 넣고, 앞 테스트가 받아 둔 조회를 비운 뒤 그린다.
 * 돌려주는 `router.location()`은 앱 안에서 이동한 지금 주소다.
 */
export function renderGroupRoute(path: string): { router: { location(): Location } } {
  window.history.replaceState(null, "", path);
  __resetGroupRoomsForTests();
  queryClient.clear();
  onTestFinished(resetGroupRoute);
  let current: Location | null = null;
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe
        onLocation={(location) => {
          current = location;
        }}
      />
    </MemoryRouter>,
  );
  return {
    router: {
      location() {
        if (current === null) {
          throw new Error("라우터 주소를 아직 읽지 못했다");
        }
        return current;
      },
    },
  };
}

/**
 * 그룹 API를 가짜 서버 한 장면으로 바꾸기
 *
 * 함수마다 앞 테스트의 구현과 호출 기록을 비우고 같은 이름의 가짜 서버 함수를 구현으로 넣는다.
 * 테스트는 돌려받은 함수에 `mockRejectedValueOnce` 같은 구현을 더해 한 번만 다르게 답하게 한다.
 */
export function mockGroupApi(scene: GroupMockScene = "default"): MockedGroupApi {
  const server = createGroupMockServer(scene, { delayMs: 0 });
  const mocked: Record<string, unknown> = {};
  for (const name of Object.keys(server) as (keyof GroupMockServer)[]) {
    if (name === "setOwnerForTests") {
      continue;
    }
    const fn = groupRoomApi[name];
    if (!vi.isMockFunction(fn)) {
      throw new Error('테스트 파일 맨 위에 vi.mock("@/lib/groupRoomApi")를 둔다');
    }
    fn.mockReset();
    fn.mockImplementation(server[name] as never);
    mocked[name] = fn;
  }
  return { ...mocked, server } as unknown as MockedGroupApi;
}

/** 가짜 서버에서 그 그룹의 그룹장을 테스트의 나로 바꾼다. */
export function makeMeOwnerOf(api: MockedGroupApi, groupId: number): void {
  api.server.setOwnerForTests(groupId, GROUP_MOCK_DEFAULT_ME);
}

/** 앱이 첫 토큰을 아직 넘기지 않은 웹뷰처럼 신원이 정해지지 않은 상태로 둔다. */
export function stubPendingIdentity(): void {
  const pending = useIdentityPending;
  const userId = useUserId;
  if (!vi.isMockFunction(pending) || !vi.isMockFunction(userId)) {
    throw new Error(
      '테스트 파일 맨 위에 useUserId와 useIdentityPending을 바꾸는 vi.mock("@/lib/userId")를 둔다',
    );
  }
  pending.mockReturnValue(true);
  userId.mockReturnValue(null);
  onTestFinished(() => {
    pending.mockReset();
    userId.mockReset();
  });
}

export { stubIntersectionObserver } from "./intersectionObserverStub";

/** 기본 장면의 공개 그룹 보기 응답 하나 */
export function seedDetail(groupId: number): PublicGroupDetailResponse {
  const detail = seedGroupData("default", Date.now()).publicDetails[groupId];
  if (detail === undefined) {
    throw new Error(`기본 장면에 공개 그룹 ${groupId}가 없다`);
  }
  return detail;
}

/** 프로필 조회가 이 값을 돌려주게 한다. */
export function mockProfile(patch: Partial<ProfileResponse>): void {
  if (!vi.isMockFunction(getProfile)) {
    throw new Error('테스트 파일 맨 위에 vi.mock("@/lib/profileApi")를 둔다');
  }
  getProfile.mockResolvedValue({
    nickname: "열공곰",
    goal: null,
    category: null,
    initial: "열",
    colorIndex: 0,
    profileImageUrl: null,
    ...patch,
  });
}
