import type { ExpoConfig } from "expo/config";

import appJson from "../../app.json";

type ManifestApplication = {
  $: Record<string, string>;
  "meta-data"?: { $: Record<string, string> }[];
};
type AndroidManifest = {
  manifest: { $: Record<string, string>; application: ManifestApplication[] };
};
type InfoPlist = { SKAdNetworkItems?: { SKAdNetworkIdentifier: string }[] };

type ModFn = (config: unknown) => Promise<{ modResults: unknown }>;
type PluginResult = ExpoConfig & {
  mods: { android: { manifest: ModFn }; ios: { infoPlist: ModFn } };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withGoogleAdsMeasurement = require("../../plugins/withGoogleAdsMeasurement") as (
  config: ExpoConfig,
) => PluginResult;

const baseConfig = { name: "FocusMakers", slug: "focusmakers" } as ExpoConfig;

function minimalManifest(): AndroidManifest {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      application: [{ $: { "android:name": ".MainApplication" } }],
    },
  };
}

async function runAndroidManifestMod(manifest: AndroidManifest): Promise<AndroidManifest> {
  const withPlugin = withGoogleAdsMeasurement(baseConfig);
  const result = await withPlugin.mods.android.manifest({
    ...withPlugin,
    modResults: manifest,
    modRequest: { platform: "android", modName: "manifest", projectRoot: "/", introspect: true },
  });
  return result.modResults as AndroidManifest;
}

async function runInfoPlistMod(plist: InfoPlist): Promise<InfoPlist> {
  const withPlugin = withGoogleAdsMeasurement(baseConfig);
  const result = await withPlugin.mods.ios.infoPlist({
    ...withPlugin,
    modResults: plist,
    modRequest: { platform: "ios", modName: "infoPlist", projectRoot: "/", introspect: true },
  });
  return result.modResults as InfoPlist;
}

describe("구글 광고 측정 config plugin", () => {
  it("Android 매니페스트에 지연 딥링크 플래그를 넣는다", async () => {
    const manifest = await runAndroidManifestMod(minimalManifest());

    expect(manifest.manifest.application[0]?.["meta-data"]).toContainEqual({
      $: { "android:name": "google_analytics_deferred_deep_link_enabled", "android:value": "true" },
    });
  });

  it("iOS SKAdNetworkItems에 구글 식별자를 더하고 메타 식별자는 남긴다", async () => {
    const plist = await runInfoPlistMod({
      SKAdNetworkItems: [{ SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" }],
    });

    expect(plist.SKAdNetworkItems).toEqual([
      { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" },
      { SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" },
    ]);
  });

  it("두 번 돌려도 구글 식별자는 하나다", async () => {
    const once = await runInfoPlistMod({});
    const twice = await runInfoPlistMod(once);

    expect(twice.SKAdNetworkItems).toEqual([{ SKAdNetworkIdentifier: "cstr6suwn9.skadnetwork" }]);
  });

  it("app.json plugins에 등록돼 있다", () => {
    expect(appJson.expo.plugins).toContain("./plugins/withGoogleAdsMeasurement");
  });
});
