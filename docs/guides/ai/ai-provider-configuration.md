---
sidebar_position: 1
title: AI Provider Configuration
description: Configure LLM providers, API keys, and embedding models in RaisinDB
---

# AI Provider Configuration

AI configuration is per tenant. Each tenant keeps two related settings:

- **Providers**: the list of LLM and embedding services the tenant can call,
  each with a slug, an API key and a list of models. Agents and the
  `raisin.ai.*` function bindings use this list.
- **Embedding configuration**: which provider and model produce the vectors
  behind vector search, at what dimension, and how documents are chunked.

There is no server-wide AI section in the server config file. Two tenants on the
same instance can use different providers, and one tenant's keys are never
visible to another.

## Supported provider kinds

| Kind | Notes | Embeddings |
|------|-------|:-:|
| `openai` | Default endpoint `https://api.openai.com/v1` | yes |
| `anthropic` | Claude models for chat; embeddings go to Voyage AI | yes (Voyage) |
| `google` | Gemini | no |
| `azure_openai` | Requires `api_endpoint` (your Azure resource URL) | yes |
| `groq` | OpenAI-compatible, fast inference | yes |
| `openrouter` | OpenAI-compatible multi-provider router | yes |
| `bedrock` | AWS Bedrock, Converse API | no |
| `ollama` | Local models, no API key needed; default endpoint `http://localhost:11434` | yes |
| `custom` | Any OpenAI-compatible endpoint; set `api_endpoint` | yes |
| `local` | In-process Candle models (CLIP, BLIP, moondream) from `RAISIN_MODELS_DIR` | image only |

"Embeddings" means the kind can be referenced by the embedding configuration
below. Every kind can serve chat and agents except `local`, which only serves
the image models.

## Adding a provider

### With the CLI

```bash
raisindb ai provider set openai --kind openai --api-key-env OPENAI_API_KEY \
  -m gpt-4o:"GPT-4o" -e text-embedding-3-small:"Embedding small"
# Provider 'openai' configured for tenant 'default' (kind=openai, enabled=true, models=2, api_key=updated (from env)).

raisindb ai provider set local-ollama --kind ollama --endpoint http://localhost:11434 \
  -m llama3 -e bge-m3

raisindb ai provider list
# SLUG          KIND    ENDPOINT                ENABLED  HAS API KEY  MODELS
# openai        openai  -                       true     true         2
# local-ollama  ollama  http://localhost:11434  true     false        2

raisindb ai provider test openai
```

`set` is a read-modify-write: other providers and stored keys are preserved.
`-m` registers a chat/agent model and `-e` an embedding model; the first of each
becomes that use case's default. Pass `--api-key`, `--api-key-stdin` or
`--api-key-env` for the key, `--endpoint` for a custom base URL, `--disabled`
to keep a provider configured but switched off, and `--tenant` for a tenant
other than `default`. `test` makes a live request to the provider and exits
non-zero when it fails.

### With the HTTP API

```http
PUT /api/tenants/{tenant}/ai/config
```

```json
{
  "providers": [
    {
      "slug": "openai",
      "provider": "openai",
      "api_key_plain": "sk-...",
      "enabled": true,
      "models": [
        { "model_id": "gpt-4o", "display_name": "GPT-4o",
          "use_cases": ["chat", "agent"],
          "default_temperature": 0.7, "default_max_tokens": 4096, "is_default": true },
        { "model_id": "text-embedding-3-small", "display_name": "Embedding small",
          "use_cases": ["embedding"],
          "default_temperature": 0, "default_max_tokens": 0, "is_default": true }
      ]
    }
  ]
}
```

Providers are merged by `slug`, so a `PUT` that names one slug leaves the others
in place. Omit `api_key_plain` to keep the stored key. Model entries need
`model_id`, `display_name`, `use_cases` (`embedding`, `chat`, `agent`,
`completion`, `classification`), `default_temperature`, `default_max_tokens`
and `is_default`; `is_default` marks the model returned for that use case when
none is named.

