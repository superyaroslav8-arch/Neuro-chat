'use strict';

/*
 * NEURO-CHAT
 * Основной клиентский JavaScript
 *
 * ВАЖНО:
 * API-ключ НЕ хранится в браузере.
 * AI-запрос отправляется на /api/chat.
 */

const APP_NAME = 'Нейро-чат';
const STORAGE_PREFIX = 'neurochat_';

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_CHATS = 100;
const MAX_CONTEXT_MESSAGES = 40;

let currentUser = null;
let currentChatId = null;
let messages = [];
let attachedFiles = [];

let selectedModel = DEFAULT_MODEL;
let temporaryChat = false;
let siteBuilderMode = false;

let isGenerating = false;
let abortController = null;

let currentSearchQuery = '';

/* =========================================================
   УТИЛИТЫ
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function createId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function storageKey(name) {
    return `${STORAGE_PREFIX}${name}`;
}

function userKey(name) {
    if (!currentUser) {
        return storageKey(name);
    }

    return `${storageKey(currentUser)}_${name}`;
}

function notify(text, type = 'info') {
    let toast = $('#neuro-toast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'neuro-toast';

        Object.assign(toast.style, {
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            zIndex: '999999',
            maxWidth: 'calc(100vw - 32px)',
            padding: '12px 18px',
            borderRadius: '14px',
            background: '#202020',
            color: '#fff',
            fontSize: '14px',
            boxShadow: '0 12px 40px rgba(0,0,0,.35)',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity .2s ease'
        });

        document.body.appendChild(toast);
    }

    toast.textContent = text;

    if (type === 'error') {
        toast.style.background = '#a52a2a';
    } else if (type === 'success') {
        toast.style.background = '#197a4b';
    } else {
        toast.style.background = '#202020';
    }

    toast.style.opacity = '1';

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
    }, 2800);
}

/* =========================================================
   АВТОРИЗАЦИЯ
   ========================================================= */

function getCurrentUser() {
    return localStorage.getItem(storageKey('current_user')) || '';
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem(
            storageKey('current_user'),
            username
        );
    } else {
        localStorage.removeItem(
            storageKey('current_user')
        );
    }
}

function getUsers() {
    return parseJSON(
        localStorage.getItem(storageKey('users')),
        {}
    );
}

function saveUsers(users) {
    localStorage.setItem(
        storageKey('users'),
        JSON.stringify(users)
    );
}

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
}

function register(event) {
    if (event) {
        event.preventDefault();
    }

    const username = normalizeUsername(
        $('#username')?.value
    );

    const password = String(
        $('#password')?.value || ''
    );

    if (!username) {
        notify('Введите имя пользователя.', 'error');
        $('#username')?.focus();
        return false;
    }

    if (username.length < 3) {
        notify(
            'Имя пользователя должно содержать минимум 3 символа.',
            'error'
        );
        return false;
    }

    if (password.length < 4) {
        notify(
            'Пароль должен содержать минимум 4 символа.',
            'error'
        );
        return false;
    }

    const users = getUsers();

    if (users[username]) {
        notify(
            'Такой пользователь уже существует.',
            'error'
        );
        return false;
    }

    users[username] = {
        password,
        createdAt: Date.now()
    };

    saveUsers(users);

    currentUser = username;
    setCurrentUser(username);

    openApplication();

    notify(
        'Аккаунт успешно создан.',
        'success'
    );

    return false;
}

function login(event) {
    if (event) {
        event.preventDefault();
    }

    const username = normalizeUsername(
        $('#username')?.value
    );

    const password = String(
        $('#password')?.value || ''
    );

    if (!username) {
        notify(
            'Введите имя пользователя.',
            'error'
        );
        $('#username')?.focus();
        return false;
    }

    if (!password) {
        notify(
            'Введите пароль.',
            'error'
        );
        $('#password')?.focus();
        return false;
    }

    const users = getUsers();

    /*
     * Если старый пользователь был создан
     * предыдущей версией Neuro-chat,
     * поддерживаем его старый формат.
     */
    const oldPassword = localStorage.getItem(
        storageKey(`password_${username}`)
    );

    if (users[username]) {
        if (users[username].password !== password) {
            notify(
                'Неверный пароль.',
                'error'
            );
            return false;
        }
    } else if (oldPassword !== null) {
        if (oldPassword !== password) {
            notify(
                'Неверный пароль.',
                'error'
            );
            return false;
        }

        users[username] = {
            password,
            createdAt: Date.now()
        };

        saveUsers(users);
    } else {
        /*
         * Для обратной совместимости:
         * если аккаунта ещё нет, создаём его.
         */
        users[username] = {
            password,
            createdAt: Date.now()
        };

        saveUsers(users);
    }

    currentUser = username;
    setCurrentUser(username);

    openApplication();

    notify(
        'Вход выполнен.',
        'success'
    );

    return false;
}

