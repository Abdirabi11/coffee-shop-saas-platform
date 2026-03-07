import { OrderAttributionService } from "../services/staff/OrderAttribution.service.js";
import { TimeEntryService } from "../services/staff/TimeEntry.service.js";
import prisma from "../config/prisma.ts"
import { BreakEnforcementService } from "../services/staff/BreakEnforcement.service.js";


async function completeShiftWithTipsExample() {
    const userUuid = "staff-123";
    const storeUuid = "store-456";

    console.log("🏪 Complete Shift with Tips & Commission Example\n");

    // 1. Clock in
    console.log("⏰ Clocking in...");
    const clockInResult = await TimeEntryService.clockIn({
        userUuid,
        storeUuid,
        deviceId: "POS-01",
        latitude: 40.7128,
        longitude: -74.0060,
    });
    console.log("✅ Clocked in:", clockInResult.timeEntry.uuid);

    // 2. Take orders during shift
    console.log("\n📝 Taking orders...");
    const orders = [];
    
    for (let i = 0; i < 5; i++) {
        // Create order (simplified)
        const order = await prisma.order.create({
            data: {
                tenantUuid: "tenant-123",
                storeUuid,
                customerUuid: `customer-${i}`,
                orderNumber: `ORD-${Date.now()}-${i}`,
                orderType: "DINE_IN",
                status: "COMPLETED",
                totalAmount: 1500 + (i * 200), // $15-23
                tipAmount: 300 + (i * 50), // $3-5.50 tips
                tipMethod: "CARD",
            },
        });

        // Attribute to staff
        await OrderAttributionService.setTakenBy({
            orderUuid: order.uuid,
            userUuid,
        });

        await OrderAttributionService.setServedBy({
            orderUuid: order.uuid,
            userUuid,
        });

        orders.push(order);
        console.log(`  ✅ Order ${i + 1}: $${(order.totalAmount / 100).toFixed(2)} + $${(order.tipAmount! / 100).toFixed(2)} tip`);
    }

    // 3. Check break requirements
    console.log("\n☕ Checking break requirements...");
    const breakCheck = await BreakEnforcementService.checkBreakRequirement(
        clockInResult.timeEntry.uuid
    );

    if (breakCheck.requiredBreaks.length > 0) {
        console.log("⚠️  Break required in", breakCheck.requiredBreaks[0].minutesUntilRequired, "minutes");
    }

    // 4. Take break
    console.log("\n☕ Taking 30-minute break...");
    const breakEntry = await TimeEntryService.startBreak({
        timeEntryUuid: clockInResult.timeEntry.uuid,
        breakType: "UNPAID",
    });
    
    // Simulate break duration
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await TimeEntryService.endBreak({
        breakEntryUuid: breakEntry.uuid,
    });
    console.log("✅ Break completed");

    // 5. Clock out
    console.log("\n⏰ Clocking out...");
    const timeEntry = await TimeEntryService.clockOut({
        userUuid,
        storeUuid,
        deviceId: "POS-01",
        latitude: 40.7128,
        longitude: -74.0060,
    });

    console.log("✅ Shift completed:");
    console.log(`  - Hours worked: ${timeEntry.hoursWorked}`);
    console.log(`  - Total pay: $${(timeEntry.totalPay! / 100).toFixed(2)}`);

    // 6. Calculate stats
    console.log("\n📊 Shift Statistics:");
    const stats = await OrderAttributionService.getStaffOrderStats({
        userUuid,
        storeUuid,
        dateFrom: new Date(Date.now() - 86400000),
        dateTo: new Date(),
    });

    console.log(`  - Orders taken: ${stats.ordersTaken.count}`);
    console.log(`  - Total revenue: $${(stats.ordersTaken.totalRevenue / 100).toFixed(2)}`);
    console.log(`  - Total tips: $${(stats.ordersTaken.totalTips / 100).toFixed(2)}`);
    console.log(`  - Avg order value: $${(stats.ordersTaken.avgOrderValue / 100).toFixed(2)}`);
}