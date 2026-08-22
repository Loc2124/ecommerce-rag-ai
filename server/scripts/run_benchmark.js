const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { callGeminiWithBackoff } = require("./gemini_utils");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MODES = ["keyword", "vector", "hybrid"];
const casesPath = path.resolve(__dirname, "benchmark_cases.json");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const embeddingCache = new Map();
const embeddingCachePath = path.resolve(
  __dirname,
  "../.benchmark-cache/benchmark_embeddings.json",
);

async function loadEmbeddingCache() {
  try {
    const saved = JSON.parse(await fs.readFile(embeddingCachePath, "utf8"));
    for (const [question, embedding] of Object.entries(saved)) {
      embeddingCache.set(question, embedding);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function saveEmbeddingCache() {
  await fs.mkdir(path.dirname(embeddingCachePath), { recursive: true });
  await fs.writeFile(
    embeddingCachePath,
    JSON.stringify(Object.fromEntries(embeddingCache)),
  );
}

async function generateEmbedding(text) {
  if (embeddingCache.has(text)) return embeddingCache.get(text);
  const result = await callGeminiWithBackoff((apiKey) => {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    return new GoogleGenerativeAI(apiKey)
      .getGenerativeModel({
        model: process.env.EMBEDDING_MODEL || "models/gemini-embedding-001",
      })
      .embedContent(text);
  });
  const values = result?.embedding?.values;
  const expectedDimension = Number(process.env.EMBEDDING_DIM) || 3072;
  if (!Array.isArray(values) || values.length !== expectedDimension) {
    throw new Error(`Unexpected embedding dimension for: ${text}`);
  }
  embeddingCache.set(text, values);
  await saveEmbeddingCache();
  return values;
}

function metrics(results, expectedIds) {
  const returnedIds = new Set((results || []).slice(0, 5).map((row) => row.id));
  const expected = new Set(expectedIds);
  let hits = 0;
  for (const id of returnedIds) {
    if (expected.has(id)) hits += 1;
  }
  return {
    precision_at_5: hits / 5,
    recall_at_5: expected.size ? hits / expected.size : 0,
  };
}

async function loadCases() {
  const raw = await fs.readFile(casesPath, "utf8");
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Benchmark dataset is empty");
  }
  return cases;
}

async function resolveProducts(cases) {
  const skus = [...new Set(cases.flatMap((item) => item.expected_skus || []))];
  const { data, error } = await supabase
    .from("products")
    .select("id, sku")
    .in("sku", skus);
  if (error) throw error;

  const bySku = new Map(
    (data || []).map((product) => [product.sku, product.id]),
  );
  const unresolved = skus.filter((sku) => !bySku.has(sku));
  if (unresolved.length) {
    throw new Error(`Benchmark SKUs not found: ${unresolved.join(", ")}`);
  }
  return cases.map((item) => ({
    ...item,
    expectedIds: (item.expected_skus || []).map((sku) => bySku.get(sku)),
  }));
}

async function ensureEvalCases(cases) {
  const questions = cases.map((item) => item.question);
  const { data: existing, error: existingError } = await supabase
    .from("eval_cases")
    .select("id, question")
    .in("question", questions);
  if (existingError) throw existingError;

  const existingByQuestion = new Map(
    (existing || []).map((item) => [item.question, item.id]),
  );
  const missing = cases.filter(
    (item) => !existingByQuestion.has(item.question),
  );
  if (missing.length) {
    const { data, error } = await supabase
      .from("eval_cases")
      .insert(
        missing.map((item) => ({
          question: item.question,
          expected_product_ids: item.expectedIds,
          category: item.category,
        })),
      )
      .select("id, question");
    if (error) throw error;
    for (const item of data || [])
      existingByQuestion.set(item.question, item.id);
  }
  return cases.map((item) => ({
    ...item,
    evalCaseId: existingByQuestion.get(item.question),
  }));
}

async function runMode(item, mode, embedding) {
  const { data, error } = await supabase.rpc("search_products_by_mode", {
    p_query_text: item.question,
    p_query_embedding: mode === "keyword" ? null : embedding,
    p_mode: mode,
    p_alpha: 0.5,
    p_match_count: 5,
  });
  if (error) throw error;
  return data || [];
}

async function main() {
  await loadEmbeddingCache();
  const args = process.argv.slice(2);
  const requestedModes = args.filter((mode) => MODES.includes(mode));
  const startArg = args.find((arg) => arg.startsWith("--start="));
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const start = startArg ? Math.max(0, Number(startArg.split("=")[1])) : 0;
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
  const modes = requestedModes.length ? requestedModes : MODES;
  const allCases = await ensureEvalCases(
    await resolveProducts(await loadCases()),
  );
  const cases =
    Number.isInteger(limit) && limit > 0
      ? allCases.slice(start, start + limit)
      : allCases.slice(start);
  const summary = {};

  for (const mode of modes) {
    let precisionTotal = 0;
    let recallTotal = 0;
    for (const item of cases) {
      const embedding =
        mode === "keyword" ? null : await generateEmbedding(item.question);
      const results = await runMode(item, mode, embedding);
      const score = metrics(results, item.expectedIds);
      precisionTotal += score.precision_at_5;
      recallTotal += score.recall_at_5;
      const { error } = await supabase.from("eval_results").insert({
        eval_case_id: item.evalCaseId,
        method: mode,
        alpha: mode === "hybrid" ? 0.5 : null,
        precision_at_5: score.precision_at_5,
        recall_at_5: score.recall_at_5,
        judge_type: "automated_retrieval",
        raw_answer: JSON.stringify(results),
      });
      if (error) throw error;
    }
    summary[mode] = {
      cases: cases.length,
      precision_at_5: Number((precisionTotal / cases.length).toFixed(4)),
      recall_at_5: Number((recallTotal / cases.length).toFixed(4)),
    };
  }

  console.log(
    JSON.stringify({ dataset: cases.length, modes, summary }, null, 2),
  );
}

main().catch((error) => {
  console.error("Benchmark failed:", error.message || error);
  process.exitCode = 1;
});
