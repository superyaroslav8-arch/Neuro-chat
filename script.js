'use strict';

/* ============================================================
   🔐 НЕЙРО-ЧАТ — ОСНОВНЫЕ НАСТРОЙКИ
   ============================================================

   ⚠️ ВСТАВЬ СВОЙ API-КЛЮЧ В ЭТУ СТРОКУ.
   На iPhone можешь использовать свою автозамену.

   ============================================================ */

const DEFAULT_API_KEY = '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';


/* ============================================================
   🤖 AI
   ============================================================ */

const API_BASE_URL = 'https://api.openai.com/v1';

const DEFAULT_MODEL = 'gpt-5';

const APP_NAME = 'Нейро-чат';

const MAX_HISTORY_CHATS = 100;

const MAX_CONTEXT_MESSAGES = 40;


/* ============================================================
   📦 СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ============================================================ */

let OPENAI_API_KEY =
    localStorage.getItem('neuro_api_key') ||
    DEFAULT_API_KEY;

let currentUser = null;

let currentChatId = null;

let messages = [];

let attachedFiles = [];

let isGenerating = false;

let currentAbortController = null;

let currentSearchQuery = '';

let selectedModel =
    localStorage.getItem('neuro_model') ||
    DEFAULT_MODEL;


/* ============================================================
   🧰 УТИЛИТЫ
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function createId(prefix = 'id') {
    return (
        prefix +
        '_' +
        Date.now() +
        '_' +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getCurrentUser() {
    return (
        currentUser ||
        localStorage.getItem('neuro_current_user') ||
        'guest'
    );
}

function getChatsStorageKey() {
    return `neuro_chats_${getCurrentUser()}`;
}

function getChats() {
    try {
        return JSON.parse(
            localStorage.getItem(
                getChatsStorageKey()
            ) || '[]'
        );
    } catch {
        return [];
    }
}

function saveChats(chats) {
    localStorage.setItem(
        getChatsStorageKey(),
        JSON.stringify(chats)
    );
}

function getCurrentTime() {
    return new Date().toLocaleTimeString(
        'ru-RU',
        {
            hour: '2-digit',
            minute: '2-digit'
        }
    );
}


/* ============================================================
   🔔 УВЕДОМЛЕНИЯ
   ============================================================ */

function showNotice(text, duration = 2500) {

    let notice =
        document.getElementById(
            'neuro-notice'
        );

    if (!notice) {

        notice =
            document.createElement('div');

        notice.id = 'neuro-notice';

        Object.assign(
            notice.style,
            {
                position: 'fixed',
                left: '50%',
                bottom: '90px',
                transform:
                    'translateX(-50%)',
                zIndex: '999999',
                padding: '12px 18px',
                borderRadius: '14px',
                background:
                    'rgba(30,30,30,.95)',
                color: '#fff',
                fontSize: '14px',
                maxWidth:
                    'calc(100vw - 30px)',
                textAlign: 'center',
                boxShadow:
                    '0 10px 35px rgba(0,0,0,.3)',
                opacity: '0',
                transition:
                    'opacity .2s ease',
                pointerEvents: 'none'
            }
        );

        document.body.appendChild(
            notice
        );
    }

    notice.textContent = text;

    notice.style.opacity = '1';

    clearTimeout(notice._timer);

    notice._timer =
        setTimeout(() => {
            notice.style.opacity = '0';
        }, duration);
}


/* ============================================================
   🔐 АВТОРИЗАЦИЯ
   ============================================================ */

function nextStep() {

    const username =
        $('username');

    if (!username) return;

    const value =
        username.value.trim();

    if (!value) {

        showNotice(
            'Введите имя пользователя'
        );

        username.focus();

        return;
    }

    $('step-username')?.style &&
        ($('step-username').style.display =
            'none');

    if ($('step-password')) {
        $('step-password').style.display =
            'block';
    }

    $('password')?.focus();
}

function backToUsername() {

    if ($('step-password')) {
        $('step-password').style.display =
            'none';
    }

    if ($('step-username')) {
        $('step-username').style.display =
            'block';
    }

    $('username')?.focus();
}

