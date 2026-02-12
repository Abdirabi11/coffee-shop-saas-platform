import { Request, Response } from "express";
import { PaymentEventBus } from "../../events/eventBus.js";
import { PaymentIntentService } from "../../services/payment/payment-intent.service.ts";


export class PaymentController {
  static async markPaymentFailed(req: Request, res: Response) {
    try {
      const { orderUuid, reason } = req.body;

      if (!orderUuid) {
        return res.status(400).json({
          message: "orderUuid is required",
        });
      };

      await PaymentIntentService.fail(orderUuid);

      PaymentEventBus.emit("PAYMENT_FAILED", {
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

  static async retryFailedPayment(req: Request, res: Response) {
    try {
      const { paymentUuid } = req.params;

      if (!paymentUuid) {
        return res.status(400).json({
          message: "paymentUuid is required",
        });
      }

      PaymentEventBus.emit("PAYMENT_RETRY_REQUESTED", {
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