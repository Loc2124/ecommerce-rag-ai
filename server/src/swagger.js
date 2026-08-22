const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Ecommerce RAG AI API",
    version: "1.0.0",
    description: "API documentation for the Ecommerce RAG AI server.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
  tags: [
    { name: "Auth" },
    { name: "AI" },
    { name: "Products" },
    { name: "Categories" },
    { name: "Orders" },
    { name: "Search" },
    { name: "Admin" },
    { name: "Payments" },
    { name: "Webhooks" },
    { name: "Health" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
          data: { nullable: true },
          error: { nullable: true },
        },
      },
      AuthRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6, format: "password" },
          full_name: { type: "string" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number", format: "float" },
          stock: { type: "integer" },
          category_id: { type: "string", format: "uuid", nullable: true },
          embedding_status: { type: "string" },
        },
      },
      Category: {
        type: "object",
        required: ["name", "slug"],
        properties: {
          id: { type: "string", format: "uuid", readOnly: true },
          name: { type: "string" },
          slug: { type: "string" },
          created_at: { type: "string", format: "date-time", readOnly: true },
        },
      },
      OrderItem: {
        type: "object",
        required: ["product_id", "quantity"],
        properties: {
          product_id: { type: "string", format: "uuid" },
          quantity: { type: "integer", minimum: 1 },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Check API and dependency health",
        responses: {
          200: { description: "API and Supabase are healthy" },
          503: { description: "A dependency is unavailable" },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a user",
        requestBody: { $ref: "#/components/requestBodies/Auth" },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login a user",
        requestBody: { $ref: "#/components/requestBodies/Auth" },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh an expired access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refresh_token"],
                properties: { refresh_token: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { $ref: "#/components/responses/Success" },
          401: { description: "Invalid refresh token" },
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/auth/change-password": {
      put: {
        tags: ["Auth"],
        summary: "Change the authenticated user's password",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["current_password", "new_password"],
                properties: {
                  current_password: { type: "string", format: "password" },
                  new_password: {
                    type: "string",
                    minLength: 6,
                    format: "password",
                  },
                },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current user",
        security: [{ bearerAuth: [] }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      put: {
        tags: ["Auth"],
        summary: "Update the authenticated user's profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { full_name: { type: "string", maxLength: 120 } },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/rag/chat": {
      post: {
        tags: ["AI"],
        summary: "Chat with the product assistant",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string", maxLength: 2000 },
                  session_id: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/chat/history/{session_id}": {
      get: {
        tags: ["AI"],
        summary: "Get chat history for a session",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/session_id" }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "List products",
        parameters: [
          { $ref: "#/components/parameters/category_id" },
          { $ref: "#/components/parameters/page" },
          { $ref: "#/components/parameters/limit" },
        ],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      post: {
        tags: ["Products"],
        summary: "Create a product",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Product" },
            },
          },
        },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/products/{id}": {
      parameters: [{ $ref: "#/components/parameters/id" }],
      get: {
        tags: ["Products"],
        summary: "Get a product",
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      put: {
        tags: ["Products"],
        summary: "Update a product",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Product" },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      delete: {
        tags: ["Products"],
        summary: "Soft-delete a product",
        security: [{ bearerAuth: [] }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/products/{id}/reviews": {
      get: {
        tags: ["Products"],
        summary: "List product reviews",
        parameters: [{ $ref: "#/components/parameters/id" }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      post: {
        tags: ["Products"],
        summary: "Create a product review",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/id" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rating"],
                properties: {
                  rating: { type: "integer", minimum: 1, maximum: 5 },
                  comment: { type: "string", maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/products/{id}/retry-embedding": {
      post: {
        tags: ["Products"],
        summary: "Retry a failed product embedding",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/id" }],
        responses: {
          200: { $ref: "#/components/responses/Success" },
          404: { description: "Product not found" },
        },
      },
    },
    "/api/categories": {
      get: {
        tags: ["Categories"],
        summary: "List categories",
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      post: {
        tags: ["Categories"],
        summary: "Create a category",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Category" },
            },
          },
        },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/categories/{categoryId}": {
      get: {
        tags: ["Categories"],
        summary: "Get a category",
        parameters: [
          { $ref: "#/components/parameters/categoryId" },
          {
            name: "withProducts",
            in: "query",
            schema: { type: "boolean" },
          },
        ],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      put: {
        tags: ["Categories"],
        summary: "Update a category",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/categoryId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Category" },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      delete: {
        tags: ["Categories"],
        summary: "Delete a category",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/categoryId" }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "List the current user's orders",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/page" },
          { $ref: "#/components/parameters/limit" },
        ],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
      post: {
        tags: ["Orders"],
        summary: "Create an order",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: {
                    type: "array",
                    items: { $ref: "#/components/schemas/OrderItem" },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/orders/{orderId}": {
      get: {
        tags: ["Orders"],
        summary: "Get an order",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/orderId" }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/orders/{orderId}/cancel": {
      put: {
        tags: ["Orders"],
        summary: "Cancel an order",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/orderId" }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Keyword, vector, or hybrid product search",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "mode",
            in: "query",
            schema: {
              type: "string",
              enum: ["keyword", "vector", "hybrid"],
              default: "hybrid",
            },
          },
          {
            name: "alpha",
            in: "query",
            schema: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 5 },
          },
        ],
        responses: {
          200: {
            description: "Matching products",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["results", "cache_hit"],
                  properties: {
                    results: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Product" },
                    },
                    cache_hit: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "List all orders",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/page" },
          { $ref: "#/components/parameters/limit" },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/admin/orders/{orderId}/status": {
      put: {
        tags: ["Admin"],
        summary: "Update an order status",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/orderId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: { status: { type: "string" } },
              },
              "/api/admin/orders/{orderId}/refund/finalize": {
                post: {
                  tags: ["Admin"],
                  summary: "Finalize an externally processed refund",
                  security: [{ bearerAuth: [] }],
                  parameters: [{ $ref: "#/components/parameters/orderId" }],
                  requestBody: {
                    required: true,
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          required: ["refund_transaction_id"],
                          properties: {
                            refund_transaction_id: { type: "string" },
                            note: { type: "string", maxLength: 1000 },
                          },
                        },
                      },
                    },
                  },
                  responses: {
                    200: { $ref: "#/components/responses/Success" },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/admin/analytics": {
      get: {
        tags: ["Admin"],
        summary: "Get admin analytics",
        security: [{ bearerAuth: [] }],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/admin/events": {
      get: {
        tags: ["Admin"],
        summary: "List admin events",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/page" },
          { $ref: "#/components/parameters/limit" },
        ],
        responses: { 200: { $ref: "#/components/responses/Success" } },
      },
    },
    "/api/payments/{orderId}/create-link": {
      post: {
        tags: ["Payments"],
        summary: "Create a payment link",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/orderId" }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: { 201: { $ref: "#/components/responses/Success" } },
      },
    },
    "/webhook/payment": {
      post: {
        tags: ["Webhooks"],
        summary: "Receive a payment webhook",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: { 200: { description: "Webhook processed" } },
      },
    },
  },
};

swaggerDefinition.components.parameters = {
  id: {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  orderId: {
    name: "orderId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  categoryId: {
    name: "categoryId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  session_id: {
    name: "session_id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  email: {
    name: "email",
    in: "query",
    required: true,
    schema: { type: "string", format: "email" },
  },
  category_id: {
    name: "category_id",
    in: "query",
    schema: { type: "string", format: "uuid" },
  },
  page: {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  limit: {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 20 },
  },
};

swaggerDefinition.components.requestBodies = {
  Auth: {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/AuthRequest" },
      },
    },
  },
};

swaggerDefinition.components.responses = {
  Success: {
    description: "Successful response",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiResponse" },
      },
    },
  },
};

module.exports = swaggerDefinition;