function login() {

    const username =
        $('username')?.value.trim();

    const password =
        $('password')?.value || '';

    if (!username) {

        showNotice(
            'Введите имя пользователя'
        );

        return;
    }

    if (!password) {

        showNotice(
            'Введите пароль'
        );

        return;
    }

    let users = {};

    try {

        users =
            JSON.parse(
                localStorage.getItem(
                    'neuro_users'
                ) || '{}'
            );

    } catch {

        users = {};
    }

    if (!users[username]) {

        users[username] = {
            password,
            createdAt: Date.now()
        };

    } else {

        if (
            users[username].password !==
            password
        ) {

            showNotice(
                'Неверный пароль'
            );

            return;
        }
    }

    localStorage.setItem(
        'neuro_users',
        JSON.stringify(users)
    );

    currentUser = username;

    localStorage.setItem(
        'neuro_current_user',
        username
    );

    if ($('login-screen')) {
        $('login-screen').style.display =
            'none';
    }

    if ($('app')) {
        $('app').style.display =
            'flex';
    }

    newChat();

    showNotice(
        `Добро пожаловать, ${username}!`
    );
}

function logout() {

    if (
        !confirm(
            'Выйти из аккаунта?'
        )
    ) {
        return;
    }

    localStorage.removeItem(
        'neuro_current_user'
    );

    currentUser = null;

    location.reload();
}


/* ============================================================
   💬 НОВЫЙ ЧАТ
   ============================================================ */

function newChat() {

    if (isGenerating) {

        showNotice(
            'Сначала дождитесь окончания ответа'
        );

        return;
    }

    currentChatId =
        createId('chat');

    messages = [];

    attachedFiles = [];

    if ($('chat-title')) {
        $('chat-title').textContent =
            'Новый чат';
    }

    const container =
        $('messages');

    if (!container) return;

    container.innerHTML = `
        <div class="welcome">

            <div class="welcome-logo-text">
                Нейро-чат
            </div>

            <p>
                Чем я могу помочь?
            </p>

            <div class="suggestions">

                <button
                    type="button"
                    onclick="quickPrompt('Создай современный сайт')"
                >
                    Создать сайт
                </button>

                <button
                    type="button"
                    onclick="quickPrompt('Напиши программу')"
                >
                    Написать код
                </button>

                <button
                    type="button"
                    onclick="quickPrompt('Придумай идею для видео')"
                >
                    Создать видео
                </button>

                <button
                    type="button"
                    onclick="quickPrompt('Сочини песню')"
                >
                    Создать музыку
                </button>

                <button
                    type="button"
                    onclick="quickPrompt('Создай концепцию 3D-модели')"
                >
                    3D-модель
                </button>

            </div>

        </div>
    `;

    renderChatHistory();

    updateChatTitle();
}


/* ============================================================
   🧹 ОЧИСТКА
   ============================================================ */

function clearChat() {

    if (!messages.length) {
        newChat();
        return;
    }

    if (
        !confirm(
            'Очистить текущий чат?'
        )
    ) {
        return;
    }

    messages = [];

    newChat();

    showNotice(
        'Чат очищен'
    );
}


/* ============================================================
   💾 СОХРАНЕНИЕ ЧАТА
   ============================================================ */

function saveCurrentChat() {

    if (
        !currentUser ||
        !messages.length
    ) {
        return;
    }

    const chats =
        getChats();

    const firstUser =
        messages.find(
            item =>
                item.role === 'user'
        );

    const title =
        firstUser?.text
            ?.replace(/\s+/g, ' ')
            ?.trim()
            ?.slice(0, 60) ||
        'Новый чат';

    const chat = {

        id:
            currentChatId ||
            createId('chat'),

        title,

        messages,

        updatedAt:
            Date.now()
    };

    const index =
        chats.findIndex(
            item =>
                item.id === chat.id
        );

    if (index >= 0) {
        chats[index] = chat;
    } else {
        chats.unshift(chat);
    }

    chats.sort(
        (a, b) =>
            b.updatedAt -
            a.updatedAt
    );

    saveChats(
        chats.slice(
            0,
            MAX_HISTORY_CHATS
        )
    );

    renderChatHistory();

    updateChatTitle();
}


