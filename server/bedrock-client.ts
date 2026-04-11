/**
 * AWS Bedrock Runtime provider — OpenAI-compatible shim
 *
 * Implements the subset of the OpenAI SDK interface used throughout the
 * platform (chat.completions.create — both non-streaming and streaming),
 * delegating to the Bedrock Converse / ConverseStream APIs.
 *
 * Callers continue to use:
 *   const ai = createAIClient();
 *   const res = await ai.chat.completions.create({ model, messages, ... });
 * with zero changes when AI_PROVIDER=bedrock.
 *
 * Supported model families (AI_BEDROCK_MODEL_FAMILY or AI_MODEL env var):
 *   anthropic.claude-3-5-sonnet-20241022-v2:0   (default)
 *   anthropic.claude-3-haiku-20240307-v1:0
 *   anthropic.claude-opus-4-5
 *   meta.llama3-70b-instruct-v1:0
 *   amazon.titan-text-premier-v1:0
 *   mistral.mistral-large-2402-v1:0
 *
 * Auth: IAM role credentials from execution environment (ECS task role).
 * No API key is required; set AI_PROVIDER=bedrock + AI_REGION=us-east-1.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message,
  type ContentBlock,
  type ContentBlockDelta,
  type SystemContentBlock,
  type InferenceConfiguration,
} from "@aws-sdk/client-bedrock-runtime";

// ── Types mirroring the OpenAI SDK surface we use across the codebase ─────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: { type: string };
  [key: string]: unknown;
}

export interface ChatCompletionChunk {
  choices: Array<{
    delta: { content?: string; role?: string };
    index: number;
    finish_reason: string | null;
  }>;
  id: string;
  model: string;
  object: string;
}

export interface ChatCompletion {
  id: string;
  model: string;
  object: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Default model selection ────────────────────────────────────────────────────

const MODEL_FAMILY_DEFAULTS: Record<string, string> = {
  claude:   "anthropic.claude-3-5-sonnet-20241022-v2:0",
  haiku:    "anthropic.claude-3-haiku-20240307-v1:0",
  opus:     "anthropic.claude-opus-4-5",
  llama:    "meta.llama3-70b-instruct-v1:0",
  titan:    "amazon.titan-text-premier-v1:0",
  mistral:  "mistral.mistral-large-2402-v1:0",
};

export function resolveBedrockModelId(modelEnv: string = ""): string {
  if (!modelEnv) return MODEL_FAMILY_DEFAULTS.claude;
  // Already a fully-qualified Bedrock model ID (contains ".")
  if (modelEnv.includes(".")) return modelEnv;
  // Family shorthand → default model for that family
  const family = modelEnv.toLowerCase();
  return MODEL_FAMILY_DEFAULTS[family] ?? MODEL_FAMILY_DEFAULTS.claude;
}

// ── Message format translation ─────────────────────────────────────────────────

function toBedrockMessages(
  messages: ChatMessage[]
): { bedrockMessages: Message[]; systemBlocks: SystemContentBlock[] } {
  const systemBlocks: SystemContentBlock[] = [];
  const bedrockMessages: Message[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemBlocks.push({ text: m.content });
    } else {
      bedrockMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ text: m.content } as ContentBlock],
      });
    }
  }

  // Bedrock requires alternating user/assistant. If the last message is from
  // assistant (unlikely, but safe to handle), append a blank user turn.
  if (bedrockMessages.length > 0 && bedrockMessages[bedrockMessages.length - 1].role === "assistant") {
    bedrockMessages.push({ role: "user", content: [{ text: " " } as ContentBlock] });
  }

  return { bedrockMessages, systemBlocks };
}

// ── Async generator wrapper for streaming ────────────────────────────────────

class BedrockStream {
  private _chunks: ChatCompletionChunk[] = [];
  private _done = false;
  private _resolvers: Array<() => void> = [];
  private _model: string;

  constructor(model: string) {
    this._model = model;
  }

  push(chunk: ChatCompletionChunk) {
    this._chunks.push(chunk);
    const resolver = this._resolvers.shift();
    if (resolver) resolver();
  }

  finish() {
    this._done = true;
    for (const r of this._resolvers) r();
  }

  [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    let index = 0;
    const self = this;

    return {
      async next(): Promise<IteratorResult<ChatCompletionChunk>> {
        while (index >= self._chunks.length && !self._done) {
          await new Promise<void>((r) => self._resolvers.push(r));
        }
        if (index < self._chunks.length) {
          return { value: self._chunks[index++], done: false };
        }
        // Iterator protocol requires `done: true` with a value; TypeScript generics
        // allow undefined here when the iterator signals completion.
        return { value: undefined!, done: true };
      }
    };
  }
}

// ── Bedrock client singleton ───────────────────────────────────────────────────

let _bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({
      region: process.env.AI_REGION || process.env.AWS_REGION || "us-east-1",
    });
  }
  return _bedrockClient;
}

// ── Core invoke functions ──────────────────────────────────────────────────────

async function invokeConverse(
  modelId: string,
  messages: ChatMessage[],
  opts: Partial<ChatCompletionOptions>
): Promise<ChatCompletion> {
  const { bedrockMessages, systemBlocks } = toBedrockMessages(messages);
  const maxTokens = opts.max_tokens ?? opts.max_completion_tokens ?? 4096;
  const inferenceConfig: InferenceConfiguration = {
    maxTokens,
    temperature: opts.temperature ?? 0.7,
  };

  const cmd = new ConverseCommand({
    modelId,
    messages: bedrockMessages,
    ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
    inferenceConfig,
  });

  const response = await getBedrockClient().send(cmd);

  const text =
    (response.output?.message?.content?.[0] as ContentBlock & { text?: string })?.text ?? "";

  return {
    id: `bedrock-${Date.now()}`,
    model: modelId,
    object: "chat.completion",
    choices: [
      {
        message: { role: "assistant", content: text },
        finish_reason: response.stopReason ?? "stop",
        index: 0,
      },
    ],
    usage: {
      prompt_tokens: response.usage?.inputTokens ?? 0,
      completion_tokens: response.usage?.outputTokens ?? 0,
      total_tokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
    },
  };
}

async function invokeConverseStream(
  modelId: string,
  messages: ChatMessage[],
  opts: Partial<ChatCompletionOptions>
): Promise<BedrockStream> {
  const { bedrockMessages, systemBlocks } = toBedrockMessages(messages);
  const maxTokens = opts.max_tokens ?? opts.max_completion_tokens ?? 4096;
  const inferenceConfig: InferenceConfiguration = {
    maxTokens,
    temperature: opts.temperature ?? 0.7,
  };

  const cmd = new ConverseStreamCommand({
    modelId,
    messages: bedrockMessages,
    ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
    inferenceConfig,
  });

  const response = await getBedrockClient().send(cmd);
  const stream = new BedrockStream(modelId);

  // Drain the stream asynchronously so callers can iterate
  (async () => {
    try {
      if (response.stream) {
        for await (const event of response.stream) {
          if (event.contentBlockDelta) {
            // Narrow the tagged union — only TextMember carries a `text` field
            const delta: ContentBlockDelta | undefined = event.contentBlockDelta.delta;
            const text = (delta && "text" in delta) ? (delta as { text: string }).text : "";
            if (text) {
              stream.push({
                id: `bedrock-${Date.now()}`,
                model: modelId,
                object: "chat.completion.chunk",
                choices: [
                  {
                    delta: { content: text },
                    index: 0,
                    finish_reason: null,
                  },
                ],
              });
            }
          }
          if (event.messageStop) {
            stream.push({
              id: `bedrock-${Date.now()}`,
              model: modelId,
              object: "chat.completion.chunk",
              choices: [
                {
                  delta: {},
                  index: 0,
                  finish_reason: event.messageStop.stopReason ?? "stop",
                },
              ],
            });
          }
        }
      }
    } finally {
      stream.finish();
    }
  })();

  return stream;
}

// ── OpenAI-compatible shim object ────────────────────────────────────────────

export function createBedrockShim() {
  const modelId = resolveBedrockModelId(
    process.env.AI_MODEL || process.env.AI_BEDROCK_MODEL_FAMILY || ""
  );

  return {
    // Expose model ID for introspection
    _bedrockModelId: modelId,
    _isBedrockShim: true as const,

    chat: {
      completions: {
        /**
         * Drop-in replacement for openai.chat.completions.create().
         * Returns ChatCompletion when stream=false, BedrockStream when stream=true.
         *
         * Design note: the model ID is resolved once at shim creation from the
         * AI_MODEL / AI_BEDROCK_MODEL_FAMILY environment variable.  Per-request
         * `opts.model` is intentionally not honoured: callers pass OpenAI model
         * strings (e.g. "gpt-4o") that are meaningless to the Bedrock API, and
         * silently switching mid-request would be unsafe.  To change the model,
         * update AI_MODEL and call resetAIClient() (which recreates the shim).
         *
         * Runtime switching note: modules that capture `createAIClient()` at
         * import time hold a reference to the original shim.  `resetAIClient()`
         * clears the singleton, so the *next* call to `createAIClient()` returns
         * the new shim — but already-bound module-level constants are unaffected
         * until the process restarts or the module re-imports.
         */
        create: async (opts: ChatCompletionOptions): Promise<ChatCompletion | BedrockStream> => {
          const effectiveModel = modelId; // Resolved at shim creation — see design note above

          if (opts.stream) {
            return invokeConverseStream(effectiveModel, opts.messages, opts);
          }
          return invokeConverse(effectiveModel, opts.messages, opts);
        },
      },
    },

    // Stub out other OpenAI SDK methods to avoid runtime errors if called
    images: {
      generate: async () => {
        throw new Error("Image generation not supported with Bedrock provider. Set AI_PROVIDER=openai for image generation.");
      },
    },
    audio: {
      transcriptions: {
        create: async () => {
          throw new Error("Audio transcription not supported with Bedrock provider. Set AI_PROVIDER=openai for audio features.");
        },
      },
    },
  };
}

// ── Probe / health-check ──────────────────────────────────────────────────────

/**
 * Quick connectivity test: invokes the model with a minimal prompt and
 * returns { ok: true, latencyMs, modelId } or { ok: false, error }.
 */
export async function probeBedrockConnection(
  modelId?: string,
  region?: string
): Promise<{ ok: boolean; latencyMs?: number; modelId?: string; error?: string }> {
  const client = new BedrockRuntimeClient({
    region: region || process.env.AI_REGION || process.env.AWS_REGION || "us-east-1",
  });

  const effectiveModelId = modelId || resolveBedrockModelId(process.env.AI_MODEL || "");

  const start = Date.now();
  try {
    const cmd = new ConverseCommand({
      modelId: effectiveModelId,
      messages: [{ role: "user", content: [{ text: "Hi" } as ContentBlock] }],
      inferenceConfig: { maxTokens: 10, temperature: 0.1 },
    });
    await client.send(cmd);
    return { ok: true, latencyMs: Date.now() - start, modelId: effectiveModelId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), modelId: effectiveModelId };
  }
}
