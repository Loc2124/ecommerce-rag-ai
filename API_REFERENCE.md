# API Reference - Ecommerce RAG AI

## Version History

### v1.3 - 2026-08-21

- Added RLS and restricted Supabase RPC/table access.
- Added paid PayOS refund requests and admin refund finalization.
- Added payment-link recovery claims and database-side input validation.
- Added verified-purchase review validation.

### v1.1 - 2026-08-19

- `GET /api/search` now returns `{ "results": [...], "cache_hit": false }`
  instead of a bare array. This is a breaking response-shape change from v1.0;
  frontend clients must read results from `response.results`.
- Added a 60-second in-memory cache for hybrid search results.
- Added `MESSAGE_TOO_LONG` for chat messages over 2,000 characters;
  `INVALID_MESSAGE` remains for missing or empty messages.
- Added `POST /api/auth/refresh` for rotating expired access tokens.
- Added admin-only `POST /api/products/:id/retry-embedding`.
- Added public `GET /api/health` for API and Supabase health checks.
- Added v1.2 account-management and product-review endpoints.

The previous v1.0 response shape should not be mixed with this reference when
comparing API documents for submission.

### v1.2 - 2026-08-19

Added reviews, profile updates, password reset/change, and the associated
database uniqueness index for one review per user/product.

Reviews and password-management endpoints are now included in v1.2.

## Authentication

Public endpoints are `/api/auth/register`,
`/api/auth/login`, `GET /api/products`, `GET /api/products/:id`,
`GET /api/categories`, `GET /api/categories/:categoryId`, `GET /api/search`,
and `/webhook/payment`. Protected endpoints require a Bearer token:

```
Authorization: Bearer <supabase-jwt-token>
```

Endpoints marked as admin-only additionally require a user whose Supabase
`app_metadata.role` is `admin`.

---

## Auth Endpoints

### Register

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Doe" (optional)
}

Response:
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": { "id": "uuid", "email": "..." },
    "session": { "access_token": "...", "refresh_token": "..." }
  }
}
```

### Login

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}

Response: (same as register)
```

### Refresh Access Token

```
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "supabase-refresh-token"
}

Response:
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "session": {
      "access_token": "...",
      "refresh_token": "...",
      "expires_at": 1234567890
    }
  }
}
```

### Get Current User

```
GET /api/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "User profile retrieved",
  "data": {
    "id": "...",
    "email": "...",
    "full_name": "...",
    "role": "customer"
  }
}
```

### Update Profile

```
PUT /api/me
Authorization: Bearer <token>
Content-Type: application/json

{ "full_name": "Nguyen Van A" }
```

### Forgot Password

```
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

The response is intentionally generic so it does not reveal whether the email
exists.

### Change Password

```
PUT /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "current_password": "old-password",
  "new_password": "new-password"
}
```

---

## Chat Endpoints

### Send Chat Message

```
POST /api/rag/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Tell me about iPhones",
  "session_id": "optional-session-uuid"
}

Response:
{
  "success": true,
  "message": "Chat response generated",
  "data": {
    "answer": "Based on our products, we have several iPhone models...",
    "recommendations": [
      { "id": "...", "name": "iPhone 15", "price": 999 }
    ],
    "is_fallback": false,
    "error_type": null,
    "session_id": "uuid"
  }
}
```

`message` is required, must be a non-empty string, and is limited to 2,000
characters. Missing or empty messages return `400 INVALID_MESSAGE`; messages
over the limit return `400 MESSAGE_TOO_LONG`.

### Get Chat History

```
GET /api/chat/history/:session_id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Chat history retrieved",
  "data": {
    "session_id": "uuid",
    "items": [
      {
        "id": "...",
        "question": "...",
        "answer": "...",
        "created_at": "2024-01-01T12:00:00Z"
      }
    ]
  }
}
```

Chat history is scoped to the authenticated user. The server matches both
`session_id` and the authenticated user's `user_id`; a missing or inaccessible
session returns `403 SESSION_FORBIDDEN`.

---

## Product Endpoints

### List Products

```
GET /api/products?page=1&limit=20&category_id=uuid
Authorization: Bearer <token> (optional)

Response:
{
  "success": true,
  "message": "Products retrieved",
  "data": {
    "products": [
      {
        "id": "...",
        "name": "iPhone 15",
        "price": 999,
        "stock": 50,
        "embedding_status": "ready",
        "category_id": "..."
      }
    ]
  }
}
```

### Get Product Detail

```
GET /api/products/:id
Authorization: Bearer <token> (optional)