/* ============================================================
   📂 ИСТОРИЯ
   ============================================================ */

function renderChatHistory() {

    const container =
        $('chat-history') ||
        $('history') ||
        $('chat-list');

    if (!container) {
        return;
    }

    const chats =
        getChats();

    container.innerHTML = '';

    if (!chats.length) {

        container.innerHTML = `
            <div class="chat-item">
                История чатов пуста
            </div>
        `;

        return;
    }

    chats.forEach(chat => {

        if (
            currentSearchQuery &&
            !chat.title
                .toLowerCase()
                .includes(
                    currentSearchQuery
                        .toLowerCase()
                )
        ) {
            return;
        }

        const item =
            document.createElement(
                'div'
            );

        item.className =
            'chat-item';

        item.dataset.chatId =
            chat.id;

        item.innerHTML = `
            <span>
                ${escapeHTML(
                    chat.title
                )}
            </span>

            <button
                type="button"
                class="chat-delete"
                title="Удалить чат"
            >
                ×
            </button>
        `;

        item.addEventListener(
            'click',
            event => {

                if (
                    event.target.closest(
                        '.chat-delete'
                    )
                ) {
                    return;
                }

                openChat(
                    chat.id
                );
            }
        );

        item
            .querySelector(
                '.chat-delete'
            )
            ?.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    deleteChat(
                        chat.id
                    );
                }
            );

        container.appendChild(
            item
        );
    });
}

function openChat(chatId) {

    const chat =
        getChats().find(
            item =>
                item.id === chatId
        );

    if (!chat) {
        return;
    }

    currentChatId =
        chat.id;

    messages =
        Array.isArray(
            chat.messages
        )
            ? chat.messages
            : [];

    if ($('chat-title')) {
        $('chat-title').textContent =
            chat.title ||
            'Чат';
    }

    renderMessages();

    closeSidebarOnMobile();
}

function deleteChat(chatId) {

    if (
        !confirm(
            'Удалить этот чат?'
        )
    ) {
        return;
    }

    const chats =
        getChats().filter(
            chat =>
                chat.id !==
                chatId
        );

    saveChats(chats);

    if (
        chatId ===
        currentChatId
    ) {
        newChat();
    } else {
        renderChatHistory();
    }

    showNotice(
        'Чат удалён'
    );
}

function searchChats(query) {

    currentSearchQuery =
        String(query || '');

    renderChatHistory();
}


/* ============================================================
   📝 НАЗВАНИЕ ЧАТА
   ============================================================ */

function updateChatTitle() {

    const first =
        messages.find(
            item =>
                item.role === 'user'
        );

    if (
        !first ||
        !$('chat-title')
    ) {
        return;
    }

    $('chat-title').textContent =
        first.text
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 45);
}


/* ============================================================
   ⚡ БЫСТРЫЕ ЗАПРОСЫ
   ============================================================ */

function quickPrompt(text) {

    const input =
        $('user-input');

    if (!input) return;

    input.value = text;

    autoResizeInput();

    input.focus();

    sendMessage();
}


/* ============================================================
   🚀 ОТПРАВКА
   ============================================================ */

