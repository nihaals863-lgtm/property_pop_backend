require('dotenv').config();
const paypalProvider = require('./src/providers/PaypalProvider');

(async () => {
    try {
        const order = await paypalProvider.createOrder(26.99, 'USD');
        console.log("Success:", order);
    } catch (e) {
        console.error("Error:", e.message);
    }
})();
