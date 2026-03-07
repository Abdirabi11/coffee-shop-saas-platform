import dayjs from "dayjs";
import fs from "fs";
import { PayrollExportService } from "../services/staff/PayrollExport.service.js";

async function monthlyPayrollExport() {
    console.log("💰 Monthly Payroll Export Example\n");

    const lastMonth = dayjs().subtract(1, "month");
    const periodStart = lastMonth.startOf("month").toDate();
    const periodEnd = lastMonth.endOf("month").toDate();

    // 1. Calculate payroll
    console.log("📊 Calculating payroll...");
    const payrollPeriod = await PayrollExportService.calculatePayrollPeriod({
        tenantUuid: "tenant-123",
        storeUuid: "store-456",
        periodStart,
        periodEnd,
        periodType: "MONTHLY",
    });

    console.log("✅ Payroll calculated:");
    console.log(`  - Total hours: ${payrollPeriod.totalHours.toFixed(2)}`);
    console.log(`  - Regular hours: ${payrollPeriod.totalRegularHours.toFixed(2)}`);
    console.log(`  - Overtime hours: ${payrollPeriod.totalOvertimeHours.toFixed(2)}`);
    console.log(`  - Total gross pay: $${(payrollPeriod.totalGrossPay / 100).toFixed(2)}`);

    // 2. Approve payroll
    console.log("\n✅ Approving payroll...");
    await PayrollExportService.approvePayrollPeriod({
        payrollPeriodUuid: payrollPeriod.uuid,
        approvedBy: "manager-uuid",
    });
    console.log("✅ Payroll approved");

    // 3. Export to multiple formats
    console.log("\n📤 Exporting payroll...");

    const formats = [
        "QUICKBOOKS_QBO",
        "ADP_CSV",
        "GUSTO_CSV",
        "GENERIC_CSV",
        "EXCEL",
    ];

    for (const format of formats) {
        const result = await PayrollExportService.exportPayroll({
            payrollPeriodUuid: payrollPeriod.uuid,
            format,
            exportedBy: "manager-uuid",
        });

        // Save to file
        const filePath = `/tmp/${result.fileName}`;
        fs.writeFileSync(filePath, result.fileContent);

        console.log(`  ✅ ${format}: ${result.fileName} (${result.export.fileSize} bytes)`);
    }

    console.log("\n✅ All payroll exports completed!");
}