import { Request, Response } from "express";
import { logWithContext } from "../../infrastructure/observability/Logger.ts";
import { MetricsService } from "../../infrastructure/observability/MetricsService.ts";
import { OrderCommandService } from "../../services/order/order-command.service.ts";
import { OrderCancellationService } from "../../services/order/orderCancellation.service.ts";
import { OrderModificationService } from "../../services/order/OrderModification.service.ts";
import { OrderQueryService } from "../../services/order/orderQuery.service.ts";
import { OrderStatusService } from "../../services/order/orderStatus.service.ts";
import { OrderValidationService } from "../../services/order/orderValidation.service.ts";
import { createOrderSchema } from "../../validators/order.validator.ts";

export class OrderController {
  //POST /api/orders
  //Create new order
  static async create(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const storeUuid = req.store!.uuid;
      const tenantUserUuid = req.user!.tenantUserUuid;
  
      // Validate input
      const validationResult = createOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Invalid order data",
          details: validationResult.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      };

      const input = validationResult.data;
  
      // Pre-validate order
      const validation = await OrderValidationService.validateOrderCreation({
        tenantUuid,
        storeUuid,
        tenantUserUuid,
        items: input.items,
      });
    
      if (!validation.valid) {
        return res.status(400).json({
          error: "ORDER_VALIDATION_FAILED",
          message: "Order validation failed",
          errors: validation.errors,
        });
      };

      // Create order
      const order = await OrderCommandService.createOrder({
        tenantUuid,
        storeUuid,
        tenantUserUuid,
        orderType: input.orderType,
        tableNumber: input.tableNumber,
        deliveryAddress: input.deliveryAddress,
        customerNotes: input.customerNotes,
        promoCode: input.promoCode,
        items: input.items,
        idempotencyKey: req.headers["idempotency-key"] as string,
      });

      logWithContext("info", "[Order] Order created", {
        traceId,
        orderUuid: order.uuid,
        orderNumber: order.orderNumber,
      });

      MetricsService.increment("order.created", 1, {
        tenantUuid,
        storeUuid,
        orderType: order.orderType,
      });

