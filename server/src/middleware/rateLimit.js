const MAX_BUCKETS = 10000;
const buckets = new Map();

function createRateLimiter({
  limit,
  windowMs,
  keyGenerator = (req) => req.ip,
}) {
  return (req, res, next) => {
    const key = `${req.path}:${keyGenerator(req) || "unknown"}`;
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
      for (const [bucketKey, timestamps] of buckets) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) {
          buckets.delete(bucketKey);
          break;
        }
      }
      if (buckets.size >= MAX_BUCKETS) {
        buckets.delete(buckets.keys().next().value);
      }
    }

    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - recent[0])) / 1000),
      );
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        data: null,
        error: { code: "RATE_LIMITED", retry_after_seconds: retryAfterSeconds },
      });
    }

    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
}

module.exports = { createRateLimiter };
