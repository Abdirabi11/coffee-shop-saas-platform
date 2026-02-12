import dayjs from "dayjs";
import prisma from "../../config/prisma.ts"

export class MonthlyRevenueJob {
  static async run (){
    console.log("📊 Running monthly revenue analytics");

    const currentMonth= dayjs().format("YYYY-MM");
    const start= dayjs().startOf("month").toDate();
    const end= dayjs().endOf("month").toDate();

    // Aggreagtion revenue from paid invoices
    const invoiceRevenue = await prisma.invoice.aggregate({
      where: {
        status: "PAID",
        paidAt: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        total: true, 
      },
      _count: {
        uuid: true,
      },
    });

      //Aggreagtion from completed payment
    const paymentRevenue = await prisma.payment.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        amount: true,
      },
      _count: {
        uuid: true,
      },
    });

      //metrics calculation
    const totalRevenue = (invoiceRevenue._sum.total ?? 0) + (paymentRevenue._sum.amount ?? 0);
    const totalTransactions = invoiceRevenue._count.uuid + paymentRevenue._count.uuid;
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const prevMonthStart = dayjs().subtract(1, "month").startOf("month").toDate();
    const prevMonthEnd = dayjs().subtract(1, "month").endOf("month").toDate();

    const prevMonthRevenue = await prisma.invoice.aggregate({
      where: {
        status: "PAID",
        paidAt: {
          gte: prevMonthStart,
          lte: prevMonthEnd,
        },
      },
      _sum: { total: true },
    });

    const prevRevenue = prevMonthRevenue._sum.total ?? 0;
    const revenueGrowth = prevRevenue > 0
      ? Number((((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(2))
      : 0;

      // Store snapshot
    await prisma.analyticsSnapshot.create({
      data: {
      type: "MONTHLY_REVENUE",
      granularity: "MONTHLY",
      periodStart: start,
      periodEnd: end,
      metrics: {
        totalRevenue,
        invoiceRevenue: invoiceRevenue._sum.total ?? 0,
        paymentRevenue: paymentRevenue._sum.amount ?? 0,
        totalTransactions,
        avgTransactionValue: Number(avgTransactionValue.toFixed(2)),
        revenueGrowth,
        prevMonthRevenue: prevRevenue,
      },
      status: "COMPLETED",
      },
    });

    console.log(`✅ Monthly revenue: $${(totalRevenue / 100).toFixed(2)}, Growth: ${revenueGrowth}%`);
    return {
      period: currentMonth,
      totalRevenue,
      revenueGrowth,
    };
  }
};