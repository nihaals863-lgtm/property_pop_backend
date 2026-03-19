const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testLookup(recipient) {
    console.log(`Testing lookup for: "${recipient}"`);
    const recipientTrimmed = recipient.trim();
    let recipientUser;

    // 1. Try Email Lookup
    recipientUser = await prisma.user.findFirst({
        where: {
            email: recipientTrimmed
        }
    });

    // 2. Try ID Lookup if recipient is a number and email lookup failed
    if (!recipientUser && /^\d+$/.test(recipientTrimmed)) {
        recipientUser = await prisma.user.findUnique({
            where: { id: parseInt(recipientTrimmed) }
        });
    }

    if (recipientUser) {
        console.log(`✅ Found: ${recipientUser.name} (${recipientUser.email}) ID: ${recipientUser.id}`);
    } else {
        console.log(`❌ Not found`);
    }
}

async function runTests() {
    try {
        // Test with existing seed user
        await testLookup('tenant@property.com');
        await testLookup(' tenant@property.com '); // with spaces
        await testLookup('1'); // by ID (Admin)
        await testLookup('2'); // by ID (Owner)
        await testLookup('nonexistent@email.com');
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

runTests();
