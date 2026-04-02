const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTenants() {
    try {
        const tenants = await prisma.user.findMany({
            where: { role: 'TENANT' },
            include: {
                leases: {
                    include: {
                        unit: { include: { property: true } }
                    }
                }
            }
        });

        console.log(`Found ${tenants.length} tenants`);
        tenants.forEach(t => {
            console.log(`Tenant: ${t.name} (ID: ${t.id}) | Email: ${t.email}`);
            t.leases.forEach(l => {
                console.log(`  - Lease ID: ${l.id}, Status: ${l.status}, Rent: ${l.monthlyRent}, UnitRent: ${l.unit.rentAmount}`);
            });
        });

    } catch (e) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkTenants();