function logout() {
    saveCurrentChat();

    currentUser = null;
    currentChatId = null;
    messages = [];
    attachedFiles = [];

    setCurrentUser('');

    const app = $('#app');
    const loginScreen = $('#login-screen');

    if (app) {
        app.style.display = 'none';
    }

    if (loginScreen) {
        loginScreen.style.display = '';
    }

    const username = $('#username');
    const password = $('#password');

    if (username) {
        username.value = '';
    }

    if (password) {
        password.value = '';
    }

    clearAttachedFiles();
}

function showLogin() {
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');

    if (loginForm) {
        loginForm.style.display = '';
    }

    if (registerForm) {
        registerForm.style.display = 'none';
    }
}

function showRegister() {
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');

    if (loginForm) {
        loginForm.style.display = 'none';
    }

    if (registerForm) {
        registerForm.style.display = '';
    }
}

function openApplication() {
    const loginScreen = $('#login-screen');
    const app = $('#app');

    if (loginScreen) {
        loginScreen.style.display = 'none';
    }

    if (app) {
        app.style.display = 'flex';
    }

    initializeApplication();
}

function restoreSession() {
    const savedUser = getCurrentUser();

    if (!savedUser) {
        const app = $('#app');
        const loginScreen = $('#login-screen');

        if (app) {
            app.style.display = 'none';
        }

        if (loginScreen) {
            loginScreen.style.display = '';
        }

        return false;
    }

    currentUser = savedUser;

    openApplication();

    return true;
}

/* =========================================================
   НАСТРОЙКИ
   ========================================================= */

function getSettings() {
    if (!currentUser) {
        return {};
    }

    return parseJSON(
        localStorage.getItem(
            userKey('settings')
        ),
        {}
    );
}

function saveSettings(settings) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        userKey('settings'),
        JSON.stringify(settings)
    );
}

function loadSettings() {
    const settings = getSettings();

    selectedModel =
        settings.model ||
        DEFAULT_MODEL;

    temporaryChat =
        settings.temporaryChat === true;

    siteBuilderMode =
        settings.siteBuilderMode === true;

    const model =
        $('#model') ||
        $('#model-select');

    if (model) {
        model.value = selectedModel;
    }

    const theme =
        $('#theme') ||
        $('#theme-select');

    if (theme) {
        theme.value =
            settings.theme ||
            'dark';
    }

    applyTheme(
        settings.theme ||
        'dark'
    );

    const temporary =
        $('#temporary-chat') ||
        $('#temporary-chat-toggle');

    if (temporary) {
        temporary.checked =
            temporaryChat;
    }

    const siteBuilder =
        $('#site-builder-mode') ||
        $('#site-builder-toggle');

    if (siteBuilder) {
        siteBuilder.checked =
            siteBuilderMode;
    }
}

function saveAllSettings() {
    const model =
        $('#model') ||
        $('#model-select');

    const theme =
        $('#theme') ||
        $('#theme-select');

    const temporary =
        $('#temporary-chat') ||
        $('#temporary-chat-toggle');

    const siteBuilder =
        $('#site-builder-mode') ||
        $('#site-builder-toggle');

    if (model) {
        selectedModel = model.value;
    }

    if (temporary) {
        temporaryChat = Boolean(
            temporary.checked
        );
    }

    if (siteBuilder) {
        siteBuilderMode = Boolean(
            siteBuilder.checked
        );
    }

    const settings = getSettings();

    settings.model = selectedModel;

    settings.theme =
        theme?.value ||
        settings.theme ||
        'dark';

    settings.temporaryChat =
        temporaryChat;

    settings.siteBuilderMode =
        siteBuilderMode;

    saveSettings(settings);

    applyTheme(settings.theme);

    closeSettings();

    notify(
        'Настройки сохранены.',
        'success'
    );
}

