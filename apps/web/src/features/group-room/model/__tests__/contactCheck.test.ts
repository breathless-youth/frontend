import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONTACT_BLOCKED_COPY, containsContactOrLink } from "../contactCheck";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("containsContactOrLink", () => {
  it.each([
    "9급 행정직 준비 중이에요. 새벽 5시에 꾸준히 나올게요.",
    "토익 900 목표예요",
    "수능 D-100부터 같이 달려요",
    "2027 수능 준비해요",
    "2026-11-02부터 시작했어요",
    "10:30~12:00 집중해요",
    "Mr.Kim 강의 같이 들어요",
    "카톡방은 따로 없어요",
    "디엠 주셔도 답은 못 드려요",
    "텔레비전 EBS 강의 같이 봐요",
    "SAT admission 준비해요",
    "카톡은 안 해요...",
  ])("공부 글은 통과한다: %s", (text) => {
    expect(containsContactOrLink(text)).toBe(false);
  });

  it.each([
    "https://open.kakao.com/o/abc",
    "www.study.com 들어와요",
    "naver.com 메일로 주세요",
    "study@gmail.com",
    "010-1234-5678",
    "01012345678",
    "@study_kim 팔로우해요",
    "카톡 abc123",
    "오픈채팅 studyroom",
    "인스타: study.gram",
    "텔레그램 kim_123",
    "디엠 kim1234",
  ])("연락처와 링크는 막는다: %s", (text) => {
    expect(containsContactOrLink(text)).toBe(true);
  });

  it.each([
    "카카오톡 abc123",
    "오픈톡 room12",
    "인스타그램 아이디는 kim123",
    "디스코드 kim#1234",
    "DM: kim123",
    "텔레 kim_123",
    "디코 kim123",
    "카톡 아이디는 _kim",
  ])("더한 연락 수단 말과 밑줄로 시작하는 아이디도 막는다: %s", (text) => {
    expect(containsContactOrLink(text)).toBe(true);
  });

  it.each(["010 1234 5678", "０１０ １２３４ ５６７８", "ｗｗｗ．ｎａｖｅｒ．ｃｏｍ"])(
    "전각 글자와 띄어쓰기로 피해도 막는다: %s",
    (text) => {
      expect(containsContactOrLink(text)).toBe(true);
    },
  );

  it("안내 문장은 위키 명세 그대로다", () => {
    expect(CONTACT_BLOCKED_COPY).toBe("연락처나 링크는 보낼 수 없어요");
  });

  // 웹 빌드 대상에 lookbehind를 모르는 Safari 16.0~16.3이 들어 있고, 이 제약은 주석만으로 지켜져 여기서 못 박는다.
  it("Safari 16.4 미만에서도 모듈을 불러오도록 정규식 lookbehind를 쓰지 않는다", () => {
    const source = readFileSync(path.resolve(currentDir, "../contactCheck.ts"), "utf-8");
    expect(source).not.toMatch(/\(\?<[!=]/);
  });
});
