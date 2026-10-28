import { ImageIcon, Trash2 } from "lucide-react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

const ACTION_CLASS =
  "flex h-14 w-full items-center gap-3 rounded-md text-left text-base leading-5 font-medium text-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35";

/**
 * 프로필 사진 메뉴 시트
 *
 * 사진 삭제는 확인 없이 바로 지우므로 지울 사진이 있을 때만 보인다.
 * 시트는 body로 나가므로 프로필 화면의 Soft Blue 테마를 시트에도 단다.
 * 시트가 닫히며 내려가는 동안에도 항목이 눌리므로 올리기·삭제가 도는 동안은 항목을 막는다.
 */
export function ProfilePhotoSheet({
  open,
  onOpenChange,
  hasPhoto,
  onChangePhoto,
  onRemovePhoto,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPhoto: boolean;
  onChangePhoto: () => void;
  onRemovePhoto: () => void;
  disabled: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="theme-soft-blue"
        // 터치로 연 시트와 닫힌 뒤의 사진 버튼에 포커스 링이 남지 않게 포커스를 옮기지 않는다(기록 탭 기간 선택 시트와 같은 처리).
        initialFocus={false}
        finalFocus={false}
      >
        <DrawerTitle className="pt-3.5 text-center text-lg leading-5.25 font-bold tracking-normal text-foreground">
          프로필 사진
        </DrawerTitle>
        {/* 시트 안 버튼은 끌기에서 뺀다. iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려진다. */}
        <div className="mt-2 flex flex-col">
          <button
            type="button"
            data-base-ui-swipe-ignore=""
            disabled={disabled}
            onClick={onChangePhoto}
            className={ACTION_CLASS}
          >
            <ImageIcon aria-hidden="true" className="size-6" />
            사진 바꾸기
          </button>
          {hasPhoto ? (
            <button
              type="button"
              data-base-ui-swipe-ignore=""
              disabled={disabled}
              onClick={onRemovePhoto}
              className={ACTION_CLASS}
            >
              <Trash2 aria-hidden="true" className="size-6" />
              사진 삭제
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
