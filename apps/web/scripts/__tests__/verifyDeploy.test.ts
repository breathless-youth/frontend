import { describe, expect, it } from "vitest";

import { MEDIAPIPE_VERSION, WASM_SENTINEL_FILE } from "../copyMediapipeWasm.js";
import { buildChecks, findAssetPath, main, rules, runChecks } from "../verifyDeploy.js";

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

describe("rules", () => {
  it("httpsRedirect는 3xx와 https Location을 함께 요구한다", () => {
    expect(rules.httpsRedirect(res(301, { location: "https://a.test/" }))).toEqual([]);
    expect(rules.httpsRedirect(res(308, { location: "https://a.test/" }))).toEqual([]);
    expect(rules.httpsRedirect(res(200))).toHaveLength(1);
    expect(rules.httpsRedirect(res(301, { location: "http://a.test/" }))).toHaveLength(1);
  });

  it("noindex는 지시자 단위로 본다", () => {
    expect(rules.noindex(res(200, { "x-robots-tag": "noindex, nofollow" }))).toEqual([]);
    expect(rules.noindex(res(200, { "x-robots-tag": "noindexing" }))).toHaveLength(1);
    expect(rules.noindex(res(200))).toHaveLength(1);
  });

  it("revalidate는 max-age=0이고 immutable이 없어야 통과한다", () => {
    expect(
      rules.revalidate(res(200, { "cache-control": "public, max-age=0, must-revalidate" })),
    ).toEqual([]);
    expect(
      rules.revalidate(res(200, { "cache-control": "public, max-age=31536000, immutable" })),
    ).toHaveLength(1);
    expect(rules.revalidate(res(200))).toHaveLength(1);
  });

  it("immutable은 Cache-Control 지시자에 immutable을 요구한다", () => {
    expect(
      rules.immutable(res(200, { "cache-control": "public, max-age=31536000, immutable" })),
    ).toEqual([]);
    expect(rules.immutable(res(200, { "cache-control": "public, max-age=0" }))).toHaveLength(1);
  });

  it("contentType과 notContentType은 매개변수를 떼고 대소문자 없이 정확히 비교한다", () => {
    const html = res(200, { "content-type": "text/html; charset=utf-8" });
    expect(rules.contentType("text/html")(html)).toEqual([]);
    expect(rules.notContentType("text/html")(html)).toHaveLength(1);
    expect(rules.contentType("application/wasm")(html)).toHaveLength(1);

    const upper = res(200, { "content-type": "TEXT/HTML" });
    expect(rules.notContentType("text/html")(upper)).toHaveLength(1);

    const lookalike = res(200, { "content-type": "application/wasmfoo" });
    expect(rules.contentType("application/wasm")(lookalike)).toHaveLength(1);
  });

  it("header와 noHeader", () => {
    const isolated = res(200, { "cross-origin-opener-policy": "same-origin" });
    expect(rules.header("cross-origin-opener-policy", "same-origin")(isolated)).toEqual([]);
    expect(rules.noHeader("cross-origin-opener-policy")(isolated)).toHaveLength(1);
    expect(rules.noHeader("cross-origin-embedder-policy")(isolated)).toEqual([]);
  });

  it("status, statusAtLeast, nonEmpty", () => {
    expect(rules.status(200)(res(200))).toEqual([]);
    expect(rules.status(200)(res(404))).toHaveLength(1);
    expect(rules.statusAtLeast(400)(res(403))).toEqual([]);
    expect(rules.statusAtLeast(400)(res(200))).toHaveLength(1);
    expect(rules.nonEmpty(res(200, { "content-length": "3758596" }))).toEqual([]);
    expect(rules.nonEmpty(res(200, { "content-length": "0" }))).toHaveLength(1);
    expect(rules.nonEmpty(res(200))).toHaveLength(1);
  });
});

describe("findAssetPath", () => {
  it("index.html에서 /assets의 js 경로를 찾는다", () => {
    const html = '<script type="module" crossorigin src="/assets/index-Ab12Cd34.js"></script>';
    expect(findAssetPath(html)).toBe("/assets/index-Ab12Cd34.js");
  });

  it("없으면 null", () => {
    expect(findAssetPath("<html></html>")).toBeNull();
  });
});

const BASE = "https://web-dev.example.test";

