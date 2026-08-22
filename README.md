# Ecommerce RAG AI

## Quick Start

Requirements: Node.js 20 or newer, a Supabase project, and a Gemini API key.

```powershell
cd server
npm install
copy .env.example .env
npm start
```

The API runs at `http://localhost:3000`.

For the complete endpoint contract, see [API_REFERENCE.md](API_REFERENCE.md).

## Environment

Configure Supabase, Gemini, CORS, and PayOS variables in `server/.env`.
PayOS requires HTTPS return/cancel URLs. For local development, use an HTTPS
tunnel such as ngrok or Cloudflare Tunnel.

## Database

Apply the Supabase migrations in filename order. Migrations 15 through 28 add
RLS, RPC permissions, prefix search, payment/refund hardening, payment-link
claims, order validation, verified reviews, chat-answer caching, and explicit
search modes.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, Gemini, or PayOS secret keys to the
frontend.

## Checks

```powershell
cd server
npm test
npm audit --omit=dev
npm run benchmark
npm run benchmark -- --start=0 --limit=20
npm run experiment:rag
# Optional: run only the first 5 cases while respecting Gemini free-tier limits
npm run experiment:rag -- 0 5
# Resume with 5 cases starting at index 5
npm run experiment:rag -- 5 5
```
