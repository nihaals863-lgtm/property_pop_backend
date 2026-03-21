const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const user = await prisma.user.findFirst({ where: { email: 'tenant@property.com' } });
        if (!user) {
            console.log('User not found: tenant@property.com');
            return;
        }

        // Search for unit 1 or any vacant unit
        const unit = await prisma.unit.findFirst({ where: { status: 'Vacant' } }) || await prisma.unit.findFirst();
        
        if (!unit) {
            console.log('No unit found in database');
            return;
        }

        const lease = await prisma.lease.create({
            data: {
                tenantId: user.id,
                unitId: unit.id,
                startDate: new Date('2026-01-01'),
                endDate: new Date('2027-01-01'),
                status: 'Active',
                monthlyRent: '1500' // Setting a default rent for testing
            }
        });

        console.log('Lease created for unit:', unit.name);
        
        await prisma.unit.update({
            where: { id: unit.id },
            data: { status: 'Occupied' }
        });

        console.log('Unit status updated to Occupied');
    } catch (e) {
        console.error('Error during setup:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
