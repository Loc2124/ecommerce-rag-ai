# Product API Test Cases

## 1) GET /api/products

Purpose: list products with pagination and filtering.

Request:
GET /api/products?category_id=<id>&page=1&limit=10

Expected status: 200
Expected response shape:
{
"success": true,
"message": "Products retrieved",
"data": { "products": [ ... ] },
"error": null
}

Notes:

- Returns only active products.
- Sorted by created_at DESC.
- Supports page and limit parameters.

## 2) GET /api/products/:id

Purpose: get a single product by id.

Request:
GET /api/products/<product_id>

Expected status: 200 if product exists.
Expected 404 if product does not exist or is inactive.

Expected response shape:
{
"success": true,
"message": "Product retrieved",
"data": { "product": { "...": "...", "embedding_status": "ready" } },
"error": null
}

## 3) POST /api/products

Purpose: create a new product.

Request body example:
{
"category_id": "<uuid>",
"sku": "iphone-15-pro",
"name": "iPhone 15 Pro",
"description": "Latest iPhone model",
"attributes": {
"brand": "Apple",
"color": "Black"
},
"price": 29990000,
"stock": 15
}

Expected status: 201
Expected response shape:
{
"success": true,
"message": "Product created successfully",
"data": { "...": "...", "embedding_status": "pending" },
"error": null
}

Notes:

- name and price are required.
- price must be finite and non-negative; stock must be a non-negative integer.
- product embedding is generated automatically if Gemini key is available.

## 4) PUT /api/products/:id

Purpose: update a product.

Request body example:
{
"price": 24990000,
"stock": 20,
"description": "Updated description"
}

Expected status: 200
Expected 404 if product not found.

Expected response shape:
{
"success": true,
"message": "Product updated successfully",
"data": { ... },
"error": null
}

## 5) DELETE /api/products/:id

Purpose: soft delete product.

Request:
DELETE /api/products/<product_id>

Expected status: 200
Expected response shape:
{
"success": true,
"message": "Product deleted successfully",
"data": {
"deleted": true,
"product": { ... }
},
"error": null
}

Notes:

- Actual deletion is soft-delete via is_active = false.

## 6) Negative cases

- GET /api/products/:id with invalid id -> 404
- POST /api/products with missing name or price -> 400
- POST /api/products with negative, NaN, or infinite price/stock -> 400
- PUT /api/products/:id with invalid payload -> 400
- DELETE /api/products/:id with unknown id -> 404

## Security cases

- Product mutation without a token -> 401
- Product mutation with a valid non-admin token -> 403
- Review without a completed purchase -> 400 PURCHASE_REQUIRED
- Duplicate review for the same user/product -> 400
- Direct anon/authenticated Supabase table access -> denied by RLS/grants
- Payment webhook with an invalid or tampered signature -> 401

## Example curl commands

List products:
curl "http://localhost:3000/api/products?page=1&limit=5"

Get by id:
curl "http://localhost:3000/api/products/<product_id>"

Create product:
curl -X POST http://localhost:3000/api/products \
 -H "Authorization: Bearer <token>" \
 -H "Content-Type: application/json" \
 -d '{
"name": "iPhone 15 Pro",
"price": 29990000,
"description": "Latest iPhone model",
"stock": 10
}'

Update product:
curl -X PUT http://localhost:3000/api/products/<product_id> \
 -H "Authorization: Bearer <token>" \
 -H "Content-Type: application/json" \
 -d '{"price": 24990000}'

Delete product:
curl -X DELETE http://localhost:3000/api/products/<product_id> \
 -H "Authorization: Bearer <token>"
