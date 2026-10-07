# TutorHub • Stripe Production Setup Guide

A complete step-by-step checklist to take Stripe Connect, Billing, and Webhooks live for **TutorHub**.

---

> [!WARNING]
> **Switch to Live Mode**: Ensure the **Test mode** toggle at the top-right of [dashboard.stripe.com](https://dashboard.stripe.com) is turned **OFF** before following these steps. All keys, products, and endpoints below must be created in **Live Mode**.

---

## Step 1: Activate Platform Business & Verification

To process real payments and disburse funds to tutors, Stripe requires verified platform credentials:

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com) and switch to **Live mode**.
2. Complete **Account Activation**:
   - **Business Details:** Legal business entity, company registration/tax ID (EIN, VAT, GST, PAN), and business address.
   - **Bank Account:** Platform bank account for receiving subscription revenue (TutorHub Pro).
   - **Identity Verification:** Upload government ID for the authorized platform representative.
3. Configure your **Platform Profile** in **Settings ⚙️ → Connect → Platform profile**:
   - **Branding:** Upload platform icon, logo, and brand color (shown during tutor onboarding).
   - **Support:** Provide support email and public domain (`https://yourdomain.com`).

---

## Step 2: Enable Accounts v1 Support & Connect Settings

TutorHub creates Express accounts programmatically via API (`stripe.accounts.create({ type: "express" })`):

1. Open **Settings ⚙️ → Developers → API policies**:
   - Direct link: [dashboard.stripe.com/settings/developers/api-policies/feat_accounts_v1_support](https://dashboard.stripe.com/settings/developers/api-policies/feat_accounts_v1_support)
2. Click the edit pencil on **Accounts v1 support** and set to **Enabled**.
3. Under **Settings ⚙️ → Connect**:
   - Verify **Express accounts** are active.
   - Verify business model is set to **Direct charges** (students pay tutors directly; platform takes 0% commission on lessons).

---

## Step 3: Generate Live API Keys

1. Navigate to **Developers → API keys** (in Live mode).
2. Copy the **Publishable key** (`pk_live_...`).
3. Click **Create secret key**:
   - **Name:** `TutorHub Production Server`
   - **Permissions:** Choose **Full access** (required for creating Connect accounts, onboarding links, and managing subscriptions).
4. Copy the secret key (`sk_live_...`).

---

## Step 4: Create the Live "TutorHub Pro" Subscription & Customer Portal

1. Open **Product catalogue → Add product** (in Live mode):
   - **Name:** `TutorHub Pro`
   - **Description:** `Unlimited bookings, custom domain, and priority listing`
   - **Pricing model:** Flat fee • **Recurring**
   - **Price:** Enter your monthly price (e.g., `€19.00` or `$19.00`)
   - **Billing period:** Monthly
2. Click **Save product**.
3. Open the product details and copy the **Price ID** (`price_...`).
4. **Activate the Customer Portal**:
   - Go to **Settings ⚙️ → Billing → Customer portal**.
   - Enable options for tutors to:
     - Cancel subscriptions
     - Update payment methods
     - View invoice history
   - Click **Save changes / Activate**.

---

## Step 5: Configure Production Webhooks

In production, Stripe sends HTTP POST requests directly to your live production domain.

1. Go to **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** `https://yourdomain.com/api/webhooks/stripe`
3. **Listen to:** Select **Events on connected accounts** (or create two endpoints: one for your platform account and one for connected accounts).
   > [!IMPORTANT]
   > Student booking payments occur on the tutor's Connected account. Your webhook endpoint **must** listen to Connected accounts to confirm bookings!

4. **Select the following 6 events:**

| Event | TutorHub Handler Action |
|---|---|
| `checkout.session.completed` | Fulfills booking / package payment, or activates Pro plan for tutor |
| `checkout.session.expired` | Fails expired payment session and frees the booked slot |
| `charge.refunded` | Marks lesson payment as refunded in database |
| `account.updated` | Detects when tutor finishes Stripe onboarding & enables charges |
| `customer.subscription.updated` | Updates active / past-due subscription status |
| `customer.subscription.deleted` | Downgrades tutor to Free tier upon subscription cancellation |

5. Click **Add endpoint**.
6. Reveal and copy the **Signing secret** (`whsec_...`).

---

## Step 6: Production Environment Variables Reference

Add these variables to your production host (e.g. Vercel, Railway, AWS, Docker):

```env
# Public domain
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Stripe Live Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
```

---

## Step 7: Pre-Launch Verification Checklist

- [ ] **Tutor Onboarding:** Register a real tutor account, click **Connect Stripe**, and complete real Express onboarding.
- [ ] **Test Real Charge:** Book a $1.00 / €1.00 lesson with a real credit/debit card and verify booking confirms.
- [ ] **Test Refund:** In the Stripe Dashboard under Payments, issue a refund and confirm status updates in TutorHub.
- [ ] **Monitor Webhooks:** In Stripe Dashboard → Developers → Webhooks, verify that all delivered events show status `200 OK`.
