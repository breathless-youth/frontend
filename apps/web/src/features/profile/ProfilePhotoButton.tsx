import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { canUseNativeProfilePhoto } from "@/lib/nativeProfilePhoto";
import { hasTokenSource } from "@/lib/userId";
import { whenIdle } from "@/lib/whenIdle";

import { ProfileAvatar } from "./ProfileAvatar";
import { useProfilePhotoMutations } from "./useProfilePhotoMutations";

/** 메뉴 시트는 시트 부품(Base UI)과 함께 따로 받고, 화면이 뜬 뒤 한가할 때 미리 받아 둔다. */
const { LazySheet: LazyProfilePhotoSheet, preload: preloadProfilePhotoSheet } = lazyWithPreload(
  () => import("./ProfilePhotoSheet").then((module) => module.ProfilePhotoSheet),
);

// 프로필 사진을 실은 개정 개인정보처리방침의 시행 시각이라 그 전에는 사진을 바꿀 수 없게 하고, 시행 뒤에는 이 조건을 삭제한다.
const PHOTO_EDIT_OPENS_AT = Date.parse("2026-11-04T00:00:00+09:00");

function isPhotoEditOpen() {
  return Date.now() >= PHOTO_EDIT_OPENS_AT;
}

type ProfilePhotoProps = {
  userId: number;
  initial: string;
  colorIndex: number;
  imageUrl?: string | null;
};

/**
 * 프로필 사진 버튼
 *
 * 누르면 사진 메뉴 시트를 열고, 고른 사진은 저장하기를 기다리지 않고 바로 올린다.
 * 토큰이 없는 문서(구 앱, 브라우저 단독)는 사진 API가 401로 막혀 버튼 없이 아바타만 보인다.
 */
export function ProfilePhotoButton(props: ProfilePhotoProps) {
  if (!hasTokenSource() || !isPhotoEditOpen()) {
    return (
      <ProfileAvatar
        initial={props.initial}
        colorIndex={props.colorIndex}
        imageUrl={props.imageUrl}
      />
    );
  }
  return <EditablePhoto {...props} />;
}

/** 파일 입력은 시트가 닫힌 뒤에 선택 결과를 받으므로 시트 밖인 여기에 둔다. */
function EditablePhoto({ userId, initial, colorIndex, imageUrl }: ProfilePhotoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const { upload, remove, busy } = useProfilePhotoMutations(userId);

  useEffect(() => {
    whenIdle(preloadProfilePhotoSheet);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="프로필 사진 변경"
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => setOpen(true)}
        className="relative flex rounded-full focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:outline-none"
      >
        <ProfileAvatar initial={initial} colorIndex={colorIndex} imageUrl={imageUrl} />
        {busy ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-full bg-dim"
          >
            <span className="size-7 animate-spin rounded-full border-3 border-primary-foreground/35 border-t-primary-foreground motion-reduce:animate-none" />
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
        >
          <Camera className="size-4" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            upload(file);
          }
        }}
      />
      <LazyProfilePhotoSheet
        open={open}
        onOpenChange={setOpen}
        hasPhoto={Boolean(imageUrl)}
        disabled={busy}
        onChangePhoto={() => {
          setOpen(false);
          // 앱 선택기는 Android 웹뷰의 파일 입력이 읽지 못하는 큰 카메라 사진도 앱에서 읽어 줄여 준다.
          if (canUseNativeProfilePhoto()) {
            upload("native");
            return;
          }
          const input = inputRef.current;
          if (input) {
            // 같은 사진을 다시 골라도 change가 나도록 비운다.
            // 고른 직후에 비우면 Android 웹뷰가 그 파일을 더 읽지 못하게 막아, 올리는 동안은 두고 선택기를 열 때 비운다.
            input.value = "";
            // 파일 선택기는 사용자 탭 안에서만 열리므로 시트 항목의 클릭에서 바로 부른다.
            input.click();
          }
        }}
        onRemovePhoto={() => {
          setOpen(false);
          remove();
        }}
      />
    </>
  );
}
