const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    try {
        const users = await prisma.user.findMany({
            where: { name: { contains: 'qween' } },
            include: {
                leases: {
                    include: {
                        unit: {
                            include: { property: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        
        if (users.length > 0) {
            console.log('--- LEASES FOR QWEEN ---');
            users[0].leases.forEach(l => {
                console.log(`Lease ID: ${l.id}, Status: ${l.status}, Rent: ${l.monthlyRent}, Unit Rent: ${l.unit?.rentAmount}, CreatedAt: ${l.createdAt}`);
            });
        } else {
            console.log('User qween not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
