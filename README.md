# MiniLedger

Track money lent to friends. Node.js + TypeScript + Fastify + Prisma + PostgreSQL backend, React Native (Expo) app.

## Run the backend
Requires Node.js 20+ and a local PostgreSQL. Create an empty database first:
```bash
psql -U postgres -c "CREATE DATABASE miniledger;"
```
Then:
```bash
cd backend
cp .env.example .env                 # Windows PowerShell: copy .env.example .env
# edit .env: DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/miniledger"
npm install
npx prisma migrate dev --name init
npm run dev                          # http://localhost:3000
npm test                             # Vitest
```
The OTP is **printed in the server terminal** (`>>> OTP for ...`).

## Run the app
```bash
cd mobile
npm install
npx expo install --fix               # aligns package versions with Expo
npx expo start --android             # Android emulator running
```
**In a browser (no Android Studio needed):**
```bash
npx expo install react-dom react-native-web @expo/metro-runtime
npx expo start --web                 # opens http://localhost:8081
```

Emulator reaches the backend at `http://10.0.2.2:3000` (set in `App.tsx`). On a physical phone, change `API` to your PC's LAN IP.

## API
| Method | Path | Notes |
|---|---|---|
| POST | /auth/request-otp | `{phone}` – logs OTP |
| POST | /auth/verify-otp | `{phone, otp}` – returns JWT |
| POST | /loans | `{friendName, amount, dueDate}` (auth) |
| GET | /loans | list, sorted by due date (auth) |
| POST | /loans/:id/repay | marks repaid (auth) |
| POST | /loans/:id/receipt | multipart field `file` (JPEG/PNG/WebP, max 5 MB) (auth) |
| GET | /loans/:id/receipt | returns the image, owner only (auth) |
| GET | /summary | `{totalLent, totalRepaid, outstanding, overdue}` (auth) |

## Design notes
- Amounts are whole rupees (`Int`) to avoid float errors.
- Every loan query is scoped by `userId` from the JWT, so users only see their own data.
- Overdue = not repaid and `dueDate < now`. Logic lives in `summary.ts` (pure function, unit-tested).
- Receipts are saved to `backend/uploads/` with random names; type and size are checked, and the image is only served to the loan's owner through an authenticated endpoint.
- If you already ran the first migration, run `npx prisma migrate dev --name add_receipt` after pulling this change.
- Input validated with Zod; invalid input returns 400.
