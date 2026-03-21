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

        const formatted = invoices.map(inv => {
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

        res.json(formatted);
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

        // 2. No invoice yet, find or create lease to create one
        let activeLease;
        let rentAmount;

            // a. Check for DRAFT leases
            const draftLease = await prisma.lease.findFirst({
                where: { tenantId: userId, status: 'DRAFT' },
                include: { unit: true }
            });
            
            if (draftLease) {
                console.log(`DEBUG: Found draft lease ${draftLease.id} for tenant ${userId}`);
                activeLease = draftLease;
            } else {
                // b. Check for Invitations to this email
                const invitation = await prisma.invitation.findFirst({
                    where: { email: req.user.email, status: 'Pending' }
                });

                let targetUnitId = null;
                let monthlyRent = 0;

                if (invitation) {
                    console.log(`DEBUG: Found pending invitation from owner ${invitation.invitedBy}`);
                    // Find first available unit of this owner
                    const firstUnit = await prisma.unit.findFirst({
                        where: { property: { ownerId: invitation.invitedBy } }
                    });
                    if (firstUnit) {
                        targetUnitId = firstUnit.id;
                        monthlyRent = parseFloat(firstUnit.rentAmount) || 1000; // Fallback rent
                    }
                }

                // c. Global Fallback (Truly uninvited / no landlord found)
                if (!targetUnitId) {
                    console.log(`DEBUG: No invitation found. Using global fallback unit.`);
                    const fallbackUnit = await prisma.unit.findFirst();
                    if (fallbackUnit) {
                        targetUnitId = fallbackUnit.id;
                        monthlyRent = parseFloat(fallbackUnit.rentAmount) || 1000;
                    }
                }

                if (!targetUnitId) {
                    return res.status(404).json({ message: 'No available units found to initiate payment.' });
                }

                // d. Create a DRAFT lease automatically
                console.log(`DEBUG: Auto-creating DRAFT lease for unit ${targetUnitId}`);
                activeLease = await prisma.lease.create({
                    data: {
                        tenantId: userId,
                        unitId: targetUnitId,
                        status: 'DRAFT',
                        monthlyRent: monthlyRent.toString(),
                        startDate: new Date(),
                        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                    },
                    include: { unit: true }
                });
            }

        if (!activeLease) {
            return res.status(404).json({ message: 'No active lease found. Please contact your landlord.' });
        }

        rentAmount = parseFloat(activeLease.monthlyRent || activeLease.unit.rentAmount) || 1000;
        const SERVICE_FEE = 14.99;
        const totalAmount = rentAmount + SERVICE_FEE;

        // 3. Create invoice automatically
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
