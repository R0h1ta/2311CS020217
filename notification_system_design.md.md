# Stage 1

## REST API Design - Campus Notification Platform

### Context
The users must receive timely information about Placements, Events, and Results and be able to browse through what has already occurred. Before designing the API endpoints, I outlined the daily user scenario, where a student would open the app, swipe through notifications, and mark some of them as read when they are done. The following design is focused on fulfilling these user-driven use cases rather than building a generic set of endpoints.
The authentication layer is assumed to be present upstream, meaning all requests are made in the context of an already authenticated user, who can view and manage their notifications.

### What the notification platform must be able to do for the users

1. View a list of notifications, optionally filtered by category and read status
2. View details for a particular notification
3. Mark a notification as read
4. Mark all notifications as read
5. Create a new notification (admin-level action – presumably used by placement, event, and result management systems)
6. Receive live updates when new notifications are published
I have added the ‘create’ capability to the list of user-related operations because, without it, the other endpoints would provide no useful data. The notifications would always be in the unread status and be empty until the first ‘create’ request.

### Endpoints

#### 1. View a list of notifications

Method: GET /api/v1/notifications
Query parameters:
• category: string (optional, possible values: placement | event | result)
• status: string (optional, possible values: read | unread)
• page, limit: pagination (default page: 1, default limit: 20)

Response:

200 OK
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
I have added a summary field to the notification listing as an optimization, so the frontend does not need to fetch the entire notification body just to display it in a list or feed.

#### 2. View a notification

Method: GET /api/v1/notifications/{id}
Response
200 OK

```json
{
"id": "ntf_8f2a1c",
"category": "placement",
"title": "Infosys shortlist released",
"body": "Shortlist for Infosys SDE role is now live.",
"isRead": false,
"createdAt": "2026-06-28T09:15:00Z",
"meta": {
"company": "Infosys"
}
}
```
404 Notification not found
```json
{
"error": "NTF_001",
"message": "Notification with ID: ntf_8f2a1c not found."
}
```
The meta field is added as extra data relevant to the category but not covered by the standard fields. In practice, the body and meta information will vary depending on the category, e.g., for a placement, the meta field might include the company name or application deadline, for an event – venue and date, for a result – the subject and access link, etc. I opted to use a generic JSON object rather than have separate fields for each category.
#### 3. Mark a notification as read
Method: PATCH /api/v1/notifications/{id}/read
This request does not require a request body because the action is apparent from the endpoint.
Response
200 OK
```json
{
"id": "ntf_8f2a1c",
"isRead": true
}
```
#### 4. Mark all notifications as read
Method: PATCH /api/v1/notifications/read-all
Response
200 OK
```json
{
"updatedCount": 12
}
```
In this case, I have separated the ‘mark all as read’ operation as a different endpoint rather than include an array of notification IDs in the body of the ‘mark as read’ request. While it may seem more intuitive to use the same endpoint for both operations by adding a query parameter for the ‘mark all’ case, I think it is safer to have a separate, clearly defined action for a commonly-used scenario. This approach also avoids possible confusion if a frontend accidentally sends a ‘mark all as read’ request to the ‘mark as read’ endpoint.
#### 5. Create a notification
Method: POST /api/v1/notifications
Request body
```json
{
"category": "event",
"title": "Tech fest registrations open",
"body": "Registrations for the annual tech fest are now open.",
"meta": {
"venue": "Main Auditorium"
}
}
```
Response
201 Created
```json
{
"id": "ntf_c91b7d",
"category": "event",
"title": "Tech fest registrations open",
"createdAt": "2026-07-01T11:29:00Z"
}
```
400 Bad Request
```json
{
"error": "NTF_002",
"message": "Invalid category: event. Allowed values: placement, result."
}
```
### Real-Time Live Notifications
I have evaluated the options and decided to implement Server-Sent Events (SSE) to notify the frontend about new notifications. WebSockets were an option, but they add complexity since the connection needs to be maintained on both ends, while with SSE, the communication is one-way, initiated from the server. Since there is no need for the frontend to send messages to the backend, this approach is more straightforward and requires less client-side code.
SSE is also beneficial because it works over regular HTTP, which is easier to support on load balancers and proxies. Another advantage of this technology is that the frontend will automatically reconnect to the server in case of an interruption, which is common when a student switches between different buildings on a university campus and loses wifi connection.
#### Stream endpoint
GET /api/v1/notifications/stream
The server will send new notification events to the client using SSE, for example,
event: notification
data: {"id":"ntf_c91b7d","category":"event","title":"Tech fest registrations open","createdAt":"2026-07-01T11:29:00Z"}
event: notification
data: {"id":"ntf_6e8bc5","category":"placement","title":"Accenture test results","createdAt":"2026-07-01T11:29:00Z"}
The frontend will keep this connection open and append events to the notification list as they arrive, updating the “unread” counter. If the connection is lost, the client reconnects to the same endpoint automatically when it becomes available again (no custom code is needed for this).
I would consider refactoring this part of the code in the future and decoupling the notification stream from the request handling layer if the system needs to support broadcasting notifications at a larger scale (e.g., during a mass exam hall announcement).
### Headers
The following headers must be sent with all requests and responses:
Content-Type: application/json
Accept: application/json

