# Stage 1

## REST API Design — Campus Notification Platform

### Context

Students need to see updates about Placements, Events, and Results as soon as
they happen, and be able to browse what they've missed. Before jumping into
endpoints, I thought about what a student actually does on a day-to-day basis
with this kind of feed: 
they open the app, scan a list, tap into something
that looks relevant, and mark things as read once they've lookedd into them. Everything
below is built around that flow rather than trying to be a generic CRUD API.

 authentication is already handled upstream — every request here is treated as coming from an
already-authorised user, so there's no login/token exchange in this design.



### Core actions the platform needs to support

1. Fetch a list of notifications (with filtering by category and read status)
2. Fetch a single notification's full details
3. Mark a notification as read
4. Mark all notifications as read
5. Create a new notification (used by whatever internal system generates
   Placement/Event/Result updates — think of it as the "publish" side)
6. Subscribe to a live stream of new notifications

I deliberately kept "create" in scope even though the assignment is
student-facing, because without "some" way for notifications to enter the
system, the rest of the API has nothing to show. I'm treating it as an
internal/admin action rather than something a regular student would call.

---

### Endpoints

#### 1. List notifications 

### GET /api/v1/notifications
Query params:
- `category` — optional, one of `placement | event | result`
- `status` — optional, one of `read | unread`
- `page`, `limit` — pagination, defaults to `page=1&limit=20`

Response `200`:
```json
{
  "data": [
    {
      "id": "ntf_8f2a1c",
      "category": "placement",
      "title": "Infosys shortlist released",
      "summary": "Shortlist for Infosys SDE role is now live.",
      "isRead": false,
      "createdAt": "2026-06-28T09:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 57
  }
}
```

I went with a `summary` field separate from the full body so the list view
stays light — the frontend shouldn't have to download full notification
bodies just to render a scroll feed.

#### 2. Get a single notification

### GET /api/v1/notifications/{id}
Response `200`:
```json
{
  "id": "ntf_8f2a1c",
  "category": "placement",
  "title": "Infosys shortlist released",
  "body": "Full details go here — eligibility, next steps, deadline, etc.",
  "isRead": false,
  "createdAt": "2026-06-28T09:15:00Z",
  "meta": {
    "company": "Infosys",
    "deadline": "2026-07-05T23:59:00Z"
  }
}
```
`404` if the id doesn't exist.

`meta` is intentionally an open object — Placement notifications need
different fields (company, deadline) than Event ones (venue, time) or Result
ones (subject, link to marks). Rather than forcing one rigid shape on all
three categories, I let `meta` flex per category while keeping the outer
envelope consistent. That felt more honest to how the data actually varies.

#### 3. Mark one notification as read
### PATCH /api/v1/notifications/{id}/read
No request body needed — the action is implied by the endpoint.

Response `200`:
```json
{
  "id": "ntf_8f2a1c",
  "isRead": true
}
```

#### 4. Mark all as read
### PATCH /api/v1/notifications/read-all
Response `200`:
```json
{
  "updatedCount": 12
}
```

I split this from the single-item endpoint instead of overloading it with a
bulk-ids array in the body — "mark everything" is a distinct, common enough
action (think a "clear all" button) that it deserves its own clean route
rather than a query-param hack.

#### 5. Create a notification (internal/publisher use)
### POST /api/v1/notifications
Request body:
```json
{
  "category": "event",
  "title": "Tech fest registrations open",
  "body": "Registrations for the annual tech fest are now open.",
  "meta": {
    "venue": "Main Auditorium",
    "eventDate": "2026-08-10T10:00:00Z"
  }
}
```
Response `201`:
```json
{
  "id": "ntf_c91b7d",
  "category": "event",
  "title": "Tech fest registrations open",
  "createdAt": "2026-07-01T11:29:00Z"
}
```
`400` if `category` isn't one of the three allowed values, or required fields
are missing.

---

### Real-time delivery

I considered polling, WebSockets, and Server-Sent Events, and landed on
**SSE** for this use case. The reasoning:

- The data only flows one direction — server tells the client "a new
  notification exists." Students never need to push anything back over the
  same channel. WebSockets give you bidirectional messaging, which is more
  machinery than this problem needs.
- SSE runs over plain HTTP, so it plays nicely with normal infra (load
  balancers, proxies) without extra protocol upgrades.
- Browsers handle reconnection for SSE automatically, which matters for
  students on patchy campus wifi moving between class buildings.
  ### GET /api/v1/notifications/stream
  Server pushes events as they're created:
  event: notification
data: {"id":"ntf_c91b7d","category":"event","title":"Tech fest registrations open","createdAt":"2026-07-01T11:29:00Z"}

The frontend keeps this connection open in the background and prepends new
items to the list as they arrive, updating the unread badge count. If the
connection drops (tab backgrounded, network blip), the browser's built-in SSE
retry kicks in and picks back up — no custom reconnect logic needed on our
side.

If this ever needs to scale to something like exam-hall-wide broadcast
notifications with heavy fan-out, I'd revisit this and look at a pub/sub
layer (Redis, or a message broker) sitting behind the SSE endpoint rather
than pushing straight from the request handler. For the current scope
though, that felt like over-engineering.

---

### Headers

All requests/responses use:
Content-Type: application/json
Accept: application/json

No custom auth headers, per the assumption that authorization happens
upstream of this API.
----------------------------------------------------------------------------------------------------------





# Stage 2

## Persistent Storage Design

