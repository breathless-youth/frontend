import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyBlockCopy,
  canCreateRoom,
  countGroupText,
  CREATE_ROOM_LIMIT_COPY,
  isRoomFull,
  joinBlockCopy,
  memberCountText,
  myRoomsTabCount,
  remainingSeats,
} from "../limits";

describe("applyBlockCopy", () => {
  it("이유마다 정한 안내 문장을 준다", () => {
    expect(applyBlockCopy("kicked_recently")).toBe("3일 동안 이 그룹에 신청할 수 없어요");
    expect(applyBlockCopy("rooms_and_applications_full")).toBe("그룹 개수가 가득 찼어요");
    expect(applyBlockCopy("pending_applications_full")).toBe("신청은 3곳까지 보낼 수 있어요");
  });
});

describe("joinBlockCopy", () => {
  it("초대코드로 들어갈 수 없는 이유마다 입력칸 아래 한 문장을 준다", () => {
    expect(joinBlockCopy("room_full")).toBe("자리가 다 찼어요");
    expect(joinBlockCopy("kicked_recently")).toBe(
      "내보내진 그룹에는 3일 동안 다시 들어갈 수 없어요",
    );
    expect(joinBlockCopy("rooms_and_applications_full")).toBe("이미 5개의 그룹을 가지고 있어요");
    expect(joinBlockCopy("invalid_code")).toBe("초대코드를 다시 확인해 주세요");
  });
});

describe("canCreateRoom", () => {
  it("그룹장인 그룹이 2개보다 적을 때만 만들 수 있다", () => {
    expect(canCreateRoom(0)).toBe(true);
    expect(canCreateRoom(1)).toBe(true);
    expect(canCreateRoom(2)).toBe(false);
    expect(CREATE_ROOM_LIMIT_COPY).toBe("그룹은 2개까지 만들 수 있어요");
  });
});

describe("숫자 표기", () => {
  it("내 그룹 탭 숫자는 들어간 그룹과 답을 기다리는 신청을 합친다", () => {
    expect(myRoomsTabCount(3, 1)).toBe("4/5");
  });

  it("멤버 수와 남은 자리", () => {
    expect(memberCountText(5)).toBe("멤버 5/6");
    expect(remainingSeats(4)).toBe(2);
    expect(remainingSeats(7)).toBe(0);
    expect(isRoomFull(6)).toBe(true);
    expect(isRoomFull(5)).toBe(false);
  });
});

describe("글자 수", () => {
  it("앞뒤 공백을 뺀 뒤 이모지 조합을 한 글자로 센다", () => {
    expect(countGroupText("  공부방  ")).toBe(3);
    expect(countGroupText("👩‍💻")).toBe(1);
  });

  // 서버는 자바 strip()으로 앞뒤를 다듬어 NBSP는 남기고 U+001C~U+001F 제어 문자는 뺀다.
  it("앞뒤에서는 서버 strip()이 빼는 글자만 뺀다", () => {
    expect(countGroupText("\u00a0공부\u00a0")).toBe(4);
    expect(countGroupText("\u001f공부\u3000")).toBe(2);
  });
});

// Intl.Segmenter는 풀어 쓴 한글도 한 글자로 묶어서 NFC를 뺀 차이가 코드포인트로 셀 때만 드러난다.
describe("Intl.Segmenter가 없는 환경의 글자 수", () => {
  // 글자 수 모듈은 불러올 때 한 번만 Intl.Segmenter를 확인하므로 스텁 뒤에 모듈을 다시 불러온다.
  beforeEach(() => {
    const { Segmenter: _removed, ...rest } = Intl as typeof Intl & { Segmenter?: unknown };
    vi.stubGlobal("Intl", rest);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("풀어 쓴 한글은 NFC로 합쳐 한 글자로 센다", async () => {
    const { countGroupText: countWithoutSegmenter } = await import("../limits");
    expect(countWithoutSegmenter("가".normalize("NFD"))).toBe(1);
  });
});