describe("buildChecks", () => {
  const checks = buildChecks(BASE, {
    models: ["a-11111111.tflite", "b-22222222.task"],
    assetPath: "/assets/index-x.js",
  });
  const byUrl = (url: string) => checks.find((check) => check.url === url);

  it("http 리다이렉트는 http 주소로 묻는다", () => {
    expect(byUrl("http://web-dev.example.test/")).toBeDefined();
  });

  it("wasm 경로는 설치된 mediapipe 버전 폴더를 쓴다", () => {
    const wasm = byUrl(`${BASE}/mediapipe/${MEDIAPIPE_VERSION}/wasm/${WASM_SENTINEL_FILE}`);
    expect(wasm?.method).toBe("HEAD");
  });

  it("모델 파일마다 확인이 하나씩 있다", () => {
    expect(byUrl(`${BASE}/models/a-11111111.tflite`)).toBeDefined();
    expect(byUrl(`${BASE}/models/b-22222222.task`)).toBeDefined();
  });

  it("/contact는 격리 헤더가 있으면 실패한다", async () => {
    const contact = byUrl(`${BASE}/contact`)!;
    const html = {
      "content-type": "text/html",
      "x-robots-tag": "noindex",
      "cross-origin-embedder-policy": "require-corp",
    };
    const problems = contact.rules.flatMap((rule) => rule(new Response(null, { headers: html })));
    expect(problems).toHaveLength(1);
  });

  it("없는 모델 확인은 HTML 200을 실패로 잡는다", () => {
    const missing = byUrl(`${BASE}/models/__verify-missing__.tflite`)!;
    const html200 = new Response(null, { status: 200, headers: { "content-type": "text/html" } });
    expect(missing.rules.flatMap((rule) => rule(html200)).length).toBeGreaterThan(0);
    expect(missing.rules.flatMap((rule) => rule(new Response(null, { status: 403 })))).toEqual([]);
  });

  it("모델 목록이 비면 그 사실을 실패로 남긴다", () => {
    const modelChecks = buildChecks(BASE, { models: [], assetPath: "/assets/index-x.js" }).filter(
      (check) => check.name.startsWith("모델"),
    );
    expect(modelChecks).toHaveLength(1);
    expect(modelChecks[0].rules.flatMap((rule) => rule(new Response(null)))).toHaveLength(1);
  });

  it("자산 경로를 못 찾으면 그 사실을 실패로 남긴다", () => {
    const [assetCheck] = buildChecks(BASE, { models: [], assetPath: null }).filter((check) =>
      check.name.includes("해시 자산"),
    );
    expect(assetCheck.rules.flatMap((rule) => rule(new Response(null)))).toHaveLength(1);
  });
});

describe("runChecks", () => {
  it("요청이 실패해도 나머지를 계속 돌고 문제로 기록한다", async () => {
    const checks = [
      { name: "ok", url: `${BASE}/ok`, method: "GET" as const, rules: [rules.status(200)] },
      { name: "down", url: `${BASE}/down`, method: "GET" as const, rules: [rules.status(200)] },
    ];
    const fakeFetch = async (url: string | URL | Request) => {
      if (String(url).endsWith("/down")) {
        throw new Error("ECONNREFUSED");
      }
      return new Response(null, { status: 200 });
    };

    const results = await runChecks(checks, fakeFetch as typeof fetch);

    expect(results.map((result) => result.problems.length)).toEqual([0, 1]);
    expect(results[1].problems[0]).toContain("ECONNREFUSED");
  });

  it("리다이렉트를 따라가지 않고 압축 없이 요청한다", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = async (_url: string | URL | Request, options?: RequestInit) => {
      init = options;
      return new Response(null, { status: 200 });
    };

    await runChecks(
      [{ name: "x", url: `${BASE}/`, method: "HEAD", rules: [] }],
      fakeFetch as typeof fetch,
    );

    expect(init).toMatchObject({
      method: "HEAD",
      redirect: "manual",
      headers: { "accept-encoding": "identity" },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

/** 스테이징이 정상일 때 돌려주는 응답을 주소별로 흉내 낸다. */
const healthyFetch = async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const noindex = { "x-robots-tag": "noindex, nofollow" };
  const immutable = { ...noindex, "cache-control": "public, max-age=31536000, immutable" };

  if (url.protocol === "http:") {
    return new Response(null, {
      status: 301,
      headers: { location: url.href.replace("http:", "https:") },
    });
  }
  if (url.pathname.includes("__verify-missing__")) {
    return new Response(null, { status: 403 });
  }
  if (url.pathname.startsWith("/.well-known/")) {
    return new Response(null, { headers: { ...noindex, "content-type": "application/json" } });
  }
  if (url.pathname.endsWith(".wasm")) {
    return new Response(null, { headers: { ...noindex, "content-type": "application/wasm" } });
  }
  if (url.pathname.startsWith("/models/")) {
    return new Response(null, {
      headers: { ...immutable, "content-type": "application/octet-stream", "content-length": "10" },
    });
  }
  if (url.pathname.startsWith("/assets/")) {
    return new Response(null, { headers: immutable });
  }
  const isolated: Record<string, string> =
    url.pathname === "/contact"
      ? {}
      : {
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
        };
  return new Response('<script type="module" src="/assets/index-x.js"></script>', {
    headers: {
      ...noindex,
      ...isolated,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
};

describe("main", () => {
  const models = ["a-11111111.tflite"];

  it("https 주소가 아니거나 주소로 읽을 수 없으면 요청 없이 2로 끝난다", async () => {
    for (const base of ["http://web-dev.example.test", "https://", undefined]) {
      const code = await main({
        base,
        models,
        fetchImpl: healthyFetch as typeof fetch,
        log: () => {},
      });

      expect(code, String(base)).toBe(2);
    }
  });

  it("모두 통과하면 0으로 끝나고 통과 요약을 찍는다", async () => {
    const lines: string[] = [];
    const code = await main({
      base: BASE,
      models,
      fetchImpl: healthyFetch as typeof fetch,
      log: (line: string) => lines.push(line),
    });

    expect(lines.filter((line) => line.startsWith("✗"))).toEqual([]);
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("모두 통과");
  });

  it("하나라도 실패하면 1로 끝나고 실패 수를 찍는다", async () => {
    const brokenWasm = async (input: string | URL | Request) =>
      String(input).endsWith(".wasm")
        ? new Response(null, { headers: { "content-type": "text/html" } })
        : healthyFetch(input);
    const lines: string[] = [];
    const code = await main({
      base: BASE,
      models,
      fetchImpl: brokenWasm as typeof fetch,
      log: (line: string) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines.at(-1)).toContain("1/");
  });
});