### Choice of database: PostgreSQL

Looking back at the Stage 1 API, most of what we're storing is
structured and predictable — a notification always has a category, a
title, a body, a read flag, a timestamp. That's a strong signal for a
relational database rather than a document store. I went with
**PostgreSQL** specifically because:

- The `meta` field varies per category (placement vs event vs result),
  and Postgres's `JSONB` column type lets me keep that flexibility
  without giving up the relational structure for everything else. I get
  the best of both worlds instead of picking one extreme.
- Read patterns are heavy on filtering (by category, by read status)
  and pagination — Postgres indexes handle this well.
- We eventually need per-user read/unread state, which is naturally a
  join between users and notifications — something relational DBs are
  built for.

I considered MongoDB early on since notifications feel "document-ish,"
but the moment I thought about per-user read tracking and the need for
consistent, join-able queries across categories, a NoSQL document store
started to feel like it would just be reinventing joins in application
code. Postgres felt like the honest choice here, not the trendy one.

---

### Schema

```sql
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category    VARCHAR(20) NOT NULL CHECK (category IN ('placement', 'event', 'result')),
    title       VARCHAR(255) NOT NULL,
    summary     VARCHAR(500),
    body        TEXT NOT NULL,
    meta        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    roll_no     VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE notification_reads (
    user_id             UUID NOT NULL REFERENCES users(id),
    notification_id     UUID NOT NULL REFERENCES notifications(id),
    read_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX idx_notifications_category_created
    ON notifications (category, created_at DESC);

CREATE INDEX idx_reads_user
    ON notification_reads (user_id);
```

I split "read status" into its **own table** (`notification_reads`)
rather than a boolean column on `notifications`, because a single
notification is read by thousands of students independently — a
boolean on the notification itself can't represent "read by student A,
unread by student B." A row only gets inserted here once a student
opens something, so "unread" is just "no row exists" — cheap to check,
and cheap to store since most notifications won't be read by most
students immediately.

---

### Problems as data volume increases

**1. The `notifications` table grows indefinitely.**
Every placement update, every event, every result becomes a permanent
row. After a few years across a large student body, this table gets
large, and old notifications (last year's placements) are rarely
queried but still take up space and can slow down scans if not indexed
well.

*Fix:* Partition the table by month/semester using Postgres native
partitioning, and archive partitions older than, say, 2 years into
cheaper cold storage. Queries for "recent notifications" (the common
case) stay fast because they only touch recent partitions.

**2. `notification_reads` grows even faster than `notifications`.**
This table is roughly `notifications × students` in size — if there
are 50,000 notifications and 10,000 students, that's a theoretical
ceiling of 500 million rows. In practice most students won't read
everything, but it's still the fastest-growing table by far.

*Fix:* Since we only insert a row on "read," it self-limits somewhat.
But at scale I'd move this to a faster key-value store (Redis, keyed
by `user:notification`) for the hot path, and periodically flush
confirmed reads into Postgres for durability/reporting. This trades a
small durability window for a big reduction in write load on the
primary DB.

**3. Read-heavy load on the notification list endpoint.**
Every student opening the app hits `GET /notifications` — this becomes
the single hottest query in the system, especially right after a big
placement announcement when everyone opens the app at once.

*Fix:* Add a caching layer (Redis) in front of the "latest
notifications" query, since that data is the same for every student
(only the read/unread overlay differs per user, and that's a cheap
separate lookup). Cache invalidates on new notification creation.

**4. Real-time fan-out at scale.**
The SSE design from Stage 1 works fine for a few hundred concurrent
connections, but if every student's browser holds an open connection
during a live results announcement, a single server process won't
handle that fan-out alone.

*Fix:* Move the "publish new notification" event through a message
broker (Redis Pub/Sub or similar) so multiple server instances can each
handle a slice of the open SSE connections, rather than one process
bottlenecking the entire student body.

---

### Sample queries (matching Stage 1 endpoints)

**List notifications, filtered by category, with read status for a user**
```sql
SELECT n.id, n.category, n.title, n.summary, n.created_at,
       (r.notification_id IS NOT NULL) AS is_read
FROM notifications n
LEFT JOIN notification_reads r
    ON r.notification_id = n.id AND r.user_id = $1
WHERE ($2::varchar IS NULL OR n.category = $2)
ORDER BY n.created_at DESC
LIMIT $3 OFFSET $4;
```

**Get a single notification**
```sql
SELECT id, category, title, body, meta, created_at
FROM notifications
WHERE id = $1;
```

**Mark one notification as read**
```sql
INSERT INTO notification_reads (user_id, notification_id)
VALUES ($1, $2)
ON CONFLICT (user_id, notification_id) DO NOTHING;
```

**Mark all as read for a user**
```sql
INSERT INTO notification_reads (user_id, notification_id)
SELECT $1, n.id
FROM notifications n
LEFT JOIN notification_reads r
    ON r.notification_id = n.id AND r.user_id = $1
WHERE r.notification_id IS NULL
ON CONFLICT (user_id, notification_id) DO NOTHING;
```

**Create a new notification**
```sql
INSERT INTO notifications (category, title, summary, body, meta)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, created_at;
```

The `ON CONFLICT DO NOTHING` pattern in the read-marking queries matters
more than it looks — a student double-tapping a notification, or a flaky
network causing a retry, shouldn't cause an error or a duplicate row.
Making that operation naturally idempotent means the frontend doesn't
need extra guard logic either.