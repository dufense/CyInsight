import OpenAI from "openai";
import { createBedrockShim, resolveBedrockModelId } from "./bedrock-client";

/**
 * Vendor-neutral AI provider abstraction.
 *
 * All providers are accessed via OpenAI-compatible API format.
 * - openai:     Native OpenAI API
 * - anthropic:  Requires OpenAI-compatible proxy (e.g., LiteLLM) or Anthropic's OpenAI-compatible endpoint
 * - ollama:     Native OpenAI-compatible API at /v1
 * - azure:      Azure OpenAI with api-version query parameter
 * - vertex:     Requires OpenAI-compatible proxy (e.g., LiteLLM) for Gemini models
 * - huggingface:HuggingFace Inference API (OpenAI-compatible)
 * - custom:     Any OpenAI-compatible endpoint (vLLM, TGI, LiteLLM, LocalAI, etc.)
 * - bedrock:    AWS Bedrock Converse API (IAM role auth; no API key needed)
 *               Uses the native BedrockRuntimeClient with an OpenAI-compatible shim.
 *               Set AI_PROVIDER=bedrock and AI_REGION=us-east-1 (or AWS_REGION).
 *               Optionally set AI_MODEL to a Bedrock model ID or family shorthand:
 *                 claude, haiku, opus, llama, titan, mistral
 *                 (defaults to anthropic.claude-3-5-sonnet-20241022-v2:0)
 *
 * For providers without native OpenAI compatibility (Anthropic, Vertex),
 * use LiteLLM (https://github.com/BerriAI/litellm) as a proxy or set
 * AI_PROVIDER=custom with AI_BASE_URL pointing to your compatibility layer.
 *
 * Runtime switching:
 * Call `resetAIClient()` after updating process.env values to clear the
 * underlying client.  `createAIClient()` returns a persistent proxy — all
 * existing module-level references (e.g. `const openai = createAIClient()`)
 * automatically pick up the new client on the very next method call without
 * any process restart or re-import.
 */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "ollama"
  | "azure"
  | "vertex"
  | "huggingface"
  | "custom"
  | "bedrock"
  | "grok"
  | "deepseek"
  | "kimi"
  | "zai";

interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  apiVersion?: string;
}

function getProviderConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "openai") as AIProvider;
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "sk-placeholder";
  const baseURL = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const model = process.env.AI_MODEL || "";
  const apiVersion = process.env.AI_API_VERSION || "";

  return { provider, model, apiKey, baseURL, apiVersion };
}

function resolveBaseURL(config: AIProviderConfig): string | undefined {
  if (config.baseURL) return config.baseURL;

  switch (config.provider) {
    case "ollama":
      return "http://localhost:11434/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "azure":
      return config.baseURL;
    case "vertex":
      return config.baseURL;
    case "huggingface":
      return "https://api-inference.huggingface.co/v1";
    case "custom":
      return config.baseURL;
    case "bedrock":
      return undefined; // Bedrock uses AWS SDK directly, not an HTTP base URL
    case "grok":
      return "https://api.x.ai/v1";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "kimi":
      return "https://api.moonshot.cn/v1";
    case "zai":
      return "https://open.bigmodel.cn/api/paas/v4/";
    case "openai":
    default:
      return undefined;
  }
}

function resolveDefaultModel(config: AIProviderConfig): string {
  if (config.model) {
    // For bedrock, resolve family shorthand → full model ID
    if (config.provider === "bedrock") return resolveBedrockModelId(config.model);
    return config.model;
  }

  switch (config.provider) {
    case "ollama":
      return "llama3";
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "azure":
      return "gpt-4o-mini";
    case "vertex":
      return "gemini-pro";
    case "huggingface":
      return "meta-llama/Meta-Llama-3-8B-Instruct";
    case "bedrock":
      return resolveBedrockModelId(""); // Default: Claude 3.5 Sonnet
    case "grok":
      return "grok-2-latest";
    case "deepseek":
      return "deepseek-chat";
    case "kimi":
      return "moonshot-v1-32k";
    case "zai":
      return "glm-4-flash";
    case "openai":
    default:
      return "gpt-4o-mini";
  }
}

// ── Singleton underlying client (rebuilt on resetAIClient) ────────────────────

let _underlying: OpenAI | ReturnType<typeof createBedrockShim> | null = null;
let _config: AIProviderConfig | null = null;

function buildUnderlyingClient(): OpenAI | ReturnType<typeof createBedrockShim> {
  const config = getProviderConfig();
  _config = config;

  if (config.provider === "bedrock") {
    return createBedrockShim();
  }

  const baseURL = resolveBaseURL(config);
  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey: config.apiKey,
  };

  if (baseURL) clientOptions.baseURL = baseURL;

  if (config.provider === "azure" && config.apiVersion) {
    clientOptions.defaultQuery = { "api-version": config.apiVersion };
  }

  if (config.provider === "ollama") {
    clientOptions.apiKey = config.apiKey === "sk-placeholder" ? "ollama" : config.apiKey;
  }

  return new OpenAI(clientOptions);
}

function getUnderlyingClient(): OpenAI | ReturnType<typeof createBedrockShim> {
  if (!_underlying) _underlying = buildUnderlyingClient();
  return _underlying;
}

// ── Persistent recursive proxy ────────────────────────────────────────────────
// `createAIClient()` always returns this same proxy object.  All property
// accesses and method calls are forwarded to the *current* underlying client,
// so module-level `const openai = createAIClient()` references automatically
// pick up the new client after `resetAIClient()` without any restart.

function makeDeepProxy(getClient: () => any, path: PropertyKey[] = []): any {
  return new Proxy(function () {}, {
    get(_, prop: PropertyKey) {
      if (prop === Symbol.iterator || prop === Symbol.asyncIterator) {
        // For streaming responses the caller iterates the result of .create(),
        // not the proxy itself — propagate iteration to the actual value.
        return undefined;
      }
      return makeDeepProxy(getClient, [...path, prop]);
    },
    apply(_, _thisArg, args: unknown[]) {
      // Walk the property path on the real client, then call the final method.
      let obj: any = getClient();
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i] as string];
      }
      const last = path[path.length - 1] as string;
      return obj[last].apply(obj, args);
    },
    // Reflect any other traps so the proxy behaves normally (typeof, etc.)
    has(_, prop) {
      return prop in getUnderlyingClient();
    },
  });
}

// The one and only proxy object — every call to createAIClient() returns this.
const _clientProxy: any = makeDeepProxy(getUnderlyingClient);

export function createAIClient(): any {
  return _clientProxy;
}

export function getDefaultModel(): string {
  if (!_config) {
    _config = getProviderConfig();
  }
  return resolveDefaultModel(_config);
}

export function getAIProviderInfo(): {
  provider: AIProvider;
  model: string;
  baseURL?: string;
  region?: string;
} {
  if (!_config) {
    _config = getProviderConfig();
  }
  return {
    provider: _config.provider,
    model: resolveDefaultModel(_config),
    baseURL: resolveBaseURL(_config),
    ...((_config.provider === "bedrock")
      ? { region: process.env.AI_REGION || process.env.AWS_REGION || "us-east-1" }
      : {}),
  };
}

/** Returns true when the active provider is AWS Bedrock */
export function isBedrockProvider(): boolean {
  if (!_config) _config = getProviderConfig();
  return _config.provider === "bedrock";
}

/**
 * Reset the cached underlying client/config.
 * The persistent proxy returned by createAIClient() delegates to the new
 * client on the very next call — no restart or re-import needed.
 */
export function resetAIClient(): void {
  _underlying = null;
  _config = null;
}
