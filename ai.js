const MODELS = {
  neuro: {
    id: "neuro",
    name: "Нейро",
    provider: "cloudflare"
  },

  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    provider: "openai"
  },

  gemini: {
    id: "gemini",
    name: "Gemini",
    provider: "google"
  },

  grok: {
    id: "grok",
    name: "Grok",
    provider: "xai"
  },

  "alice-1": {
    id: "alice-1",
    name: "Алиса 1",
    provider: "alice"
  }
};

const DEFAULT_CLOUDFLARE_MODEL =
  "@cf/meta/llama-3.1-8b-instruct";

const DEFAULT_GEMINI_MODEL =
  "gemini-3.8-flash";

const DEFAULT_XAI_MODEL =
  "grok-4.6";

const MAX_MESSAGE_LENGTH =
  12000;

const MAX_HISTORY = 30;

function normalizeModel(model) {
  const value =
    String(model || "neuro")
      .trim()
      .toLowerCase();

  return MODELS[value]
    ? value
    : "neuro";
}

function normalizeMessages(
  messages
) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .slice(-MAX_HISTORY)
    .map((message) => {
      const role =
        message?.role ===
        "assistant"
          ? "assistant"
          : "user";

      const content =
        String(
          message?.content ||
          message?.text ||
          ""
        )
          .trim()
          .slice(
            0,
            MAX_MESSAGE_LENGTH
          );

      return {
        role,
        content
      };
    })
    .filter(
      (message) =>
        message.content
    );
}

function makeSystemPrompt() {
  return [
    "Ты — Нейро, AI-помощник проекта «Нейро-чат».",
    "Отвечай на русском языке, если пользователь не попросил другой язык.",
    "Отвечай точно, понятно и по делу.",
    "Не утверждай, что выполнил действие, если оно реально не было выполнено.",
    "Не придумывай ссылки, файлы, результаты инструментов или факты.",
    "Если для действия требуется разрешение пользователя, сначала попроси подтверждение.",
    "Если информации недостаточно, честно сообщи об этом."
  ].join(" ");
}

async function getUserSettings(
  env,
  userId
) {
  if (
    !userId ||
    typeof env.getUserSettings !==
      "function"
  ) {
    return {};
  }

  try {
    return (
      (await env.getUserSettings(
        userId
      )) || {}
    );
  } catch {
    return {};
  }
}

function extractApiKey(
  settings,
  provider
) {
  const keys =
    settings?.apiKeys;

  if (
    !keys ||
    typeof keys !== "object"
  ) {
    return null;
  }

  const value =
    keys[provider];

  return value
    ? String(value).trim() ||
        null
    : null;
}

async function cloudflareChat(
  env,
  messages
) {
  if (!env.AI) {
    throw new Error(
      "Cloudflare AI не подключён к Worker."
    );
  }

  const model =
    env.NEURO_AI_MODEL ||
    DEFAULT_CLOUDFLARE_MODEL;

  const result =
    await env.AI.run(
      model,
      {
        messages: [
          {
            role: "system",
            content:
              makeSystemPrompt()
          },
          ...messages
        ]
      }
    );

  const text =
    result?.response ||
    result?.result?.response ||
    result?.output_text ||
    "";

  if (!text) {
    throw new Error(
      "Модель «Нейро» не вернула ответ."
    );
  }

  return String(text).trim();
}

async function openAIChat(
  apiKey,
  messages
) {
  if (!apiKey) {
    throw new Error(
      "Добавьте API-ключ OpenAI в настройках."
    );
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          authorization:
            `Bearer ${apiKey}`
        },

        body: JSON.stringify({
          model: "gpt-4o-mini",

          messages: [
            {
              role: "system",
              content:
                makeSystemPrompt()
            },

            ...messages
          ],

          temperature: 0.7
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "OpenAI не принял запрос."
    );
  }

  const text =
    data?.choices?.[0]
      ?.message
      ?.content;

  if (!text) {
    throw new Error(
      "OpenAI не вернул текст ответа."
    );
  }

  return String(text).trim();
}

async function geminiChat(
  apiKey,
  messages
) {
  if (!apiKey) {
    throw new Error(
      "Добавьте API-ключ Gemini в настройках."
    );
  }

  const contents =
    messages.map(
      (message) => ({
        role:
          message.role ===
          "assistant"
            ? "model"
            : "user",

        parts: [
          {
            text:
              message.content
          }
        ]
      })
    );

  const response =
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          "x-goog-api-key":
            apiKey
        },

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  makeSystemPrompt()
              }
            ]
          },

          contents
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini не принял запрос."
    );
  }

  const text =
    data?.candidates?.[0]
      ?.content
      ?.parts
      ?.map(
        (part) =>
          part?.text || ""
      )
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "Gemini не вернул текст ответа."
    );
  }

  return text;
}

