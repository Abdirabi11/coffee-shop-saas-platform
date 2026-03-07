import { PermissionManagementService } from "../services/staff/PermissionManagement.service.ts";
import { ShiftManagementService } from "../services/staff/ShiftManagement.service.ts";
import { StaffManagementService } from "../services/staff/StaffManagement.service.ts";


async function onboardNewStaff() {
  
    // 1. Create staff member
    const newStaff = await StaffManagementService.createStaff({
        tenantUuid: "tenant-123",
        storeUuids: ["store-456"], // Primary store
        email: "john.doe@coffee.com",
        phoneNumber: "+1234567890",
        firstName: "John",
        lastName: "Doe",
        pin: "1234", // 4-digit PIN for POS
        password: "securePassword123", // Optional for mobile app
        role: "STAFF",
        storeRoles: {
            "store-456": "CASHIER", // Role at this store
        },
        employmentType: "PART_TIME",
        payRate: 1500, // $15.00/hour in cents
        hireDate: new Date(),
        certifications: {
            food_handler: {
                expires: "2025-12-31",
                number: "FH123456",
            },
        },
        createdBy: "manager-uuid",
    });

    console.log("✅ Staff created:", newStaff.uuid);

    // 2. Grant additional permissions
    await PermissionManagementService.grantCustomPermission({
        userUuid: newStaff.uuid,
        storeUuid: "store-456",
        permissionSlug: "order.refund",
        grantedBy: "manager-uuid",
        reason: "Experienced cashier",
    });

    console.log("✅ Custom permission granted");

    // 3. Create first week schedule
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const shiftDate = new Date(today);
        shiftDate.setDate(today.getDate() + i);
        
        // Morning shift: 8 AM - 4 PM
        const scheduledStart = new Date(shiftDate);
        scheduledStart.setHours(8, 0, 0, 0);
        
        const scheduledEnd = new Date(shiftDate);
        scheduledEnd.setHours(16, 0, 0, 0);

        await ShiftManagementService.createShift({
            tenantUuid: "tenant-123",
            storeUuid: "store-456",
            userUuid: newStaff.uuid,
            role: "CASHIER",
            scheduledStart,
            scheduledEnd,
            shiftType: "REGULAR",
            requiredBreaks: 1, // One 30-min break
            breakDuration: 30,
            notes: i === 0 ? "First day - training shift" : undefined,
        });
    }

    console.log("✅ First week schedule created");

    return newStaff;
}