-- =====================================================================
-- Stripe Connect (Express) payouts.
-- Students pay the TUTOR directly (a Stripe "direct charge" on the tutor's connected account), so the
-- platform never holds tutor money. This migration only adds the two columns that remember the
-- tutor's connected account. (It also tidies up if an earlier wallet/escrow experiment was applied.)
-- =====================================================================

alter table public.tutor_profiles
  add column if not exists stripe_account_id text,                          -- acct_... of the tutor's Express account
  add column if not exists stripe_charges_enabled boolean not null default false;  -- true once Stripe says the account can take payments

-- Look tutors up by their Stripe account when webhooks arrive (account.updated)
create unique index if not exists tutor_profiles_stripe_account_idx
  on public.tutor_profiles (stripe_account_id) where stripe_account_id is not null;

-- Remove the wallet/payout objects if an earlier version created them (no-ops on a fresh database)
drop function if exists public.settle_payout(uuid, text, text, text);
drop function if exists public.create_payout_request(uuid, integer, integer, uuid, text, text);
drop function if exists public.wallet_apply(uuid, integer, integer);
drop table if exists public.payout_requests;
drop table if exists public.payout_methods;
drop table if exists public.wallet_transactions;
drop table if exists public.wallets;
