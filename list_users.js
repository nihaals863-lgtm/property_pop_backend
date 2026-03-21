const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAllUsers() {
    console.log('--- DATABASE USER LIST ---');
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true }
        });
        if (users.length === 0) {
            console.log('No users found.');
        } else {
            users.forEach(u => console.log(`ID: ${u.id} | Email: "${u.email}" | Role: ${u.role}`));
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

listAllUsers();
