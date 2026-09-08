const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Раздаём фронтенд
app.use(express.static(path.join(__dirname)));

// OpenAI
const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })
    : null;

// Проверка сервера
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        service: "Neuro Chat",
        ai: Boolean(openai),
        time: new Date().toISOString()
    });
});

// Основной AI-запрос
app.post("/api/chat", async (req, res) => {
    try {
        const { message, history = [], userApiKey, model } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: "Сообщение пустое."
            });
        }

        /*
         * Если пользователь указал свой API-ключ,
         * используем его в первую очередь.
         *
         * Если ключа нет — используем основной ключ
         * из переменной окружения OPENAI_API_KEY.
         */
        const apiKey = userApiKey || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(503).json({
                success: false,
                error:
                    "API-ключ не настроен. Добавьте свой API-ключ в настройках или настройте OPENAI_API_KEY на сервере."
            });
        }

        const client = new OpenAI({
            apiKey
        });

        // Ограничиваем историю, чтобы запросы не становились бесконечными
        const safeHistory = Array.isArray(history)
            ? history.slice(-20)
            : [];

        const input = [];

        for (const item of safeHistory) {
            if (!item || !item.role || !item.content) continue;

            if (
                item.role === "user" ||
                item.role === "assistant"
            ) {
                input.push({
                    role: item.role,
                    content: String(item.content)
                });
            }
        }

        input.push({
            role: "user",
            content: message.trim()
        });

        const response = await client.responses.create({
            model: model || process.env.OPENAI_MODEL || "gpt-5",

            instructions: `
Ты — Нейро-чат, современный универсальный AI-ассистент.

Твои задачи:
- отвечать на вопросы пользователя;
- помогать программировать;
- создавать HTML, CSS, JavaScript и другие проекты;
- анализировать и исправлять код;
- объяснять сложные вещи простым языком;
- помогать создавать сайты;
- работать с контекстом предыдущих сообщений;
- давать готовые решения, а не бессмысленные заглушки.

Если пользователь просит написать код:
1. Сначала пойми задачу.
2. Создай рабочий код.
3. Не добавляй "в разработке", если пользователь не просил.
4. Если нужен сайт — учитывай HTML, CSS и JavaScript.
5. Если нужно несколько файлов — явно разделяй их по названиям файлов.

Отвечай на языке пользователя.
Если пользователь пишет на русском — отвечай на русском.

Не утверждай, что ты выполнил действие, если фактически его не выполнял.
`,

            input
        });

        return res.json({
            success: true,
            answer: response.output_text || "Не удалось получить ответ.",
            model: model || process.env.OPENAI_MODEL || "gpt-5"
        });

    } catch (error) {
        console.error("AI ERROR:", error);

        let message = "Произошла ошибка при обращении к AI.";

        if (error?.status === 401) {
            message = "API-ключ недействителен.";
        }

        if (error?.status === 429) {
            message = "Превышен лимит API. Попробуйте позже.";
        }

        return res.status(500).json({
            success: false,
            error: message
        });
    }
});

// Проверка API
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        neuroChat: true,
        openai: Boolean(process.env.OPENAI_API_KEY)
    });
});

// Все неизвестные страницы отправляем на index.html
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
    console.log("");
    console.log("=================================");
    console.log("       NEURO CHAT SERVER");
    console.log("=================================");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(
        `OpenAI: ${
            process.env.OPENAI_API_KEY
                ? "CONNECTED"
                : "NOT CONFIGURED"
        }`
    );
    console.log("=================================");
    console.log("");
});