async function sendMessage() {

    if (isGenerating) {

        showNotice(
            'Ответ уже генерируется'
        );

        return;
    }

    const input =
        $('user-input');

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (!text) {
        return;
    }

    if (!OPENAI_API_KEY) {

        showNotice(
            'API-ключ не указан'
        );

        openSettings();

        return;
    }

    input.value = '';

    input.style.height =
        'auto';

    removeWelcome();

    addMessage(
        'user',
        text
    );

    isGenerating = true;

    updateSendButton(
        true
    );

    showTyping();

    currentAbortController =
        new AbortController();

    try {

        const apiMessages =
            buildApiMessages();

        const response =
            await fetch(
                `${API_BASE_URL}/chat/completions`,
                {
                    method: 'POST',

                    signal:
                        currentAbortController
                            .signal,

                    headers: {
                        'Content-Type':
                            'application/json',

                        'Authorization':
                            `Bearer ${OPENAI_API_KEY}`
                    },

                    body:
                        JSON.stringify({
                            model:
                                selectedModel,

                            messages:
                                apiMessages,

                            temperature:
                                0.7
                        })
                }
            );

        let data;

        try {

            data =
                await response.json();

        } catch {

            throw new Error(
                `Сервер вернул некорректный ответ: ${response.status}`
            );
        }

        removeTyping();

        if (
            !response.ok ||
            data?.error
        ) {

            throw new Error(
                data?.error?.message ||
                `Ошибка API: ${response.status}`
            );
        }

        const reply =
            data?.choices?.[0]
                ?.message
                ?.content;

        if (!reply) {

            throw new Error(
                'AI не вернул текст ответа'
            );
        }

        addMessage(
            'bot',
            reply
        );

        saveCurrentChat();

    } catch (error) {

        removeTyping();

        if (
            error.name ===
            'AbortError'
        ) {

            addMessage(
                'bot',
                'Генерация остановлена.'
            );

        } else {

            console.error(
                'Neuro-chat:',
                error
            );

            addMessage(
                'bot',
                formatError(
                    error
                )
            );
        }

    } finally {

        isGenerating =
            false;

        currentAbortController =
            null;

        updateSendButton(
            false
        );

        input.focus();
    }
}


/* ============================================================
   🧠 КОНТЕКСТ
   ============================================================ */

function buildApiMessages() {

    const system =
        buildSystemPrompt();

    const recent =
        messages
            .filter(
                item =>
                    item.role ===
                        'user' ||
                    item.role ===
                        'bot'
            )
            .slice(
                -MAX_CONTEXT_MESSAGES
            )
            .map(
                item => ({
                    role:
                        item.role ===
                        'user'
                            ? 'user'
                            : 'assistant',

                    content:
                        item.text
                })
            );

    return [
        {
            role: 'system',
            content: system
        },

        ...recent
    ];
}

function buildSystemPrompt() {

    return `
Ты — Нейро-чат, современный AI-ассистент.

Название продукта: ${APP_NAME}.

Отвечай на русском языке,
если пользователь не попросил
использовать другой язык.

Твои основные задачи:

1. Отвечать на вопросы.
2. Помогать с программированием.
3. Помогать создавать сайты.
4. Помогать с текстами.
5. Помогать с изображениями
   через доступные инструменты.
6. Помогать с видео-концепциями.
7. Помогать с музыкой.
8. Помогать с 3D-моделированием.
9. Анализировать предоставленную
   пользователем информацию.
10. Помогать с проектами.

Правила:

— Не выдумывай результаты инструментов.
— Не утверждай, что файл создан,
  если файл реально не был создан.
— Для кода используй Markdown.
— Сложные ответы структурируй.
— Не повторяй вопрос пользователя.
— Не добавляй фразы вроде
  «функция находится в разработке»,
  если пользователь просто просит
  обычный ответ.
— Отвечай конкретно.
`;
}


/* ============================================================
   💬 СООБЩЕНИЯ
   ============================================================ */

function addMessage(
    role,
    text
) {

    messages.push({

        id:
            createId('message'),

        role,

        text:

            String(text ?? ''),

        createdAt:
            Date.now(),

        time:
            getCurrentTime()
    });

    renderMessages();

    if (
        role === 'user'
    ) {
        saveCurrentChat();
    }
}

function renderMessages() {

    const container =
        $('messages');

    if (!container) {
        return;
    }

    if (!messages.length) {
        newChat();
        return;
    }

    container.innerHTML = '';

    messages.forEach(
        (message, index) => {

            const wrapper =
                document.createElement(
                    'div'
                );

            wrapper.className =
                `message ${message.role}`;

            const content =
                document.createElement(
                    'div'
                );

            content.className =
                'message-content';

            content.innerHTML =
                formatText(
                    message.text
                );

            wrapper.appendChild(
                content
            );

            const actions =
                document.createElement(
                    'div'
                );

            actions.className =
                'message-actions';

            const copy =
                document.createElement(
                    'button'
                );

            copy.type = 'button';

            copy.textContent =
                'Копировать';

            copy.onclick =
                () =>
                    copyText(
                        message.text
                    );

            actions.appendChild(
                copy
            );

            if (
                message.role ===
                'user'
            ) {

                const edit =
                    document.createElement(
                        'button'
                    );

                edit.type =
                    'button';

                edit.textContent =
                    'Изменить';

                edit.onclick =
                    () =>
                        editMessage(
                            index
                        );

                actions.appendChild(
                    edit
                );
            }

            if (
                message.role ===
                'bot'
            ) {

                const retry =
                    document.createElement(
                        'button'
                    );

                retry.type =
                    'button';

                retry.textContent =
                    'Повторить';

                retry.onclick =
                    () =>
                        regenerateMessage(
                            index
                        );

                actions.appendChild(
                    retry
                );
            }

            wrapper.appendChild(
                actions
            );

            container.appendChild(
                wrapper
            );
        }
    );

    container.scrollTop =
        container.scrollHeight;
}