function saveApiKey() {
    /*
     * API-ключ теперь не сохраняем в браузере.
     * AI работает через /api/chat.
     */
    notify(
        'API-ключ на сайте больше не хранится. Используется серверный AI.',
        'success'
    );
}

function applyTheme(theme) {
    document.documentElement.dataset.theme =
        theme;

    if (theme === 'light') {
        document.body.classList.add(
            'light-theme'
        );
    } else {
        document.body.classList.remove(
            'light-theme'
        );
    }
}

/* =========================================================
   ЧАТЫ
   ========================================================= */

function getChats() {
    if (!currentUser) {
        return [];
    }

    return parseJSON(
        localStorage.getItem(
            userKey('chats')
        ),
        []
    );
}

function saveChats(chats) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        userKey('chats'),
        JSON.stringify(
            chats.slice(0, MAX_CHATS)
        )
    );
}

function createChatTitle(text) {
    const clean = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!clean) {
        return 'Новый чат';
    }

    return clean.length > 42
        ? `${clean.slice(0, 42)}…`
        : clean;
}

function saveCurrentChat() {
    if (
        !currentUser ||
        !currentChatId ||
        temporaryChat
    ) {
        return;
    }

    if (!messages.length) {
        return;
    }

    const chats = getChats();

    const index = chats.findIndex(
        chat =>
            chat.id === currentChatId
    );

    const firstUserMessage =
        messages.find(
            message =>
                message.role === 'user'
        );

    const chat = {
        id: currentChatId,
        title: createChatTitle(
            firstUserMessage?.content ||
            'Новый чат'
        ),
        messages: messages.slice(),
        createdAt:
            index >= 0
                ? chats[index].createdAt
                : Date.now(),
        updatedAt: Date.now(),
        pinned:
            index >= 0
                ? Boolean(chats[index].pinned)
                : false
    };

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

    saveChats(chats);

    renderChatHistory();
}

function newChat() {
    saveCurrentChat();

    currentChatId =
        createId('chat');

    messages = [];
    attachedFiles = [];

    clearAttachedFiles();
    renderMessages();
    renderChatHistory();
    showWelcomeScreen();

    const input = $('#user-input');

    if (input) {
        input.value = '';
        input.focus();
    }
}

function clearChat() {
    messages = [];
    attachedFiles = [];

    clearAttachedFiles();
    renderMessages();
    showWelcomeScreen();

    saveCurrentChat();
}

function selectChat(id) {
    openChat(id);
}

function openChat(id) {
    const chat = getChats().find(
        item => item.id === id
    );

    if (!chat) {
        return;
    }

    saveCurrentChat();

    currentChatId = chat.id;

    messages =
        Array.isArray(chat.messages)
            ? chat.messages.slice()
            : [];

    renderMessages();
    renderChatHistory();
    hideWelcomeScreen();
}

function deleteChat(id, event) {
    if (event) {
        event.stopPropagation();
    }

    const chats =
        getChats().filter(
            chat => chat.id !== id
        );

    saveChats(chats);

    if (currentChatId === id) {
        currentChatId = null;
        messages = [];
        newChat();
    }

    renderChatHistory();
}

function togglePinChat(id, event) {
    if (event) {
        event.stopPropagation();
    }

    const chats = getChats();

    const chat = chats.find(
        item => item.id === id
    );

    if (!chat) {
        return;
    }

    chat.pinned =
        !Boolean(chat.pinned);

    saveChats(chats);
    renderChatHistory();
}

