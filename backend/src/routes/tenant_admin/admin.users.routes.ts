import express from "express"
import { 
    adminCreateUser, 
    banUsers, 
    changeUserRole, 
    createAdmin, 
    viewAllUsers
} from "../controllers/admin.users.controller.ts";
import { authenticate, authorize } from "../middlewares/auth.middleware.ts";
import { adminIpAllowlist } from "../security/IpAllow.ts";
import { adminLimiter } from "../utils/rateLimit.ts";
import { sensitiveLimiter } from "../utils/rateLimit.ts";


const router= express.Router()

router.use(authenticate, authorize("ADMIN", "SUPER_ADMIN"));
router.use(adminLimiter);
router.use(adminIpAllowlist);

router.post("/create-admin", authorize("SUPER_ADMIN"), createAdmin);
router.post("/create-user", adminCreateUser)
router.post("/change-role", changeUserRole);
router.get("/view-users", viewAllUsers);  
router.post("/ban-user", sensitiveLimiter, banUsers);


export default router;