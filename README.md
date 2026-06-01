# DoraDrink Backend

Express + TypeScript + MongoDB scaffold for DoraDrink V2.

## Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Health check:

```text
GET http://localhost:4000/health
```

Initial routes:

```text
POST /api/users/bootstrap
GET /api/users/me?userId=<id>
GET /api/wallet?userId=<id>
```

This backend is intentionally local-first friendly. The mobile app should keep writing to local storage first, then sync reward-critical events to these APIs.
