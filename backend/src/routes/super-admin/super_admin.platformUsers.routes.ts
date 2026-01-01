import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

router.use(authenticate, authorize("SUPER_ADMIN"));

router.get("/users/login", );
router.post("/users/logout", );
router.patch("/users/:userUuid",);
router.delete("/users/:userUuid",);


// Controller Responsibilities
// Create additional super admins
// Disable compromised accounts
// Rotate access
// ⚠️ VERY LIMITED ACCESS

export default router;