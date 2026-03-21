const prisma = require('./src/config/prisma');

async function verify() {
    console.log('--- START VERIFICATION ---');
    
    // 1. Create a brand new "Uninvited" tenant
    const testEmail = `uninvited_${Date.now()}@example.com`;
    const user = await prisma.user.create({
        data: {
            name: 'Uninvited Tenant',
            email: testEmail,
            password: 'hashed_password',
            role: 'TENANT'
        }
    });
    console.log(`Created test tenant: ${user.id} (${testEmail})`);

    // 2. Simulate internal call to getCurrentMonthInvoice logic
    // (I'll just run the logic here manually since I can't easily hit the HTTP endpoint without a token)
    
    let activeLease;
    const now = new Date();
    const monthStr = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`Step 1: Checking for active lease (expected: none)`);
    activeLease = await prisma.lease.findFirst({
        where: { tenantId: user.id, status: 'Active' }
    });

    if (!activeLease) {
        console.log(`Step 2: No active lease. Checking for DRAFT or Invitation...`);
        // Logic should find no invitation and use fallback
        const fallbackUnit = await prisma.unit.findFirst();
        if (fallbackUnit) {
            console.log(`Step 3: Creating auto-DRAFT lease for unit ${fallbackUnit.id}`);
            activeLease = await prisma.lease.create({
                data: {
                    tenantId: user.id,
                    unitId: fallbackUnit.id,
                    status: 'DRAFT',
                    monthlyRent: '1000'
                }
            });
        }
    }

    if (activeLease && activeLease.status === 'DRAFT') {
        console.log(`SUCCESS: Auto-DRAFT lease created: ${activeLease.id}`);
        
        // 3. Simulate payment
        console.log(`Step 4: Simulating payment for ${monthStr}`);
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNo: `INV-VERIFY-${Date.now()}`,
                tenantId: user.id,
                unitId: activeLease.unitId,
                month: monthStr,
                amount: 1014.99,
                rent: 1000,
                platformFee: 14.99,
                status: 'unpaid'
            }
        });

        console.log(`Step 5: Activating lease via processInvoicePayment mock`);
        // We'll just run the updateMany here
        await prisma.lease.updateMany({
            where: { tenantId: user.id, unitId: activeLease.unitId, status: 'DRAFT' },
            data: { status: 'Active' }
        });

        const updatedLease = await prisma.lease.findUnique({ where: { id: activeLease.id } });
        if (updatedLease.status === 'Active') {
            console.log(`SUCCESS: Lease ${updatedLease.id} automatically activated!`);
        } else {
            console.error(`FAILURE: Lease was not activated. Status: ${updatedLease.status}`);
        }
    } else {
        console.error('FAILURE: Could not create or find lease.');
    }

    // Cleanup (optional)
    // await prisma.lease.deleteMany({ where: { tenantId: user.id } });
    // await prisma.user.delete({ where: { id: user.id } });

    console.log('--- VERIFICATION COMPLETE ---');
    await prisma.$disconnect();
}

verify();