/* ============================================================
   🖊️ РЕДАКТИРОВАНИЕ
   ============================================================ */

function editMessage(index) {

    const message =
        messages[index];

    if (
        !message ||
        message.role !==
            'user'
    ) {
        return;
    }

    const input =
        $('user-input');

    if (!input) {
        return;
    }

    input.value =
        message.text;

    messages =
        messages.slice(
            0,
            index
        );

    renderMessages();

    autoResizeInput();

    input.focus();
}


/* ============================================================
   🔄 ПОВТОР ГЕНЕРАЦИИ
   ============================================================ */

function regenerateMessage(
    botIndex
) {

    const botMessage =
        messages[botIndex];

    if (
        !botMessage ||
        botMessage.role !==
            'bot'
    ) {
        return;
    }

    let userMessage =
        null;

    for (
        let i =
            botIndex - 1;
        i >= 0;
        i--
    ) {

        if (
            messages[i].role ===
            'user'
        ) {

            userMessage =
                messages[i];

            break;
        }
    }

    if (!userMessage) {
        return;
    }

    messages =
        messages.slice(
            0,
            botIndex
        );

    renderMessages();

    const input =
        $('user-input');

    if (!input) {
        return;
    }

    input.value =
        userMessage.text;

    sendMessage();
}


/* ============================================================
   📋 КОПИРОВАНИЕ
   ============================================================ */

async function copyText(text) {

    try {

        await navigator.clipboard
            .writeText(text);

        showNotice(
            'Скопировано'
        );

    } catch {

        const textarea =
            document.createElement(
                'textarea'
            );

        textarea.value =
            text;

        document.body.appendChild(
            textarea
        );

        textarea.select();

        document.execCommand(
            'copy'
        );

        textarea.remove();

        showNotice(
            'Скопировано'
        );
    }
}


/* ============================================================
   🧾 MARKDOWN
   ============================================================ */

