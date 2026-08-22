# Security Hardening Status

## Current Status

The server has completed the planned security hardening for the project scope.
It is ready for local development and integration testing. Production payment
launch still requires HTTPS PayOS URLs and real provider webhook testing.

## Implemented Controls

- Supabase Auth Bearer token validation.
- Admin authorization through `app_metadata.role`.
- RLS enabled for application tables.
- Direct table access revoked for `anon` and `authenticated` roles.
- Business RPC execution restricted to `service_role`.
- CORS origin allowlist and Helmet security headers.
- JSON request body limit and input validation.
- Auth, search, and chat rate limits.
- SQL query-builder/RPC parameterization and sanitized prefix search.
- Prompt input treated as untrusted data.
- Order ownership and status-transition checks.
- Paid PayOS cancellation/refund workflow with row locking and audit events.
- Payment-link reuse and expiring creation claims.
- HMAC webhook verification with amount validation and replay handling.
- Verified-purchase reviews and one review per user/product.
- Financial database constraints and database-side RPC validation.
- Semantic chat-answer cache with configurable cosine-distance threshold.
- Explicit keyword, vector, and hybrid search modes for evaluation.
- Generic responses for unexpected server errors in hardened endpoints.

## Required Migrations

Apply Supabase migrations in filename order. The hardening additions are:

- `15_restrict_rpc_execute.sql`
- `16_prefix_keyword_search.sql`
- `17_database_hardening.sql`
- `18_payment_cancellation_guard.sql`
- `19_validate_financial_constraints.sql`
- `20_refund_request_workflow.sql`
- `21_payment_link_and_rpc_hardening.sql`
- `22_payment_link_claim.sql`
- `23_create_order_rpc_validation.sql`
- `24_verified_review_rpc.sql`
- `25_backfill_payment_refund_hardening.sql`
- `26_late_payment_refund_fix.sql`
- `27_ai_evaluation_support.sql`
- `28_fix_search_mode_ambiguous_id.sql`

## Payment Prerequisites

Set these server-only variables before using PayOS:

```env
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_RETURN_URL=https://your-https-host/payment/success
PAYOS_CANCEL_URL=https://your-https-host/payment/cancel
```

Without a domain, use an HTTPS tunnel such as ngrok or Cloudflare Tunnel.
Never expose PayOS, Gemini, or Supabase service-role secrets to the client.

## Verification

```powershell
cd server
npm test
npm audit --omit=dev
npm start
```

Smoke test:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health
Invoke-WebRequest -UseBasicParsing "http://localhost:3000/api/search?q=appl&limit=5"
```

For database verification, confirm all application tables have RLS enabled and
that `anon`/`authenticated` have no table privileges. Test PayOS signatures,
replay, refund finalization, and concurrent payment-link requests in sandbox.

## Known Scope Limits

- Rate limiting is process-local; use Redis/shared storage for multiple instances.
- The repository currently has no automated integration tests.
- Refund finalization requires external PayOS refund confirmation before the
  admin endpoint is called.
