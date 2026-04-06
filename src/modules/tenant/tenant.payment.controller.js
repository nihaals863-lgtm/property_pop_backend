const paymentService = require('../../services/PaymentService');
const prisma = require('../../config/prisma');

/**
 * Tenant Payment Controller
 * Production Implementation: Strictly validates against DB, uses Services.
 */
exports.processPayment = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const { invoiceId, paymentMethod, method, propertyAddress, unitNumber, isManualPay, totalAmount, serviceFee } = req.body;
        console.log(`WALLET Process Payment: ID=${invoiceId}, Manual=${isManualPay}, Amount=${totalAmount}`);

        const idempotencyKey = req.headers['x-idempotency-key'] || `IDEM-${userId}-${invoiceId || 'manual'}-${Date.now()}`;
        const parsedInvoiceId = parseInt(invoiceId);

        const isManual = isManualPay === true || String(isManualPay) === 'true' || !invoiceId || invoiceId === 'custom' || String(invoiceId).toLowerCase() === 'custom' || isNaN(parsedInvoiceId);

        if (isManual) {
            const actualMethod = method || paymentMethod || 'wallet';
            const isWalletPayment = actualMethod.toLowerCase() === 'wallet';

            if (isWalletPayment) {
                const wallet = await prisma.wallet.findUnique({ where: { userId } });
                if (!wallet) throw new Error('Wallet not found');
                if (parseFloat(wallet.balance) < parseFloat(totalAmount)) throw new Error('Insufficient balance');
            }

            // Try to find lease for auto-invoice
            const lease = await prisma.lease.findFirst({
                where: { tenantId: userId },
                include: { unit: { include: { property: true } } }
            });

            await prisma.$transaction(async (tx) => {
                if (isWalletPayment) {
                    const wallet = await tx.wallet.findUnique({ where: { userId } });
                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: {
                            balance: { decrement: parseFloat(totalAmount) },
                            wallettransactions: {
                                create: {
                                    type: 'RENT_PAYMENT',
                                    amount: parseFloat(totalAmount),
                                    method: 'WALLET',
                                    status: 'SUCCESS'
                                }
                            }
                        }
                    });
                }

                if (lease) {
                    // Create invoice for history
                    const newInvoice = await tx.invoice.create({
                        data: {
                            invoiceNo: `INV-${Date.now()}`,
                            tenantId: userId,
                            unitId: lease.unitId,
                            month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
                            amount: parseFloat(totalAmount),
                            rent: parseFloat(totalAmount) - 14.99,
                            serviceFees: 14.99,
                            status: actualMethod.toLowerCase() === 'bank_transfer' ? 'pending' : 'paid',
                            paidAt: new Date(),
                            paymentMethod: actualMethod.toUpperCase(),
                            totalPaid: parseFloat(totalAmount),
                            confirmationStatus: actualMethod.toLowerCase() === 'bank_transfer' ? 'Pending' : 'Confirmed',
                            confirmedAt: new Date(),
                            dueDate: new Date()
                        }
                    });

                    const accountingService = require('../../services/AccountingService');
                    await accountingService.recordTransaction({
                        description: `Manual Rent Payment - ${actualMethod.toUpperCase()} (Auto-Invoice)`,
                        type: 'Income',
                        amount: totalAmount,
                        invoiceId: newInvoice.id,
                        propertyId: lease.unit.propertyId,
                        ownerId: lease.unit.property.ownerId,
                        idempotencyKey,
                        propertyAddress,
                        unitNumber
                    }, tx);
                } else {
                    const accountingService = require('../../services/AccountingService');
                    await accountingService.recordTransaction({
                        description: `Manual Rent Payment - ${actualMethod.toUpperCase()}`,
                        type: 'Income',
                        amount: totalAmount,
                        idempotencyKey,
                        propertyAddress,
                        unitNumber
                    }, tx);
                }
            });

            return res.json({
                success: true,
                message: 'Manual payment processed and recorded successfully',
                transactionId: `MAN-${Date.now()}`
            });
        }

        // Call PaymentService for standard invoice flow
        const result = await paymentService.collectPayment(userId, invoiceId, idempotencyKey, method || paymentMethod, propertyAddress, unitNumber);

        res.json({
            success: true,
            message: 'Payment processed successfully',
            result
        });

    } catch (e) {
        console.error('Wallet Process Error:', e.message);
        res.status(500).json({ message: e.message });
    }
};