Reading it back never returns a key:

```http
GET /api/tenants/{tenant}/ai/providers
```

```json
{"providers":[{"slug":"openai","provider":"openai","enabled":true,"has_api_key":true,"model_count":2},
              {"slug":"local-ollama","provider":"ollama","api_endpoint":"http://localhost:11434","enabled":true,"has_api_key":false,"model_count":2}]}
```

Other endpoints under `/api/tenants/{tenant}/ai/`: `GET config` (full
configuration with `has_api_key` in place of keys), `DELETE providers/{slug}`,
`POST providers/{slug}/test`, `GET models` and `GET models/{use_case}` (every
model across providers), and
`GET providers/{slug}/models/{model}/capabilities`, which answers
`{"chat":true,"embeddings":false,"vision":true,"tools":true,"streaming":true}`.

### With SQL

```sql
ALTER AI CONFIG ADD PROVIDER 'openai'
  SET API_KEY = 'sk-...'
  SET MODEL = 'gpt-4o';
ALTER AI CONFIG ADD PROVIDER 'openai'
  SET MODEL = 'text-embedding-3-small' SET USE_CASES = 'embedding';
SHOW AI PROVIDERS;
ALTER AI CONFIG DROP PROVIDER 'openai';
```

`ADD PROVIDER` creates or updates the slug; a slug that is not a kind name needs
`SET KIND = '...'`. Keys not mentioned keep their stored value. See the
[provider statements](/docs/reference/sql/functions/vector-functions#provider-statements)
for every key.

### In the admin console

**Management → AI Settings** edits the same configuration with one section per
provider. The Bedrock section shows separate fields for the access key id,
secret and region.

## Referring to a model

A provider slug is what agents and functions name. An agent's `provider`
property is a slug, and a model is written as `slug:model_id`:

```js
const r = raisin.ai.completion({
  model: 'local-ollama:llama3',
  messages: [{ role: 'user', content: 'Summarise this in one line.' }],
});
```

A bare `model_id` also resolves when exactly one configured provider lists it.
Slugs match `^[a-z0-9][a-z0-9-]{0,38}$`, so a tenant can keep two accounts of
the same kind (`openai-prod`, `openai-eval`) side by side.

## API key security

Keys are encrypted with AES-256-GCM before they are stored, using a master key
the server reads from the `RAISIN_MASTER_KEYS` (or legacy `RAISIN_MASTER_KEY`)
environment variable. The key never leaves the process: every read surface
returns `has_api_key: true` instead. Keys are decrypted at the moment of a call.

## AWS Bedrock

Bedrock uses the Converse API for chat. Its credentials travel in the same two
fields as every other provider: the API key holds `ACCESS_KEY_ID:SECRET_ACCESS_KEY`
and the endpoint holds the region.

```bash
raisindb ai provider set bedrock --kind bedrock \
  --api-key "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" \
  --endpoint us-east-1 -m anthropic.claude-sonnet-4-20250514-v1:0
```

```sql
ALTER AI CONFIG ADD PROVIDER 'bedrock'
  SET API_KEY = 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  SET BASE_URL = 'us-east-1'
  SET MODEL = 'anthropic.claude-sonnet-4-20250514-v1:0';
```

Over HTTP the same provider entry is
`{"slug":"bedrock","provider":"bedrock","api_key_plain":"AKIA...:...","api_endpoint":"us-east-1","models":[...]}`.
Bedrock is a chat provider; the embedding configuration cannot point at it.

## Embedding configuration

Vector search reads one embedding configuration per tenant. It names a provider
from the list above by slug (`ai_provider_ref`) and a model (`ai_model_ref`),
and fixes the vector width.

```sql
ALTER EMBEDDING CONFIG
  SET PROVIDER = 'ollama'
  SET MODEL = 'bge-m3'
  SET DIMENSIONS = 1024
  SET BASE_URL = 'http://localhost:11434'
  SET ENABLED = true;

SHOW EMBEDDING CONFIG;
TEST EMBEDDING CONNECTION;
-- {"result":"Connection successful","dimensions":1024,"model":"bge-m3","success":true}
```

The SQL form takes a provider kind (`openai`, `claude`, `ollama`,
`huggingface`) and its own `API_KEY`. The HTTP form can instead reference a
provider slug, so one key serves both chat and embeddings:

```http
POST /api/tenants/{tenant}/embeddings/config
```

```json
{
  "enabled": true,
  "ai_provider_ref": "local-ollama",
  "ai_model_ref": "bge-m3",
  "provider": "Ollama",
  "model": "bge-m3",
  "dimensions": 1024,
  "include_name": true,
  "include_path": true,
  "chunking": { "chunk_size": 256, "splitter": "recursive", "overlap": { "type": "Tokens", "value": 64 } },
  "default_max_distance": 0.6
}
```

`GET` on the same path returns the configuration with `has_api_key` and the
active `quantization` (`F32` unless changed). `POST .../embeddings/config/test`
makes a live embedding call.

Settings and what they do:

| Setting | Meaning |
|---|---|
| `enabled` | Nothing is embedded and `KNN` refuses to run until this is true |
| `dimensions` | Vector width. Must match the model; changing it starts a new index partition |
| `include_name`, `include_path` | Whether a node's name and path are part of the text that is embedded |
| `chunking` | How long text is split (below) |
| `default_max_distance` | Cutoff for search results; 0.6 when unset |
| `distance_metric` | `cosine` (default), `l2`, `inner_product`, `hamming` |
| `quantization` | `F32` (default), `F16`, `Int8`; storage precision of the index |
| `max_embeddings_per_repo` | Optional cap per repository |

### Auto-embedding

Once the configuration is enabled, every node create or update queues an
embedding job. Embedding never blocks the write; the vector appears in the
index a moment later. Which node properties are embedded is decided by the
node type's field index settings (`index: [Vector]`) with the node's name and
path added according to `include_name` and `include_path`.

### Dimensions

| Model | Dimensions | Provider kind |
|-------|-----------:|----------|
| `text-embedding-3-small` | 1536 | openai |
| `text-embedding-3-large` | 3072 | openai |
| `nomic-embed-text` | 768 | ollama |
| `bge-m3` | 1024 | ollama |

Each model and dimension pair gets its own index partition. Switching models
leaves the old partition in place and starts filling a new one; run
`REBUILD VECTOR INDEX` or regenerate embeddings to fill it for existing content.
`SHOW VECTOR INDEX HEALTH` lists every partition and marks the one in use.

### Text chunking

Long text is split before embedding, and each chunk gets its own vector. The
chunking settings live on the embedding configuration and can be overridden per
[processing rule](./asset-processing.md#tasks) for uploaded documents:

```yaml
chunking:
  chunk_size: 256          # tokens per chunk (default 256)
  splitter: recursive      # recursive | fixed_size | markdown | code
  overlap:
    type: Tokens           # Tokens (a count, default 64) or Percentage (0.0 to 0.5)
    value: 64
```

Search results are fused per node, and `chunk_index` and `chunk_text` name the
chunk that matched. See
[Embeddings and Vector Search](./embeddings-and-vector-search.md).

## Local inference

**Ollama** runs any pulled model on your own machine or network. Configure it
as a provider of kind `ollama` with the endpoint of the Ollama server; no API
key is needed. It serves both chat models and embedding models.

**Candle** models run inside the server process when it is built with the
`candle` feature (part of the default `ai` feature set). They are used for
image work: CLIP embeddings of uploaded images and caption models. Model files
are read from `RAISIN_MODELS_DIR` (default `./models`), and the console's
**AI Settings** page can download them from Hugging Face.

## Next Steps

- [Embeddings and Vector Search](./embeddings-and-vector-search.md): query the vectors
- [RAG Patterns](./rag-patterns.md): build retrieval-augmented generation pipelines
- [Agent Memory with Branches](./agent-memory-with-branches.md): branches for AI agent isolation
