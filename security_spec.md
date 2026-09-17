# security_spec.md — Firestore Hardening Specifications

## 1. Data Invariants

- **Root User Isolation**: A user profile at `/users/{userId}` can only be created or modified if `userId` is strictly equal to the authenticated user's UID (`request.auth.uid`). No member can view or write to another user's document.
- **Strict Email Verification**: To prevent identity hijacking, standard database read and write permissions require an email-verified Google session (`request.auth.token.email_verified == true`).
- **Relational Integrity (The Master Gate)**: All items in the `/users/{userId}/schedule` subcollection and `/users/{userId}/customizations` subcollection are protected under the parent User scope. Any access is immediately revoked if the user ID in the path mismatch the current session's `request.auth.uid`.
- **System Integrity (No Client Collusions)**: Field variables like `updatedAt` must match the server-generated `request.time` exactly.
- **Immortal Identity Fields**: Once defined, the `uid` and `email` properties on a User's resource are immutable and can never be rewritten.

---

## 2. The "Dirty Dozen" Payloads (Exploit Scenarios)

### Payload 1: Root User Security Bypass (Identity Spoofing)
An attacker attempts to create a profile under another user's UID:
- **Path**: `/users/attacker_uid`
- **Request Auth**: `{ uid: "different_uid", token: { email: "victim@domain.com", email_verified: true } }`
- **Payload**: `{"uid": "attacker_uid", "email": "victim@domain.com", "accentColor": "#ffffff", "updatedAt": "request.time"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 2: Email Spoofing Attack
An attacker attempts to sign in with an unverified email address matching a privileged email or any other account to gain permission:
- **Path**: `/users/legit_uid`
- **Request Auth**: `{ uid: "legit_uid", token: { email: "legit_user@gmail.com", email_verified: false } }`
- **Payload**: `{"uid": "legit_uid", "email": "legit_user@gmail.com", "accentColor": "#3b82f6", "updatedAt": "request.time"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 3: Guest/Anonymous Account Escalation
An anonymous (unverified) user session attempts to write to user preferences:
- **Path**: `/users/anon_uid`
- **Request Auth**: `{ uid: "anon_uid", token: { firebase: { sign_in_provider: "anonymous" } } }` (no verified email)
- **Payload**: `{"uid": "anon_uid", "email": "", "accentColor": "#3b82f6", "updatedAt": "request.time"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 4: Invalid Field Type Injection (Value Poisoning)
An authenticated user attempts to inject a boolean value into a text field (`accentColor`):
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Payload**: `{"uid": "verified_uid", "email": "verified@gmail.com", "accentColor": true, "updatedAt": "request.time"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 5: Rogue Key Infiltration (The "Ghost Field" Schema Attack)
An authenticated attacker attempts to write extra unauthorized keys (`isVerifiedOwner`, `isAdmin`) into their user schema:
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Payload**: `{"uid": "verified_uid", "email": "verified@gmail.com", "accentColor": "#ffffff", "updatedAt": "request.time", "isAdminPrivileged": true}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 6: Size Overflow Attack (Spam / Denial of Wallet)
An authenticated user attempts to write a massive custom background image string exceeding maximum size boundaries (e.g. over 1MB) to flood database storage quota:
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Payload**: `{ "accentColor": "#3b82f6", "backgroundImage": "A".repeat(200000) }` (excessive size)
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 7: Immortal Field Mutability Attack (UID Alteration)
An authorized user attempts to updates their `uid` to hijack a different document identity after creation:
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Existing Doc**: `{"uid": "verified_uid", "email": "verified@gmail.com", "accentColor": "#3b82f6"}`
- **Payload**: `{"uid": "different_hijacked_uid", "email": "verified@gmail.com", "accentColor": "#3b82f6"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 8: Immortal Field Mutability Attack (Email Alteration)
An authorized user attempts to rewrite their immutable register email profile:
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Existing Doc**: `{"uid": "verified_uid", "email": "verified@gmail.com", "accentColor": "#3b82f6"}`
- **Payload**: `{"uid": "verified_uid", "email": "hacker@domain.com", "accentColor": "#3b82f6"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 9: Client Clock Forgery Attack
An attacker tries to post custom historical or future timeline dates/times in updates instead of using `request.time`:
- **Path**: `/users/verified_uid`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Payload**: `{"uid": "verified_uid", "email": "verified@gmail.com", "updatedAt": "2020-01-01T00:00:00Z"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 10: Schedule Path Cross-User Exploitation
Attacker tries to add a custom schedule item under a victim's user path:
- **Path**: `/users/victim_uid/schedule/some_task`
- **Request Auth**: `{ uid: "attacker_uid", token: { email: "attacker@gmail.com", email_verified: true } }`
- **Payload**: `{"startTime": "10:00", "endTime": "11:00", "activity": "Steal data"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 11: Invalid Time Formatting Injection
An authorized user attempts to inject an unstructured, invalid time string into a schedule's `startTime` (value poisoning):
- **Path**: `/users/verified_uid/schedule/task_1`
- **Request Auth**: `{ uid: "verified_uid", token: { email: "verified@gmail.com", email_verified: true } }`
- **Payload**: `{"startTime": "invalid-time-format-here", "endTime": "12:00", "activity": "Coding"}`
- **Expected Outcome**: `PERMISSION_DENIED`

### Payload 12: Orphaned Checklists/Customization Hijacking
Attacker tries to delete or modify customization items of another user to disrupt operations:
- **Path**: `/users/victim_uid/customizations/cust_1`
- **Request Auth**: `{ uid: "attacker_uid", token: { email: "attacker@gmail.com", email_verified: true } }`
- **Payload**: `{ "objective": "Erase goals", "steps": [], "updatedAt": "request.time" }`
- **Expected Outcome**: `PERMISSION_DENIED`

---

## 3. The Test Runner Spec

Test simulations verify that each of the Dirty Dozen Payloads fail to be written or read under the secure policy specified in `/firestore.rules`.
All tests strictly audit the policy blocks to achieve Zero-Trust access metrics.
