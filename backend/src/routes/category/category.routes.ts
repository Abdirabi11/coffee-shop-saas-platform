import express from "express"
import { 
    createCategory, 
    deleteCategory, 
    getCategories, 
    reorderCategories, 
    updateCategory 
} from "../../controllers/category/category.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";

const router= express.Router();

router.use(authenticate);
router.use(authorize("ADMIN", "MANAGER"));

router.post("/", createCategory);
router.get("/", getCategories);
router.patch("/reorder", reorderCategories);
router.patch("/:uuid", updateCategory);
router.delete("/:uuid", deleteCategory);

export default router;
