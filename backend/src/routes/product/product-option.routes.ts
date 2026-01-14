import express from "express"
import { 
    addOption, 
    addOptionGroup, 
    deleteOption, 
    deleteOptionGroup, 
    getOptionGroups, 
    updateOption, 
    updateOptionGroup 
} from "../../controllers/products/product-option.controller.ts";

const router = express.Router();

router.post( "/products/:productUuid/options/groups", addOptionGroup );
router.get( "/products/:productUuid/options/groups", getOptionGroups );
router.patch( "/option-groups/:groupUuid", updateOptionGroup);
router.delete( "/option-groups/:groupUuid", deleteOptionGroup );
router.post("/option-groups/:groupUuid/options", addOption );
router.patch( "/options/:optionUuid", updateOption );
router.delete( "/options/:optionUuid", deleteOption );

export default router;