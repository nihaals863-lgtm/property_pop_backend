const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMukal() {
    try {
        const user = await prisma.user.findFirst({
            where: { name: { contains: 'mukal' } },
            include: {
                leases: {
                    include: {
                        unit: {
                            include: {
                                property: true
                            }
                        }
                    }
                },
                invoices: true
            }
        });

        if (!user) {
            console.log('User Mukal not found');
            return;
        }

        console.log('--- User Info ---');
        console.log(`ID: ${user.id}, Name: ${user.name}, Email: ${user.email}`);
        
        console.log('\n--- Leases ---');
        user.leases.forEach(l => {
            console.log(`Lease ID: ${l.id}, Status: ${l.status}, MonthlyRent: ${l.monthlyRent}`);
            console.log(`  Unit: ${l.unit.name}, RentAmount: ${l.unit.rentAmount}`);
            console.log(`  Property: ${l.unit.property.name}`);
        });

        console.log('\n--- Invoices ---');
        user.invoices.forEach(inv => {
            console.log(`Invoice: ${inv.invoiceNo}, Month: ${inv.month}, Rent: ${inv.rent}, Amount: ${inv.amount}, Status: ${inv.status}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkMukal();