async function xaiChat(
  apiKey,
  messages
) {
  if (!apiKey) {
    throw new Error(
      "Добавьте API-ключ Grok в настройках."
    );
  }

  const response =
    await fetch(
      "https://api.x.ai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          authorization:
            `Bearer ${apiKey}`
        },

        body: JSON.stringify({
          model:
            DEFAULT_XAI_MODEL,

          messages: [
            {
              role: "system",
              content:
                makeSystemPrompt()
            },

            ...messages
          ],

          temperature: 0.7
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Grok не принял запрос."
    );
  }

  const text =
    data?.choices?.[0]
      ?.message
      ?.content;

  if (!text) {
    throw new Error(
      "Grok не вернул текст ответа."
    );
  }

  return String(text).trim();
}

async function aliceChat(
  apiKey
) {
  if (!apiKey) {
    throw new Error(
      "Добавьте API-доступ Алисы в настройках."
    );
  }

  throw new Error(
    "API Алисы не подключён: нужен совместимый API endpoint Яндекса."
  );
}

export async function chat({
  env,
  model = "neuro",
  messages = [],
  userId = null
}) {
  const selectedModel =
    normalizeModel(model);

  const normalizedMessages =
    normalizeMessages(messages);

  if (
    !normalizedMessages.length
  ) {
    throw new Error(
      "Сообщение для AI не найдено."
    );
  }

  const settings =
    await getUserSettings(
      env,
      userId
    );

  const provider =
    MODELS[selectedModel]
      .provider;

  let text;

  try {
    switch (provider) {
      case "cloudflare":
        text =
          await cloudflareChat(
            env,
            normalizedMessages
          );
        break;

      case "openai":
        text =
          await openAIChat(
            extractApiKey(
              settings,
              "openai"
            ),
            normalizedMessages
          );
        break;

      case "google":
        text =
          await geminiChat(
            extractApiKey(
              settings,
              "google"
            ),
            normalizedMessages
          );
        break;

      case "xai":
        text =
          await xaiChat(
            extractApiKey(
              settings,
              "xai"
            ),
            normalizedMessages
          );
        break;

      case "alice":
        text =
          await aliceChat(
            extractApiKey(
              settings,
              "alice"
            )
          );
        break;

      default:
        throw new Error(
          "Неизвестный AI-провайдер."
        );
    }
  } catch (error) {
    console.error(
      `[AI:${selectedModel}]`,
      error
    );

    throw new Error(
      error?.message ||
      "AI не смог обработать запрос."
    );
  }

  return {
    model:
      selectedModel,

    modelName:
      MODELS[selectedModel]
        .name,

    provider,

    message: text
  };
}

export async function generateImage({
  env,
  prompt
}) {
  if (!env.AI) {
    throw new Error(
      "Cloudflare AI не подключён."
    );
  }

  const text =
    String(prompt || "")
      .trim();

  if (!text) {
    throw new Error(
      "Введите описание изображения."
    );
  }

  const model =
    env.IMAGE_AI_MODEL ||
    "@cf/black-forest-labs/flux-1-schnell";

  const result =
    await env.AI.run(
      model,
      {
        prompt: text
      }
    );

  const image =
    result?.image ||
    result?.result?.image;

  if (!image) {
    throw new Error(
      "Генератор изображения не вернул изображение."
    );
  }

  const dataURI =
    String(image).startsWith(
      "data:image/"
    )
      ? String(image)
      : `data:image/jpeg;base64,${image}`;

  return {
    model,
    dataURI
  };
}

export async function generateVideo() {
  throw new Error(
    "Генератор видео ещё не подключён к реальному API."
  );
}

export async function generateMusic() {
  throw new Error(
    "Генератор музыки ещё не подключён к реальному API."
  );
}

export async function generate3D() {
  throw new Error(
    "Генератор 3D-моделей ещё не подключён к реальному API."
  );
}

export function getAIStatus(
  env
) {
  return {
    ok: true,

    models:
      Object.values(MODELS)
        .map((model) => ({
          id: model.id,
          name: model.name,
          provider:
            model.provider,

          available:
            model.provider ===
            "cloudflare"
              ? Boolean(env.AI)
              : true
        })),

    generation: {
      image:
        Boolean(env.AI),

      video: false,

      music: false,

      "3d": false
    }
  };
}

export {
  MODELS,
  normalizeModel,
  normalizeMessages
};