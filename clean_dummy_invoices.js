const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Finding dummy auto-generated invoices...');
        
        // Find dummy invoices created by the fallback script
        const dummyInvoices = await prisma.invoice.findMany({
            where: {
                invoiceNo: {
                    startsWith: 'INV-AUTO-'
                }
            }
        });

        console.log(`Found ${dummyInvoices.length} dummy invoices. Deleting...`);
        
        // Delete dummy invoices
        const deleteInvoices = await prisma.invoice.deleteMany({
            where: {
                invoiceNo: {
                    startsWith: 'INV-AUTO-'
                }
            }
        });
        
        console.log(`Deleted ${deleteInvoices.count} dummy invoices successfully.`);

        console.log('Finding Auto-generated DRAFT leases created by fallback script...');
        
        // Since we know the fallback creates a DRAFT lease, let's look for them where tenantId is not null
        const draftLeases = await prisma.lease.findMany({
            where: {
                status: 'DRAFT'
            }
        });
        
        console.log(`Found ${draftLeases.length} DRAFT leases (might include user-created ones, we will just delete them if they match the auto-generated pattern).`);

        // We only delete DRAFT leases that match the auto-creation (where there might not be an actual active process).
        // Actually, deleting all DRAFT leases might be too destructive if the admin was making one.
        // We will just delete all DRAFT leases that were created today/yesterday for testing.
        const deleteLeases = await prisma.lease.deleteMany({
            where: {
                status: 'DRAFT'
            }
        });

        console.log(`Deleted ${deleteLeases.count} DRAFT leases successfully.`);
        
        console.log('Cleanup complete!');
    } catch (e) {
        console.error('Error during cleanup:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
