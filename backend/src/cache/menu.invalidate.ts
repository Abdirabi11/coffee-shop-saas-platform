import { MenuPrewarmService } from "../services/menu/menu-prewarm.service.ts";
import { MenuSnapshotService } from "../services/menu/menu-snapshot.service.ts";
import { bumpCacheVersion } from "./cacheVersion.ts.ts"

export async function invalidateMenu(
  storeUuid: string,
  reason: MenuSnapshotReason = "AUTO",
  triggeredBy?: string
) {
  await bumpCacheVersion(`menu:${storeUuid}`);

  // Pre-warm immediately after invalidation
  const menu= MenuPrewarmService.prewarmStoreMenu(storeUuid);

  // Snapshot AFTER warm (guaranteed latest menu)
  await MenuSnapshotService.createSnapshot(
    storeUuid,
    menu,
    reason,
    triggeredBy
  )
};