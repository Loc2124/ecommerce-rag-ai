# API Reference - Ecommerce RAG AI

## Authentication

All endpoints except `/api/categories/*` require Bearer token:

```
Authorization: Bearer <supabase-jwt-token>
```

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

### Get Current User

```
GET /api/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "User profile retrieved",
  "data": {
    "user": { "id": "...", "email": "...", "user_metadata": {} }
  }
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

### Delete Product (Soft Delete)

```
DELETE /api/products/:id
Authorization: Bearer <token> (admin required)

Response: (product with is_active: false)
```

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
      { "id": "...", "name": "Electronics", "description": "..." }
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
Error 400 if order not in cancelable state (pending/confirmed)
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

{
  "return_url": "https://your-domain.com/payment/success",
  "cancel_url": "https://your-domain.com/payment/cancel"
}

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
(No auth required, but should verify PayOS signature)

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
- CANCELLED/EXPIRED → order.status = "cancelled"
```

---

## Error Codes

| Code                      | HTTP | Meaning                                          |
| ------------------------- | ---- | ------------------------------------------------ |
| UNAUTHORIZED              | 401  | Missing or invalid token                         |
| FORBIDDEN                 | 403  | Not authorized (ownership/role check failed)     |
| ADMIN_FORBIDDEN           | 403  | Admin access required                            |
| INVALID_MESSAGE           | 400  | Message is required or invalid                   |
| CHAT_RATE_LIMIT           | 429  | Too many requests (retry_after_seconds included) |
| INVALID_ORDER_ID          | 400  | Order ID missing or invalid                      |
| ORDER_NOT_FOUND           | 404  | Order doesn't exist                              |
| ORDER_FORBIDDEN           | 403  | User doesn't own this order                      |
| INVALID_STATUS_TRANSITION | 400  | Invalid status change                            |
| INVALID_CATEGORY_ID       | 400  | Category ID missing or invalid                   |
| CATEGORY_NOT_FOUND        | 404  | Category doesn't exist                           |
| INVALID_WEBHOOK           | 400  | Missing required webhook fields                  |
| INTERNAL_ERROR            | 500  | Server error (see message)                       |

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
       ↘ cancelled ↙
         (from pending or confirmed only)
```

Admin can force status transitions (with validation).
Customers can only cancel pending/confirmed orders.

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

**API Documentation v1.0 - Ready for Integration Testing**
