const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMukalInvoices() {
    try {
        const invoices = await prisma.invoice.findMany({
            where: { tenantId: 90 },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`Found ${invoices.length} invoices for Mukal`);
        invoices.forEach(inv => {
            console.log(`Invoice: ${inv.invoiceNo}, Amt: ${inv.amount}, Rent: ${inv.rent}, Month: ${inv.month}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkMukalInvoices();
