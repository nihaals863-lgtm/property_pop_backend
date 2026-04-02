const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncRent() {
    try {
        const leasesToFix = await prisma.lease.findMany({
            where: {
                OR: [
                    { monthlyRent: null },
                    { monthlyRent: 0 }
                ]
            }
        });

        console.log(`Found ${leasesToFix.length} leases with missing rent`);

        for (const lease of leasesToFix) {
            // Find latest invoice for this tenant
            const latestInvoice = await prisma.invoice.findFirst({
                where: { tenantId: lease.tenantId },
                orderBy: { createdAt: 'desc' }
            });

            if (latestInvoice && latestInvoice.rent && parseFloat(latestInvoice.rent) > 0) {
                console.log(`Fixing Lease ${lease.id} for Tenant ${lease.tenantId}. Setting rent to ${latestInvoice.rent}`);
                await prisma.lease.update({
                    where: { id: lease.id },
                    data: { monthlyRent: latestInvoice.rent }
                });
            } else {
                console.log(`No valid invoice found for Tenant ${lease.tenantId}. Skipping.`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

syncRent();
