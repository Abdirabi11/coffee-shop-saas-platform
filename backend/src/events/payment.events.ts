import { InventoryService } from "../services/products/inventory.service.ts";
import { EventBus } from "./eventBus.ts";


EventBus.on("PAYMENT_CONFIRMED", async ({ orderUuid }) => {
    await InventoryService.deductForOrder(orderUuid);
});