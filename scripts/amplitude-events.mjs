/**
 * Amplitude 이벤트 목록 추출과 두 버전 비교.
 *
 * 웹의 이벤트는 모두 amplitude.ts의 track("이름", {...}) 호출로 나간다.
 * 정규식은 여러 줄 호출과 단축 속성을 놓치므로 타입스크립트 파서로 읽는다.
 * 속성 값 계산식이 바뀐 것은 잡지 않고 비교 링크로 확인하게 둔다.
 */
import ts from "typescript";

export const AMPLITUDE_FILE = "apps/web/src/lib/amplitude.ts";

// 펼침·변수 인자·계산된 키처럼 속성 이름을 정적으로 알 수 없는 자리의 표시.
const UNKNOWN = "...";

function propName(prop) {
  if (ts.isSpreadAssignment(prop)) return UNKNOWN;
  const name = prop.name;
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) return name.text;
  return UNKNOWN;
}

/** 이벤트 이름별 정렬된 속성 이름 목록. */
export function extractEvents(source) {
  const file = ts.createSourceFile(
    "amplitude.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const events = new Map();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "track" &&
      node.arguments[0] &&
      (ts.isStringLiteral(node.arguments[0]) ||
        ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      const props = events.get(node.arguments[0].text) ?? new Set();
      const arg = node.arguments[1];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) props.add(propName(p));
      } else if (arg) {
        props.add(UNKNOWN);
      }
      events.set(node.arguments[0].text, props);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return Object.fromEntries(
    [...events.keys()].sort().map((name) => [name, [...events.get(name)].sort()]),
  );
}

/** 두 이벤트 목록의 추가·삭제·속성 변경. */
export function diffEvents(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const diff = { added: [], removed: [], changed: [] };
  for (const name of names) {
    const a = before[name];
    const b = after[name];
    if (!a) diff.added.push({ name, props: b });
    else if (!b) diff.removed.push(name);
    else {
      const addedProps = b.filter((p) => !a.includes(p));
      const removedProps = a.filter((p) => !b.includes(p));
      if (addedProps.length || removedProps.length)
        diff.changed.push({ name, addedProps, removedProps });
    }
  }
  return diff;
}

/** 비교 결과가 비었는지 여부. */
export function isEmptyDiff(diff) {
  return !diff.added.length && !diff.removed.length && !diff.changed.length;
}

/** 스레드에 올릴 이벤트 변경 문구. */
export function formatEventDiff(diff, { fromVersion, toVersion, compareUrl }) {
  if (isEmptyDiff(diff)) return "📊 이벤트 변경 없음";
  const lines = [`📊 이벤트 변경 (${fromVersion} → ${toVersion})`];
  if (diff.added.length) {
    lines.push("새 이벤트");
    for (const { name, props } of diff.added) {
      lines.push(props.length ? `  • ${name}  ${props.join(", ")}` : `  • ${name}`);
    }
  }
  if (diff.changed.length) {
    lines.push("속성 변경");
    for (const { name, addedProps, removedProps } of diff.changed) {
      const parts = [...addedProps.map((p) => `+ ${p}`), ...removedProps.map((p) => `− ${p}`)];
      lines.push(`  • ${name}  ${parts.join("  ")}`);
    }
  }
  if (diff.removed.length) {
    lines.push("삭제");
    for (const name of diff.removed) lines.push(`  • ${name}`);
  }
  lines.push(`<${compareUrl}|전체 비교>`);
  return lines.join("\n");
}
