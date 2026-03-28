import express from "express"
import { OrderController } from "../../controllers/order/Order.controller.ts";


const router= express.Router()
/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: Create new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - orderType
 *             properties:
 *               orderType:
 *                 type: string
 *                 enum: [DINE_IN, TAKEAWAY, DELIVERY]
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post("/", OrderController.create);
