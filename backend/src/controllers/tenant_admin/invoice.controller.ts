import { Request, Response } from "express";
import prisma from "../../config/prisma.ts"

export const downloadInvoice = async (req: Request, res: Response) => {
    const { invoiceUuid } = req.params;
  
    const invoice = await prisma.invoice.findUnique({
      where: { uuid: invoiceUuid },
    });
  
    if (!invoice?.pdfUrl) {
      return res.status(404).json({ message: "Invoice PDF not ready" });
    }
  
    res.sendFile(invoice.pdfUrl, { root: "storage" });
};