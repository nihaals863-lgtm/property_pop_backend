const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true }
        });
        console.log('--- Registered Users ---');
        console.log(JSON.stringify(users, null, 2));
        console.log('------------------------');
    } catch (e) {
        console.error('Error fetching users:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
