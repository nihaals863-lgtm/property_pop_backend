const prisma = require('../config/prisma');

/**
 * Accounting Service
 * Manages the financial ledger and ensures data integrity.
 */
class AccountingService {
    /**
     * Record a transaction in the ledger.
     * Should usually be called within a prisma.$transaction.
     */
    async recordTransaction(txData, txClient = prisma) {
        const {
            date,
            description,
            type,
            amount,
            invoiceId,
            unitId,
            propertyId,
            ownerId,
            idempotencyKey,
            propertyAddress,
            unitNumber
        } = txData;

        // Fetch last balance to calculate new balance
        const lastTx = await txClient.transaction.findFirst({
            orderBy: { id: 'desc' }
        });
        const prevBalance = lastTx ? parseFloat(lastTx.balance) : 0;
        const newBalance = prevBalance + parseFloat(amount);

        return await txClient.transaction.create({
            data: {
                date: date || new Date(),
                description,
                type,
                amount: parseFloat(amount),
                balance: newBalance,
                status: 'SUCCESS',
                invoice: invoiceId && !isNaN(parseInt(invoiceId)) ? { connect: { id: parseInt(invoiceId) } } : undefined,
                propertyId: propertyId ? parseInt(propertyId) : undefined,
                ownerId: ownerId ? parseInt(ownerId) : undefined,
                idempotencyKey,
                propertyAddress,
                unitNumber
            }
        });
    }

    /**
     * Reconcile an invoice payment.
     * Marks invoice as paid and creates a ledger entry atomically.
     */
    async processInvoicePayment(invoiceId, paymentData) {
        const id = typeof invoiceId === 'string' ? parseInt(invoiceId) : invoiceId;
        if (!id || isNaN(id)) {
            throw new Error(`Invalid Invoice ID for reconciliation: ${invoiceId}`);
        }

        return await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({
                where: { id },
                include: { unit: { include: { property: true } } }
            });

            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status === 'paid') return invoice;

            const amountPaid = paymentData.amountPaid || invoice.amount;

            // 1. Update Invoice status and confirmation
            const updatedInvoice = await tx.invoice.update({
                where: { id },
                data: {
                    status: 'paid',
                    paidAt: new Date(),
                    paymentMethod: paymentData.method,
                    totalPaid: parseFloat(amountPaid),
                    confirmationStatus: 'Confirmed',
                    confirmedAt: new Date()
                }
            });

            // 2. [NEW] Auto-Activate DRAFT Lease if applicable
            // If the tenant has a DRAFT lease for this unit, make it ACTIVE
            await tx.lease.updateMany({
                where: {
                    tenantId: invoice.tenantId,
                    unitId: invoice.unitId,
                    status: 'DRAFT'
                },
                data: { status: 'Active' }
            });

            // 3. Record Rent Income for Owner in Ledger
            await this.recordTransaction({
                description: `Rent Payment for Invoice ${invoice.invoiceNo}`,
                type: 'Income',
                amount: paymentData.rentCovered || invoice.rent,
                invoiceId: invoice.id,
                propertyId: invoice.unit.propertyId,
                ownerId: invoice.unit.property.ownerId,
                idempotencyKey: `${paymentData.idempotencyKey}-RENT`,
                propertyAddress: paymentData.propertyAddress,
                unitNumber: paymentData.unitNumber
            }, tx);

            // 4. Record Service Fee Income for Landlord (previously Admin)
            if (paymentData.serviceFee > 0) {
                await this.recordTransaction({
                    description: `Monthly Service Fee ($14.99) for Invoice ${invoice.invoiceNo}`,
                    type: 'Income',
                    amount: paymentData.serviceFee,
                    invoiceId: invoice.id,
                    propertyId: invoice.unit.propertyId,
                    ownerId: invoice.unit.property.ownerId, // Landlord instead of Admin
                    idempotencyKey: `${paymentData.idempotencyKey}-FEE`,
                    propertyAddress: paymentData.propertyAddress,
                    unitNumber: paymentData.unitNumber
                }, tx);
            }

            return updatedInvoice;
        });
    }
}

module.exports = new AccountingService();
