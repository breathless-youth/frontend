// 카탈로그는 public/sounds/catalog.json 에서 오므로 id 를 컴파일 타임 유니온으로 두면
// JSON 이 바뀌었을 때 타입이 거짓 안전감만 준다. string 별칭으로 두고 파서가 거른다.
export type SoundId = string;

export type SoundGroupId = "noise" | "ambience" | "music";

export type AmbientSound = {
  id: SoundId;
  kind: "synth" | "file";
  label: string;
  file?: string;
  /** 시트의 어느 탭에 놓을지. 없거나 모르는 값이면 soundGroups 가 kind 로 떨어뜨린다. */
  group?: SoundGroupId;
};

/** 꺼져 있던 소리를 아이콘으로 다시 켤 때 쓰는 값. 직전에 듣던 음량이 있으면 해당 음량을 사용한다. */
export const DEFAULT_LEVEL = 60;

const CATALOG_URL = "/sounds/catalog.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const GROUPS: readonly string[] = ["noise", "ambience", "music"];

function parseGroup(raw: unknown): SoundGroupId | undefined {
  return typeof raw === "string" && GROUPS.includes(raw) ? (raw as SoundGroupId) : undefined;
}

function parseSound(raw: unknown): AmbientSound | null {
  if (!isRecord(raw)) return null;
  const { id, kind, label, file } = raw;
  if (typeof id !== "string" || id === "" || typeof label !== "string" || label === "") {
    return null;
  }
  const group = parseGroup(raw.group);
  if (kind === "synth") return { id, kind, label, group };
  if (kind === "file" && typeof file === "string" && file !== "") {
    return { id, kind, label, file, group };
  }
  return null;
}

export function parseCatalog(raw: unknown): AmbientSound[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw.sounds : undefined;
  if (!Array.isArray(list)) return [];
  const sounds: AmbientSound[] = [];
  for (const item of list) {
    const sound = parseSound(item);
    if (sound) sounds.push(sound);
  }
  return sounds;
}

export async function loadCatalog(fetchImpl: typeof fetch = fetch): Promise<AmbientSound[]> {
  try {
    const response = await fetchImpl(CATALOG_URL);
    if (!response.ok) return [];
    return parseCatalog(await response.json());
  } catch {
    return [];
  }
}