function renderChatHistory() {
    const container =
        $('#chat-history');

    if (!container) {
        return;
    }

    let chats = getChats();

    if (currentSearchQuery) {
        const query =
            currentSearchQuery.toLowerCase();

        chats = chats.filter(chat =>
            String(
                chat.title || ''
            )
                .toLowerCase()
                .includes(query)
        );
    }

    chats.sort((a, b) => {
        if (
            Boolean(a.pinned) !==
            Boolean(b.pinned)
        ) {
            return a.pinned
                ? -1
                : 1;
        }

        return (
            b.updatedAt -
            a.updatedAt
        );
    });

    container.innerHTML = '';

    if (!chats.length) {
        const empty =
            document.createElement(
                'div'
            );

        empty.className =
            'chat-history-empty';

        empty.textContent =
            currentSearchQuery
                ? 'Ничего не найдено'
                : 'История чатов пуста';

        container.appendChild(empty);

        return;
    }

    chats.forEach(chat => {
        const item =
            document.createElement(
                'div'
            );

        item.className =
            'chat-item' +
            (
                chat.id ===
                currentChatId
                    ? ' active'
                    : ''
            );

        const title =
            document.createElement(
                'span'
            );

        title.className =
            'chat-item-title';

        title.textContent =
            chat.pinned
                ? `📌 ${chat.title || 'Новый чат'}`
                : (
                    chat.title ||
                    'Новый чат'
                );

        const actions =
            document.createElement(
                'div'
            );

        actions.className =
            'chat-item-actions';

        const pin =
            document.createElement(
                'button'
            );

        pin.type = 'button';
        pin.textContent =
            chat.pinned
                ? '📌'
                : '○';

        pin.addEventListener(
            'click',
            event =>
                togglePinChat(
                    chat.id,
                    event
                )
        );

        const remove =
            document.createElement(
                'button'
            );

        remove.type = 'button';
        remove.textContent = '×';

        remove.addEventListener(
            'click',
            event =>
                deleteChat(
                    chat.id,
                    event
                )
        );

        actions.appendChild(pin);
        actions.appendChild(remove);

        item.appendChild(title);
        item.appendChild(actions);

        item.addEventListener(
            'click',
            () =>
                openChat(chat.id)
        );

        container.appendChild(item);
    });
}

function searchChats(value) {
    currentSearchQuery =
        String(value || '').trim();

    renderChatHistory();
}

/* =========================================================
   СООБЩЕНИЯ
   ========================================================= */

function renderMessages() {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    messages.forEach(message => {
        addMessageToDOM(message);
    });

    scrollMessages();
}

function addMessageToDOM(message) {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    const wrapper =
        document.createElement(
            'div'
        );

    wrapper.className =
        `message ${
            message.role === 'user'
                ? 'user-message'
                : 'assistant-message'
        }`;

    const bubble =
        document.createElement(
            'div'
        );

    bubble.className =
        'message-bubble';

    bubble.innerHTML =
        formatMessage(
            message.content
        );

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);

    return wrapper;
}

function formatMessage(text) {
    let value = escapeHTML(
        String(text || '')
    );

    /*
     * Простая поддержка markdown-подобного текста.
     */
    value = value.replace(
        /```([\s\S]*?)```/g,
        '<pre><code>$1</code></pre>'
    );

    value = value.replace(
        /\*\*(.*?)\*\*/g,
        '<strong>$1</strong>'
    );

    value = value.replace(
        /`([^`]+)`/g,
        '<code>$1</code>'
    );

    value = value.replace(
        /\n/g,
        '<br>'
    );

    return value;
}

function showWelcomeScreen() {
    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display = '';
    }
}

function hideWelcomeScreen() {
    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display = 'none';
    }
}

function updateChatTitle(title) {
    const elements = $$(
        '[data-chat-title]'
    );

    elements.forEach(
        element =>
            element.textContent =
                title
    );
}

function scrollMessages() {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    requestAnimationFrame(() => {
        container.scrollTop =
            container.scrollHeight;
    });
}

/* =========================================================
   AI
   ========================================================= */

async function callAI() {
    const contextMessages =
        messages
            .slice(-MAX_CONTEXT_MESSAGES)
            .map(message => ({
                role: message.role,
                content: message.content
            }));

    const settings =
        getSettings();

    const model =
        settings.model ||
        selectedModel ||
        DEFAULT_MODEL;

    const response =
        await fetch(
            '/api/chat',
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages:
                        contextMessages,
                    temperature: 0.7,
                    max_tokens: 8192
                }),
                signal:
                    abortController?.signal
            }
        );

    let data = null;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            'Сервер вернул некорректный ответ.'
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error ||
            'Ошибка AI-сервера.'
        );
    }

    if (!data.message) {
        throw new Error(
            'AI не вернул сообщение.'
        );
    }

    return data.message;
}

async function sendMessage(event) {
    if (event) {
        event.preventDefault();
    }

    if (isGenerating) {
        return;
    }

    const input =
        $('#user-input');

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (!text && !attachedFiles.length) {
        return;
    }

    if (!currentUser) {
        notify(
            'Сначала войдите в аккаунт.',
            'error'
        );
        return;
    }

    hideWelcomeScreen();

    const userMessage = {
        id: createId('message'),
        role: 'user',
        content:
            text ||
            'Отправлены вложения.',
        createdAt: Date.now()
    };

    if (attachedFiles.length) {
        userMessage.attachments =
            attachedFiles.map(file => ({
                name: file.name,
                type: file.type,
                size: file.size
            }));
    }

    messages.push(userMessage);

    input.value = '';

    clearAttachedFiles();
    renderMessages();

    isGenerating = true;

    showTypingIndicator();

    abortController =
        new AbortController();

    try {
        const answer =
            await callAI();

        messages.push({
            id: createId('message'),
            role: 'assistant',
            content:
                answer.content ||
                'Пустой ответ AI.',
            createdAt: Date.now()
        });

        renderMessages();
        saveCurrentChat();
    } catch (error) {
        if (
            error?.name ===
            'AbortError'
        ) {
            return;
        }

        messages.push({
            id: createId('message'),
            role: 'assistant',
            content:
                `⚠️ ${error.message || 'Не удалось получить ответ от AI.'}`,
            createdAt: Date.now()
        });

        renderMessages();
    } finally {
        hideTypingIndicator();

        isGenerating = false;
        abortController = null;
    }
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    isGenerating = false;
    hideTypingIndicator();
}

function showTypingIndicator() {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    hideTypingIndicator();

    const typing =
        document.createElement(
            'div'
        );

    typing.id =
        'neuro-typing';

    typing.className =
        'message assistant-message';

    typing.innerHTML = `
        <div class="message-bubble typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;

    container.appendChild(typing);

    scrollMessages();
}

