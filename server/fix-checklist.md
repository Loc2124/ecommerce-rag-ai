# Fix Checklist theo module

## Auth

- [x] Chốt policy auth rõ ràng: login/register customer-only hoặc guest-mode rõ ràng
- [x] Kiểm tra `register` có `email/password` tối thiểu, password length >= 6
- [x] Kiểm tra `email` trước khi signUp và trả về `409` nếu đã tồn tại
- [x] Chuẩn hóa response JSON `success/message/data/error`
- [x] Xử lý `email rate limit` bằng mã `429` và message rõ ràng
- [x] `GET /api/me` luôn trả profile từ token xác thực

## Chat

- [x] Route `/api/rag/chat` chỉ cho authenticated user
- [x] `session_id` phải gắn với `user_id` khi tạo log/chat session
- [x] Kiểm tra sở hữu `session_id` trước khi đọc history
- [x] Response có `is_fallback` và `error_type` khi Gemini/search fail
- [x] Thêm rate limit/quota theo user
- [x] Validate `message` length và input sanitization
- [x] Trả về response format thống nhất với các module khác

## Orders

- [x] Thêm ownership check cho `GET /orders/:id`
- [x] Thêm ownership check cho `PUT /orders/:id/cancel`
- [x] Validate trạng thái chuyển đổi hợp lệ (`pending -> confirmed -> shipped -> completed`)
- [x] Thêm pagination cho `GET /orders` customer
- [x] Kiểm tra webhook status đồng bộ với trạng thái đơn

## Products

- [x] Thêm retry logic cho embedding generation
- [x] Theo dõi trạng thái `embedding_status` / `is_indexed`
- [x] Re-embed khi `name` hoặc `description` thay đổi
- [x] Dùng soft delete thay vì hard delete
- [x] Chuẩn hóa response JSON và error code
- [x] Thêm `GET /categories` nếu cần cho frontend

## Admin

- [x] `GET /admin/orders` có page/pagination
- [x] `PUT /admin/orders/:id/status` validate chuyển trạng thái hợp lệ
- [x] `GET /admin/analytics` có metric cho latency, cache rate, cron status
- [x] Expose cron status cho `expire_pending_payos_orders`
- [x] Có event log cho admin action

## Webhook & Integration

- [x] `POST /webhook/payment` - Receive and sync payment status to order
- [x] Admin event logging (`logAdminEvent()` on all admin updates)
- [x] Cron job status tracking (`getCronJobStatus()`)

## P0/P1 đã hoàn thành

- [x] Chat route auth-only
- [x] Chat response có `is_fallback` và `error_type`
- [x] Product embedding generation thêm retry
- [x] Chat ownership check cho history endpoint
- [x] Rate limit / quota cho chat
- [x] Product embedding status tracking
- [x] Orders ownership validation
- [x] Admin order management + analytics
- [x] Categories endpoint
- [x] Event logging + webhook sync + cron status
