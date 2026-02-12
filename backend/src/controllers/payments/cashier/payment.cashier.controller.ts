import { Request, Response } from "express";
import {z} from "zod"
import { CashDrawerService } from "../../../services/payment/cashier/cashDrawer.service.ts";
import { CashierPaymentService } from "../../../services/payment/cashier/payment.cashier.service.ts";

// Validation schemas
const processPaymentSchema = z.object({
  orderUuid: z.string().uuid(),
  paymentMethod: z.enum(["CASH", "CARD_TERMINAL"]),
  
  // For cash payments
  amountTendered: z.number().positive().optional(),
  changeGiven: z.number().min(0).optional(),
  
  // Optional
  terminalId: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => {
    // If payment method is CASH, amountTendered and changeGiven are required
    if (data.paymentMethod === "CASH") {
      return data.amountTendered !== undefined && data.changeGiven !== undefined;
    }
    return true;
  },
  {
    message: "amountTendered and changeGiven required for CASH payments",
  }
);

const voidPaymentSchema = z.object({
  voidReason: z.string().min(10, "Void reason must be at least 10 characters"),
  managerPin: z.string().optional(), 
});

const correctPaymentSchema = z.object({
  correctAmount: z.number().positive(),
  correctionReason: z.string().min(10, "Correction reason must be at least 10 characters"),
});

const openDrawerSchema = z.object({
  terminalId: z.string(),
  openingBalance: z.number().min(0),
});

const closeDrawerSchema = z.object({
  actualCash: z.number().min(0),
  actualCard: z.number().min(0),
  closingNotes: z.string().optional(),
});

/**
 * POST /api/payments/cashier/process
 * Process cashier payment (cash or card terminal)
 * @description Immediately completes payment without verification
*/
export const processPayment= async (req: Request, res: Response)=>{
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Authentication required",
      });
    };
    
    if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only cashiers/managers can process payments",
      });
    };

    const tenantUuid = staff.tenantUuid;
    if (!tenantUuid) {
      return res.status(400).json({
        success: false,
        message: "Tenant context required",
      });
    };

    const parsed = processPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.format(),
      });
    };

    const idempotencyKey = req.headers["idempotency-key"] as string;
    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        message: "Idempotency-Key header required",
      });
    }

    const deviceId = (req.headers["x-device-id"] as string) || "unknown";
    const terminalId = parsed.data.terminalId || deviceId; // Default to deviceId if not provided
    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

    const payment = await CashierPaymentService.processPayment({
      tenantUuid,
      orderUuid: parsed.data.orderUuid,
      paymentMethod: parsed.data.paymentMethod,
      amountTendered: parsed.data.amountTendered,
      changeGiven: parsed.data.changeGiven,
      processedBy: staff.uuid,
      deviceId,
      terminalId,
      ipAddress,
      receiptNumber: parsed.data.receiptNumber,
      notes: parsed.data.notes,
      idempotencyKey,
    });

    return res.status(201).json({
      success: true,
      message: "Payment processed successfully",
      payment: {
        uuid: payment.uuid,
        orderUuid: payment.orderUuid,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        processedAt: payment.processedAt,
        receiptNumber: payment.receiptNumber,
        changeGiven: payment.changeGiven,
      },
    });
  } catch (error: any) {
    console.error("[PROCESS_PAYMENT_ERROR]", error);

    if (error.message.includes("Order not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    };

    if (error.message.includes("already processed")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    };

    if (error.message.includes("Change calculation error")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    };

    return res.status(500).json({
      success: false,
      message: "Failed to process payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * POST /api/payments/cashier/:paymentUuid/void
 * Void a payment (manager only)
 * @description Cancels a payment and returns order to READY status
*/
export const voidPayment = async (req: Request, res: Response) => {
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    };

    // Only managers and admins can void
    if (!["MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only managers can void payments",
      });
    }

    const { paymentUuid } = req.params;

    const parsed = voidPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.format(),
      });
    };

    const payment = await CashierPaymentService.voidPayment({
      paymentUuid,
      voidedBy: staff.uuid,
      voidReason: parsed.data.voidReason,
      managerPin: parsed.data.managerPin,
    });

    return res.status(200).json({
      success: true,
      message: "Payment voided successfully",
      payment: {
        uuid: payment.uuid,
        status: payment.status,
        voidedAt: payment.voidedAt,
        voidedBy: payment.voidedBy,
        voidReason: payment.voidReason,
      },
    });
  } catch (error: any) {
    console.error("[VOID_PAYMENT_ERROR]", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("too old")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to void payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  };
};

