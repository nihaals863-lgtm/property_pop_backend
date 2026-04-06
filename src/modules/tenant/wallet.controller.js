const prisma = require('../../config/prisma');

exports.getWallet = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        let wallet = await prisma.wallet.findUnique({
            where: { userId },
            include: {
                wallettransactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            console.error(`ERROR: User ${userId} not found in database!`);
            return res.status(404).json({ message: 'User account not found' });
        }

        if (!wallet) {
            console.log(`DEBUG: Creating new wallet for user ${userId}...`);
            wallet = await prisma.wallet.create({
                data: {
                    userId,
                    balance: 0.00
                },
                include: {
                    wallettransactions: true
                }
            });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get Wallet Error - Detailed:', error);
        res.status(500).json({ message: 'Server error fetching wallet', error: error.message });
    }
};

exports.addFunds = async (req, res) => {
    try {
        console.log('DEBUG: req.user:', JSON.stringify(req.user));
        const userId = parseInt(req.user.id);
        console.log('DEBUG: Parsed userId:', userId);
        const { amount, method } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        let wallet = await prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) {
            const userExists = await prisma.user.findUnique({ where: { id: userId } });
            if (!userExists) {
                console.error(`ERROR: User ${userId} not found in database!`);
                return res.status(404).json({ message: 'User account not found' });
            }
            
            console.log(`DEBUG: Creating new wallet for user ${userId}...`);
            wallet = await prisma.wallet.create({
                data: { userId, balance: 0.00 }
            });
        }

        const updatedWallet = await prisma.wallet.update({
            where: { userId },
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
            },
            include: {
                wallettransactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        res.json(updatedWallet);
    } catch (error) {
        console.error('Add Funds Error - Detailed:', error);
        res.status(500).json({ message: 'Server error adding funds', error: error.message });
    }
};

exports.withdraw = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const { amount, method } = req.body;

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const wallet = await prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

        if (parseFloat(wallet.balance.toString()) < Number(amount)) {
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        const updatedWallet = await prisma.wallet.update({
            where: { userId },
            data: {
                balance: { decrement: Number(amount) },
                wallettransactions: {
                    create: {
                        type: 'WITHDRAW',
                        amount: Number(amount),
                        method: method || 'BANK',
                        status: 'SUCCESS'
                    }
                }
            },
            include: {
                wallettransactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        res.json(updatedWallet);
    } catch (error) {
        console.error('Withdraw Error:', error);
        res.status(500).json({ message: 'Server error withdrawing funds', error: error.message });
    }
};

exports.transfer = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const { amount, recipient } = req.body;

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }
        if (!recipient) {
            return res.status(400).json({ message: 'Recipient is required' });
        }

        await prisma.$transaction(async (tx) => {
            const senderWallet = await tx.wallet.findUnique({ where: { userId } });
            if (!senderWallet || parseFloat(senderWallet.balance.toString()) < Number(amount)) {
                throw new Error('Insufficient funds');
            }

            // Find valid recipient - Robust Lookup
            const recipientTrimmed = recipient.trim();
            let recipientUser;

            // 1. Try Email Lookup (findFirst for case-insensitivity check)
            recipientUser = await tx.user.findFirst({
                where: {
                    email: recipientTrimmed
                }
            });

            // 2. Try ID Lookup if recipient is a number and email lookup failed
            if (!recipientUser && /^\d+$/.test(recipientTrimmed)) {
                recipientUser = await tx.user.findUnique({
                    where: { id: parseInt(recipientTrimmed) }
                });
            }

            if (!recipientUser) throw new Error('Recipient user not found (Checked Email & Account #)');

            if (recipientUser.id === userId) throw new Error('Cannot transfer to yourself');

            // Deduct from Sender
            await tx.wallet.update({
                where: { userId },
                data: {
                    balance: { decrement: Number(amount) },
                    wallettransactions: {
                        create: {
                            type: 'TRANSFER_OUT',
                            amount: Number(amount),
                            method: 'WALLET', // sending via wallet
                            status: 'SUCCESS'
                        }
                    }
                }
            });

            // Add to Recipient
            // Ensure recipient wallet exists
            let recipientWallet = await tx.wallet.findUnique({ where: { userId: recipientUser.id } });
            if (!recipientWallet) {
                recipientWallet = await tx.wallet.create({ data: { userId: recipientUser.id, balance: 0.00 } });
            }

            await tx.wallet.update({
                where: { userId: recipientUser.id },
                data: {
                    balance: { increment: Number(amount) },
                    wallettransactions: {
                        create: {
                            type: 'TRANSFER_IN',
                            amount: Number(amount),
                            method: 'WALLET',
                            status: 'SUCCESS'
                        }
                    }
                }
            });
        });

        res.json({ success: true, message: 'Transfer successful' });

    } catch (error) {
        console.error('Transfer Error:', error);
        res.status(400).json({ message: error.message || 'Transfer failed', error: error.message });
    }
};
