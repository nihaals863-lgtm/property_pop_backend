const axios = require('axios');
(async () => {
    try {
        const res = await axios.post('http://localhost:5000/api/tenant/paypal/create-order', {
            invoiceId: 'custom',
            propertyAddress: "32",
            unitNumber: "",
            isManualPay: true,
            amount: 12,
            note: "dfgh"
        }, {
            headers: {
                Authorization: "Bearer invalid" // Or something? We need to authenticate.
            }
        });
        console.log(res.data);
    } catch(err) {
        console.error(err.response ? err.response.data : err.message);
    }
})();
