const DEFAULT_DELAY_MS = 5000;
const MAX_BACKOFF_MS = 60000;
let nextRequestAt = 0;
let currentKeyIndex = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDailyQuotaError(error) {
  return /GenerateRequestsPerDay|per day|daily quota|quotaValue.*\b\d+\b/i.test(
    String(error?.message || error),
  );
}

function getGeminiKeys() {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  return [
    ...new Set(
      raw
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
}

function isQuotaError(error) {
  return /429|quota|rate.?limit|resource.?exhausted/i.test(
    String(error?.message || error),
  );
}

function isAccessError(error) {
  return /401|403|forbidden|unauthorized|denied access|invalid api key/i.test(
    String(error?.message || error),
  );
}

function isModelUnavailableError(error) {
  return /404|model .*not found|model .*no longer available|model unavailable/i.test(
    String(error?.message || error),
  );
}

function getProviderRetryDelayMs(error) {
  const message = String(error?.message || error);
  const match = message.match(
    /retryDelay["']?\s*:\s*["']?(\d+)s|retry after\s+(\d+)\s*seconds?/i,
  );
  return match ? (Number(match[1] || match[2]) + 1) * 1000 : null;
}

async function throttle(
  delayMs = Number(process.env.GEMINI_REQUEST_DELAY_MS) || DEFAULT_DELAY_MS,
) {
  const now = Date.now();
  const waitMs = Math.max(0, nextRequestAt - now);
  if (waitMs > 0) await wait(waitMs);
  nextRequestAt = Date.now() + delayMs;
}

async function callGeminiWithBackoff(operation, options = {}) {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error("No Gemini API key is configured");
  const maxRetries = options.maxRetries || 5;
  const baseDelayMs = options.baseDelayMs || 5000;
  const maxDelayMs = options.maxDelayMs || MAX_BACKOFF_MS;

  const attemptedKeys = new Set();
  let keyIndex = currentKeyIndex;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      await throttle(options.throttleMs);
      attemptedKeys.add(keyIndex);
      return await operation(keys[keyIndex]);
    } catch (error) {
      if (isModelUnavailableError(error)) {
        throw new Error(
          `Gemini model is unavailable: ${error.message || error}. Update LLM_MODEL or EMBEDDING_MODEL to a model enabled for this project.`,
        );
      }
      if (
        (isQuotaError(error) || isAccessError(error)) &&
        attemptedKeys.size < keys.length
      ) {
        keyIndex = (keyIndex + 1) % keys.length;
        currentKeyIndex = keyIndex;
        console.warn(
          `Gemini access/quota error on key ${attemptedKeys.size}; rotating to configured key ${keyIndex + 1}/${keys.length}`,
        );
        attempt -= 1;
        continue;
      }
      if (isAccessError(error)) {
        throw new Error(
          `Gemini access denied for all ${attemptedKeys.size} configured key(s). Check API key validity, project access, billing/API enablement, and model availability.`,
        );
      }
      if (isDailyQuotaError(error)) {
        throw new Error(
          "Gemini daily quota exceeded. Wait for quota reset or use a different model/API project; retrying will not help.",
        );
      }
      if (attempt === maxRetries - 1) {
        throw new Error(
          `Gemini request failed after ${maxRetries} attempts: ${error.message || error}`,
        );
      }

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const providerDelay = getProviderRetryDelayMs(error);
      const delayMs = Math.min(maxDelayMs, providerDelay || exponentialDelay);
      console.warn(
        `Gemini rate/API error; retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`,
      );
      await wait(delayMs);
    }
  }
}

module.exports = {
  callGeminiWithBackoff,
  getGeminiKeys,
  isDailyQuotaError,
  wait,
};
