const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal Provider
 * Uses PayPal Checkout Node.js SDK (v2 Orders API)
 */
class PaypalProvider {
    constructor() {
        let clientId = process.env.PAYPAL_CLIENT_ID || '';
        let clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        let mode = process.env.PAYPAL_MODE || 'live';

        // Clean up common issues like accidentally copied quotes or trailing spaces
        clientId = clientId.replace(/['"]+/g, '').trim();
        clientSecret = clientSecret.replace(/['"]+/g, '').trim();
        mode = mode.replace(/['"]+/g, '').trim();

        if (!clientId || !clientSecret) {
            console.warn('⚠️ WARNING: PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing in environment variables.');
        }

        console.log(`[PayPal] Initializing in ${mode.toUpperCase()} mode. Client ID starts with: ${clientId.substring(0, 5)}...`);

        if (mode === 'live') {
            this.environment = new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
        } else {
            this.environment = new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
        }

        this.client = new checkoutNodeJssdk.core.PayPalHttpClient(this.environment);
    }

    /**
     * Create a PayPal Order
     */
    async createOrder(amount, currency = 'USD') {
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: currency,
                    value: Number(amount).toFixed(2)
                }
            }]
        });

        try {
            const response = await this.client.execute(request);
            return {
                orderId: response.result.id,
                status: response.result.status
            };
        } catch (err) {
            console.error('PayPal CreateOrder Error Detail:', JSON.stringify(err, null, 2));
            throw new Error(`PayPal CreateOrder failed: ${err.message}`);
        }
    }

    /**
     * Capture a PayPal Order
     */
    async captureOrder(orderId) {
        const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});

        try {
            const response = await this.client.execute(request);
            return {
                success: true,
                transactionId: response.result.purchase_units[0].payments.captures[0].id,
                status: response.result.status
            };
        } catch (err) {
            console.error('PayPal Capture Order Error:', err.message);
            throw new Error('Failed to capture PayPal payment');
        }
    }
}

module.exports = new PaypalProvider();
