import express from "express"
import { 
    closeCashDrawer, 
    correctPayment, 
    getActiveDrawer, 
    getAnomalies, 
    getCashDrawer, 
    getPaymentByOrder, 
    getPaymentDetails, 
    openCashDrawer, 
    processPayment, 
    reviewAnomaly, 
    voidPayment 
} from "../../controllers/payments/cashier/payment.cashier.controller.ts";
import { authenticate, authorize } from "../../middlewares/auth.middleware.ts";


const router = express.Router();

router.use(authenticate);

router.post( "/process", authorize(["CASHIER", "MANAGER", "ADMIN"]), processPayment );
router.post( "/:paymentUuid/void", authorize(["MANAGER", "ADMIN"]), voidPayment );
router.post( "/:paymentUuid/correct", authorize(["ADMIN"]), correctPayment );
router.get( "/:paymentUuid", getPaymentDetails );
router.get( "/order/:orderUuid", getPaymentByOrder );

router.post( "/drawer/open", authorize(["CASHIER", "MANAGER", "ADMIN"]), openCashDrawer );
router.post("/drawer/:drawerUuid/close", authorize(["CASHIER", "MANAGER", "ADMIN"]), closeCashDrawer );
router.get( "/drawer/:drawerUuid", getCashDrawer );
router.get( "/drawer/active/:terminalId", getActiveDrawer );

// Get anomalies (manager, admin)
router.get( "/anomalies", authorize(["MANAGER", "ADMIN"]), getAnomalies );
router.post( "/anomalies/:anomalyUuid/review", authorize(["MANAGER", "ADMIN"]), reviewAnomaly );

export default router;