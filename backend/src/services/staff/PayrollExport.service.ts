import dayjs from "dayjs";
import { createObjectCsvStringifier } from "csv-writer";
import ExcelJS from "exceljs";
import prisma from "../../config/prisma.ts"
import { logWithContext } from "../../infrastructure/observability/logger.ts";
import { MetricsService } from "../../infrastructure/observability/metricsService.ts";

export class PayrollExportService {

    static async calculatePayrollPeriod(input: {
        tenantUuid: string;
        storeUuid?: string;
        periodStart: Date;
        periodEnd: Date;
        periodType?: string;
    }) {
        try {
            const periodType = (input.periodType as any) || "BIWEEKLY";

            // Create or get payroll period
            let payrollPeriod = await prisma.payrollPeriod.findUnique({
                where: {
                    tenantUuid_periodStart_periodType: {
                        tenantUuid: input.tenantUuid,
                        periodStart: input.periodStart,
                        periodType,
                    },
                },
            });

            if (!payrollPeriod) {
                payrollPeriod = await prisma.payrollPeriod.create({
                    data: {
                        tenantUuid: input.tenantUuid,
                        storeUuid: input.storeUuid,
                        periodStart: input.periodStart,
                        periodEnd: input.periodEnd,
                        periodType,
                        status: "DRAFT",
                    },
                });
            };

            // Get all time entries for this period
            const where: any = {
                tenantUuid: input.tenantUuid,
                clockInAt: {
                    gte: input.periodStart,
                    lte: input.periodEnd,
                },
                clockOutAt: { not: null },
            };

            if (input.storeUuid) {
                where.storeUuid = input.storeUuid;
            }

            const timeEntries = await prisma.timeEntry.findMany({
                where,
                include: {
                    user: {
                        include: {
                            tenantUsers: {
                                where: { tenantUuid: input.tenantUuid },
                            },
                        },
                    },
                },
            });

            // Group by user and store
            const staffRecords = new Map<string, Map<string, any>>();

            for (const entry of timeEntries) {
                const key = `${entry.userUuid}-${entry.storeUuid}`;
                
                if (!staffRecords.has(entry.userUuid)) {
                    staffRecords.set(entry.userUuid, new Map());
                }

                const userStores = staffRecords.get(entry.userUuid)!;
                
                if (!userStores.has(entry.storeUuid)) {
                    userStores.set(entry.storeUuid, {
                        userUuid: entry.userUuid,
                        storeUuid: entry.storeUuid,
                        regularHours: 0,
                        overtimeHours: 0,
                        totalHours: 0,
                        payRate: entry.payRate || 0,
                        entries: [],
                    });
                };

                const record = userStores.get(entry.storeUuid)!;
                record.entries.push(entry);
                record.totalHours += entry.hoursWorked || 0;
            }

            let totalHours = 0;
            let totalRegularHours = 0;
            let totalOvertimeHours = 0;
            let totalGrossPay = 0;

            // Calculate pay for each staff member
            for (const [userUuid, userStores] of staffRecords.entries()) {
                for (const [storeUuid, data] of userStores.entries()) {
                    // Determine regular vs overtime hours
                    // Standard: 40 hours/week, anything over is 1.5x
                    const weeklyHours = this.calculateWeeklyHours(data.entries, input.periodStart, input.periodEnd);
                    
                    let regularHours = 0;
                    let overtimeHours = 0;

                    for (const [week, hours] of weeklyHours.entries()) {
                        if (hours <= 40) {
                            regularHours += hours;
                        } else {
                            regularHours += 40;
                            overtimeHours += hours - 40;
                        }
                    }

                    const regularRate = data.payRate;
                    const overtimeRate = Math.round(data.payRate * 1.5);

                    const regularPay = Math.round(regularHours * regularRate);
                    const overtimePay = Math.round(overtimeHours * overtimeRate);

                    // Get tips for this period
                    const tipDistributions = await prisma.tipDistribution.findMany({
                        where: {
                            userUuid,
                            storeUuid,
                            createdAt: {
                                gte: input.periodStart,
                                lte: input.periodEnd,
                            },
                            payoutStatus: "PAID",
                        },
                    });

                    const tipIncome = tipDistributions.reduce((sum, t) => sum + t.tipAmount, 0);

                    // Get commissions for this period
                    const commissions = await prisma.commission.findMany({
                        where: {
                            userUuid,
                            storeUuid,
                            periodStart: {
                                gte: input.periodStart,
                                lte: input.periodEnd,
                            },
                            payoutStatus: "PAID",
                        },
                    });

                    const commissionIncome = commissions.reduce(
                        (sum, c) => sum + c.commissionAmount + c.bonusAmount,
                        0
                    );

                    const grossPay = regularPay + overtimePay + tipIncome + commissionIncome;

                    // Create payroll record
                    await prisma.payrollRecord.upsert({
                        where: {
                            payrollPeriodUuid_userUuid_storeUuid: {
                                payrollPeriodUuid: payrollPeriod.uuid,
                                userUuid,
                                storeUuid,
                            },
                        },
                        create: {
                            payrollPeriodUuid: payrollPeriod.uuid,
                            userUuid,
                            storeUuid,
                            regularHours,
                            overtimeHours,
                            totalHours: regularHours + overtimeHours,
                            regularRate,
                            overtimeRate,
                            regularPay,
                            overtimePay,
                            tipIncome,
                            commissionIncome,
                            grossPay,
                        },
                        update: {
                            regularHours,
                            overtimeHours,
                            totalHours: regularHours + overtimeHours,
                            regularRate,
                            overtimeRate,
                            regularPay,
                            overtimePay,
                            tipIncome,
                            commissionIncome,
                            grossPay,
                        },
                    });

                    totalHours += regularHours + overtimeHours;
                    totalRegularHours += regularHours;
                    totalOvertimeHours += overtimeHours;
                    totalGrossPay += grossPay;
                }
            }

            // Update payroll period totals
            const updated = await prisma.payrollPeriod.update({
                where: { uuid: payrollPeriod.uuid },
                data: {
                    totalHours,
                    totalRegularHours,
                    totalOvertimeHours,
                    totalGrossPay,
                    status: "CALCULATED",
                    calculatedAt: new Date(),
                    calculatedBy: "SYSTEM",
                },
            });

            logWithContext("info", "[Payroll] Period calculated", {
                payrollPeriodUuid: payrollPeriod.uuid,
                totalHours,
                totalGrossPay,
            });

            MetricsService.increment("payroll.calculated", 1);

            return updated;

        } catch (error: any) {
            logWithContext("error", "[Payroll] Calculation failed", {
                error: error.message,
            });
            throw error;
        }
    }

