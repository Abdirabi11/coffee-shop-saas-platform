import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

// router.use(authenticate, authorize("SUPER_ADMIN"));


// router.post("/auth/login", );
// router.post("/auth/logout", );
// router.post("/auth/me",);
// router.post("/auth/refresh",);

// Controller Responsibilities
// Login Super Admin
// Issue JWT (role = SUPER_ADMIN)
// Secure cookies / tokens
// Protect platform routes
// ⚠️ Super Admin does NOT use storeUuid

export default router;