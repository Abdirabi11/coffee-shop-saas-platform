import { MenuEventService } from "../services/menu/menu-events.ts";
import { MenuPrewarmService } from "../services/menu/menu-prewarm.service.ts";
import { MenuSnapshotService } from "../services/menu/menu-snapshot.service.ts";
import { bumpCacheVersion } from "./cacheVersion.ts.ts"

export async function invalidateMenu(
  storeUuid: string,
  reason: MenuSnapshotReason = "AUTO",
  triggeredBy?: string
) {
  await bumpCacheVersion(`menu:${storeUuid}`);

  await MenuEventService.emit("MENU_INVALIDATED", {
    storeUuid,
    reason,
    triggeredBy,
  });
  // Pre-warm immediately after invalidation
  const menu= await MenuPrewarmService.prewarmStoreMenu(storeUuid);

  await MenuEventService.emit("MENU_PREWARMED", {
    storeUuid,
    triggeredBy,
  });
  // Snapshot AFTER warm (guaranteed latest menu)
  await MenuSnapshotService.createSnapshot(
    storeUuid,
    menu,
    reason,
    triggeredBy
  );

  await MenuEventService.emit("MENU_SNAPSHOT_CREATED", {
    storeUuid,
    reason,
    triggeredBy,
  });
};