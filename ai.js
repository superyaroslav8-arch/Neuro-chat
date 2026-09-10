/**
 * ai.js
 * Нейро-чат — AI engine
 *
 * Поддерживаемые режимы:
 *   neuro    -> автоматический выбор доступного AI
 *   chatgpt  -> OpenAI API
 *   gemini   -> Google Gemini API
 *   grok     -> xAI API
 *   alice-1  -> пока не подключён к публичному API
 *
 * ВАЖНО:
 * API-ключи НЕ хранятся в этом файле.
 *
 * Ожидаемые Worker secrets:
 *   OPENAI_API_KEY
 *   GOOGLE_API_KEY
 *   XAI_API_KEY
 *
 * Для Cloudflare Workers AI:
 *   env.AI
 *
 * Этот файл отвечает только за AI.
 * Авторизация, пользователи, чаты и база данных
 * находятся в auth.js / database.js.
 */

const DEFAULT_SYSTEM_PROMPT = `
Ты — Нейро, AI-помощник сервиса «Нейро-чат».

Отвечай на языке пользователя.
По умолчанию используй русский язык, если пользователь пишет по-русски.

Будь точным, полезным и понятным.
Не выдумывай факты, ссылки, API, возможности сервисов или результаты действий.
Если информации недостаточно — честно сообщи об этом.

Не утверждай, что ты выполнил действие, если действие реально не выполнялось.
`;

const MODEL_CONFIG = {
  neuro: {
    label: "Нейро",
    type: "automatic",
  },

  chatgpt: {
    label: "ChatGPT",
    type: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5.6",
  },

  gemini: {
    label: "Gemini",
    type: "gemini",
    envKey: "GOOGLE_API_KEY",
    defaultModel: "gemini-2.5-flash",
  },

  grok: {
    label: "Grok",
    type: "xai",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-4.6",
  },

  "alice-1": {
    label: "Алиса 1",
    type: "unavailable",
  },
};

const CLOUDFLARE_AI_MODEL =
  "@cf/meta/llama-3.1-8b-instruct";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_INPUT_LENGTH = 100000;

/* -------------------------------------------------------------------------- */
/* Общие функции                                                              */
/* -------------------------------------------------------------------------- */

function cleanString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeModel(model) {
  const value = cleanString(model, "neuro").toLowerCase();

  if (MODEL_CONFIG[value]) {
    return value;
  }

  return "neuro";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const result = [];

  for (const item of messages.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = cleanString(item.role).toLowerCase();
    const content = cleanString(item.content);

    if (
      !content ||
      content.length > MAX_MESSAGE_LENGTH
    ) {
      continue;
    }

    if (
      role !== "user" &&
      role !== "assistant" &&
      role !== "system"
    ) {
      continue;
    }

    result.push({
      role,
      content,
    });
  }

  return result;
}

function totalMessageLength(messages) {
  return messages.reduce(
    (total, message) =>
      total + message.content.length,
    0,
  );
}