function hideTypingIndicator() {
    $('#neuro-typing')?.remove();
}

/* =========================================================
   БЫСТРЫЕ ЗАПРОСЫ
   ========================================================= */

function quickPrompt(text) {
    const input =
        $('#user-input');

    if (!input) {
        return;
    }

    input.value = text;
    input.focus();
}

/* =========================================================
   ВЛОЖЕНИЯ
   ========================================================= */

function toggleAttach() {
    const menu =
        $('#attach-menu');

    if (!menu) {
        return;
    }

    menu.classList.toggle('open');

    if (menu.style.display === 'none') {
        menu.style.display = '';
    }
}

function closeAttachMenu() {
    const menu =
        $('#attach-menu');

    if (menu) {
        menu.classList.remove(
            'open'
        );
    }
}

function attachType(type) {
    closeAttachMenu();

    let input = null;

    if (type === 'file') {
        input = $('#file-input');
    } else if (type === 'photo') {
        input = $('#photo-input');
    } else if (type === 'camera') {
        input = $('#camera-input');
    } else if (type === 'model') {
        input = $('#model-file-input');
    }

    if (input) {
        input.click();
    }
}

function handleFiles(fileList) {
    if (!fileList) {
        return;
    }

    Array.from(fileList).forEach(
        file => {
            attachedFiles.push(file);
        }
    );

    renderAttachedFiles();
}

function renderAttachedFiles() {
    const container =
        $('#attached-files');

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
                'attached-file';

            item.innerHTML = `
                <span>${escapeHTML(file.name)}</span>
                <button type="button">×</button>
            `;

            item
                .querySelector('button')
                .addEventListener(
                    'click',
                    () =>
                        removeAttachedFile(
                            index
                        )
                );

            container.appendChild(item);
        }
    );
}

function removeAttachedFile(index) {
    attachedFiles.splice(
        index,
        1
    );

    renderAttachedFiles();
}

function clearAttachedFiles() {
    attachedFiles = [];

    const container =
        $('#attached-files');

    if (container) {
        container.innerHTML = '';
    }
}

/* =========================================================
   НАСТРОЙКА INPUT
   ========================================================= */

