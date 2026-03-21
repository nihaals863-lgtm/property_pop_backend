const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function createDefaultTenant() {
    const email = 'tenant@property.com';
    const password = '123456';
    
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            console.log(`User ${email} already exists.`);
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: 'Default Tenant',
                role: 'TENANT',
                phone: '1234567890',
                type: 'Individual'
            }
        });
        console.log(`Successfully created tenant: ${email} with password: ${password}`);
    } catch (e) {
        console.error('Error creating user:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

createDefaultTenant();
