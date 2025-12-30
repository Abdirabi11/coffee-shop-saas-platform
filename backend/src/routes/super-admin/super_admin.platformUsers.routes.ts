import express from "express";

const router= express.Router();


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