exports.initiatePaypalPayment = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const { invoiceId, amount, isManualPay } = req.body;
        console.log(`initiatePaypalPayment: ID=${invoiceId}, manual=${isManualPay}`);
        console.log('--- DEPLOYMENT VERIFICATION: Version V2 with Manual Fix active ---');
        
        let rentAmount = 0;
        let serviceFee = 14.99;
        let finalAmount = 14.99;

        const parsedInvoiceId = parseInt(invoiceId);

        if (!invoiceId || invoiceId === 'custom' || isManualPay || isNaN(parsedInvoiceId)) {
            // Manual flow: use the provided amount
            rentAmount = parseFloat(amount || 0);
            finalAmount = rentAmount + serviceFee;
        } else {
            // Standard flow: fetch invoice from DB
            const invoice = await prisma.invoice.findUnique({
                where: { id: parsedInvoiceId }
            });
            if (!invoice) throw new Error('Invoice not found');
            rentAmount = parseFloat(invoice.rent);
            finalAmount = rentAmount + 14.99;
        }

        const paypalProvider = require('../../providers/PaypalProvider');
        const order = await paypalProvider.createOrder(finalAmount, 'USD');

        res.json(order);
    } catch (e) {
        console.error('Paypal Initiate Error:', e.message);
        res.status(500).json({ message: e.message });
    }
};

exports.confirmPaypalPayment = async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        const { orderId, invoiceId, propertyAddress, unitNumber, paymentMethod, amount, isManualPay } = req.body;

        const paypalProvider = require('../../providers/PaypalProvider');
        const capture = await paypalProvider.captureOrder(orderId);

        if (capture.success) {
            const idempotencyKey = `PAYPAL-${orderId}-U${userId}`;
            console.log(`Processing PayPal Capture: ID=${invoiceId}, Manual=${isManualPay}`);
            const parsedInvoiceId = parseInt(invoiceId);
            
            if (!invoiceId || invoiceId === 'custom' || isManualPay === true || String(isManualPay) === 'true' || String(invoiceId).toLowerCase() === 'custom' || isNaN(parsedInvoiceId)) {
                // Try to find the tenant's lease to create a proper invoice record
                const lease = await prisma.lease.findFirst({
                    where: { tenantId: userId },
                    include: { unit: { include: { property: true } } }
                });

                if (lease) {
                    // Create an invoice record automatically
                    const newInvoice = await prisma.invoice.create({
                        data: {
                            invoiceNo: `INV-${Date.now()}`,
                            tenantId: userId,
                            unitId: lease.unitId,
                            month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
                            amount: amount,
                            rent: parseFloat(amount) - 14.99,
                            serviceFees: 14.99,
                            status: 'paid', // Mark as paid immediately since PayPal succeeded
                            paidAt: new Date(),
                            paymentMethod: 'PAYPAL',
                            totalPaid: parseFloat(amount),
                            confirmationStatus: 'Confirmed',
                            confirmedAt: new Date(),
                            dueDate: new Date()
                        }
                    });

                    // Update local invoiceId for subsequent steps if needed
                    // But here we can directly use PaymentService for better recording
                    await paymentService.collectPayment(userId, newInvoice.id, idempotencyKey, paymentMethod || 'paypal', propertyAddress, unitNumber);
                } else {
                    // Fallback to direct transaction without invoice if no lease found
                    const accountingService = require('../../services/AccountingService');
                    await accountingService.recordTransaction({
                        description: `Manual Rent Payment - PayPal`,
                        type: 'Income',
                        amount: amount,
                        idempotencyKey,
                        propertyAddress,
                        unitNumber
                    });
                }
            } else {
                // Invoice Payment Recording
                await paymentService.collectPayment(userId, invoiceId, idempotencyKey, paymentMethod || 'paypal', propertyAddress, unitNumber);
            }

            res.json({
                success: true,
                message: 'Payment confirmed and recorded',
                transactionId: capture.transactionId
            });
        }

    } catch (e) {
        console.error('Paypal Confirm Error:', e.message);
        res.status(500).json({ message: e.message });
    }
};
