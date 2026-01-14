import express from "express"
import { getOpeningHours, setOpeningHour } from "../../controllers/store/storeOpening.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";


const router = express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));

router.get("/store/opening-hours", getOpeningHours);
router.post("/store/opening-hours", setOpeningHour);

export default router;