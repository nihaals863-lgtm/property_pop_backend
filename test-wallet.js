const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const userId = 1; // Assuming there is a user with ID 1
    const amount = 100;
    const method = 'DEBIT_CARD';

    console.log(`Searching for wallet for user ${userId}...`);
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      console.log('Wallet not found, creating one...');
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0.00 }
      });
    }

    console.log(`Updating wallet ${wallet.id}...`);
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: Number(amount) },
        wallettransactions: {
          create: {
            type: 'ADD_FUNDS',
            amount: Number(amount),
            method: method || 'DEBIT_CARD',
            status: 'SUCCESS'
          }
        }
      }
    });
    console.log('Update Successful:', updatedWallet);
  } catch (error) {
    console.error('Error detail:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