      return res.status(201).json({
        success: true,
        order,
      });
    } catch (error: any) {
      logWithContext("error", "[Order] Failed to create order", {
        traceId,
        error: error.message,
        stack: error.stack,
      });
  
      MetricsService.increment("order.create.error", 1);
  
      // Handle specific errors
      if (error.message.includes("Store is currently closed")) {
        return res.status(400).json({
          error: "STORE_CLOSED",
          message: "Store is currently closed",
        });
      };
  
      if (error.message.includes("out of stock")) {
        return res.status(400).json({
          error: "INSUFFICIENT_STOCK",
          message: error.message,
        });
      };
  
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to create order",
      });
    }
  }

  //GET /api/orders
  //List orders with filters
  static async list(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
  
    try {
      const tenantUuid = req.tenant!.uuid;
      const storeUuid = req.store?.uuid;
      const tenantUserUuid = req.user!.tenantUserUuid;
      const userRole = req.user!.role;

      // For customers, only show their orders
      const filters: any = {
        tenantUuid,
        ...(storeUuid && { storeUuid }),
        ...(userRole === "CUSTOMER" && { tenantUserUuid }),
        status: req.query.status as string,
        paymentStatus: req.query.paymentStatus as string,
        orderType: req.query.orderType as string,
        search: req.query.search as string,
      };

      // Date range
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }

      // Pagination
      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      };

      const result = await OrderQueryService.list({
        ...filters,
        pagination,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to list orders", {
        traceId,
        error: error.message,
      });

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve orders",
      });
    }
  }

  //GET /api/orders/:orderUuid
  //Get single order
  static async getOne(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
      
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid } = req.params;
      const tenantUserUuid = req.user!.tenantUserUuid;
      const userRole = req.user!.role;

      const order = await OrderQueryService.getByUuid({
        tenantUuid,
        orderUuid,
        includeHistory: true,
      });

      // Check access
      if (userRole === "CUSTOMER" && order.tenantUserUuid !== tenantUserUuid) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You don't have access to this order",
        });
      }

      return res.status(200).json({
        success: true,
        order,
      });
    } catch (error: any) {
      logWithContext("error", "[Order] Failed to get order", {
        traceId,
        error: error.message,
      });

      if (error.message === "ORDER_NOT_FOUND") {
        return res.status(404).json({
          error: "ORDER_NOT_FOUND",
          message: "Order not found",
        });
      };

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve order",
      });
    }
  }

  //PATCH /api/orders/:orderUuid/status
  //Update order status
  static async updateStatus(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid } = req.params;
      const { status, reason, notes } = req.body;
      const changedBy = req.user!.uuid;

      if (!status) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Status is required",
        });
      }

      const order = await OrderStatusService.transition(orderUuid, status, {
        changedBy,
        reason,
        notes,
      });

      logWithContext("info", "[Order] Status updated", {
        traceId,
        orderUuid,
        newStatus: status,
      });

      MetricsService.increment("order.status.updated", 1, {
        status,
      });

      return res.status(200).json({
        success: true,
        order,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to update status", {
        traceId,
        error: error.message,
      });

      if (error.message.includes("Invalid transition")) {
        return res.status(400).json({
          error: "INVALID_STATUS_TRANSITION",
          message: error.message,
        });
      }

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to update order status",
      });
    }
  }

  //POST /api/orders/:orderUuid/cancel
  //Cancel order
  static async cancel(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid } = req.params;
      const { reason } = req.body;
      const cancelledBy = req.user!.uuid;
      const userRole = req.user!.role;

      if (!reason) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Cancellation reason is required",
        });
      }

      // Get order
      const order = await OrderQueryService.getByUuid({
        tenantUuid,
        orderUuid,
      });

      // Check permissions
      if (userRole === "CUSTOMER" && order.tenantUserUuid !== req.user!.tenantUserUuid) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "You don't have permission to cancel this order",
        });
      }

      // Cancel based on payment status
      if (order.paymentStatus === "PAID") {
        await OrderCancellationService.cancelAfterPayment({
          tenantUuid,
          orderUuid,
          reason,
          cancelledBy,
        });
      } else {
        await OrderCancellationService.cancelBeforePayment({
          tenantUuid,
          orderUuid,
          reason,
          cancelledBy,
        });
      }

      logWithContext("info", "[Order] Order cancelled", {
        traceId,
        orderUuid,
        reason,
      });

      MetricsService.increment("order.cancelled", 1, {
        isPaid: order.paymentStatus === "PAID",
      });

      return res.status(200).json({
        success: true,
        message: "Order cancelled successfully",
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to cancel order", {
        traceId,
        error: error.message,
      });

      if (error.message.includes("CANNOT_CANCEL")) {
        return res.status(400).json({
          error: "CANNOT_CANCEL_ORDER",
          message: error.message,
        });
      }

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to cancel order",
      });
    }
  }

  //POST /api/orders/:orderUuid/items
  //Add item to order
  static async addItem(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid } = req.params;
      const { productUuid, quantity, modifiers, specialInstructions } = req.body;

      const order = await OrderModificationService.addItem({
        tenantUuid,
        orderUuid,
        productUuid,
        quantity,
        modifiers,
        specialInstructions,
      });

      return res.status(200).json({
        success: true,
        order,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to add item", {
        traceId,
        error: error.message,
      });

      if (error.message === "CANNOT_MODIFY_PAID_ORDER") {
        return res.status(400).json({
          error: "CANNOT_MODIFY_ORDER",
          message: "Cannot modify a paid order",
        });
      }

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to add item to order",
      });
    }
  }
  //DELETE /api/orders/:orderUuid/items/:itemUuid
  //Remove item from order
  static async removeItem(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid, itemUuid } = req.params;

      const order = await OrderModificationService.removeItem({
        tenantUuid,
        orderUuid,
        orderItemUuid: itemUuid,
      });

      return res.status(200).json({
        success: true,
        order,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to remove item", {
        traceId,
        error: error.message,
      });

      if (error.message === "CANNOT_REMOVE_LAST_ITEM") {
        return res.status(400).json({
          error: "CANNOT_REMOVE_ITEM",
          message: "Cannot remove the last item from order",
        });
      }

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to remove item",
      });
    }
  }

  //GET /api/orders/stats
  //Get order statistics
  static async getStats(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const storeUuid = req.store?.uuid;

      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;

      const stats = await OrderQueryService.getStats({
        tenantUuid,
        storeUuid,
        startDate,
        endDate,
      });

      return res.status(200).json({
        success: true,
        stats,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to get stats", {
        traceId,
        error: error.message,
      });

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve statistics",
      });
    }
  }

  //GET /api/orders/active
  //Get active orders for kitchen display
  static async getActive(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const storeUuid = req.store!.uuid;

      const orders = await OrderQueryService.getActiveOrders({
        tenantUuid,
        storeUuid,
      });

      return res.status(200).json({
        success: true,
        orders,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to get active orders", {
        traceId,
        error: error.message,
      });

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve active orders",
      });
    }
  }

  //GET /api/orders/:orderUuid/timeline
  //Get order timeline
  static async getTimeline(req: Request, res: Response) {
    const traceId = req.headers["x-trace-id"] as string || `order_${Date.now()}`;
    
    try {
      const tenantUuid = req.tenant!.uuid;
      const { orderUuid } = req.params;

      const timeline = await OrderQueryService.getTimeline({
        tenantUuid,
        orderUuid,
      });

      return res.status(200).json({
        success: true,
        timeline,
      });

    } catch (error: any) {
      logWithContext("error", "[Order] Failed to get timeline", {
        traceId,
        error: error.message,
      });

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve order timeline",
      });
    }
  }
}

// if (await FeatureFlagService.canUseOfflineOrders(tenantUuid)) {
//   // Allow offline order sync
// }