function setupInput() {
    const input =
        $('#user-input');

    const send =
        $('#send-button');

    if (input) {
        input.addEventListener(
            'keydown',
            event => {
                if (
                    event.key === 'Enter' &&
                    !event.shiftKey
                ) {
                    event.preventDefault();
                    sendMessage();
                }
            }
        );

        input.addEventListener(
            'input',
            () => {
                input.style.height =
                    'auto';

                input.style.height =
                    Math.min(
                        input.scrollHeight,
                        180
                    ) + 'px';
            }
        );
    }

    if (send) {
        send.addEventListener(
            'click',
            sendMessage
        );
    }
}

function setupAttachments() {
    const inputs = [
        '#file-input',
        '#photo-input',
        '#camera-input',
        '#model-file-input'
    ];

    inputs.forEach(
        selector => {
            const input =
                $(selector);

            if (!input) {
                return;
            }

            input.addEventListener(
                'change',
                event => {
                    handleFiles(
                        event.target.files
                    );

                    event.target.value =
                        '';
                }
            );
        }
    );
}

function setupSearch() {
    const input =
        $('#chat-search');

    if (!input) {
        return;
    }

    input.addEventListener(
        'input',
        event =>
            searchChats(
                event.target.value
            )
    );
}

function setupKeyboardShortcuts() {
    document.addEventListener(
        'keydown',
        event => {
            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() ===
                    'k'
            ) {
                event.preventDefault();

                $('#chat-search')?.focus();
            }

            if (
                event.key === 'Escape' &&
                isGenerating
            ) {
                stopGeneration();
            }
        }
    );
}

/* =========================================================
   НАВИГАЦИЯ
   ========================================================= */

function setupNavigation() {
    $$('.nav-item').forEach(item => {
        item.addEventListener(
            'click',
            () => {
                const action =
                    item.dataset.action ||
                    item.dataset.page;

                $$('.nav-item').forEach(
                    element =>
                        element.classList.remove(
                            'active'
                        )
                );

                item.classList.add(
                    'active'
                );

                navigate(action);
            }
        );
    });
}

function navigate(section) {
    const sections = [
        '#chat-section',
        '#library-section',
        '#projects-section',
        '#plugins-section',
        '#scheduled-section'
    ];

    sections.forEach(
        selector => {
            const element =
                $(selector);

            if (element) {
                element.style.display =
                    'none';
            }
        }
    );

    let target = null;

    switch (section) {
        case 'chat':
        case 'home':
            target =
                $('#chat-section');
            break;

        case 'library':
            target =
                $('#library-section');
            break;

        case 'projects':
            target =
                $('#projects-section');
            break;

        case 'plugins':
            target =
                $('#plugins-section');
            break;

        case 'scheduled':
            target =
                $('#scheduled-section');
            break;

        default:
            target =
                $('#chat-section');
    }

    if (target) {
        target.style.display = '';
    }

    if (
        section === 'chat' ||
        section === 'home'
    ) {
        renderMessages();
    }
}

/* =========================================================
   SIDEBAR
   ========================================================= */

function toggleSidebar() {
    const sidebar =
        $('#sidebar');

    if (!sidebar) {
        return;
    }

    sidebar.classList.toggle(
        'open'
    );
}

/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings() {
    const modal =
        $('#settings-modal');

    if (modal) {
        modal.style.display =
            'flex';
    }

    loadSettings();
}

function closeSettings() {
    const modal =
        $('#settings-modal');

    if (modal) {
        modal.style.display =
            'none';
    }
}

function openSupport() {
    const modal =
        $('#support-modal');

    if (modal) {
        modal.style.display =
            'flex';
    }
}

function closeSupport() {
    const modal =
        $('#support-modal');

    if (modal) {
        modal.style.display =
            'none';
    }
}

/* =========================================================
   БИБЛИОТЕКА
   ========================================================= */

function openLibrary() {
    navigate('library');
}

function openProjects() {
    navigate('projects');
    renderProjects();
}

function openPlugins() {
    navigate('plugins');
}

function openScheduled() {
    navigate('scheduled');
}

/* =========================================================
   ПРОЕКТЫ
   ========================================================= */

function getProjects() {
    if (!currentUser) {
        return [];
    }

    return parseJSON(
        localStorage.getItem(
            userKey('projects')
        ),
        []
    );
}

function saveProjects(projects) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        userKey('projects'),
        JSON.stringify(projects)
    );
}

