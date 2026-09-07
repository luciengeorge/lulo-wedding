import { openai } from "@ai-sdk/openai";
import { RAG } from "@convex-dev/rag";

import { components } from "./_generated/api";

/**
 * Generic RAG instance backed by OpenAI text-embedding-3-small (1536 dims, $0.02/M tokens).
 *
 * Use it for vector search across any user content. Add namespaces or filters per use case
 * — see https://convex.dev/components/rag for usage patterns.
 *
 * To swap the embedding model, change `textEmbeddingModel` and `embeddingDimension` together.
 * Common alternatives:
 *   - openai.embedding("text-embedding-3-large") — 3072 dims, higher quality
 *   - voyage multimodal — image + text in one space (separate component)
 */
export const rag = new RAG(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
});
