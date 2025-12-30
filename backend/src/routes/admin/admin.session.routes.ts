import express from "express"
import { forceLogoutUsers, viewActiveSessions, killSpecificDevice} from "../controllers/admin.sessions.controller.ts";
import {authenticate, authorize} from "../middlewares/auth.middleware.ts"

const router= express.Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/", viewActiveSessions);
router.post("/force-logout", forceLogoutUsers);
router.post("/kill", killSpecificDevice);


export default router;