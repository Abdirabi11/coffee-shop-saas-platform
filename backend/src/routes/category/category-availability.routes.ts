import express from "express"
import { 
    addCategoryAvailability, 
    deleteCategoryAvailability, 
    getCategoryAvailability, 
    updateCategoryAvailability 
} from "../../controllers/category/category-availability.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";


const router= express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));

router.post( "/categories/:categoryUuid/availability", addCategoryAvailability );
router.get( "/categories/:categoryUuid/availability", getCategoryAvailability );
router.patch( "/category-availability/:uuid", updateCategoryAvailability );
router.delete("/category-availability/:uuid",deleteCategoryAvailability);

export default router;