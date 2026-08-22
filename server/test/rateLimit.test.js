const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../src/middleware/rateLimit");

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rate limiter isolates password attempts by user", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 60000,
    keyGenerator: (req) => req.user.id,
  });
  const request = (userId) => ({
    path: "/api/auth/change-password",
    user: { id: userId },
    ip: "127.0.0.1",
  });
  const run = (userId) => {
    const response = createResponse();
    let nextCalled = false;
    limiter(request(userId), response, () => {
      nextCalled = true;
    });
    return { response, nextCalled };
  };

  assert.equal(run("user-a").nextCalled, true);
  assert.equal(run("user-a").response.statusCode, 429);
  assert.equal(run("user-b").nextCalled, true);
});

test("rate limiter returns retry metadata when blocked", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60000 });
  const request = { path: "/api/auth/login", ip: "192.0.2.1" };
  const firstResponse = createResponse();
  limiter(request, firstResponse, () => {});

  const blockedResponse = createResponse();
  limiter(request, blockedResponse, () => {});

  assert.equal(blockedResponse.statusCode, 429);
  assert.match(blockedResponse.headers["Retry-After"], /^\d+$/);
  assert.equal(blockedResponse.body.error.code, "RATE_LIMITED");
});
