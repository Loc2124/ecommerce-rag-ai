const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function verifyPayOSSignature(payload) {
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  const signature = payload?.signature;
  if (!checksumKey || !signature) return false;

  const source =
    payload.data && typeof payload.data === "object"
      ? payload.data
      : Object.fromEntries(
          Object.entries(payload).filter(
            ([key]) => key !== "signature" && key !== "raw_webhook_payload",
          ),
        );
  const message = Object.keys(source)
    .sort()
    .map((key) => `${key}=${source[key]}`)
    .join("&");
  const expected = require("crypto")
    .createHmac("sha256", checksumKey)
    .update(message)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");
  return (
    expectedBuffer.length === signatureBuffer.length &&
    require("crypto").timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

async function resolveOrderId(orderId, orderCode) {
  if (orderId) return orderId;
  if (!orderCode) throw new Error("order_id or order_code is required");

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("payos_order_code", Number(orderCode))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Order not found for PayOS order code");
  return data.id;
}

async function syncPaymentWebhookStatus(
  orderId,
  transactionId,
  webhookStatus,
  amount,
  rawPayload = null,
) {
  try {
    let orderStatus = "pending";
    if (webhookStatus === "PAID") {
      if (!transactionId || amount === undefined || amount === null) {
        throw new Error("transaction_id and amount are required for PAID");
      }

      const { data, error } = await supabase.rpc("confirm_payos_payment", {
        p_order_id: orderId,
        p_transaction_id: transactionId,
        p_amount: Number(amount),
      });
      if (error) throw error;
      orderStatus = data;

      const { error: payloadError } = await supabase
        .from("payments")
        .update({ raw_webhook_payload: rawPayload || {} })
        .eq("transaction_id", transactionId);
      if (payloadError) throw payloadError;
    } else if (webhookStatus === "CANCELLED" || webhookStatus === "EXPIRED") {
      const { data, error } = await supabase.rpc("cancel_and_restock_order", {
        p_order_id: orderId,
        p_new_status: webhookStatus.toLowerCase(),
      });
      if (error) throw error;
      orderStatus = data;
    }

    return {
      order_id: orderId,
      transaction_id: transactionId || null,
      payment_status: webhookStatus,
      order_status: orderStatus,
      synced_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error syncing webhook status:", error?.message || error);
    throw error;
  }
}

async function getCronJobStatus() {
  try {
    const { data: cronLogs, error } = await supabase
      .from("cron_logs")
      .select(
        "id, job_name, status, duration_ms, error_message, rows_affected, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      if (error.code === "PGRST116") {
        return {
          job_name: "expire_pending_payos_orders",
          status: "table_not_found",
          message: "Cron logs table not yet created",
          last_runs: [],
        };
      }
      throw error;
    }

    const now = new Date();
    const lastRun = cronLogs && cronLogs.length > 0 ? cronLogs[0] : null;
    const isHealthy =
      lastRun &&
      now.getTime() - new Date(lastRun.created_at).getTime() < 15 * 60 * 1000;

    return {
      job_name: "expire_pending_payos_orders",
      status: isHealthy ? "healthy" : "delayed",
      last_run_at: lastRun?.created_at || null,
      last_run_duration_ms: lastRun?.duration_ms || null,
      recent_runs: cronLogs || [],
    };
  } catch (error) {
    console.error("Error getting cron status:", error?.message || error);
    return {
      job_name: "expire_pending_payos_orders",
      status: "error",
      error: error?.message || "Unknown error",
    };
  }
}

module.exports = {
  resolveOrderId,
  verifyPayOSSignature,
  syncPaymentWebhookStatus,
  getCronJobStatus,
};
