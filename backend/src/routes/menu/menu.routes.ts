import express from "express";
import { getMenuPreview } from "../../controllers/menu/menu-preview.controller.ts";
import { getStoreMenu, prewarmMenu } from "../../controllers/menu/menu.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router()


// Public endpoint (customer-facing)
router.get("/stores/:storeUuid/menu", getStoreMenu);


router.get(
    "/admin/stores/:storeUuid/menu/preview",
    authenticate,
    authorize("ADMIN", "MANAGER"),
    getMenuPreview
);

router.post(
  "/stores/:storeUuid/menu/prewarm",
  authenticate,
  authorize("ADMIN"),
  prewarmMenu
);

export default router;