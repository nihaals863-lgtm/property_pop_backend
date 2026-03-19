# PayPal Payment Testing Guide (Sandbox) - Hindi/English Mix

Agar aapko check karna hai ki payment gateway sahi se kaam kar raha hai ya nahi, bina asli paise kharch kiye, toh aap **PayPal Sandbox** use kar sakte hain. Yeh ek fake environment hai jahan aap nakli account aur credit cards se testing kar sakte hain.

## Step 1: Sandbox Mode Enable Karein

Sabse pehle aapko apni `.env` file mein settings badalni hogi taki system ko pata chale ki hum testing kar rahe hain.

1. Apni `.env` file ko open karein.
2. "live" configuration ko comment kar dein (uupar `#` laga kar).
3. "sandbox" configuration ko uncomment karein.

Aapka `.env` file kuch aisa dikhna chahiye:

```env
# PayPal Configuration (live) - Isse abhi band kar dein
# PAYPAL_CLIENT_ID=AZv9Qxg...
# PAYPAL_CLIENT_SECRET=EDpWg...
# PAYPAL_MODE=live

# PayPal Configuration (sandbox) - Isse chalu karein
PAYPAL_CLIENT_ID=AfpPOA0Y1kLVsqXy7LUFEnkLrU4GFoSrvN-2Z1cQTU98OgqZyUCTJC7ONU5pCis3XV4qyBADRPIYxwZx
PAYPAL_CLIENT_SECRET=ELWaopozzb-FM0WPUdRoTzw4DA7lFob5oFpBXejje8sfw14WJUzuyu4KHAj0GsI7uIdPsf7ZkgbApFvt
PAYPAL_MODE=sandbox
```

## Step 2: Sandbox Accounts Banayein

Testing ke liye aapko do accounts ki zaroorat hogi:
1. **Business Account**: Yeh aapka account hoga jisme paise aayenge.
2. **Personal Account**: Yeh ek dummy customer/tenant ka account hoga jisse aap paise bhejenge.

### Accounts kaise banayein:
1. [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/accounts) par jayein.
2. Apne asli PayPal account se login karein.
3. **Testing Tools** > **Sandbox Accounts** mein aapko pehle se bane accounts milenge.
4. Aap ek naya "Personal" account bhi bana sakte hain. Payment karte waqt isi account ka email aur password use karein.

## Step 3: Test Credit Cards Use Karein

Agar aap bina PayPal login ke "Debit/Credit Card" option test karna chahte hain, toh in nakli card numbers ka use karein:

> [!TIP]
> Aur bhi test cards aapko yahan mil jayenge: [PayPal Test Cards](https://developer.paypal.com/docs/checkout/standard/integrate/test/#test-card-generator).

| Card Type | Card Number | Expiry Date | CVV |
| :--- | :--- | :--- | :--- |
| Visa | `4111 1111 1111 1111` | Koi bhi future date | `123` |
| Mastercard | `5105 1051 0510 5105` | Koi bhi future date | `123` |

## Step 4: Payments Check Karein

Sandbox mode mein ki gayi transactions aapke asli PayPal account mein nahi dikhengi. Unhe dekhne ke liye:

1. [sandbox.paypal.com](https://www.sandbox.paypal.com/) par jayein.
2. Apne **Sandbox Business Account** se login karke check karein ki paise aaye ya nahi.
3. **Sandbox Personal Account** se login karke dekhein ki transaction history kya hai.

---
**Zaroori Baat (Warning):** Kabhi bhi `PAYPAL_MODE=sandbox` hone par apna asli credit card ya asli PayPal account use na karein, woh fail ho jayega. Sirf test accounts aur cards hi use karein.
