import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import prisma  from "../config/prisma.ts"

export const generateInvoicePdf= async (invoiceUuid: string)=>{
    const invoice= await prisma.invocie.findUnique({
        where: {uuid: invoiceUuid},
        include: {
            tenant: true,
            billingSnapshot: true
        }
    });
    if(!invoice){
        throw new Error("Invoice not found");
    };

    const doc= new PDFDocument({ margin: 30})

    const fileName= `invoice-${invoice.invoiceNumber}.pdf`;
    const filePath= path.join(
        __dirname,
        "../../storage/invoices",
        fileName
    );

    doc.pipe(fs.createWriteStream(filePath));
    
    // Header
    doc.fontSize(20).text("INVOICE", { align: "right" });
    doc.moveDown();

    doc.fontSize(10).text(`Invoice #: ${invoice.invoiceNumber}`);
    doc.text(`Issued: ${invoice.issuedAt.toDateString()}`);
    doc.text(
      `Period: ${invoice.periodStart.toDateString()} - ${invoice.periodEnd.toDateString()}`
    );

    doc.moveDown();

    //tenant
    doc.fontSize(12).text("Billed To:");
    doc.fontSize(10).text(invoice.tenant.name);
    doc.text(invoice.tenant.email);

    doc.moveDown(2)

    //Line items
    doc.fontSize(12).text("description");
    doc.moveDown(0.5);

    doc.fontSize(10).text(
        `Plan (${invoice.billingSnapshot.planName} v${invoice.billingSnapshot.planVersion})`
    );
    doc.text(`Base price: $${invoice.billingSnapshot.basePrice / 100}`);

    if (invoice.billingSnapshot.addOnsTotal > 0) {
        doc.text(
          `Add-ons: $${invoice.billingSnapshot.addOnsTotal / 100}`
        );
    };

    doc.moveDown();

    // Totals
    doc.fontSize(12).text(
        `Total: $${invoice.total / 100}`,
        { align: "right" }
    );
    
    doc.end();

    await prisma.invoice.update({
        where: { uuid: invoice.uuid },
        data: {
          pdfUrl: `/invoices/${fileName}`,
        },
    });

    return filePath;
};