Other headers, including authentication tokens, are outside the scope of this API design.
----------------------------------------------------------------------------------------------------------





# Stage 2

## Persistent Storage Design

### Choice of database: PostgreSQL

Looking at the data that needs to be stored for the Stage 1 API, most of it is easily predictable. A notification has a category, title, body, read status, and timestamp. This points more towards a relational database than a document store. I chose PostgreSQL because:

- The `meta` field is different depending on the category (placement vs event vs result), but I want the flexibility of a JSON column while still having the relational integrity of the rest of the notification data. With PostgreSQL’s JSONB, I can have my cake and eat it too.
- There are heavy filtering/pagination needs on the notifications list – indexing is much more straightforward in a relational database.
- We need to track read/unread status per user – again, a relational database is more natural for joins than a document store.

I almost went with MongoDB because notifications seem like “documents”, but as soon as I started thinking about per-user read tracking and the joins it would require, it seemed like a lot of overhead to shoehorn it into a document store. PostgreSQL it was!
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
I put the “read/unread” tracking in a separate table rather than a boolean column on the notification itself because a single notification can be read by thousands of students independently. A “read” boolean on the notification would imply that either everyone has read it or nobody has, which is not the case. The table only contains a row for a student-notification pair if that student has read that notification. This is more data, but it’s worth it – in practice, most notifications will be unread by most students, and checking for existence of a row is cheaper than checking a boolean.
---

### Problems as data volume increases
1. The `notifications` table will grow exponentially. Every placement update, event, and result is a new row. This will become a problem after a few years of use, as queries on this table will start taking longer and longer to execute, even if they only need to scan a small number of rows.
Potential solution: Depending on how many rows we expect to have, we could consider partitioning the table by time (month/semester) and archiving old partitions to cheaper storage.

2. The `notification_reads` table will grow even faster – it contains a row for every student-notification pair. If we have 50,000 notifications and 10,000 students, that’s 500 million rows. In practice, most students will not read most notifications, but it’s still the fastest-growing table by far.

Potential solution: This table only contains rows when a student has read a notification. Since the read action only adds a row to this table, it has some natural limits to its growth. At scale, we might want to offload this to a faster key-value store (Redis) for the hot reads, only persisting them to the PostgreSQL table periodically.

3. The list of notifications is a read-heavy endpoint. Every student that opens the app will query this endpoint, potentially overwhelming the database.
Potential solution: We can cache the latest notifications in a Redis instance, as they are the same for all students (with the exception of the read/unread status, which is a separate query). This would reduce the load on the database significantly.
4. The live notification feed (SSE) needs to fan out to potentially thousands of concurrently connected clients. The solution from Stage 1 would not scale well to hundreds of concurrent connections.

Potential solution: We can offload the actual notification publishing to a message queue (Redis Pub/Sub), so that multiple application servers can subscribe to the queue and handle publishing to individual clients.
---

### Sample queries (matching Stage 1 endpoints)

List notifications, filtered by category, with read status for a user
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

Get a notification
```sql
SELECT id, category, title, body, meta, created_at
FROM notifications
WHERE id = $1;
```

Mark one notification as read
```sql
INSERT INTO notification_reads (user_id, notification_id)
VALUES ($1, $2)
ON CONFLICT (user_id, notification_id) DO NOTHING;
```

Mark all as read
```sql
INSERT INTO notification_reads (user_id, notification_id)
SELECT $1, n.id
FROM notifications n
LEFT JOIN notification_reads r
ON r.notification_id = n.id AND r.user_id = $1
WHERE r.notification_id IS NULL
ON CONFLICT (user_id, notification_id) DO NOTHING;
```

Create a notification
```sql
INSERT INTO notifications (category, title, summary, body, meta)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, created_at;
```
The `ON CONFLICT DO NOTHING` pattern is important for the mark-as-read queries – it prevents the same notification from being marked as read multiple times unnecessarily. It also prevents errors if the client tries to mark a notification as read that has already been read. This makes the operation “idempotent”, which is useful for clients that might retry the request.
-----------------------------------------------------
-----------------------------------------------------

