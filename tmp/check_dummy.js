const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true }
    });
    console.log('All Users:', JSON.stringify(allUsers, null, 2));

    const allLeases = await prisma.lease.findMany({
      include: { unit: true, tenant: true }
    });
    console.log('All Leases:', JSON.stringify(allLeases, null, 2));

    const allInvoices = await prisma.invoice.findMany({
      include: { unit: true, tenant: true }
    });
    console.log('All Invoices:', JSON.stringify(allInvoices, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
