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