Response: (single product object in data)
```

### Create Product

```
POST /api/products
Authorization: Bearer <token> (admin required)
Content-Type: application/json

{
  "name": "iPhone 15 Pro",
  "description": "Latest Apple phone",
  "price": 1099,
  "stock": 100,
  "category_id": "uuid"
}

Response: (product object with embedding_status: "pending")
```

### Update Product

```
PUT /api/products/:id
Authorization: Bearer <token> (admin required)
Content-Type: application/json

{
  "name": "iPhone 15 Pro Max",
  "price": 1199
}

Response: (updated product, re-embedding triggered if name/description changed)
```

When `name` or `description` is present in the update body, the server
combines the new value with the unchanged value from the existing product,
generates a new embedding, and updates `embedding_status` to `pending`,
`ready`, or `failed`. Other product updates do not trigger re-embedding.

### Delete Product (Soft Delete)

```
DELETE /api/products/:id
Authorization: Bearer <token> (admin required)

Response: (product with is_active: false)
```

### Retry Product Embedding (Admin)

```
POST /api/products/:id/retry-embedding
Authorization: Bearer <admin-token>

Response: (product with embedding_status: "ready" or "failed")
```

The endpoint reuses the product's current `name` and `description`, retries
embedding generation up to three times, and persists the resulting status.

### Product Reviews

```
GET /api/products/:id/reviews

POST /api/products/:id/reviews
Authorization: Bearer <token>
Content-Type: application/json

{ "rating": 5, "comment": "Excellent product" }
```

Ratings must be integers from 1 to 5, comments are limited to 2,000
characters, and each user can review a product once.

---

## Health Endpoint

### API Health

```
GET /api/health

Response 200:
{
  "status": "ok",
  "checks": {
    "supabase": "ok",
    "gemini": "configured",
    "payos": "configured"
  },
  "timestamp": "..."
}
```

Returns `503` when the Supabase connectivity check fails.

---

## Search Endpoints

### Search Products

```
GET /api/search?q=iphone&mode=hybrid&alpha=0.5&limit=5

Response:
{
  "results": [
    {
      "id": "uuid",
      "name": "iPhone 15",
      "price": 999
    }
  ],
  "cache_hit": false
}
```

Query parameters:

- `q`: required search text
- `mode`: optional `keyword`, `vector`, or `hybrid`; default `hybrid`.
  Keyword mode uses full-text search only. Vector mode uses embedding similarity
  only. Hybrid mode combines both scores.
- `alpha`: optional hybrid-search weight from `0` to `1`, default `0.5`
- `limit`: optional result count from `1` to `50`, default `5`

Search results use an in-memory cache keyed by normalized query, `mode`,
`alpha`, and `limit`. Entries expire after 60 seconds by default and are capped
at 500 entries. Set `SEARCH_CACHE_TTL_MS` to change the TTL. `cache_hit` is
`true` when the response came from this cache.

---

## Category Endpoints

### List Categories

```
GET /api/categories

Response:
{
  "success": true,
  "message": "Categories retrieved",
  "data": {
    "categories": [
      { "id": "...", "name": "Electronics", "slug": "electronics" }
    ]
  }
}
```

### Get Category Detail

```
GET /api/categories/:categoryId?withProducts=true

Response:
{
  "success": true,
  "data": {
    "category": {
      "id": "...",
      "name": "Electronics",
      "products": [ /* if withProducts=true */ ]
    }
  }
}
```

### Create Category (Admin)

```
POST /api/categories
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "Điện thoại",
  "slug": "dien-thoai"
}

Response:
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "category": {
      "id": "uuid",
      "name": "Điện thoại",
      "slug": "dien-thoai",
      "created_at": "..."
    }
  }
}
```

### Update Category (Admin)

```
PUT /api/categories/:categoryId
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "Điện thoại thông minh",
  "slug": "dien-thoai-thong-minh"
}

Response: (updated category in data.category)
```

### Delete Category (Admin)

```
DELETE /api/categories/:categoryId
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "message": "Category deleted successfully",
  "data": {
    "deleted": true,
    "category": { "id": "uuid", "name": "...", "slug": "..." }
  }
}
```

Deleting a category sets `products.category_id` to `null` according to the
database foreign-key policy.

---

## Order Endpoints

### Create Order

```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "payment_method": "payos",
  "items": [
    { "product_id": "uuid", "quantity": 1 }
  ]
}

