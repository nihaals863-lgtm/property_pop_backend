const prisma = require('../../config/prisma');

// GET /api/tenant/lease
exports.getLeaseDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('Fetching lease for userId:', userId);

        const tenant = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                leases: {
                    include: {
                        unit: {
                            include: {
                                property: {
                                    include: { owner: true }
                                }
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        console.log('Tenant found with ALL leases:', JSON.stringify(tenant, null, 2));

        if (!tenant || !tenant.leases || tenant.leases.length === 0) {
            console.log('No leases found for tenant:', userId);
            return res.status(404).json({ message: 'No lease found for this account' });
        }

        // Filter for relevant leases in JS if needed, or just take the latest
        // Find the most recent active/relevant lease
        const lease = tenant.leases.find(l => ['Active', 'Moved'].includes(l.status)) || tenant.leases.find(l => l.status === 'DRAFT') || tenant.leases[0];

        const owner = lease.unit.property.owner;

        const startDate = lease.startDate || lease.createdAt;
        const endDate = lease.endDate || new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1));
        let rentValue = lease.monthlyRent || lease.unit?.rentAmount || 0;
        
        // Final fallback: Check latest invoice if rent is still zero
        if (parseFloat(rentValue) === 0) {
            const latestInvoice = await prisma.invoice.findFirst({
                where: { tenantId: userId },
                orderBy: { createdAt: 'desc' }
            });
            if (latestInvoice && latestInvoice.rent) {
                rentValue = latestInvoice.rent;
            }
        }
        
        const rent = parseFloat(rentValue);

        res.json({
            id: `LEASE-${new Date(startDate).getFullYear()}-${lease.id}`,
            property: lease.unit.property.name,
            unit: lease.unit.name,
            address: lease.unit.property.address,
            monthlyRent: rent,
            startDate: startDate,
            endDate: endDate,
            status: lease.status,
            deposit: 14.99, // Showing Service Fee as per user flow
            supportContact: {
                name: owner?.name || 'Property Management',
                email: owner?.email || 'support@rental.com',
                phone: owner?.phone || 'N/A'
            }
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};