function createProject() {
    if (!currentUser) {
        return;
    }

    const name =
        prompt(
            'Название проекта:'
        );

    if (!name?.trim()) {
        return;
    }

    const projects =
        getProjects();

    projects.unshift({
        id: createId('project'),
        name: name.trim(),
        createdAt: Date.now()
    });

    saveProjects(projects);
    renderProjects();

    notify(
        'Проект создан.',
        'success'
    );
}

function deleteProject(id) {
    const projects =
        getProjects().filter(
            project =>
                project.id !== id
        );

    saveProjects(projects);
    renderProjects();
}

function renderProjects() {
    const container =
        $('#projects-list');

    if (!container) {
        return;
    }

    const projects =
        getProjects();

    container.innerHTML = '';

    if (!projects.length) {
        container.innerHTML =
            '<div class="empty-state">Проектов пока нет.</div>';
        return;
    }

    projects.forEach(project => {
        const item =
            document.createElement(
                'div'
            );

        item.className =
            'project-item';

        item.innerHTML = `
            <span>${escapeHTML(project.name)}</span>
            <button type="button">Удалить</button>
        `;

        item
            .querySelector('button')
            .addEventListener(
                'click',
                () =>
                    deleteProject(
                        project.id
                    )
            );

        container.appendChild(item);
    });
}

/* =========================================================
   ЗАПЛАНИРОВАННЫЕ ЗАДАЧИ
   ========================================================= */

function getScheduledTasks() {
    if (!currentUser) {
        return [];
    }

    return parseJSON(
        localStorage.getItem(
            userKey('scheduled')
        ),
        []
    );
}

function saveScheduledTasks(tasks) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        userKey('scheduled'),
        JSON.stringify(tasks)
    );
}

function createScheduledTask() {
    if (!currentUser) {
        return;
    }

    const text =
        prompt(
            'Что нужно запланировать?'
        );

    if (!text?.trim()) {
        return;
    }

    const tasks =
        getScheduledTasks();

    tasks.unshift({
        id: createId('task'),
        text: text.trim(),
        createdAt: Date.now()
    });

    saveScheduledTasks(tasks);
    renderScheduledTasks();

    notify(
        'Задача сохранена.',
        'success'
    );
}

function deleteScheduledTask(id) {
    const tasks =
        getScheduledTasks().filter(
            task =>
                task.id !== id
        );

    saveScheduledTasks(tasks);
    renderScheduledTasks();
}

function renderScheduledTasks() {
    const container =
        $('#scheduled-list');

    if (!container) {
        return;
    }

    const tasks =
        getScheduledTasks();

    container.innerHTML = '';

    if (!tasks.length) {
        container.innerHTML =
            '<div class="empty-state">Запланированных задач нет.</div>';
        return;
    }

    tasks.forEach(task => {
        const item =
            document.createElement(
                'div'
            );

        item.className =
            'scheduled-item';

        item.innerHTML = `
            <span>${escapeHTML(task.text)}</span>
            <button type="button">Удалить</button>
        `;

        item
            .querySelector('button')
            .addEventListener(
                'click',
                () =>
                    deleteScheduledTask(
                        task.id
                    )
            );

        container.appendChild(item);
    });
}

/* =========================================================
   CODE MODE
   ========================================================= */

function openCodeMode() {
    const modal =
        $('#code-modal');

    if (modal) {
        modal.style.display =
            'flex';
    }
}

function closeCodeMode() {
    const modal =
        $('#code-modal');

    if (modal) {
        modal.style.display =
            'none';
    }
}

function selectCodeFile() {
    $('#code-file-input')?.click();
}

function runCode() {
    const editor =
        $('#code-editor');

    if (!editor) {
        return;
    }

    const code =
        editor.value;

    const preview =
        window.open(
            '',
            '_blank'
        );

    if (!preview) {
        notify(
            'Браузер заблокировал окно предпросмотра.',
            'error'
        );
        return;
    }

    preview.document.open();
    preview.document.write(code);
    preview.document.close();
}