    private static calculateWeeklyHours(
        entries: any[],
        periodStart: Date,
        periodEnd: Date
    ): Map<string, number> {
        const weeklyHours = new Map<string, number>();

        for (const entry of entries) {
            const weekStart = dayjs(entry.clockInAt).startOf("week");
            const weekKey = weekStart.format("YYYY-WW");

            if (!weeklyHours.has(weekKey)) {
                weeklyHours.set(weekKey, 0);
            }

            weeklyHours.set(weekKey, weeklyHours.get(weekKey)! + (entry.hoursWorked || 0));
        };

        return weeklyHours;
    }

    static async exportQuickBooksIIF(payrollPeriodUuid: string): Promise<string> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);

        let iif = "!TIMERHDR\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tNOTE\n";

        for (const record of records) {
            const hours = record.totalHours.toFixed(2);
            const date = dayjs(record.payrollPeriod.periodEnd).format("MM/DD/YYYY");
            
            iif += `TIMERACT\t${date}\t\t${record.user.firstName} ${record.user.lastName}\tRegular Pay\t\t${hours}\tPayroll period ${date}\n`;
        }

        return iif;
    }

    static async exportQuickBooksCSV(payrollPeriodUuid: string): Promise<string> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);

        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: "employeeName", title: "Employee Name" },
                { id: "employeeId", title: "Employee ID" },
                { id: "regularHours", title: "Regular Hours" },
                { id: "overtimeHours", title: "Overtime Hours" },
                { id: "regularPay", title: "Regular Pay" },
                { id: "overtimePay", title: "Overtime Pay" },
                { id: "tips", title: "Tips" },
                { id: "commission", title: "Commission" },
                { id: "grossPay", title: "Gross Pay" },
            ],
        });

        const data = records.map((record) => ({
            employeeName: `${record.user.firstName} ${record.user.lastName}`,
            employeeId: record.user.uuid,
            regularHours: record.regularHours.toFixed(2),
            overtimeHours: record.overtimeHours.toFixed(2),
            regularPay: (record.regularPay / 100).toFixed(2),
            overtimePay: (record.overtimePay / 100).toFixed(2),
            tips: (record.tipIncome / 100).toFixed(2),
            commission: (record.commissionIncome / 100).toFixed(2),
            grossPay: (record.grossPay / 100).toFixed(2),
        }));

        return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
    }

    static async exportADPCSV(payrollPeriodUuid: string): Promise<string> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);

        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: "coCode", title: "Co Code" },
                { id: "batchId", title: "Batch ID" },
                { id: "fileNumber", title: "File #" },
                { id: "regularHours", title: "Reg Hours" },
                { id: "overtimeHours", title: "O/T Hours" },
                { id: "regularEarnings", title: "Reg Earnings" },
                { id: "overtimeEarnings", title: "O/T Earnings" },
                { id: "tips", title: "Tips" },
            ],
        });

        const data = records.map((record, index) => ({
            coCode: "001",
            batchId: dayjs().format("YYYYMMDD"),
            fileNumber: record.user.uuid.substring(0, 8),
            regularHours: record.regularHours.toFixed(2),
            overtimeHours: record.overtimeHours.toFixed(2),
            regularEarnings: (record.regularPay / 100).toFixed(2),
            overtimeEarnings: (record.overtimePay / 100).toFixed(2),
            tips: (record.tipIncome / 100).toFixed(2),
        }));

        return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
    }

    static async exportGustoCSV(payrollPeriodUuid: string): Promise<string> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);

        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: "employeeName", title: "Employee" },
                { id: "email", title: "Email" },
                { id: "hours", title: "Hours" },
                { id: "wage", title: "Hourly Wage" },
                { id: "tips", title: "Tips" },
                { id: "bonus", title: "Bonus" },
            ],
        });

        const data = records.map((record) => ({
            employeeName: `${record.user.firstName} ${record.user.lastName}`,
            email: record.user.email || "",
            hours: record.totalHours.toFixed(2),
            wage: (record.regularRate / 100).toFixed(2),
            tips: (record.tipIncome / 100).toFixed(2),
            bonus: (record.commissionIncome / 100).toFixed(2),
        }));

        return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
    }

    static async exportGenericCSV(payrollPeriodUuid: string): Promise<string> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);

        const csvStringifier = createObjectCsvStringifier({
            header: [
                { id: "employeeId", title: "Employee ID" },
                { id: "firstName", title: "First Name" },
                { id: "lastName", title: "Last Name" },
                { id: "email", title: "Email" },
                { id: "store", title: "Store" },
                { id: "periodStart", title: "Period Start" },
                { id: "periodEnd", title: "Period End" },
                { id: "regularHours", title: "Regular Hours" },
                { id: "overtimeHours", title: "Overtime Hours" },
                { id: "totalHours", title: "Total Hours" },
                { id: "hourlyRate", title: "Hourly Rate" },
                { id: "overtimeRate", title: "Overtime Rate" },
                { id: "regularPay", title: "Regular Pay" },
                { id: "overtimePay", title: "Overtime Pay" },
                { id: "tips", title: "Tips" },
                { id: "commission", title: "Commission" },
                { id: "grossPay", title: "Gross Pay" },
            ],
        });

        const data = records.map((record) => ({
            employeeId: record.user.uuid,
            firstName: record.user.firstName,
            lastName: record.user.lastName,
            email: record.user.email || "",
            store: record.store.name,
            periodStart: dayjs(record.payrollPeriod.periodStart).format("YYYY-MM-DD"),
            periodEnd: dayjs(record.payrollPeriod.periodEnd).format("YYYY-MM-DD"),
            regularHours: record.regularHours.toFixed(2),
            overtimeHours: record.overtimeHours.toFixed(2),
            totalHours: record.totalHours.toFixed(2),
            hourlyRate: (record.regularRate / 100).toFixed(2),
            overtimeRate: (record.overtimeRate / 100).toFixed(2),
            regularPay: (record.regularPay / 100).toFixed(2),
            overtimePay: (record.overtimePay / 100).toFixed(2),
            tips: (record.tipIncome / 100).toFixed(2),
            commission: (record.commissionIncome / 100).toFixed(2),
            grossPay: (record.grossPay / 100).toFixed(2),
        }));

        return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
    }

    static async exportExcel(payrollPeriodUuid: string): Promise<Buffer> {
        const records = await this.getPayrollRecords(payrollPeriodUuid);
        const period = records[0]?.payrollPeriod;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Payroll");

        // Add title
        worksheet.mergeCells("A1:Q1");
        worksheet.getCell("A1").value = `Payroll Report: ${dayjs(period.periodStart).format("MMM DD")} - ${dayjs(period.periodEnd).format("MMM DD, YYYY")}`;
        worksheet.getCell("A1").font = { size: 16, bold: true };
        worksheet.getCell("A1").alignment = { horizontal: "center" };

        // Headers
        worksheet.addRow([]);
        const headerRow = worksheet.addRow([
            "Employee ID",
            "First Name",
            "Last Name",
            "Email",
            "Store",
            "Regular Hours",
            "Overtime Hours",
            "Total Hours",
            "Hourly Rate",
            "Overtime Rate",
            "Regular Pay",
            "Overtime Pay",
            "Tips",
            "Commission",
            "Gross Pay",
        ]);

        headerRow.font = { bold: true };
        headerRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFD9D9D9" },
        };

        // Data
        for (const record of records) {
            worksheet.addRow([
                record.user.uuid,
                record.user.firstName,
                record.user.lastName,
                record.user.email || "",
                record.store.name,
                record.regularHours,
                record.overtimeHours,
                record.totalHours,
                record.regularRate / 100,
                record.overtimeRate / 100,
                record.regularPay / 100,
                record.overtimePay / 100,
                record.tipIncome / 100,
                record.commissionIncome / 100,
                record.grossPay / 100,
            ]);
        }

        // Totals row
        const totalsRow = worksheet.addRow([
            "",
            "",
            "",
            "",
            "TOTALS:",
            { formula: `SUM(F4:F${records.length + 3})` },
            { formula: `SUM(G4:G${records.length + 3})` },
            { formula: `SUM(H4:H${records.length + 3})` },
            "",
            "",
            { formula: `SUM(K4:K${records.length + 3})` },
            { formula: `SUM(L4:L${records.length + 3})` },
            { formula: `SUM(M4:M${records.length + 3})` },
            { formula: `SUM(N4:N${records.length + 3})` },
            { formula: `SUM(O4:O${records.length + 3})` },
        ]);

        totalsRow.font = { bold: true };
        totalsRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0F0F0" },
        };

        // Format currency columns
        ["K", "L", "M", "N", "O"].forEach((col) => {
            worksheet.getColumn(col).numFmt = "$#,##0.00";
        });

        // Format hour columns
        ["F", "G", "H"].forEach((col) => {
            worksheet.getColumn(col).numFmt = "#,##0.00";
        });

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
            column.width = 15;
        });

        return await workbook.xlsx.writeBuffer() as Buffer;
    }

    //Main export function
    static async exportPayroll(input: {
        payrollPeriodUuid: string;
        format: string;
        exportedBy: string;
    }) {
        try {
            let fileContent: string | Buffer;
            let fileName: string;
            let fileSize: number;

            const period = await prisma.payrollPeriod.findUnique({
                where: { uuid: input.payrollPeriodUuid },
            });

            const dateStr = dayjs(period!.periodStart).format("YYYY-MM-DD");

            switch (input.format) {
                case "QUICKBOOKS_IIF":
                    fileContent = await this.exportQuickBooksIIF(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}.iif`;
                    break;

                case "QUICKBOOKS_QBO":
                    fileContent = await this.exportQuickBooksCSV(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}_qbo.csv`;
                    break;

                case "ADP_CSV":
                    fileContent = await this.exportADPCSV(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}_adp.csv`;
                    break;

                case "GUSTO_CSV":
                    fileContent = await this.exportGustoCSV(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}_gusto.csv`;
                    break;

                case "GENERIC_CSV":
                    fileContent = await this.exportGenericCSV(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}.csv`;
                    break;

                case "EXCEL":
                    fileContent = await this.exportExcel(input.payrollPeriodUuid);
                    fileName = `payroll_${dateStr}.xlsx`;
                    break;

                default:
                    throw new Error("UNSUPPORTED_FORMAT");
            }

            fileSize = Buffer.byteLength(fileContent);

            // Get record count
            const recordCount = await prisma.payrollRecord.count({
                where: { payrollPeriodUuid: input.payrollPeriodUuid },
            });

            // Create export record
            const payrollExport = await prisma.payrollExport.create({
                data: {
                    payrollPeriodUuid: input.payrollPeriodUuid,
                    format: input.format as any,
                    fileName,
                    fileSize,
                    recordCount,
                    totalAmount: period!.totalGrossPay,
                    exportedBy: input.exportedBy,
                },
            });

            // Update period status
            await prisma.payrollPeriod.update({
                where: { uuid: input.payrollPeriodUuid },
                data: {
                    status: "EXPORTED",
                    exportedAt: new Date(),
                    exportedBy: input.exportedBy,
                },
            });

            logWithContext("info", "[Payroll] Export completed", {
                payrollExportUuid: payrollExport.uuid,
                format: input.format,
                recordCount,
                fileSize,
            });

            MetricsService.increment("payroll.exported", 1, {
                format: input.format,
            });

            return {
                export: payrollExport,
                fileContent,
                fileName,
            };

        } catch (error: any) {
            logWithContext("error", "[Payroll] Export failed", {
                error: error.message,
            });
            throw error;
        }
    }

    private static async getPayrollRecords(payrollPeriodUuid: string) {
        return prisma.payrollRecord.findMany({
            where: { payrollPeriodUuid },
            include: {
                user: {
                    select: {
                        uuid: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                store: {
                    select: {
                        uuid: true,
                        name: true,
                    },
                },
                payrollPeriod: true,
            },
            orderBy: [
                { user: { lastName: "asc" } },
                { user: { firstName: "asc" } },
            ],
        });
    }

    static async approvePayrollPeriod(input: {
        payrollPeriodUuid: string;
        approvedBy: string;
    }) {
        const period = await prisma.payrollPeriod.update({
            where: { uuid: input.payrollPeriodUuid },
            data: {
                status: "APPROVED",
                approvedAt: new Date(),
                approvedBy: input.approvedBy,
            },
        });

        logWithContext("info", "[Payroll] Period approved", {
            payrollPeriodUuid: input.payrollPeriodUuid,
            approvedBy: input.approvedBy,
        });

        return period;
    }
}