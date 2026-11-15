import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diffEvents, extractEvents, formatEventDiff, isEmptyDiff } from "./amplitude-events.mjs";

describe("extractEvents", () => {
  it("한 줄 호출의 이벤트와 속성을 읽는다", () => {
    const src = `track("study_session_started", { room_type: roomType, restored });`;
    assert.deepEqual(extractEvents(src), { study_session_started: ["restored", "room_type"] });
  });
  it("여러 줄 호출도 읽는다", () => {
    const src = `track(\n  "study_session_ended",\n  {\n    room_type: a,\n    study_sec: Number(b),\n  },\n);`;
    assert.deepEqual(extractEvents(src), { study_session_ended: ["room_type", "study_sec"] });
  });
  it("속성이 없는 호출은 빈 배열이다", () => {
    assert.deepEqual(extractEvents(`track("social_room_created");`), { social_room_created: [] });
  });
  it("펼침과 객체가 아닌 둘째 인자는 ...으로 표시한다", () => {
    const src = `track("a", { ...rest, x: 1 }); track("b", props);`;
    assert.deepEqual(extractEvents(src), { a: ["...", "x"], b: ["..."] });
  });
  it("이벤트 이름이 문자열 리터럴이 아니면 뺀다", () => {
    assert.deepEqual(extractEvents(`track(name, { x: 1 }); other("c", {});`), {});
  });
  it("같은 이벤트의 속성을 합친다", () => {
    const src = `track("a", { x: 1 }); track("a", { y: 2 });`;
    assert.deepEqual(extractEvents(src), { a: ["x", "y"] });
  });
});

describe("diffEvents", () => {
  const before = { a: ["x"], b: ["p", "q"], gone: [] };
  const after = { a: ["x"], b: ["q", "r"], fresh: ["provider"] };
  it("추가·삭제·속성 변경을 구분한다", () => {
    assert.deepEqual(diffEvents(before, after), {
      added: [{ name: "fresh", props: ["provider"] }],
      removed: ["gone"],
      changed: [{ name: "b", addedProps: ["r"], removedProps: ["p"] }],
    });
  });
  it("같으면 빈 결과다", () => assert.equal(isEmptyDiff(diffEvents(before, before)), true));
});

describe("formatEventDiff", () => {
  const opts = { fromVersion: "26.46.3", toVersion: "26.47.0", compareUrl: "https://x/compare" };
  it("변경이 없으면 한 줄이다", () => {
    assert.equal(
      formatEventDiff({ added: [], removed: [], changed: [] }, opts),
      "📊 이벤트 변경 없음",
    );
  });
  it("빈 묶음은 제목째 뺀다", () => {
    const text = formatEventDiff(
      { added: [{ name: "fresh", props: ["provider"] }], removed: [], changed: [] },
      opts,
    );
    assert.equal(
      text,
      "📊 이벤트 변경 (26.46.3 → 26.47.0)\n새 이벤트\n  • fresh  provider\n<https://x/compare|전체 비교>",
    );
  });
  it("속성 변경은 +와 −로 쓴다", () => {
    const text = formatEventDiff(
      { added: [], removed: [], changed: [{ name: "b", addedProps: ["r"], removedProps: ["p"] }] },
      opts,
    );
    assert.match(text, /속성 변경\n  • b  \+ r  − p/);
  });
});