async function askCodeAI() {
    const editor =
        $('#code-editor');

    if (!editor) {
        return;
    }

    const code =
        editor.value;

    const input =
        prompt(
            'Что изменить в коде?'
        );

    if (!input?.trim()) {
        return;
    }

    const oldMessages =
        messages;

    messages = [
        {
            role: 'user',
            content:
                `Измени этот код по запросу: ${input}\n\nКОД:\n${code}`
        }
    ];

    try {
        const result =
            await callAI();

        editor.value =
            result.content ||
            code;

        notify(
            'Код обновлён.',
            'success'
        );
    } catch (error) {
        notify(
            error.message,
            'error'
        );
    } finally {
        messages =
            oldMessages;
    }
}

/* =========================================================
   ПРЕДПРОСМОТР САЙТА
   ========================================================= */

function openSitePreview() {
    const modal =
        $('#site-preview-modal');

    const frame =
        $('#site-preview-frame');

    const editor =
        $('#code-editor');

    if (frame && editor) {
        frame.srcdoc =
            editor.value;
    }

    if (modal) {
        modal.style.display =
            'flex';
    }
}

function closeSitePreview() {
    const modal =
        $('#site-preview-modal');

    if (modal) {
        modal.style.display =
            'none';
    }
}

function startSiteBuilder() {
    siteBuilderMode = true;

    newChat();

    const input =
        $('#user-input');

    if (input) {
        input.value =
            'Создай сайт. Опиши структуру, дизайн и функции.';
        input.focus();
    }

    notify(
        'Режим создания сайта включён.',
        'success'
    );
}

/* =========================================================
   КОПИРОВАНИЕ
   ========================================================= */

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(
            String(text || '')
        );

        notify(
            'Скопировано.',
            'success'
        );
    } catch {
        notify(
            'Не удалось скопировать.',
            'error'
        );
    }
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */

let initialized = false;

function initializeApplication() {
    if (initialized) {
        /*
         * Не запускаем обработчики повторно.
         * Это одна из причин появления дубликатов
         * и повторных действий в старой версии.
         */
        loadSettings();
        renderChatHistory();
        renderMessages();
        return;
    }

    initialized = true;

    loadSettings();

    setupNavigation();
    setupInput();
    setupAttachments();
    setupSearch();
    setupKeyboardShortcuts();

    renderChatHistory();
    renderProjects();
    renderScheduledTasks();

    const chats =
        getChats();

    if (chats.length) {
        chats.sort(
            (a, b) =>
                b.updatedAt -
                a.updatedAt
        );

        openChat(
            chats[0].id
        );
    } else {
        newChat();
    }
}

function initialize() {
    /*
     * Всегда сначала проверяем сессию.
     * Если пользователь уже вошёл,
     * login-screen больше не показывается.
     */
    restoreSession();
}

/* =========================================================
   ГЛОБАЛЬНЫЕ ФУНКЦИИ
   Нужны для onclick/onsubmit в index.html.
   ========================================================= */

window.showLogin = showLogin;
window.showRegister = showRegister;

window.login = login;
window.register = register;
window.logout = logout;

window.newChat = newChat;
window.clearChat = clearChat;
window.selectChat = selectChat;
window.deleteChat = deleteChat;

window.quickPrompt = quickPrompt;
window.sendMessage = sendMessage;
window.stopGeneration = stopGeneration;

window.toggleAttach = toggleAttach;
window.attachType = attachType;
window.removeAttachedFile =
    removeAttachedFile;

window.toggleSidebar =
    toggleSidebar;

window.openSettings =
    openSettings;

window.closeSettings =
    closeSettings;

window.saveApiKey =
    saveApiKey;

window.saveAllSettings =
    saveAllSettings;

window.openSupport =
    openSupport;

window.closeSupport =
    closeSupport;

window.createProject =
    createProject;

window.deleteProject =
    deleteProject;

window.createScheduledTask =
    createScheduledTask;

window.deleteScheduledTask =
    deleteScheduledTask;

window.openCodeMode =
    openCodeMode;

window.closeCodeMode =
    closeCodeMode;

window.selectCodeFile =
    selectCodeFile;

window.runCode =
    runCode;

window.openSitePreview =
    openSitePreview;

window.closeSitePreview =
    closeSitePreview;

window.askCodeAI =
    askCodeAI;

window.copyText =
    copyText;

window.navigate =
    navigate;

window.startSiteBuilder =
    startSiteBuilder;

/* =========================================================
   ЗАПУСК
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    initialize
);

window.addEventListener(
    'beforeunload',
    () => {
        saveCurrentChat();
    }
);