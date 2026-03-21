const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStatus() {
    console.log('--- DATABASE STATUS CHECK ---');
    try {
        await prisma.$connect();
        console.log('Connected successfully.');
        
        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);
        
        if (userCount > 0) {
            const users = await prisma.user.findMany({
                take: 10,
                select: { id: true, email: true, role: true }
            });
            console.log('First 10 users:');
            console.table(users);
        } else {
            console.log('No users found in database!');
        }
    } catch (e) {
        console.error('CRITICAL DATABASE ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkStatus();
