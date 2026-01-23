import { Request, Response } from "express";
import { EventBus } from "../../events/eventBus.ts";
import { PaymentService } from "../../services/payment/payment.service.ts";


export class PaymentController {
    static async confirmPayment(req: Request, res: Response){
        try {
            const {
                orderUuid,
                provider,
                providerRef,
                snapshot,
            } = req.body;

            if (!orderUuid || !provider || !providerRef) {
                return res.status(400).json({
                  message: "Missing required payment confirmation fields",
                });
            };

            await PaymentService.confirmPayment({
                orderUuid,
                provider,
                providerRef,
                snapshot,
            });

            return res.status(200).json({
                success: true,
                message: "Payment confirmed",
            });
        } catch (err: any) {
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }

     /**
   * Used when provider explicitly reports a failure
   * (webhook or frontend callback)
   */
    static async markPaymentFailed(req: Request, res: Response) {
        try {
            const { orderUuid, reason } = req.body;
      
            if (!orderUuid) {
              return res.status(400).json({
                message: "orderUuid is required",
              });
            }
      
            EventBus.emit("PAYMENT_FAILED", {
              orderUuid,
              reason: reason ?? "UNKNOWN",
            });

            return res.status(200).json({
                success: true,
                message: "Payment marked as failed",
              });
        } catch (err: any) {
              return res.status(400).json({
                success: false,
                message: err.message,
              });
        }
    }

    /**
   * Optional: manual retry trigger (admin / support)
   * Usually not exposed publicly
   */
    static async retryFailedPayment(req: Request, res: Response) {
        try {
          const { paymentUuid } = req.params;
    
          if (!paymentUuid) {
            return res.status(400).json({
              message: "paymentUuid is required",
            });
          }
    
          EventBus.emit("PAYMENT_RETRY_REQUESTED", {
            paymentUuid,
          });
    
          return res.status(200).json({
            success: true,
            message: "Payment retry queued",
          });
        } catch (err: any) {
          return res.status(400).json({success: false,
            message: err.message,
          });
        }
    }
};