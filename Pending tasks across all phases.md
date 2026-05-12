Pending tasks across all phases
Consolidated from everything I flagged during build-out:

Tech debt (known, deferred)
#	Item	Where	Impact
1	Migration history broken	apps/api/prisma/migrations/20260410000000_tender_invitation_awarded_status and 3 sibling tender migrations	prisma migrate dev cannot run — only db push works. Blocking for prod deploys.
2	No ESLint config	repo-wide	pnpm lint fails (next lint prompts interactively)
3	Add-ons backend missing	schema has PlanAddon + AddonPurchase from Phase 1; no service routes / admin UI	Plans can't sell add-ons
4	Reminder cadence hardcoded	service-invoice-overdue.scheduler.ts — 3-day cooldown	Should live in PlatformConfig for runtime tuning
5	Magic-link evidence submission	/inv/[token] is read-only + Stripe pay only	Clients without accounts can pay via Stripe but not submit off-platform evidence
6	Webhook URL note in docs/Stripe Dashboard	docs say /api/v1/webhooks/stripe	Confirm actual Stripe Dashboard config matches
7	Bull Board / job inspection UI	none wired	If subscription/usage-reset/overdue cron jobs misbehave, no UI to debug
8	Recipient typeahead doesn't include task/order linkage	/invoices/create	Users still type task_id/order_id manually if they want references
Functional polish (low priority)
#	Item
9	Plan reorder uses 2 parallel PUTs (rare race window where both rows end up with same sort_order)
10	"Edit plan" admin handler re-fetches the full plans list to find one row (no GET /admin/subscriptions/plans/:id endpoint)
11	MRR calc only counts plans with AUD pricing — USD-only plans contribute 0
12	team_seats and consultant_profiles limits in useSubscription return {current: 0, limit} on the frontend (real count is computed server-side at check time only)
Create the admin — use the existing script, NOT raw SQL

# Default: admin@onys.local with auto-generated temp password
pnpm --filter @onys/api seed:admin

# Or custom:
ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" pnpm --filter @onys/api seed:admin
The script:

Creates a PLATFORM_ADMIN row with must_change_password=true
bcrypt-hashes the password at cost 12 (you can't do this in pure SQL)
Generates a complexity-compliant temp password if you don't pass ADMIN_TEMP_PASSWORD
Writes an audit log entry
Prints the email + password to the console — copy it before closing the terminal
If you genuinely need SQL (e.g., you can't run pnpm), here's a one-shot with a known bcrypt hash:


-- Password: ChangeMe1!
-- Bcrypt cost-12 hash; replace email/name as needed.
INSERT INTO "User" (
  id, email, password_hash, account_type, full_name,
  email_verified, email_verified_at, must_change_password,
  failed_login_count, created_at, updated_at
) VALUES (
  'cltest' || substr(md5(random()::text), 1, 18),
  'admin@onys.local',
  '$2b$12$m6rNQ3jK2O8xI/rJEEcVx.OERGCxAMP4FXcYIhcQ5bUOdHHYg8aLG',
  'PLATFORM_ADMIN',
  'Platform Admin',
  true,
  now(),
  true,
  0,
  now(),
  now()
);
Strongly prefer the seed script. Hardcoded bcrypt hashes in chat history are a security smell.

Yes, you can start testing — here's the order

# 0. One-time prereqs (verify each is running)
#    Postgres on :5432, Redis on :6379, .env has DATABASE_URL + REDIS_URL + JWT_SECRET + FRONTEND_URL
#    For Stripe: STRIPE_SECRET_KEY (sk_test_...) + STRIPE_WEBHOOK_SECRET

# 1. Create the admin account
pnpm --filter @onys/api seed:admin
# → copy the printed temp password

# 2. Seed the 8 subscription plans (and sync to Stripe if STRIPE_SECRET_KEY is set)
pnpm --filter @onys/api seed:subscriptions

# 3. Start the api (terminal 1)
pnpm --filter @onys/api dev

# 4. Start the workers (terminal 2) — handles email sending + cron schedulers
pnpm --filter @onys/workers dev

# 5. Start the web app (terminal 3)
pnpm --filter @onys/web dev

# 6. (Optional but recommended for subscription flow) Stripe webhook listener (terminal 4)
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
# → copy the whsec_... it prints into apps/api/.env STRIPE_WEBHOOK_SECRET, restart api
Smoke test path (~10 min)
Admin login → http://localhost:3000/admin/login → email + temp password → forced change-password → land on /admin/dashboard
Verify plans seeded → /admin/subscriptions → see 8 plans, all Active. Hit "Sync" on each row if Stripe sync didn't run during seed.
Public pricing → log out → /pricing → see plans split by Client / Supplier tabs, monthly / yearly toggle, save % badge
Register a customer → /register → choose CUSTOMER → log in
Subscribe → /pricing → click any plan → /subscribe?plan_id=… → "Subscribe with Stripe" → Stripe Checkout in test mode → use card 4242 4242 4242 4242, any future date, any CVC
Confirm webhook fired → in stripe listen terminal, see checkout.session.completed → /subscribe/success polls and shows "Welcome to {plan}"
Billing dashboard → /billing → current plan, usage meters at 0, "Manage in portal" button works
Limit enforcement → publish a task → expect either success (if plan allows) or 429 toast + <UpgradePromptModal> opens
Service invoices (separate flow) — set up /settings/payment-methods first, then /invoices/create → send → switch to recipient account → /invoices → submit evidence → switch back → approve
What you can't easily verify locally
Monthly usage reset — fires at 0 0 1 * * UTC. To test now, edit the cron in subscription-usage-reset.scheduler.ts to */2 * * * * temporarily, restart workers, watch counters reset every 2 min.
Overdue reminder — same pattern in service-invoice-overdue.scheduler.ts.
Email delivery — needs Microsoft Graph credentials in .env (AZURE_EMAIL_TENANT_ID/CLIENT_ID/CLIENT_SECRET). Without them, emails fail silently in the worker but everything else works.
You're cleared to start. If anything blows up, the docs/subscription-module.md "Troubleshooting" section has 9 of the most likely failure modes with one-line fixes.



# Terminal 1
pnpm --filter @onys/api dev
# Terminal 2
pnpm --filter @onys/workers dev
# Terminal 3
pnpm --filter @onys/web dev



Admin created — copy these now before the terminal scrolls:


Email:         admin@onys.local
Temp password: cbeda391191fd7b2!A1
Save them somewhere safe — the password is only printed once and there's no recovery path other than re-seeding (which fails because the email is already taken — you'd DELETE FROM "User" WHERE email = 'admin@onys.local'; first).

You're cleared to go. Login at http://localhost:3000/admin/login after starting apps/web — first action will be the forced password change.

Run the rest of the bootstrap:


pnpm --filter @onys/api seed:subscriptions      # 8 plans
pnpm --filter @onys/api dev                     # terminal 1
pnpm --filter @onys/workers dev                 # terminal 2
pnpm --filter @onys/web dev                     # terminal 3


What the contractor sees now
Customer places an order → contractor sees:
Email with task title + customer name + "Open order" CTA (within seconds)
In-app notification (bell icon updates within 20s)
Sidebar badge on "Active Orders" (within 60s; immediate after manual refresh)
Dashboard "Action required" card with the count + link
Same pattern holds for revision requests, tender invitations, disputes.
To extend: add another order lifecycle event — write one function in order-notifications.ts, add one case in email.worker.ts, call from the service. That's it.