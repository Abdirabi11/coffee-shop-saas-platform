import express from "express"
import { 
    addAvailability, 
    deleteAvailability, 
    getAvailability, 
    updateAvailability 
} from "../../controllers/products/product-availability.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";


const router = express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));

router.post("/products/:productUuid/availability", addAvailability);
router.get("/products/:productUuid/availability", getAvailability);
router.patch("/availability/:uuid", updateAvailability);
router.delete("/availability/:uuid", deleteAvailability);

export default router;