Response:
{
  "success": true,
  "message": "Order created successfully",
  "data": { "order": { "id": "...", "status": "pending" } }
}
```

### List My Orders

```
GET /api/orders?page=1&limit=20
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Orders retrieved",
  "data": {
    "orders": [
      {
        "id": "...",
        "status": "pending",
        "total": 1099.99,
        "order_items": [ { "product_id": "...", "quantity": 1 } ],
        "created_at": "..."
      }
    ],
    "page": 1,
    "limit": 20
  }
}
```

### Get Order Detail

```
GET /api/orders/:orderId
Authorization: Bearer <token>

Response: (single order with full details)
Forbidden 403 if user doesn't own order
```

### Cancel Order

```
PUT /api/orders/:orderId/cancel
Authorization: Bearer <token>

Response: (order with status: "cancelled")
Pending orders are cancelled immediately. A confirmed PayOS order with a
successful payment returns HTTP 202 with `REFUND_REQUIRED`; the order remains
confirmed while an admin processes the external refund. `refund_pending` is a
business label represented by `refund_requests.status = 'pending'`; it is not
a value in the `orders.status` enum.
```

---

## Admin Endpoints (Admin Only)

### List All Orders

```
GET /api/admin/orders?page=1&limit=50&status=pending
Authorization: Bearer <admin-token>

Response: (orders with pagination and user details)
```

### Update Order Status (Admin)

```
PUT /api/admin/orders/:orderId/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "shipped"
}

Response: (updated order)
Error 400 if invalid status transition
```

### Finalize Refund (Admin)

```
POST /api/admin/orders/:orderId/refund/finalize
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "refund_transaction_id": "payos-refund-reference",
  "note": "Refund confirmed in PayOS dashboard"
}
```

This records the refund, marks the order cancelled, and restocks its items in
one database transaction. It must only be called after the external refund is
confirmed.

### Get Analytics Dashboard

```
GET /api/admin/analytics
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": {
    "chat": {
      "total_queries_24h": 150,
      "fallback_rate": "5%",
      "avg_latency_ms": 245,
      "cache_hit_rate": "20%"
    },
    "products": {
      "total_products": 500,
      "embedding_ready": 495,
      "embedding_failed": 5,
      "embedding_ready_rate": "99%"
    },
    "orders": {
      "total_orders": 1250,
      "status_breakdown": { "pending": 50, "confirmed": 150, ... },
      "total_revenue": "49500.00"
    },
    "cron_status": {
      "job_name": "expire_pending_payos_orders",
      "status": "healthy",
      "last_run_at": "2024-01-01T12:15:00Z"
    }
  }
}
```

### Get Admin Event Log

```
GET /api/admin/events?page=1&limit=100
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "...",
        "user_id": "...",
        "action": "update_order_status",
        "resource_type": "order",
        "resource_id": "...",
        "details": { "from_status": "pending", "to_status": "confirmed" },
        "created_at": "..."
      }
    ],
    "page": 1,
    "total": 250
  }
}
```

---

## Webhook Endpoints

### Create PayOS Payment Link

```
POST /api/payments/:orderId/create-link
Authorization: Bearer <token>
Content-Type: application/json

{}

Return and cancel URLs are read from the server environment configuration and
cannot be overridden by the client.

Response:
{
  "success": true,
  "message": "Payment link created",
  "data": {
    "order_id": "uuid",
    "order_code": 123456789,
    "checkout_url": "https://pay.payos.vn/web/...",
    "payment_link_id": "...",
    "qr_code": "...",
    "expires_at": "..."
  }
}
```

### Payment Webhook

```
POST /webhook/payment
Content-Type: application/json
(No Bearer auth required. PayOS HMAC signature is required.)

{
  "order_id": "uuid",
  "order_code": 123456789,
  "transaction_id": "payos-transaction-id",
  "amount": 1099.99,
  "status": "PAID",
  "signature": "payos-signature",
  "raw_webhook_payload": { ... }
}

`order_id` may be omitted when PayOS sends `order_code` returned by the create-link API.

Response:
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "order_id": "...",
    "transaction_id": "...",
    "payment_status": "PAID",
    "order_status": "confirmed",
    "synced_at": "..."
  }
}

Valid statuses: PAID, PENDING, CANCELLED, EXPIRED
- PAID → order.status = "confirmed"
- CANCELLED/EXPIRED → pending orders are cancelled and restocked
- A late cancellation for a non-pending order is ignored safely