function formatText(text) {

    let value =
        escapeHTML(text);

    value =
        value.replace(
            /```([\s\S]*?)```/g,
            '<pre><code>$1</code></pre>'
        );

    value =
        value.replace(
            /`([^`]+)`/g,
            '<code>$1</code>'
        );

    value =
        value.replace(
            /\*\*(.*?)\*\*/g,
            '<strong>$1</strong>'
        );

    value =
        value.replace(
            /\*(.*?)\*/g,
            '<em>$1</em>'
        );

    value =
        value.replace(
            /^### (.*)$/gm,
            '<h3>$1</h3>'
        );

    value =
        value.replace(
            /^## (.*)$/gm,
            '<h2>$1</h2>'
        );

    value =
        value.replace(
            /^# (.*)$/gm,
            '<h1>$1</h1>'
        );

    value =
        value.replace(
            /\n/g,
            '<br>'
        );

    return value;
}


/* ============================================================
   ⏳ ИНДИКАТОР
   ============================================================ */

function showTyping() {

    removeTyping();

    const container =
        $('messages');

    if (!container) {
        return;
    }

    const typing =
        document.createElement(
            'div'
        );

    typing.id =
        'typing-indicator';

    typing.className =
        'typing';

    typing.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    container.appendChild(
        typing
    );

    container.scrollTop =
        container.scrollHeight;
}

function removeTyping() {

    $(
        'typing-indicator'
    )?.remove();
}

function updateSendButton(
    generating
) {

    const button =
        document.querySelector(
            '.send-btn'
        );

    if (!button) {
        return;
    }

    button.disabled =
        false;

    if (generating) {

        button.textContent =
            '■';

        button.title =
            'Остановить генерацию';

        button.onclick =
            stopGeneration;

    } else {

        button.textContent =
            '➤';

        button.title =
            'Отправить';

        button.onclick =
            sendMessage;
    }
}

function stopGeneration() {

    if (
        currentAbortController
    ) {

        currentAbortController.abort();

        currentAbortController =
            null;
    }
}


/* ============================================================
   📎 ВЛОЖЕНИЯ
   ============================================================ */

function toggleAttach() {

    const menu =
        $('attach-menu');

    if (!menu) {
        return;
    }

    const opened =
        menu.style.display ===
        'flex';

    menu.style.display =
        opened
            ? 'none'
            : 'flex';
}

function closeAttachMenu() {

    if ($('attach-menu')) {

        $('attach-menu').style.display =
            'none';
    }
}

function attachType(type) {

    closeAttachMenu();

    switch (type) {

        case 'camera':

            openFilePicker(
                'image/*',
                true
            );

            break;

        case 'photo':

            openFilePicker(
                'image/*',
                false
            );

            break;

        case 'file':

            openFilePicker(
                '.txt,.pdf,.doc,.docx,.xls,.xlsx,.csv,.json,.js,.css,.html,.py,.stl,.obj,.step,.stp',
                false
            );

            break;

        case 'image':

            openFilePicker(
                'image/*',
                false
            );

            break;

        case 'video':

            openFilePicker(
                'video/*',
                false
            );

            break;

        case '3d':

            openFilePicker(
                '.stl,.obj,.step,.stp,.3mf,.gltf,.glb',
                false
            );

            break;

        default:

            showNotice(
                'Выберите тип вложения'
            );
    }
}

function openFilePicker(
    accept,
    capture = false
) {

    const input =
        document.createElement(
            'input'
        );

    input.type =
        'file';

    input.accept =
        accept;

    input.multiple =
        true;

    if (capture) {
        input.capture =
            'environment';
    }

    input.addEventListener(
        'change',
        event => {

            const files =
                Array.from(
                    event.target
                        .files || []
                );

            if (!files.length) {
                return;
            }

            attachedFiles.push(
                ...files
            );

            renderAttachedFiles();

            showNotice(
                `Добавлено файлов: ${files.length}`
            );
        }
    );

    input.click();
}

function renderAttachedFiles() {

    let container =
        $('attached-files');

    if (
        !container &&
        document.querySelector(
            '.input-area'
        )
    ) {

        container =
            document.createElement(
                'div'
            );

        container.id =
            'attached-files';

        container.className =
            'file-preview-list';

        document
            .querySelector(
                '.input-area'
            )
            .prepend(
                container
            );
    }

    if (!container) {
        return;
    }

    container.innerHTML = '';

    attachedFiles.forEach(
        (file, index) => {

            const item =
                document.createElement(
                    'div'
                );

            item.className =
                'file-preview';

            item.innerHTML = `
                <span class="file-preview-name">
                    ${escapeHTML(
                        file.name
                    )}
                </span>

                <button
                    type="button"
                    title="Удалить"
                >
                    ×
                </button>
            `;

            item
                .querySelector(
                    'button'
                )
                .onclick = () => {

                    attachedFiles.splice(
                        index,
                        1
                    );

                    renderAttachedFiles();
                };

            container.appendChild(
                item
            );
        }
    );

    if (!attachedFiles.length) {
        container.remove();
    }
}


/* ============================================================
   ⚙️ НАСТРОЙКИ
   ============================================================ */

function openSettings() {

    const modal =
        $('settings-modal');

    if (!modal) {
        return;
    }

    modal.style.display =
        'flex';

    if ($('api-key')) {

        $('api-key').value =
            OPENAI_API_KEY;
    }

    if ($('model')) {

        $('model').value =
            selectedModel;
    }

    if ($('theme-select')) {

        $('theme-select').value =
            localStorage.getItem(
                'neuro_theme'
            ) || 'dark';
    }
}

function closeSettings() {

    if ($('settings-modal')) {

        $('settings-modal').style.display =
            'none';
    }
}

function saveApiKey() {

    const input =
        $('api-key');

    if (!input) {
        return;
    }

    const key =
        input.value.trim();

    if (!key) {

        showNotice(
            'Введите API-ключ'
        );

        return;
    }

    OPENAI_API_KEY =
        key;

    localStorage.setItem(
        'neuro_api_key',
        key
    );

    showNotice(
        'API-ключ сохранён'
    );
}

function changeModel(model) {

    if (!model) {
        return;
    }

    selectedModel =
        model;

    localStorage.setItem(
        'neuro_model',
        model
    );

    showNotice(
        `Выбрана модель: ${model}`
    );
}


/* ============================================================
   🌓 ТЕМА
   ============================================================ */

function changeTheme(
    theme,
    notify = true
) {

    const light =
        theme === 'light';

    document.body.classList.toggle(
        'light',
        light
    );

    localStorage.setItem(
        'neuro_theme',
        light
            ? 'light'
            : 'dark'
    );

    if ($('theme-select')) {

        $('theme-select').value =
            light
                ? 'light'
                : 'dark';
    }

    if (notify) {

        showNotice(
            light
                ? 'Светлая тема включена'
                : 'Тёмная тема включена'
        );
    }
}


/* ============================================================
   🆘 ПОДДЕРЖКА
   ============================================================ */

function openSupport() {

    const modal =
        $('support-modal');

    if (modal) {

        modal.style.display =
            'flex';
    }
}

function closeSupport() {

    const modal =
        $('support-modal');

    if (modal) {

        modal.style.display =
            'none';
    }
}


/* ============================================================
   📱 SIDEBAR
   ============================================================ */

function toggleSidebar() {

    $('sidebar')
        ?.classList.toggle(
            'open'
        );
}

function closeSidebarOnMobile() {

    if (
        window.innerWidth <=
        800
    ) {

        $('sidebar')
            ?.classList.remove(
                'open'
            );
    }
}


/* ============================================================
   ⌨️ ВВОД
   ============================================================ */

function setupInput() {

    const input =
        $('user-input');

    if (!input) {
        return;
    }

    input.addEventListener(
        'input',
        autoResizeInput
    );

    input.addEventListener(
        'keydown',
        event => {

            if (
                event.key ===
                'Enter' &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();
            }
        }
    );
}

function autoResizeInput() {

    const input =
        $('user-input');

    if (!input) {
        return;
    }

    input.style.height =
        'auto';

    input.style.height =
        Math.min(
            input.scrollHeight,
            180
        ) + 'px';
}


/* ============================================================
   🔍 ПОИСК
   ============================================================ */

function setupSearch() {

    const search =
        $('chat-search');

    if (!search) {
        return;
    }

    search.addEventListener(
        'input',
        event => {

            searchChats(
                event.target.value
            );
        }
    );
}


/* ============================================================
   🧭 НАВИГАЦИЯ
   ============================================================ */

function setupNavigation() {

    document
        .querySelectorAll(
            '.nav-item'
        )
        .forEach(
            item => {

                item.addEventListener(
                    'click',
                    event => {

                        event.preventDefault();

                        document
                            .querySelectorAll(
                                '.nav-item'
                            )
                            .forEach(
                                nav =>
                                    nav.classList
                                        .remove(
                                            'active'
                                        )
                            );

                        item.classList.add(
                            'active'
                        );

                        const action =
                            item.dataset
                                .action;

                        if (
                            action ===
                            'new-chat'
                        ) {

                            newChat();

                            return;
                        }

                        closeSidebarOnMobile();
                    }
                );
            }
        );
}


/* ============================================================
   🪟 МОДАЛЬНЫЕ ОКНА
   ============================================================ */

function setupModals() {

    document.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                $('settings-modal')
            ) {

                closeSettings();
            }

            if (
                event.target ===
                $('support-modal')
            ) {

                closeSupport();
            }
        }
    );
}


/* ============================================================
   ⌨️ ГОРЯЧИЕ КЛАВИШИ
   ============================================================ */

function setupKeyboardShortcuts() {

    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key ===
                'Escape'
            ) {

                closeSettings();

                closeSupport();

                closeAttachMenu();
            }

            if (
                (event.metaKey ||
                    event.ctrlKey) &&
                event.key.toLowerCase() ===
                    'k'
            ) {

                event.preventDefault();

                $('user-input')
                    ?.focus();
            }

            if (
                (event.metaKey ||
                    event.ctrlKey) &&
                event.key.toLowerCase() ===
                    'n'
            ) {

                event.preventDefault();

                newChat();
            }
        }
    );
}


/* ============================================================
   ❌ ОШИБКИ
   ============================================================ */

function formatError(error) {

    const message =
        error?.message ||
        '';

    const lower =
        message.toLowerCase();

    if (
        message.includes('401') ||
        lower.includes(
            'invalid api key'
        ) ||
        lower.includes(
            'incorrect api key'
        )
    ) {

        return `
