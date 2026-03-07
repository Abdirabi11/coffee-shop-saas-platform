import { logWithContext } from "../infrastructure/observability/logger.ts";
import { CategoryCacheService } from "../services/cache/CategoryCache.service.ts";
import { EventBus } from "./eventBus.ts";


// Category created → Invalidate cache
EventBus.on("CATEGORY_CREATED", async (payload) => {
    logWithContext("info", "[CategoryEvent] CATEGORY_CREATED", {
        categoryUuid: payload.categoryUuid,
    });
  
    await CategoryCacheService.invalidate(payload.storeUuid);
});
  
// Category updated → Invalidate cache
EventBus.on("CATEGORY_UPDATED", async (payload) => {
    logWithContext("info", "[CategoryEvent] CATEGORY_UPDATED", {
        categoryUuid: payload.categoryUuid,
    });
  
    await CategoryCacheService.invalidate(payload.storeUuid);
});
  
// Category deleted → Invalidate cache
EventBus.on("CATEGORY_DELETED", async (payload) => {
    logWithContext("info", "[CategoryEvent] CATEGORY_DELETED", {
        categoryUuid: payload.categoryUuid,
    });
  
    await CategoryCacheService.invalidate(payload.storeUuid);
});
  
// Category reordered → Invalidate cache
EventBus.on("CATEGORY_REORDERED", async (payload) => {
    logWithContext("info", "[CategoryEvent] CATEGORY_REORDERED", {
        storeUuid: payload.storeUuid,
    });
  
    await CategoryCacheService.invalidate(payload.storeUuid);
});
  