const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { callGeminiWithBackoff, wait } = require("./gemini_utils");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const casesPath = path.resolve(__dirname, "benchmark_cases.json");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const REQUEST_DELAY_MS = Number(process.env.RAG_EXPERIMENT_DELAY_MS) || 13000;
const embeddingCache = new Map();
const embeddingCachePath = path.resolve(
  __dirname,
  "../.benchmark-cache/rag_embeddings.json",
);
const checkpointPath = path.resolve(
  __dirname,
  "../.benchmark-cache/rag_experiment_checkpoint.json",
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

async function loadCheckpoint() {
  try {
    return JSON.parse(await fs.readFile(checkpointPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveCheckpoint(checkpoint) {
  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
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

function parseAnswers(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      no_rag: String(parsed.no_rag || ""),
      rag: String(parsed.rag || ""),
    };
  } catch {
    const marked = cleaned.match(
      /NO_RAG\s*:\s*([\s\S]*?)\n\s*RAG\s*:\s*([\s\S]*)/i,
    );
    if (marked) {
      return { no_rag: marked[1].trim(), rag: marked[2].trim() };
    }
    return { no_rag: "", rag: cleaned };
  }
}

async function generateAnswers(question, productContext) {
  const prompt = `No product data was retrieved for no_rag.\nPRODUCT_DATA (trusted retrieval context for rag):\n${productContext || "(none)"}\n\nCUSTOMER_QUESTION:\n${question}`;

  const result = await callGeminiWithBackoff((apiKey) => {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    return new GoogleGenerativeAI(apiKey)
      .getGenerativeModel({
        model: process.env.LLM_MODEL || "models/gemini-3.6-flash",
        systemInstruction:
          "Answer in Vietnamese using exactly these two markers on separate lines: NO_RAG: followed by the answer without product data, then RAG: followed by the answer using PRODUCT_DATA. Be concise. Never invent product names, prices, or specifications. For no_rag, say that you cannot recommend a specific product. For rag, answer only from PRODUCT_DATA.",
        generationConfig: { maxOutputTokens: 500 },
      })
      .generateContent(prompt);
  });
  const text =
    typeof result.response?.text === "function" ? result.response.text() : "{}";
  return parseAnswers(text);
}

function scoreAnswer(answer, expectedProducts, mode) {
  const normalizedAnswer = answer.toLowerCase();
  const mentionedExpected = expectedProducts.filter((product) =>
    normalizedAnswer.includes(product.name.toLowerCase()),
  ).length;
  const mentionedProducts = expectedProducts.filter((product) =>
    normalizedAnswer.includes(product.name.toLowerCase()),
  ).length;
  const relevance = expectedProducts.length
    ? mentionedExpected / expectedProducts.length
    : 0;
  const faithfulness = mode === "rag" && mentionedProducts > 0 ? 1 : 0;
  return {
    score_relevance: Number(relevance.toFixed(3)),
    score_faithfulness: faithfulness,
  };
}

async function loadCases() {
  const cases = JSON.parse(await fs.readFile(casesPath, "utf8"));
  if (!Array.isArray(cases) || !cases.length) {
    throw new Error("Benchmark dataset is empty");
  }
  return cases;
}

async function resolveCases(cases) {
  const skus = [...new Set(cases.flatMap((item) => item.expected_skus || []))];
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, name, price, description, attributes")
    .in("sku", skus);
  if (error) throw error;
  const bySku = new Map((data || []).map((product) => [product.sku, product]));
  const missing = skus.filter((sku) => !bySku.has(sku));
  if (missing.length)
    throw new Error(`Benchmark SKUs not found: ${missing.join(", ")}`);
  return cases.map((item) => ({
    ...item,
    products: item.expected_skus.map((sku) => bySku.get(sku)),
  }));
}

async function ensureEvalCases(cases) {
  const questions = cases.map((item) => item.question);
  const { data: existing, error: existingError } = await supabase
    .from("eval_cases")
    .select("id, question")
    .in("question", questions);
  if (existingError) throw existingError;
  const ids = new Map((existing || []).map((item) => [item.question, item.id]));
  const missing = cases.filter((item) => !ids.has(item.question));
  if (missing.length) {
    const { data, error } = await supabase
      .from("eval_cases")
      .insert(
        missing.map((item) => ({
          question: item.question,
          expected_product_ids: item.products.map((product) => product.id),
          category: item.category,
        })),
      )
      .select("id, question");
    if (error) throw error;
    for (const item of data || []) ids.set(item.question, item.id);
  }
  return cases.map((item) => ({ ...item, evalCaseId: ids.get(item.question) }));
}

async function retrieveProducts(question) {
  const embedding = await generateEmbedding(question);
  const { data, error } = await supabase.rpc("search_products_by_mode", {
    p_query_text: question,
    p_query_embedding: embedding,
    p_mode: "hybrid",
    p_alpha: 0.5,
    p_match_count: 5,
  });
  if (error) throw error;
  return data || [];
}

async function main() {
  await loadEmbeddingCache();
  const checkpoint = await loadCheckpoint();
  const requestedStart = Number(process.argv[2]);
  const requestedLimit = Number(process.argv[3]);
  const allCases = await ensureEvalCases(await resolveCases(await loadCases()));
  const start =
    Number.isInteger(requestedStart) && requestedStart >= 0
      ? requestedStart
      : 0;
  const cases =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? allCases.slice(start, start + requestedLimit)
      : allCases.slice(start);
  const summary = {
    no_rag: { relevance: 0, faithfulness: 0 },
    rag: { relevance: 0, faithfulness: 0 },
  };

  for (const item of cases) {
    let record = checkpoint[item.question];
    const shouldPersistResults = !record?.persisted;
    if (!record) {
      const retrieved = await retrieveProducts(item.question);
      const context = retrieved
        .map((product) => `${product.name} | price: ${product.price}`)
        .join("\n");
      const answers = await generateAnswers(item.question, context);
      record = { retrieved, answers, persisted: false };
      checkpoint[item.question] = record;
      await saveCheckpoint(checkpoint);
    }
    const { retrieved, answers } = record;

    for (const mode of ["no_rag", "rag"]) {
      const scores = scoreAnswer(answers[mode], item.products, mode);
      summary[mode].relevance += scores.score_relevance;
      summary[mode].faithfulness += scores.score_faithfulness;
      if (shouldPersistResults) {
        const { error } = await supabase.from("eval_results").insert({
          eval_case_id: item.evalCaseId,
          method: mode,
          score_faithfulness: scores.score_faithfulness,
          score_relevance: scores.score_relevance,
          judge_type: "heuristic_name_match",
          raw_answer: JSON.stringify({
            question: item.question,
            retrieved,
            answer: answers[mode],
          }),
        });
        if (error) throw error;
      }
    }
    record.persisted = true;
    await saveCheckpoint(checkpoint);
    if (item !== cases[cases.length - 1]) await wait(REQUEST_DELAY_MS);
  }

  for (const mode of ["no_rag", "rag"]) {
    summary[mode].relevance = Number(
      (summary[mode].relevance / cases.length).toFixed(4),
    );
    summary[mode].faithfulness = Number(
      (summary[mode].faithfulness / cases.length).toFixed(4),
    );
  }
  console.log(
    JSON.stringify(
      { dataset: cases.length, judge: "heuristic_name_match", summary },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("RAG experiment failed:", error.message || error);
  process.exitCode = 1;
});
