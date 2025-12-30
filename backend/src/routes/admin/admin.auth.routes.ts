import express from "express"
import { adminLogin, createAdmin, generate2FASecret, verifyAdmin2FA } from "../controllers/admin.auth.controller.ts";
import { authenticate, authorize } from "../middlewares/auth.middleware.ts";
import { adminIpAllowlist } from "../security/IpAllow.ts";
import { adminLimiter } from "../utils/rateLimit.ts";


const router= express.Router();

router.use(adminLimiter);
router.use(adminIpAllowlist);

router.post("/login",  authorize("ADMIN"), adminLogin);
router.post("/generate2FASecret",  authorize("ADMIN"), generate2FASecret);
router.post("/generate2FASecret",  authorize("ADMIN"), verifyAdmin2FA);
router.get("/fruad-events", authenticate, authorize("ADMIN"), fraudEvents);
router.get("/:id/security", authenticate, authorize("ADMIN"), security);
router.get("/:id/security", authenticate, authorize("ADMIN"), security);
router.get("/:id/unban", authenticate, authorize("ADMIN"), unbanUser);


router.get(
    "/fraud-events",
    authenticate,
    authorize("SUPER_ADMIN"),
    async (_req, res) => {
      const events = await prisma.fraudEvent.findMany({
        orderBy: { createdAt: "desc" },
      });
  
      res.json({ events });
    }
);


export default router;