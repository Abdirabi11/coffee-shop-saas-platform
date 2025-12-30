import express from "express";

const router= express.Router();


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