Ошибка авторизации API.

Проверь API-ключ в настройках.
`;
    }

    if (
        message.includes('403') ||
        lower.includes(
            'forbidden'
        )
    ) {

        return `
API отклонил запрос.

Проверь доступ аккаунта
и выбранную модель.
`;
    }

    if (
        message.includes('429') ||
        lower.includes(
            'rate limit'
        )
    ) {

        return `
Превышен лимит запросов.

Попробуй повторить запрос
через некоторое время.
`;
    }

    if (
        message.includes('404')
    ) {

        return `
Запрошенная модель или endpoint
не найдены.
`;
    }

    if (
        lower.includes(
            'failed to fetch'
        )
    ) {

        return `
Не удалось подключиться к API.

Проверь интернет-соединение.
`;
    }

    return `
Произошла ошибка:

${message || 'Неизвестная ошибка'}
`;
}


/* ============================================================
   🚀 ЗАПУСК
   ============================================================ */

function initializeNeuroChat() {

    const savedUser =
        localStorage.getItem(
            'neuro_current_user'
        );

    if (savedUser) {

        currentUser =
            savedUser;

        if ($('login-screen')) {

            $('login-screen').style.display =
                'none';
        }

        if ($('app')) {

            $('app').style.display =
                'flex';
        }
    }

    const savedTheme =
        localStorage.getItem(
            'neuro_theme'
        ) || 'dark';

    changeTheme(
        savedTheme,
        false
    );

    setupInput();

    setupSearch();

    setupNavigation();

    setupModals();

    setupKeyboardShortcuts();

    if ($('model')) {

        $('model').value =
            selectedModel;

        $('model').addEventListener(
            'change',
            event => {

                changeModel(
                    event.target.value
                );
            }
        );
    }

    if (
        currentUser &&
        !$('messages')
            ?.querySelector(
                '.message'
            )
    ) {

        newChat();
    }

    updateSendButton(
        false
    );
}


/* ============================================================
   🌐 ЗАПУСК ПОСЛЕ ЗАГРУЗКИ
   ============================================================ */

if (
    document.readyState ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        initializeNeuroChat
    );

} else {

    initializeNeuroChat();
}


/* ============================================================
   🧩 ГЛОБАЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

window.nextStep =
    nextStep;

window.backToUsername =
    backToUsername;

window.login =
    login;

window.logout =
    logout;

window.newChat =
    newChat;

window.clearChat =
    clearChat;

window.sendMessage =
    sendMessage;

window.quickPrompt =
    quickPrompt;

window.toggleAttach =
    toggleAttach;

window.attachType =
    attachType;

window.openSettings =
    openSettings;

window.closeSettings =
    closeSettings;

window.saveApiKey =
    saveApiKey;

window.changeTheme =
    changeTheme;

window.openSupport =
    openSupport;

window.closeSupport =
    closeSupport;

window.toggleSidebar =
    toggleSidebar;

window.copyText =
    copyText;

window.stopGeneration =
    stopGeneration;

window.openChat =
    openChat;

window.deleteChat =
    deleteChat;

window.editMessage =
    editMessage;

window.regenerateMessage =
    regenerateMessage;