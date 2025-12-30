import express from "express"
import { 
    addProduct, 
    deleteProduct, 
    updateProduct, 
    getProducts, 
    getSingleProduct 
} from "../controllers/product.controller.ts";
import { requireStoreAccess } from "../middlewares/auth.middleware.ts";
import {authenticate, authorize} from "../middlewares/auth.middleware.ts"


const router= express.Router();



router.use(authenticate, requireStoreAccess);

router.post("/add-product", authenticate, addProduct)
router.get("/all", getProducts)
router.get("/:productUuid", getSingleProduct)
router.put("/edit-product/:productUuid", updateProduct)
router.delete("/:productUuid", authenticate ,deleteProduct)



export default router;