/**
 * POST /api/payments/cashier/:paymentUuid/correct
 * Correct payment amount (accounting errors)
 * @description Admin only - corrects payment amount with audit trail
*/
export const correctPayment= async (req: Request, res: Response) =>{
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Only admins can correct
    if (staff.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only admins can correct payment amounts",
      });
    }

    const { paymentUuid } = req.params;

    const parsed = correctPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.format(),
      });
    }

    const payment = await CashierPaymentService.correctPayment({
      paymentUuid,
      correctAmount: parsed.data.correctAmount,
      correctedBy: staff.uuid,
      correctionReason: parsed.data.correctionReason,
    });

    return res.status(200).json({
      success: true,
      message: "Payment amount corrected",
      payment: {
        uuid: payment.uuid,
        originalAmount: payment.originalAmount,
        amount: payment.amount,
        correctedAt: payment.correctedAt,
        correctionReason: payment.correctionReason,
      },
    });
  } catch (error: any) {
    console.error("[CORRECT_PAYMENT_ERROR]", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to correct payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/payments/cashier/:paymentUuid
 * Get payment details and history
*/
export const getPaymentDetails = async (req: Request, res: Response) => {
  try {
    const { paymentUuid } = req.params;

    const result = await CashierPaymentService.getPaymentStatus(paymentUuid);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[GET_PAYMENT_DETAILS_ERROR]", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/payments/cashier/order/:orderUuid
 * Get payment by order UUID
*/
export const getPaymentByOrder = async (req: Request, res: Response) => {
  try {
    const { orderUuid } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { orderUuid },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            totalAmount: true,
          },
        },
        auditSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found for this order",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error: any) {
    console.error("[GET_PAYMENT_BY_ORDER_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// CASH DRAWER ENDPOINTS
/**
 * POST /api/payments/cashier/drawer/open
 * Open cash drawer for shift
*/
export const openCashDrawer = async (req: Request, res: Response) => {
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only cashiers/managers can open drawers",
      });
    }

    const parsed = openDrawerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.format(),
      });
    }

    // Get store UUID from staff context or request
    const storeUuid = staff.storeUuid || req.body.storeUuid;
    if (!storeUuid) {
      return res.status(400).json({
        success: false,
        message: "Store context required",
      });
    }

    const drawer = await CashDrawerService.openDrawer({
      storeUuid,
      terminalId: parsed.data.terminalId,
      openingBalance: parsed.data.openingBalance,
      openedBy: staff.uuid,
    });

    return res.status(201).json({
      success: true,
      message: "Cash drawer opened",
      drawer: {
        uuid: drawer.uuid,
        terminalId: drawer.terminalId,
        openingBalance: drawer.openingBalance,
        sessionStart: drawer.sessionStart,
      },
    });
  } catch (error: any) {
    console.error("[OPEN_DRAWER_ERROR]", error);

    if (error.message.includes("already open")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to open cash drawer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * POST /api/payments/cashier/drawer/:drawerUuid/close
 * Close cash drawer at end of shift
*/
export const closeCashDrawer = async (req: Request, res: Response) => {
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!["CASHIER", "MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only cashiers/managers can close drawers",
      });
    }

    const { drawerUuid } = req.params;

    const parsed = closeDrawerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.format(),
      });
    }

    const drawer = await CashDrawerService.closeDrawer({
      drawerUuid,
      actualCash: parsed.data.actualCash,
      actualCard: parsed.data.actualCard,
      closedBy: staff.uuid,
      closingNotes: parsed.data.closingNotes,
    });

    return res.status(200).json({
      success: true,
      message: "Cash drawer closed",
      drawer: {
        uuid: drawer.uuid,
        sessionStart: drawer.sessionStart,
        sessionEnd: drawer.sessionEnd,
        expectedCash: drawer.expectedCash,
        actualCash: drawer.actualCash,
        cashVariance: drawer.cashVariance,
        expectedCard: drawer.expectedCard,
        actualCard: drawer.actualCard,
        cardVariance: drawer.cardVariance,
      },
    });
  } catch (error: any) {
    console.error("[CLOSE_DRAWER_ERROR]", error);

    if (error.message.includes("not open")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to close cash drawer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/payments/cashier/drawer/:drawerUuid
 * Get cash drawer details
*/
export const getCashDrawer = async (req: Request, res: Response) => {
  try {
    const { drawerUuid } = req.params;

    const drawer = await prisma.cashDrawer.findUnique({
      where: { uuid: drawerUuid },
    });

    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: "Cash drawer not found",
      });
    }

    return res.status(200).json({
      success: true,
      drawer,
    });
  } catch (error: any) {
    console.error("[GET_DRAWER_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cash drawer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * GET /api/payments/cashier/drawer/active/:terminalId
 * Get active cash drawer for terminal
*/
export const getActiveDrawer = async (req: Request, res: Response) => {
  try {
    const { terminalId } = req.params;
    const staff = req.user;

    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const storeUuid = staff.storeUuid || req.query.storeUuid;
    if (!storeUuid) {
      return res.status(400).json({
        success: false,
        message: "Store context required",
      });
    }

    const drawer = await prisma.cashDrawer.findFirst({
      where: {
        storeUuid: storeUuid as string,
        terminalId,
        status: "OPEN",
      },
    });

    if (!drawer) {
      return res.status(404).json({
        success: false,
        message: "No active drawer found for this terminal",
      });
    }

    return res.status(200).json({
      success: true,
      drawer,
    });
  } catch (error: any) {
    console.error("[GET_ACTIVE_DRAWER_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active drawer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ANOMALY & REVIEW ENDPOINTS

/**
 * GET /api/payments/cashier/anomalies
 * Get payment anomalies for review
*/
export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Only managers and admins can view anomalies
    if (!["MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only managers can view anomalies",
      });
    }

    const { storeUuid, status, severity } = req.query;

    const anomalies = await prisma.paymentAnomaly.findMany({
      where: {
        ...(storeUuid && { storeUuid: storeUuid as string }),
        ...(status && { status: status as any }),
        ...(severity && { severity: severity as any }),
      },
      include: {
        payment: {
          include: {
            order: {
              select: {
                orderNumber: true,
                totalAmount: true,
              },
            },
          },
        },
      },
      orderBy: {
        detectedAt: "desc",
      },
      take: 100,
    });

    return res.status(200).json({
      success: true,
      anomalies,
      count: anomalies.length,
    });
  } catch (error: any) {
    console.error("[GET_ANOMALIES_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch anomalies",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * POST /api/payments/cashier/anomalies/:anomalyUuid/review
 * Review and resolve anomaly
*/
export const reviewAnomaly = async (req: Request, res: Response) => {
  try {
    const staff = req.user;
    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!["MANAGER", "ADMIN"].includes(staff.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Only managers can review anomalies",
      });
    }

    const { anomalyUuid } = req.params;
    const { status, reviewNotes, resolution } = req.body;

    const anomaly = await prisma.paymentAnomaly.update({
      where: { uuid: anomalyUuid },
      data: {
        status,
        reviewedBy: staff.uuid,
        reviewedAt: new Date(),
        reviewNotes,
        resolution,
      },
    });

    // If anomaly is resolved, unflag the payment
    if (status === "RESOLVED" || status === "DISMISSED") {
      await prisma.payment.update({
        where: { uuid: anomaly.paymentUuid },
        data: {
          flaggedForReview: false,
          reviewedBy: staff.uuid,
          reviewedAt: new Date(),
          reviewNotes,
          reviewOutcome: status === "RESOLVED" ? "APPROVED" : "DISPUTED",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Anomaly reviewed",
      anomaly,
    });
  } catch (error: any) {
    console.error("[REVIEW_ANOMALY_ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Failed to review anomaly",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};