function createAIError(
  message,
  code = "AI_ERROR",
  status = 500,
) {
  const error = new Error(message);

  error.code = code;
  error.status = status;

  return error;
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function extractTextFromOpenAI(data) {
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output)
    ? data.output
    : [];

  const parts = [];

  for (const item of output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type === "output_text" &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractTextFromGemini(data) {
  const candidates = Array.isArray(data?.candidates)
    ? data.candidates
    : [];

  const parts = [];

  for (const candidate of candidates) {
    const candidateParts = candidate?.content?.parts;

    if (!Array.isArray(candidateParts)) {
      continue;
    }

    for (const part of candidateParts) {
      if (typeof part?.text === "string") {
        parts.push(part.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function extractTextFromXAI(data) {
  const choices = Array.isArray(data?.choices)
    ? data.choices
    : [];

  const first = choices[0];

  const content =
    first?.message?.content ??
    first?.message?.text ??
    "";

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        return part?.text || "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

function extractTextFromCloudflare(data) {
  if (typeof data === "string") {
    return data.trim();
  }

  if (
    typeof data?.response === "string"
  ) {
    return data.response.trim();
  }

  if (
    typeof data?.result?.response === "string"
  ) {
    return data.result.response.trim();
  }

  if (
    typeof data?.result?.text === "string"
  ) {
    return data.result.text.trim();
  }

  if (
    typeof data?.text === "string"
  ) {
    return data.text.trim();
  }

  return "";
}

function assertSuccessfulResponse(
  response,
  data,
  provider,
) {
  if (response.ok) {
    return;
  }

  let message =
    data?.error?.message ||
    data?.message ||
    data?.error ||
    "";

  if (typeof message !== "string") {
    message = "";
  }

  if (!message) {
    message =
      `${provider} API вернул ошибку ${response.status}.`;
  }

  const status =
    response.status >= 400 &&
    response.status < 600
      ? response.status
      : 502;

  throw createAIError(
    message,
    "AI_PROVIDER_ERROR",
    status,
  );
}

function validateMessages(messages) {
  if (!messages.length) {
    throw createAIError(
      "Не переданы сообщения для AI.",
      "EMPTY_MESSAGES",
      400,
    );
  }

  const totalLength =
    totalMessageLength(messages);

  if (totalLength > MAX_TOTAL_INPUT_LENGTH) {
    throw createAIError(
      "Слишком большой объём сообщения.",
      "INPUT_TOO_LARGE",
      413,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Cloudflare Workers AI                                                      */
/* -------------------------------------------------------------------------- */

async function callCloudflareAI(
  env,
  messages,
  options = {},
) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    throw createAIError(
      "Cloudflare Workers AI не подключён.",
      "CLOUDFLARE_AI_NOT_CONFIGURED",
      503,
    );
  }

  const model =
    options.model ||
    env.NEURO_CLOUDFLARE_MODEL ||
    CLOUDFLARE_AI_MODEL;

  const cleanMessages =
    messages.filter(
      (message) =>
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system",
    );

  const request = {
    messages: cleanMessages,
  };

  let result;

  try {
    result = await env.AI.run(
      model,
      request,
    );
  } catch (error) {
    throw createAIError(
      error?.message ||
        "Cloudflare Workers AI не смог обработать запрос.",
      "CLOUDFLARE_AI_ERROR",
      502,
    );
  }

  const text =
    extractTextFromCloudflare(result);

  if (!text) {
    throw createAIError(
      "Cloudflare Workers AI вернул пустой ответ.",
      "EMPTY_AI_RESPONSE",
      502,
    );
  }

  return {
    text,
    provider: "cloudflare",
    model,
  };
}

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                      */
/* -------------------------------------------------------------------------- */

async function callOpenAI(
  env,
  messages,
  options = {},
) {
  const apiKey =
    cleanString(env?.OPENAI_API_KEY);

  if (!apiKey) {
    throw createAIError(
      "OPENAI_API_KEY не настроен.",
      "OPENAI_NOT_CONFIGURED",
      503,
    );
  }

  const model =
    options.model ||
    env.OPENAI_MODEL ||
    MODEL_CONFIG.chatgpt.defaultModel;

  const input = messages.map(
    (message) => ({
      role: message.role,
      content: message.content,
    }),
  );

  let response;

  try {
    response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions:
            options.systemPrompt ||
            DEFAULT_SYSTEM_PROMPT,
          input,
          store: false,
          max_output_tokens:
            options.maxOutputTokens || 2048,
        }),
      },
    );
  } catch (error) {
    throw createAIError(
      error?.message ||
        "Не удалось подключиться к OpenAI.",
      "OPENAI_NETWORK_ERROR",
      502,
    );
  }

  const data =
    await readJsonResponse(response);

  assertSuccessfulResponse(
    response,
    data,
    "OpenAI",
  );

  const text =
    extractTextFromOpenAI(data);

  if (!text) {
    throw createAIError(
      "OpenAI вернул пустой ответ.",
      "OPENAI_EMPTY_RESPONSE",
      502,
    );
  }

  return {
    text,
    provider: "openai",
    model,
    responseId: data?.id || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Google Gemini                                                               */
/* -------------------------------------------------------------------------- */

function convertMessagesToGemini(messages) {
  return messages
    .filter(
      (message) =>
        message.role === "user" ||
        message.role === "assistant",
    )
    .map((message) => ({
      role:
        message.role === "assistant"
          ? "model"
          : "user",
      parts: [
        {
          text: message.content,
        },
      ],
    }));
}

async function callGemini(
  env,
  messages,
  options = {},
) {
  const apiKey =
    cleanString(env?.GOOGLE_API_KEY);

  if (!apiKey) {
    throw createAIError(
      "GOOGLE_API_KEY не настроен.",
      "GEMINI_NOT_CONFIGURED",
      503,
    );
  }

  const model =
    options.model ||
    env.GEMINI_MODEL ||
    MODEL_CONFIG.gemini.defaultModel;

  const contents =
    convertMessagesToGemini(messages);

  if (!contents.length) {
    throw createAIError(
      "Gemini не получил сообщений.",
      "GEMINI_EMPTY_INPUT",
      400,
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response;

  try {
    response = await fetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  options.systemPrompt ||
                  DEFAULT_SYSTEM_PROMPT,
              },
            ],
          },

          contents,

          generationConfig: {
            maxOutputTokens:
              options.maxOutputTokens || 2048,
          },
        }),
      },
    );
  } catch (error) {
    throw createAIError(
      error?.message ||
        "Не удалось подключиться к Gemini.",
      "GEMINI_NETWORK_ERROR",
      502,
    );
  }

  const data =
    await readJsonResponse(response);

  assertSuccessfulResponse(
    response,
    data,
    "Gemini",
  );

  const text =
    extractTextFromGemini(data);

  if (!text) {
    throw createAIError(
      "Gemini вернул пустой ответ.",
      "GEMINI_EMPTY_RESPONSE",
      502,
    );
  }

  return {
    text,
    provider: "gemini",
    model,
  };
}

/* -------------------------------------------------------------------------- */
/* xAI / Grok                                                                 */
/* -------------------------------------------------------------------------- */

async function callGrok(
  env,
  messages,
  options = {},
) {
  const apiKey =
    cleanString(env?.XAI_API_KEY);

  if (!apiKey) {
    throw createAIError(
      "XAI_API_KEY не настроен.",
      "GROK_NOT_CONFIGURED",
      503,
    );
  }

  const model =
    options.model ||
    env.XAI_MODEL ||
    MODEL_CONFIG.grok.defaultModel;

  const input = [
    {
      role: "system",
      content:
        options.systemPrompt ||
        DEFAULT_SYSTEM_PROMPT,
    },
    ...messages,
  ];

  let response;

  try {
    response = await fetch(
      "https://api.x.ai/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input,
        }),
      },
    );
  } catch (error) {
    throw createAIError(
      error?.message ||
        "Не удалось подключиться к xAI.",
      "GROK_NETWORK_ERROR",
      502,
    );
  }

  const data =
    await readJsonResponse(response);

  assertSuccessfulResponse(
    response,
    data,
    "xAI",
  );

  let text =
    extractTextFromOpenAI(data);

  if (!text) {
    text =
      extractTextFromXAI(data);
  }

  if (!text) {
    throw createAIError(
      "Grok вернул пустой ответ.",
      "GROK_EMPTY_RESPONSE",
      502,
    );
  }

  return {
    text,
    provider: "xai",
    model,
    responseId: data?.id || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Автоматический режим «Нейро»                                               */
/* -------------------------------------------------------------------------- */

function getAvailableProviders(env) {
  const providers = [];

  if (
    env?.AI &&
    typeof env.AI.run === "function"
  ) {
    providers.push("cloudflare");
  }

  if (cleanString(env?.OPENAI_API_KEY)) {
    providers.push("openai");
  }

  if (cleanString(env?.GOOGLE_API_KEY)) {
    providers.push("gemini");
  }

  if (cleanString(env?.XAI_API_KEY)) {
    providers.push("xai");
  }

  return providers;
}

async function callNeuro(
  env,
  messages,
  options = {},
) {
  const providers =
    getAvailableProviders(env);

  if (!providers.length) {
    throw createAIError(
      "Нейро пока не настроен: подключите Cloudflare Workers AI или один из AI API.",
      "AI_NOT_CONFIGURED",
      503,
    );
  }

  /*
   * Приоритет:
   *
   * 1. Cloudflare Workers AI
   * 2. OpenAI
   * 3. Gemini
   * 4. Grok
   *
   * Это настоящий fallback:
   * если первый доступный провайдер временно
   * не отвечает, пробуем следующий.
   */

  const attempts = [];

  for (const provider of providers) {
    try {
      if (provider === "cloudflare") {
        return await callCloudflareAI(
          env,
          messages,
          options,
        );
      }

      if (provider === "openai") {
        return await callOpenAI(
          env,
          messages,
          options,
        );
      }

      if (provider === "gemini") {
        return await callGemini(
          env,
          messages,
          options,
        );
      }

      if (provider === "xai") {
        return await callGrok(
          env,
          messages,
          options,
        );
      }
    } catch (error) {
      attempts.push({
        provider,
        message:
          error?.message ||
          "Неизвестная ошибка.",
      });
    }
  }

  const details = attempts
    .map(
      (item) =>
        `${item.provider}: ${item.message}`,
    )
    .join("; ");

  throw createAIError(
    `Нейро не смог получить ответ ни от одного доступного AI-провайдера. ${details}`,
    "ALL_AI_PROVIDERS_FAILED",
    502,
  );
}

/* -------------------------------------------------------------------------- */
/* Главная функция чата                                                       */
/* -------------------------------------------------------------------------- */

export async function chat(
  env,
  options = {},
) {
  const model =
    normalizeModel(options.model);

  const messages =
    normalizeMessages(
      options.messages,
    );

  validateMessages(messages);

  const systemPrompt =
    cleanString(
      options.systemPrompt,
      DEFAULT_SYSTEM_PROMPT,
    );

  const aiOptions = {
    ...options,
    systemPrompt,
  };

  if (model === "neuro") {
    return callNeuro(
      env,
      messages,
      aiOptions,
    );
  }

  if (model === "chatgpt") {
    return callOpenAI(
      env,
      messages,
      aiOptions,
    );
  }

  if (model === "gemini") {
    return callGemini(
      env,
      messages,
      aiOptions,
    );
  }

  if (model === "grok") {
    return callGrok(
      env,
      messages,
      aiOptions,
    );
  }

  if (model === "alice-1") {
    throw createAIError(
      "«Алиса 1» пока не подключена к публичному AI API в этом проекте.",
      "ALICE_NOT_CONFIGURED",
      503,
    );
  }

  throw createAIError(
    "Неизвестный AI-режим.",
    "UNKNOWN_MODEL",
    400,
  );
}

/* -------------------------------------------------------------------------- */
/* Генерация изображений                                                      */
/* -------------------------------------------------------------------------- */

export async function generateImage(
  env,
  options = {},
) {
  const prompt =
    cleanString(options.prompt);

  if (!prompt) {
    throw createAIError(
      "Для создания изображения нужен prompt.",
      "EMPTY_IMAGE_PROMPT",
      400,
    );
  }

  /*
   * На этом этапе специально не имитируем
   * генерацию изображения.
   *
   * Когда подключим реальный image provider,
   * сюда добавляется официальный API-вызов.
   */

  throw createAIError(
    "Генерация изображений ещё не подключена к реальному image API.",
    "IMAGE_PROVIDER_NOT_CONFIGURED",
    503,
  );
}

/* -------------------------------------------------------------------------- */
/* Генерация видео                                                             */
/* -------------------------------------------------------------------------- */

export async function generateVideo(
  env,
  options = {},
) {
  const prompt =
    cleanString(options.prompt);

  if (!prompt) {
    throw createAIError(
      "Для создания видео нужен prompt.",
      "EMPTY_VIDEO_PROMPT",
      400,
    );
  }

  throw createAIError(
    "Генерация видео ещё не подключена к реальному video API.",
    "VIDEO_PROVIDER_NOT_CONFIGURED",
    503,
  );
}

/* -------------------------------------------------------------------------- */
/* Генерация музыки                                                            */
/* -------------------------------------------------------------------------- */

export async function generateMusic(
  env,
  options = {},
) {
  const prompt =
    cleanString(options.prompt);

  if (!prompt) {
    throw createAIError(
      "Для создания музыки нужен prompt.",
      "EMPTY_MUSIC_PROMPT",
      400,
    );
  }

  throw createAIError(
    "Генерация музыки ещё не подключена к реальному music API.",
    "MUSIC_PROVIDER_NOT_CONFIGURED",
    503,
  );
}

/* -------------------------------------------------------------------------- */
/* Генерация 3D-модели                                                        */
/* -------------------------------------------------------------------------- */

export async function generate3D(
  env,
  options = {},
) {
  const prompt =
    cleanString(options.prompt);

  if (!prompt) {
    throw createAIError(
      "Для создания 3D-модели нужен prompt.",
      "EMPTY_3D_PROMPT",
      400,
    );
  }

  throw createAIError(
    "Генерация 3D-моделей ещё не подключена к реальному 3D API.",
    "THREE_D_PROVIDER_NOT_CONFIGURED",
    503,
  );
}

/* -------------------------------------------------------------------------- */
/* Информация о доступных AI                                                   */
/* -------------------------------------------------------------------------- */

export function getAIStatus(env) {
  const available =
    getAvailableProviders(env);

  return {
    neuro: available.length > 0,

    cloudflare:
      available.includes("cloudflare"),

    chatgpt:
      available.includes("openai"),

    gemini:
      available.includes("gemini"),

    grok:
      available.includes("xai"),

    alice1: false,

    providers: available,
  };
}

/* -------------------------------------------------------------------------- */
/* Экспорт агрегированного объекта                                            */
/* -------------------------------------------------------------------------- */

export const ai = {
  chat,
  generateImage,
  generateVideo,
  generateMusic,
  generate3D,
  getAIStatus,
};

export default ai;