The server verifies the sorted payload signature with HMAC-SHA256 using
`PAYOS_CHECKSUM_KEY` before resolving the order or calling payment RPCs.
Invalid signatures return `401 INVALID_WEBHOOK_SIGNATURE`. Duplicate
`transaction_id` values are idempotently ignored by the confirmation RPC.
```

---

## Error Codes

| Code                        | HTTP | Meaning                                          |
| --------------------------- | ---- | ------------------------------------------------ |
| UNAUTHORIZED                | 401  | Missing or invalid token                         |
| FORBIDDEN                   | 403  | Not authorized (ownership/role check failed)     |
| ADMIN_FORBIDDEN             | 403  | Admin access required                            |
| INVALID_MESSAGE             | 400  | Message is missing or empty                      |
| MESSAGE_TOO_LONG            | 400  | Message exceeds 2,000 characters                 |
| REFRESH_TOKEN_REQUIRED      | 400  | Refresh token is missing                         |
| REFRESH_TOKEN_INVALID       | 401  | Refresh token is invalid or expired              |
| EMBEDDING_RETRY_FAILED      | 500  | Embedding retry failed                           |
| CURRENT_PASSWORD_INVALID    | 401  | Current password is invalid                      |
| PASSWORD_RESET_FAILED       | 500  | Password reset request failed                    |
| PASSWORD_CHANGE_FAILED      | 500  | Password change failed                           |
| PROFILE_UPDATE_FAILED       | 500  | Profile update failed                            |
| REVIEW_CREATE_FAILED        | 400  | Review creation failed                           |
| PURCHASE_REQUIRED           | 400  | A completed purchase is required to review       |
| REVIEWS_FETCH_FAILED        | 500  | Review retrieval failed                          |
| CHAT_RATE_LIMIT             | 429  | Too many requests (retry_after_seconds included) |
| INVALID_ORDER_ID            | 400  | Order ID missing or invalid                      |
| ORDER_NOT_FOUND             | 404  | Order doesn't exist                              |
| ORDER_FORBIDDEN             | 403  | User doesn't own this order                      |
| REFUND_REQUIRED             | 202  | Paid order awaits refund processing              |
| REFUND_TRANSACTION_REQUIRED | 400  | Refund reference is missing                      |
| REFUND_FINALIZE_FAILED      | 409  | Refund cannot be finalized                       |
| SESSION_FORBIDDEN           | 403  | User cannot access the chat session              |
| INVALID_STATUS_TRANSITION   | 400  | Invalid status change                            |
| INVALID_CATEGORY_ID         | 400  | Category ID missing or invalid                   |
| CATEGORY_NOT_FOUND          | 404  | Category doesn't exist                           |
| CATEGORY_CREATE_FAILED      | 400  | Category creation failed                         |
| CATEGORY_UPDATE_FAILED      | 400  | Category update failed                           |
| CATEGORY_DELETE_FAILED      | 400  | Category deletion failed                         |
| INVALID_WEBHOOK             | 400  | Missing required webhook fields                  |
| INTERNAL_ERROR              | 500  | Server error (see message)                       |

---

## Rate Limiting

- **Chat endpoint**: 10 requests/minute per user
- **Response header**: `Retry-After: <seconds>` when rate limited
- Returns 429 with `retry_after_seconds` in error data

---

## Pagination

All list endpoints support:

```
?page=1&limit=20
```

Default limits:

- Products: 20
- Orders (customer): 20
- Orders (admin): 50
- Events: 100

---

## Status Lifecycle

Orders follow this status flow:

```
pending → confirmed → shipped → completed
      ↘ cancelled

    confirmed PayOS + successful payment → refund_requests.pending → cancelled
           (after admin confirms external refund)
```

Admin updates are still checked against the same allowed transition map.
Admins can update orders without ownership checks, but cannot bypass invalid
transitions; for example, `pending` cannot move directly to `shipped` and
`completed` cannot move to another status.
Customers can cancel pending orders immediately. Paid confirmed PayOS orders
create a row in `refund_requests`, write a `refund_requested` admin event, and
remain confirmed until an admin finalizes it. Payment statuses are the internal
enum `pending`, `success`, and `failed`; specifically, PayOS `PAID` maps to
`payments.status = 'success'`. PayOS webhook statuses are mapped to these
values and are not stored verbatim in `payments.status`.

---

## Response Examples

### Success

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { "id": "...", "name": "..." },
  "error": null
}
```

### Client Error

```json
{
  "success": false,
  "message": "Invalid request",
  "data": null,
  "error": {
    "code": "INVALID_MESSAGE",
    "retry_after_seconds": 15
  }
}
```

### Server Error

```json
{
  "success": false,
  "message": "Internal server error",
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR"
  }
}
```

---

**API Documentation v1.3 - Current contract**
