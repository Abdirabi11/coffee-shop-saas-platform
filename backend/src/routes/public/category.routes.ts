import { Router } from "express";
import { CategoryCacheService } from "../../services/cache/CategoryCache.service.ts"; 
import { rateLimitByTenant } from "../../middlewares/rateLimitByTenant.middleware.ts"; 

const router = Router();

// Rate limiting (60 requests per minute per IP)
router.use(rateLimitByTenant({ points: 60, duration: 60 }));

//GET /api/public/categories/:storeUuid
//Get categories for store (PUBLIC - no auth)
router.get("/:storeUuid", async (req, res) => {
  try {
    const { storeUuid } = req.params;
    const tenantUuid = req.headers["x-tenant-id"] as string;

        if (!tenantUuid) {
            return res.status(400).json({
                error: "TENANT_ID_REQUIRED",
                message: "x-tenant-id header is required",
            });
        }

        const categories = await CategoryCacheService.getCategories({
            tenantUuid,
            storeUuid,
            includeChildren: true,
        });

        return res.status(200).json({
            success: true,
            categories,
        });

    } catch (error: any) {
        return res.status(500).json({
            error: "INTERNAL_SERVER_ERROR",
            message: "Failed to retrieve categories",
        });
    }
});

export default router;
