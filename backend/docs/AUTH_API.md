# Auth API and frontend integration contract

All state-changing endpoints use the Laravel **web** middleware stack, despite the `/api` prefix. Sessions and CSRF are required. No bearer tokens are returned. Call from the same origin for this delivery.

First `GET /api/auth/csrf`, keep cookies, read `data.csrf_token`, and send `X-CSRF-TOKEN` plus `Accept: application/json` on POSTs. Refresh the token after login, logout or reset because the session/token may regenerate. `public/auth-client.js` is a working reference adapter.

Every success is `{success:true,message,data}`; failures are `{success:false,message,errors?}`.

| Method and endpoint | Body / purpose |
|---|---|
| GET `/api/health` | Application liveness only |
| GET `/api/auth/csrf` | Get CSRF token and browser session |
| POST `/api/auth/register` | Canonical owner fields below; forces User role |
| POST `/api/auth/resend-otp` | `{identifier,channel,context}`; registration or pending login |
| POST `/api/auth/verify-otp` | `{identifier,channel,context,code}`; registration or pending login |
| POST `/api/auth/login` | `{email,password,channel?}`; password first, then verified email/SMS code by default |
| GET `/api/auth/me` | Active verified session only; `{data:{user:{user_id,role,name,email,phone,status}}}` |
| POST `/api/auth/logout` | Empty JSON object; invalidates session |
| POST `/api/auth/password-reset` | `{email}`; generic acknowledgement; emails a reset/setup code if eligible |
| POST `/api/auth/password-reset/confirm` | `{email,code,password,password_confirmation}`; resets password, revokes previous auth versions |

## Registration

```json
{
  "first_name": "Maria",
  "middle_name": null,
  "last_name": "Santos",
  "email": "maria@example.com",
  "phone": "09171234567",
  "birthdate": "2000-01-01",
  "address": "Quezon City",
  "password": "choose-your-own-password",
  "password_confirmation": "choose-your-own-password",
  "terms_accepted": true,
  "verification_method": "email"
}
```

Email path: register → account created, email code sent → verify-otp with `context=registration`, `channel=email` → login. Email verification does not automatically establish a login session.

SMS path (matches the supplied signup wizard): resend-otp with `context=registration`, `channel=sms`, `identifier=phone` BEFORE signup → include `otp_code` and `verification_method=sms` in register → code consumption, account and consent creation happen in one transaction. SMS codes for pre-registration are not verified by the standalone verify endpoint.

Registration never creates a pet. Username/role/status cannot be chosen through the payload. Server-side 18+ validation uses Asia/Manila date. Passwords are limited to 8–72 characters AND at most 72 UTF-8 bytes to avoid bcrypt truncation.

## Login

By default, login with a correct password returns:

```json
{"success":true,"message":"Enter the login code.","data":{"otp_required":true,"identifier":"maria@example.com","channel":"email","context":"login"}}
```

There is still no authenticated session at this point. Submit the code to verify-otp with context login. Only then is the session authenticated and regenerated. Only previously verified contact channels may be used. `VHS_LOGIN_OTP=false` permits password-only login for accounts that have already completed registration verification; this does not disable signup verification.

## Security boundaries and future adapters

- OTPs: random six digits, 5-minute expiry, 5 attempts, 60-second resend cooldown, 5 issues/destination/hour, 20 issues/IP/hour, plus 30 auth requests/IP/minute.
- Codes are stored as keyed hashes, tied to context and browser-session nonce. Failure counters commit even on wrong codes. Consumption and account changes share a transaction.
- Sending locks serialize per destination via the database cache. External sends are not retried automatically; duplicates can cost money. Failed sends mark codes unusable. Delivery exceptions never return provider payloads/secrets.
- Login: 5 failed attempts/email/15 minutes plus route IP throttle. Inactive accounts/doctor profiles are blocked; password reset increments an auth version checked on every protected request.
- `phone_verified_at`, `auth_version`, `remember_token`, and `account_verifications.session_hash` are additive internal fields; external field names stay unchanged.
- Register/reset audited using frozen `user_created` / `user_updated` action keys. No successful event is written for rejected operations.
- Raw SOAP is hidden on the Consultation model; later clinical endpoints still need explicit Doctor-only policies. Model hiding alone is not authorization.
- Role middleware is ready; pet/document ownership policies and the corresponding domain APIs are not implemented yet.
- Booking OTP is not active in this delivery. It must later be consumed with the actual appointment creation transaction, not represented by an untrusted browser boolean. Unknown contexts are rejected today.
- Terms copied from the supplied public frontend are served at `/terms`; set `VHS_TERMS_VERSION` to your approved document version and version it whenever that document changes.

## Existing frontend remains a staged integration

The original `web-page/script.js` still sends to legacy PHP, and the portals still load mock stores. Do not interpret a successful `/auth` test as a full migration. Next changes should map its signup field names to this API and replace sessionStorage identity with auth/me. Keep the existing interface; use the working auth-client as a request reference. Pet/booking/clinical integration follows B3–B5.
