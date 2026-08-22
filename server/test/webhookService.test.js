const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.PAYOS_CHECKSUM_KEY = "test-checksum-key";

const { verifyPayOSSignature } = require("../src/services/webhookService");

function signData(data) {
  const message = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("&");
  return crypto
    .createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
    .update(message)
    .digest("hex");
}

test("accepts a valid PayOS signed data payload", () => {
  const data = {
    orderCode: 123456,
    amount: 150000,
    description: "Order test",
    code: "00",
  };

  assert.equal(verifyPayOSSignature({ data, signature: signData(data) }), true);
});

test("rejects a tampered PayOS payload", () => {
  const data = {
    orderCode: 123456,
    amount: 150000,
    description: "Order test",
    code: "00",
  };
  const payload = { data, signature: signData(data) };
  payload.data.amount = 1;

  assert.equal(verifyPayOSSignature(payload), false);
});

test("rejects a missing or malformed signature", () => {
  const data = { orderCode: 123456, amount: 150000 };

  assert.equal(verifyPayOSSignature({ data }), false);
  assert.equal(
    verifyPayOSSignature({ data, signature: "not-a-valid-signature" }),
    false,
  );
});
