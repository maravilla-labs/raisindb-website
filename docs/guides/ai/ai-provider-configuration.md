---
sidebar_position: 1
title: AI Provider Configuration
description: Configure LLM providers, API keys, and embedding models in RaisinDB
---

# AI Provider Configuration

RaisinDB integrates with major LLM and embedding providers out of the box. Each tenant configures AI independently, so different teams or applications on the same instance can use different providers and models.

## Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **OpenAI** | GPT-4, GPT-3.5, text-embedding-3-small/large | Default provider |
| **Anthropic** | Claude model family | |
| **Google Gemini** | Gemini 1.5, 2.0 | Tool calling support |
| **Azure OpenAI** | Azure-hosted OpenAI models | Enterprise deployments |
| **Groq** | Open-source models (Llama, Mixtral) | Fast inference |
| **OpenRouter** | Multi-provider router | Unified API for many models |
| **AWS Bedrock** | Claude, Nova, Llama | Via AWS credentials |
| **Ollama** | Any local model | Self-hosted, no API key needed |
| **Custom** | Any OpenAI-compatible endpoint | Custom deployments |

## Configuring a Provider

Provider configuration is stored per-tenant in the system workspace. Set it via the REST API or SQL:

```sql
-- Configure OpenAI as the default provider
INSERT INTO 'raisin:system' (name, path, node_type, properties) VALUES (
  'ai-config',
  '/config/ai',
  'raisin:AIConfig',
  '{
    "providers": [
      {
        "provider": "openai",
        "api_key": "sk-your-api-key-here",
        "enabled": true,
        "models": ["gpt-4", "text-embedding-3-small"]
      }
    ]
  }'
);
```

### API Key Security

API keys are encrypted at rest using AES-256-GCM before being stored. The master encryption key should be managed through your secrets infrastructure (environment variables, AWS Secrets Manager, HashiCorp Vault, etc.).

- Encrypted keys are **never returned** to API clients
- Keys are decrypted only at the moment of use
- Each tenant's keys are isolated from other tenants

### Multiple Providers

You can configure multiple providers simultaneously. This is useful for using different models for different tasks (e.g., OpenAI for embeddings, Anthropic for generation):

```yaml
# In your tenant configuration
providers:
  - provider: openai
    api_key: "sk-..."
    enabled: true
    models:
      - text-embedding-3-small
      - text-embedding-3-large

  - provider: anthropic
    api_key: "sk-ant-..."
    enabled: true
    models:
      - claude-sonnet-4-20250514

  - provider: ollama
    api_endpoint: "http://localhost:11434"
    enabled: true
    models:
      - llama3
      - nomic-embed-text
```

## Embedding Configuration

Embeddings power [vector search](./embeddings-and-vector-search.md) and [RAG patterns](./rag-patterns.md). RaisinDB generates embeddings automatically when configured.

### Auto-Embedding

When a provider with embedding models is configured, RaisinDB can automatically generate embeddings when nodes are created or updated. Embedding generation runs asynchronously through the job system, so it doesn't block write operations.

### Embedding Dimensions

Different models produce different vector dimensions:

| Model | Dimensions | Provider |
|-------|-----------|----------|
| `text-embedding-3-small` | 1536 | OpenAI |
| `text-embedding-3-large` | 3072 | OpenAI |
| `nomic-embed-text` | 768 | Ollama |

The HNSW vector index is configured with a fixed dimension size at startup. Make sure your embedding model dimensions match the configured index dimensions.

### Text Chunking

For long documents, RaisinDB automatically splits content into chunks before generating embeddings. Chunking is configurable:

- **By tokens** — split at token boundaries (recommended for most models)
- **By sentences** — preserve sentence boundaries
- **By paragraphs** — keep paragraphs intact

Chunk overlap is configurable to ensure context is preserved across chunk boundaries.

## Local Inference with Ollama

For environments where data cannot leave the network, use Ollama for fully local inference:

```yaml
providers:
  - provider: ollama
    api_endpoint: "http://localhost:11434"
    enabled: true
    models:
      - llama3
      - nomic-embed-text
```

No API key is required for Ollama. Make sure the Ollama server is running and the models are pulled before use.

## Local Inference with Candle

RaisinDB also supports local inference via the Candle framework for specialized models like CLIP and BLIP (image understanding). This requires the `candle` feature flag on the server build and downloads models from HuggingFace automatically.

## Per-Tenant Isolation

Each tenant has its own AI configuration, meaning:

- Tenant A can use OpenAI while Tenant B uses Anthropic
- API keys are scoped to a single tenant
- Usage and billing are naturally separated
- Model availability can differ per tenant

## Default Model Settings

You can set default models for different operations:

```yaml
defaults:
  embedding_model: "text-embedding-3-small"
  embedding_provider: "openai"
  generation_model: "claude-sonnet-4-20250514"
  generation_provider: "anthropic"
  chunking:
    strategy: "tokens"
    chunk_size: 512
    chunk_overlap: 50
```

These defaults are used when no specific model is requested in an API call or function invocation.

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md) — configure and query vector embeddings
- [RAG Patterns](./rag-patterns.md) — build retrieval-augmented generation pipelines
- [Agent Memory with Branches](./agent-memory-with-branches.md) — use branches for AI agent isolation
