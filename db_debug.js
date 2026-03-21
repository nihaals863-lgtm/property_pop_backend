const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const log = [];
    try {
        const users = await prisma.user.findMany();
        log.push('Users: ' + JSON.stringify(users, null, 2));
        
        const leases = await prisma.lease.findMany();
        log.push('Leases: ' + JSON.stringify(leases, null, 2));
        
        const units = await prisma.unit.findMany();
        log.push('Units: ' + JSON.stringify(units, null, 2));
    } catch (e) {
        log.push('Error: ' + e.message);
        log.push(e.stack);
    } finally {
        fs.writeFileSync('db_debug.log', log.join('\n\n'));
        await prisma.$disconnect();
    }
}

main();