# Stage 3

## Query Performance Analysis

### Is the query accurate?
Yes, it returns the correct result - all the unread notifications for student 1042.

### Why is it slow?
The issue with this query is that it is not optimized for performance. With 5 million rows in the notifications table, this query would take a long time to execute, especially if there are no indexes on the studentID and isRead columns.

### What I would change
I would add an index on the columns that are being queried and sorted:
```sql
CREATE INDEX idx_notifications_student_unread ON notifications (studentID, isRead, createdAt);
```
I would also change the `SELECT ` to specify the columns that are needed, rather than selecting all columns.
```sql
SELECT id, title, summary, notificationType, createdAt
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```
This would reduce the amount of data that needs to be transferred and processed.

### Cost impact
The cost of this query depends on the number of rows that need to be processed. If there are no indexes on the columns that are being queried, the cost could be very high, especially if there are many rows that match the query conditions.

### Is “index every column” good advice?
I do not think that the advice to “index every column” is good advice. It can be helpful to have indexes on certain columns, but it is not always necessary or efficient to index every column. It is important to consider the specific needs of the application and the queries that are being executed.

### Query: placement notifications in the last 7 days
```sql
SELECT id, title, summary, createdAt
FROM notifications
WHERE notificationType
-----------------------------------------------------
-----------------------------------------------------

# Stage 4

## Fixing the Repeated DB Hits

### The problem

Every time a student loads the app, we hit the database to get their notifications. if 10,000 students load the app at once, that’s 10,000 queries hitting the database at once. Even if most of them are the same query, it’s still a lot for the database to handle at once.

### My solution: Caching

The key insight here is that the notifications list is the same for all students – what differs is what each student has read. So, rather than querying the database for notifications every time a student loads the app, we could cache the notifications list in a fast, in-memory cache like Redis. This way, we only hit the database once per student, rather than once per query.

### Other things I’d add
I’d add pagination to the notifications list so that we only retrieve the notifications that are visible on the screen at once. This would reduce the amount of data that needs to be transferred and processed.
I’d also add caching on the client side so that the student doesn’t have to reload the notifications list every time they switch back to the app.

And finally, I’d add rate limiting to the notifications list endpoint to prevent abuse.
### Tradeoffs of caching
The main benefit of caching is that it reduces the load on the database and improves performance. The main downside is that it can introduce latency if the cache is not updated frequently enough.
I think it’s a good tradeoff for this application because it improves performance without sacrificing too much in the way of freshness. If the cache is updated every few minutes, it’s unlikely to have a significant impact on the user experience.
However, it does add complexity to the system, as we now have to manage a separate cache in addition to the database.
### Why not just make the DB itself faster?
That’s a good question. I think it’s a worthwhile pursuit, but it’s limited in how much it can help. There are only so many ways to optimize a database query before you start seeing diminishing returns.
Caching is a much more scalable solution, as it reduces the number of queries that have to be processed by the database in the first place.
-----------------------------------------------------
-----------------------------------------------------
# Stage 5
## Fixing the "Notify All" Implementation
### Shortcomings I see
The code is currently looping through all 50,000 students, sending each one an email, and saving a record of the notification in the database. This is slow (serial) and error prone (no retries).
### Should DB save and email happen together?
No. I think the notification should be saved to the database and pushed to the in-app notification center right away, so that students see it in real time. The email should be a separate, asynchronous process that can be retried if it fails.

### How I'd redesign it
I’d save the notification record once, rather than for each student. Then, I’d push it to the in-app notification center for all students at once. Finally, I’d send the emails as a separate job that can be retried if it fails.
This would be much faster, as pushing to the in-app notification center is a much lighter operation than sending an email. It would also be more reliable, as the notification record in the database would be saved before any emails were sent.

### Revised pseudocode
```python
# Save the notification record
notification = Notification.create(title, summary, body, notification_type)
# Push to in-app notification center for all students
InAppNotificationCenter.broadcast(notification)
# Send emails asynchronously
EmailQueue.enqueue_all(EmailJob.new(notification, students))
# If an email fails, retry it
EmailJob.retry_failed_jobs()
```

for student_id in student_ids:
    push_to_app(student_id, notification_id)

for student_id in student_ids:
    queue_email_job(student_id, notification_id)

### Why it's better
In-app notifications show up instantly for everyone. Emails run in
parallel through a queue instead of one-by-one, and failed emails
retry automatically — and if they still fail, we get a clear list of
exactly who was missed, instead of silently losing 200 students.