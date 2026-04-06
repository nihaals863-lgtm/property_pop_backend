const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

exports.authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user exists in DB
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            console.error(`AUTH ERROR: User ${decoded.id} in token not found in DB`);
            return res.status(401).json({ message: 'User not found, please login again' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return res.status(401).json({ message: 'Invalid token: ' + err.message });
    }
};

exports.authorize = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role && req.user.role !== 'ADMIN') { // Admin can access all usually, but stick to role
            if (req.user.role !== role) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }
        next();
    };
};

exports.authenticateDownload = (req, res, next) => {
    const token = req.query.token;
    if (!token) return res.status(401).json({ message: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return res.status(401).json({ message: 'Invalid token: ' + err.message });
    }
};
