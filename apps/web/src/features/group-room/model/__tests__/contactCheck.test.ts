import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contactBlockedCopy, containsContactOrLink } from "../contactCheck";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// 서버 판정 테스트와 백엔드가 넘긴 예시 표에서 서버가 막는 글이다.
const SERVER_BLOCKED = [
  "https://open.kakao.com/o/abc",
  "www.studywith.me",
  "studygroup.kr 으로 와요",
  "naver.com",
  "kim1234@gmail.com",
  "010-1234-5678",
  "010 1234 5678",
  "123456789",
  "@study_kim",
  "카톡 kim1234",
  "인스타: study_kim",
  "오픈채팅 abc123",
  "텔레그램 kimstudy",
  "디엠 kim_99",
  "010.1234.5678",
  "010\n1234\n5678",
  "010\t1234\t5678",
  "dm kim99",
  "라인 abc123",
  "디코 abc123",
  "카카오톡 abc123",
  "오픈톡 abc123",
  "디스코드 abc123",
  "인스타그램 abc123",
  "텔레 abc123",
  "카톡 아이디 kim1234",
  "인스타 ID: study_kim",
  "카카오 아이디 kim1234",
  "kakao id kim1234",
  "갠톡 kim1234",
  "insta kim_study",
  "KAKAO.COM",
  "공부모임.com",
  "ｗｗｗ.ｓｔｕｄｙ.me",
  "０１０-１２３４-５６７８",
  "ｗｗｗ．ａ",
  // 카톡을 자모로 풀어 쓴 NFD 글이라 NFKC로 맞춰야 잡힌다.
  "\u110f\u1161\u1110\u1169\u11a8 kim1234",
  "2026-11-03 2027-01-01",
];

// 서버 판정 테스트와 백엔드가 넘긴 예시 표에서 서버가 통과시키는 글이다.
const SERVER_PASSED = [
  "9급",
  "토익 900",
  "D-100",
  "2027 수능",
  "2026-11-03부터 시작",
  "하루 10시간 공부해요",
  "node.js 공부 모임",
  "카톡 말고 여기서 공부해요",
  "인스타 안 해요",
  "3.5시간",
  "카톡 100명 모임",
  "인스타 100일 챌린지",
  "라인 100선",
  "2026-11-03 - 2027-02-01",
  "2026.11.03 시작",
  "admin123 계정 얘기",
  "가이드라인 100선",
  "DM me later",
  "naver.company",
  "화이팅 @ 7시",
  "@10시 출석",
  "installation guide",
  "카카오 backend 준비",
  "카카오 android 스터디",
  "kakao backend 준비",
  "010 - 1234 - 5678",
  "",
  "   ",
  "\n",
];

describe("containsContactOrLink", () => {
  it.each(SERVER_BLOCKED)("서버가 막는 글은 막는다: %j", (text) => {
    expect(containsContactOrLink(text)).toBe(true);
  });

  it.each(SERVER_PASSED)("서버가 통과시키는 글은 통과시킨다: %j", (text) => {
    expect(containsContactOrLink(text)).toBe(false);
  });

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
    "디스코드 kim#1234",
    "DM: kim123",
    "텔레 kim_123",
    "디코 kim123",
    "카톡 _kim123",
  ])("더한 연락 수단 말과 밑줄로 시작하는 아이디도 막는다: %s", (text) => {
    expect(containsContactOrLink(text)).toBe(true);
  });

  it.each(["문의는 dm kim123", "연락은 @study_kim"])(
    "글 가운데에 온 dm과 @ 아이디도 막는다: %s",
    (text) => {
      expect(containsContactOrLink(text)).toBe(true);
    },
  );

  // 서버는 아이디 표시 뒤에 바로 아이디가 와야 막아서 `아이디는`처럼 조사가 붙으면 통과시킨다.
  it.each(["인스타그램 아이디는 kim123", "카톡 아이디는 _kim"])(
    "서버처럼 아이디 표시 뒤에 조사가 붙은 글은 통과시킨다: %s",
    (text) => {
      expect(containsContactOrLink(text)).toBe(false);
    },
  );

  // 서버 정규식의 공백은 ASCII 공백 여섯 글자뿐이라 줄 구분 문자나 BOM으로 띄운 글은 서버가 통과시킨다.
  it.each(["010\u20281234\u20285678", "카톡\u2028kim1234", "010\ufeff1234\ufeff5678"])(
    "서버처럼 ASCII 공백만 띄어쓰기로 본다: %j",
    (text) => {
      expect(containsContactOrLink(text)).toBe(false);
    },
  );

  it.each(["010 1234 5678", "０１０ １２３４ ５６７８", "ｗｗｗ．ｎａｖｅｒ．ｃｏｍ"])(
    "전각 글자와 띄어쓰기로 피해도 막는다: %s",
    (text) => {
      expect(containsContactOrLink(text)).toBe(true);
    },
  );

  it("안내 문장은 위키 명세 그대로다", () => {
    expect(contactBlockedCopy()).toBe("연락처나 링크는 보낼 수 없어요");
  });

  // 웹 빌드 대상에 lookbehind를 모르는 Safari 16.0~16.3이 들어 있고, 이 제약은 주석만으로 지켜져 여기서 못 박는다.
  it("Safari 16.4 미만에서도 모듈을 불러오도록 정규식 lookbehind를 쓰지 않는다", () => {
    const source = readFileSync(path.resolve(currentDir, "../contactCheck.ts"), "utf-8");
    expect(source).not.toMatch(/\(\?<[!=]/);
  });
});
