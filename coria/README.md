# Coria frontend

Next.js app for the Coria team workspace UI.

**Full project docs:** [../README.md](../README.md)

## Local dev

Follow the full setup guide in [../README.md](../README.md#setup-from-scratch) (Supabase, backend, then frontend).

Quick start once configured:

```bash
cp .env.example .env.local   # edit with your Supabase + BACKEND_URL + INVOKE_SECRET
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires the [backend](../backend) running on `http://127.0.0.1:8000`.
