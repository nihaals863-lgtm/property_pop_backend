const prisma = require('../../config/prisma');

// GET /api/tenant/invoices
exports.getInvoices = async (req, res) => {
    try {
        const userId = req.user.id;

        const invoices = await prisma.invoice.findMany({
            where: {
                tenantId: userId
            },
            orderBy: { createdAt: 'desc' },
            include: { unit: true }
        });

        const orphanTransactions = await prisma.transaction.findMany({
            where: {
                invoiceId: null,
                OR: [
                    { idempotencyKey: { contains: `IDEM-${userId}-` } },
                    { idempotencyKey: { contains: `-U${userId}` } }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedInvoices = invoices.map(inv => {
            const s = inv.status.toLowerCase();
            let statusDisplay = 'Due';
            if (s === 'paid') statusDisplay = 'Paid';
            else if (s === 'overdue') statusDisplay = 'Due'; // Keep it simple for tenant

            return {
                id: inv.id,
                dbId: inv.id, // Keep for compatibility
                invoiceNo: inv.invoiceNo,
                month: inv.month,
                // Return amount as string for frontend parsing (remove $ and formatting)
                amount: inv.amount.toString(),
                rent: inv.rent.toString(),
                serviceFees: inv.serviceFees ? inv.serviceFees.toString() : '0',
                serviceFee: inv.platformFee ? inv.platformFee.toString() : '0',
                status: statusDisplay,
                confirmationStatus: inv.confirmationStatus,
                confirmedAt: inv.confirmedAt,
                // Return raw dates for frontend formatting
                dueDate: inv.dueDate,
                paidAt: inv.paidAt,
                createdAt: inv.createdAt,
                // Derived date for legacy support if needed, but frontend uses dueDate
                date: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : inv.createdAt.toISOString().split('T')[0],
                unit: inv.unit ? inv.unit.name : 'N/A'
            };
        });

        const formattedOrphans = orphanTransactions.map(tx => {
            return {
                id: `tx-${tx.id}`,
                dbId: null,
                invoiceNo: `MANUAL-${tx.id}`,
                month: new Date(tx.createdAt).toLocaleString('default', { month: 'long', year: 'numeric' }),
                amount: tx.amount.toString(),
                rent: (parseFloat(tx.amount) - 14.99).toString(),
                serviceFees: '14.99',
                serviceFee: '14.99',
                status: 'Paid',
                confirmationStatus: 'Confirmed',
                confirmedAt: tx.createdAt,
                dueDate: tx.createdAt,
                paidAt: tx.createdAt,
                createdAt: tx.createdAt,
                date: new Date(tx.createdAt).toISOString().split('T')[0],
                unit: tx.propertyAddress ? `${tx.propertyAddress} ${tx.unitNumber || ''}` : 'Manual Entry'
            };
        });

        const allFormatted = [...formattedInvoices, ...formattedOrphans].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(allFormatted);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/tenant/invoices/mock (TESTING ONLY)
exports.createMockInvoice = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find tenant and unit
        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    where: { status: 'Active' },
                    include: { unit: true }
                }
            }
        });

        if (!tenant || tenant.leases.length === 0) {
            return res.status(400).json({ message: 'No active lease found' });
        }

        const lease = tenant.leases[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const monthStr = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

        const SERVICE_FEE = 14.99;
        const rentAmount = parseFloat(lease.monthlyRent || lease.unit.rentAmount);
        const totalAmount = rentAmount + SERVICE_FEE;

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNo: `INV-${Date.now()}`,
                tenantId: userId,
                unitId: lease.unitId,
                month: monthStr,
                amount: totalAmount,
                rent: rentAmount,
                serviceFees: SERVICE_FEE,
                dueDate: nextMonth,
                status: 'pending'
            }
        });

        res.json({ success: true, message: 'Mock invoice created', invoice });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Failed to create mock invoice' });
    }
};

// POST /api/tenant/invoices/:id/confirm
exports.confirmInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const invoice = await prisma.invoice.findFirst({
            where: {
                id: parseInt(id),
                tenantId: userId
            }
        });

        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.status.toLowerCase() !== 'paid') {
            return res.status(400).json({ message: 'Invoice must be paid before confirmation' });
        }

        const updated = await prisma.invoice.update({
            where: { id: parseInt(id) },
            data: {
                confirmationStatus: 'Confirmed',
                confirmedAt: new Date()
            }
        });

        res.json({ success: true, message: 'Payment acknowledgement confirmed', invoice: updated });
    } catch (e) {
        console.error('Confirm Invoice Error:', e);
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/tenant/invoices/current-month
exports.getCurrentMonthInvoice = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const monthStr = now.toLocaleString('default', { month: 'long', year: 'numeric' });

        // 1. Check if invoice already exists
        let invoice = await prisma.invoice.findFirst({
            where: {
                tenantId: userId,
                month: monthStr
            },
            include: { unit: true }
        });

        if (invoice) {
            return res.json({
                ...invoice,
                amount: invoice.amount.toString(),
                rent: invoice.rent.toString(),
                serviceFees: invoice.serviceFees.toString()
            });
        }

        // 2. If no invoice exists, we should ONLY create one if they have an ACTIVE lease
        let activeLease = await prisma.lease.findFirst({
            where: { tenantId: userId, status: 'Active' },
            include: { unit: true }
        });

        if (!activeLease) {
            return res.status(404).json({ message: 'No active lease or pending invoice found for the current month.' });
        }

        // 3. Create invoice automatically ONLY for the active lease
        const rentAmount = parseFloat(activeLease.monthlyRent || activeLease.unit.rentAmount) || 0;
        
        // Use a default or fetch from settings if needed, but for now we keep it consistent with schema
        const SERVICE_FEE = 14.99; 
        const totalAmount = rentAmount + SERVICE_FEE;

        invoice = await prisma.invoice.create({
            data: {
                invoiceNo: `INV-AUTO-${Date.now()}`,
                tenantId: userId,
                unitId: activeLease.unitId,
                month: monthStr,
                amount: totalAmount,
                rent: rentAmount,
                serviceFees: SERVICE_FEE,
                platformFee: SERVICE_FEE,
                dueDate: now,
                status: 'pending'
            },
            include: { unit: true }
        });

        res.json({
            ...invoice,
            amount: invoice.amount.toString(),
            rent: invoice.rent.toString(),
            serviceFees: invoice.serviceFees.toString()
        });

    } catch (e) {
        console.error('Get Current Invoice Error:', e);
        res.status(500).json({ message: 'Failed to access current month invoice' });
    }
};
