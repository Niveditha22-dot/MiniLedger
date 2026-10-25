# MiniLedger
 
> Keep track of money you've lent to friends: who owes you, how much, and what's overdue.
 
MiniLedger is a small full-stack app for managing informal loans between friends. You sign in with your phone number and a one-time password, record each loan with the friend's name, amount and due date, optionally attach a photo of the receipt, and mark entries as repaid when the money comes back. The app highlights overdue loans in red and shows a summary card with the total lent, total repaid and overdue amount. The backend is a REST API built with Node.js, TypeScript and Fastify, validated with Zod and backed by PostgreSQL through Prisma. The client is a React Native app built with Expo.
 
## Features
 
- **Phone + OTP login.** The OTP is mocked: it is printed in the server log instead of being sent by SMS. OTPs expire after 5 minutes, and a successful login returns a signed JWT.
- **Loan entries.** Add an entry (friend name, amount, due date) and mark it as repaid.
- **Summary endpoint.** Total lent, total repaid, outstanding and overdue amounts in one call.
- **Overdue highlighting.** Unpaid loans past their due date are shown in red in the list.
- **Receipt photos (bonus).** Attach a JPEG, PNG or WebP image (max 5 MB) to an entry. Receipts are only served to the loan's owner.
## Tech stack
 
| Layer | Technology |
|---|---|
| API | Node.js, TypeScript, Fastify |
| Validation | Zod |
| Auth | JWT (`@fastify/jwt`), mock OTP |
| Database | PostgreSQL with Prisma ORM and migrations |
| Uploads | `@fastify/multipart`, files stored on disk |
| Tests | Vitest |
| App | React Native (Expo), TypeScript |
 
## Project structure
 
```
miniledger/
├── backend/
│   ├── prisma/            # schema.prisma and migrations
│   ├── src/
│   │   ├── app.ts         # routes, auth, validation
│   │   ├── summary.ts     # summary calculation (pure, unit-tested)
│   │   └── index.ts       # server entry point
│   └── test/              # Vitest tests
└── mobile/
    └── App.tsx            # login, list, summary card, add form
```
 
## Getting started
 
### Prerequisites
 
- Node.js 20 or newer
- PostgreSQL (a local install is fine)
### 1. Backend
 
Create an empty database:
 
```bash
psql -U postgres -c "CREATE DATABASE miniledger;"
```
 
Then:
 
```bash
cd backend
cp .env.example .env        # Windows cmd: copy .env.example .env
```
 
Open `.env` and set your database password in `DATABASE_URL`:
 
```
DATABASE_URL="postgresql://postgres:YOURPASSWORD@localhost:5432/miniledger"
JWT_SECRET="change-me"
PORT=3000
```
 
Install, migrate and start:
 
```bash
npm install
npx prisma migrate dev --name init
npm test
npm run dev                  # http://localhost:3000
```
 
The OTP is **printed in this terminal** (`>>> OTP for <phone>: <code>`), so keep it visible when you log in.
 
### 2. App
 
In a second terminal:
 
```bash
cd mobile
npm install
npx expo install --fix       # aligns package versions with your Expo SDK
```
 
**Run in the browser** (no emulator needed):
 
```bash
npx expo install react-dom react-native-web @expo/metro-runtime
npx expo start --web         # opens http://localhost:8081
```
 
**Run on an Android emulator:**
 
```bash
npx expo start --android
```
 
The app picks the API address automatically: `localhost:3000` in the browser and `10.0.2.2:3000` on the Android emulator (both set at the top of `App.tsx`). On a physical phone, change `API` to your computer's LAN IP.
 
### Quick walkthrough
 
1. Enter a phone number (10+ digits) and tap **Send OTP**.
2. Copy the 6-digit code from the backend terminal and verify.
3. Add an entry with a past due date to see it highlighted as overdue.
4. Tap **Repaid** and watch the summary card update.
## API reference
 
All routes except the two `/auth` ones need the header `Authorization: Bearer <token>`.
 
| Method | Path | Description |
|---|---|---|
| POST | `/auth/request-otp` | Body `{ phone }`. Generates an OTP and prints it in the server log. |
| POST | `/auth/verify-otp` | Body `{ phone, otp }`. Returns `{ token }`. |
| POST | `/loans` | Body `{ friendName, amount, dueDate }`. Creates an entry. |
| GET | `/loans` | Lists your entries, sorted by due date. |
| POST | `/loans/:id/repay` | Marks an entry as repaid. |
| POST | `/loans/:id/receipt` | Multipart field `file`. Attaches a receipt image. |
| GET | `/loans/:id/receipt` | Returns the receipt image (owner only). |
| GET | `/summary` | Returns `{ totalLent, totalRepaid, outstanding, overdue }`. |
 
Invalid input returns `400` with the validation errors. A missing or invalid token returns `401`, and an unknown entry returns `404`.
 
## Design decisions
 
- **Amounts are whole rupees (`Int`)**, which avoids floating-point rounding errors in the totals.
- **Every query is scoped to the logged-in user.** The user id comes from the JWT and never from the request body, so people can only see and change their own entries.
- **Overdue means not repaid and `dueDate < now`.** That rule lives in `summary.ts` as a pure function so it can be tested without a database.
- **Receipts are stored with random filenames**, and type and size are checked on upload. They are served through an authenticated endpoint instead of a public folder.
- **Separate OTP table with an expiry.** An OTP is deleted after use and replaced whenever a new one is requested.
## Testing
 
```bash
cd backend
npm test
```
 
The tests cover the summary calculation: an empty list, mixed repaid, overdue and upcoming loans, and the rule that repaid loans are never overdue.
 
