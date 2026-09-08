'use strict';

/* =========================================================
   НЕЙРО-ЧАТ
   Основной JavaScript
   ========================================================= */

/*
   ВАЖНО:
   Здесь оставь свой существующий основной ключ.

   Если пользователь НЕ указал свой ключ в настройках,
   используется DEFAULT_API_KEY.

   Если пользователь указал свой ключ,
   используется пользовательский ключ.
*/
const DEFAULT_API_KEY = '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';

const API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5';

const APP_NAME = 'Нейро-чат';
const APP_VERSION = '2.0.0';

const STORAGE_PREFIX = 'neurochat_';

const MAX_HISTORY_CHATS = 100;
const MAX_CONTEXT_MESSAGES = 40;

let OPENAI_API_KEY = DEFAULT_API_KEY;

let currentUser = null;
let currentChatId = null;

let messages = [];
let attachedFiles = [];

let isGenerating = false;
let currentAbortController = null;

let currentSearchQuery = '';
let selectedModel = DEFAULT_MODEL;

let temporaryChat = false;
let siteBuilderMode = false;


/* =========================================================
   БАЗОВЫЕ УТИЛИТЫ
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function createId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHTML(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeJSONParse(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function getStorageKey(name) {
    return `${STORAGE_PREFIX}${name}`;
}

function getUserStorageKey(name) {
    if (!currentUser) {
        return getStorageKey(name);
    }

    return `${getStorageKey(currentUser)}_${name}`;
}

function getCurrentUser() {
    return localStorage.getItem(getStorageKey('current_user')) || '';
}

function setCurrentUser(username) {
    if (username) {
        localStorage.setItem(getStorageKey('current_user'), username);
    } else {
        localStorage.removeItem(getStorageKey('current_user'));
    }
}

function showNotice(message, type = 'info') {
    let notice = $('#neuro-notice');

    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'neuro-notice';

        Object.assign(notice.style, {
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            zIndex: '99999',
            padding: '12px 18px',
            borderRadius: '12px',
            background: 'rgba(25,25,25,.96)',
            color: '#fff',
            fontSize: '14px',
            maxWidth: 'calc(100vw - 40px)',
            boxShadow: '0 10px 40px rgba(0,0,0,.3)',
            transition: 'opacity .2s ease'
        });

        document.body.appendChild(notice);
    }

    notice.textContent = message;
    notice.style.opacity = '1';

    if (type === 'error') {
        notice.style.background = 'rgba(160,35,35,.96)';
    } else if (type === 'success') {
        notice.style.background = 'rgba(25,125,70,.96)';
    } else {
        notice.style.background = 'rgba(25,25,25,.96)';
    }

    clearTimeout(notice._timer);

    notice._timer = setTimeout(() => {
        notice.style.opacity = '0';
    }, 2800);
}


/* =========================================================
   API-КЛЮЧИ
   ========================================================= */

function getSavedUserApiKey() {
    if (!currentUser) {
        return '';
    }

    return localStorage.getItem(
        getUserStorageKey('api_key')
    ) || '';
}

function getActiveApiKey() {
    const userKey = getSavedUserApiKey().trim();

    /*
       Приоритет:

       1. Ключ пользователя
       2. Основной ключ владельца
    */

    if (userKey) {
        return userKey;
    }

    return DEFAULT_API_KEY.trim();
}

function refreshActiveApiKey() {
    OPENAI_API_KEY = getActiveApiKey();
    return OPENAI_API_KEY;
}

function saveUserApiKey() {
    const input = $('#api-key-input');

    if (!input || !currentUser) {
        return;
    }

    const key = input.value.trim();

    if (key) {
        localStorage.setItem(
            getUserStorageKey('api_key'),
            key
        );

        OPENAI_API_KEY = key;

        showNotice(
            'Ваш API-ключ сохранён и будет использоваться вместо основного.',
            'success'
        );
    } else {
        localStorage.removeItem(
            getUserStorageKey('api_key')
        );

        OPENAI_API_KEY = DEFAULT_API_KEY;

        showNotice(
            'Пользовательский ключ удалён. Используется основной ключ.',
            'success'
        );
    }

    updateApiKeyStatus();
}

function updateApiKeyStatus() {
    const input = $('#api-key-input');

    if (input) {
        input.value = getSavedUserApiKey();
    }

    const status =
        $('#api-key-status') ||
        $('#key-status');

    if (!status) {
        return;
    }

    if (getSavedUserApiKey()) {
        status.textContent = 'Используется ваш API-ключ';
    } else if (DEFAULT_API_KEY.trim()) {
        status.textContent = 'Используется основной API-ключ';
    } else {
        status.textContent = 'API-ключ не задан';
    }
}


/* =========================================================
   АВТОРИЗАЦИЯ
   ========================================================= */

function nextStep() {
    const usernameInput = $('#username-input');
    const passwordInput = $('#password-input');

    if (!usernameInput || !passwordInput) {
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
        showNotice('Введите имя пользователя.', 'error');
        usernameInput.focus();
        return;
    }

    if (!password) {
        showNotice('Введите пароль.', 'error');
        passwordInput.focus();
        return;
    }

    localStorage.setItem(
        getStorageKey(`password_${username}`),
        password
    );

    currentUser = username;

    setCurrentUser(username);

    login();
}

function backToUsername() {
    const usernameInput = $('#username-input');

    if (usernameInput) {
        usernameInput.focus();
    }
}

function login() {
    const usernameInput = $('#username-input');
    const passwordInput = $('#password-input');

    const username =
        currentUser ||
        (usernameInput ? usernameInput.value.trim() : '');

    const password =
        passwordInput ?
        passwordInput.value :
        '';

    if (!username) {
        showNotice('Введите имя пользователя.', 'error');
        return;
    }

    const savedPassword = localStorage.getItem(
        getStorageKey(`password_${username}`)
    );

    if (savedPassword && savedPassword !== password) {
        showNotice('Неверный пароль.', 'error');
        return;
    }

    if (!savedPassword) {
        localStorage.setItem(
            getStorageKey(`password_${username}`),
            password
        );
    }

    currentUser = username;
    setCurrentUser(username);

    refreshActiveApiKey();

    const loginScreen = $('#login-screen');
    const app = $('#app');

    if (loginScreen) {
        loginScreen.style.display = 'none';
    }

    if (app) {
        app.style.display = 'flex';
    }

    initializeNeuroChat();
}

function logout() {
    saveCurrentChat();

    currentUser = null;
    currentChatId = null;
    messages = [];

    setCurrentUser('');

    const app = $('#app');
    const loginScreen = $('#login-screen');

    if (app) {
        app.style.display = 'none';
    }

    if (loginScreen) {
        loginScreen.style.display = '';
    }

    const usernameInput = $('#username-input');
    const passwordInput = $('#password-input');

    if (usernameInput) {
        usernameInput.value = '';
    }

    if (passwordInput) {
        passwordInput.value = '';
    }
}


/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */

function initializeNeuroChat() {
    currentUser = getCurrentUser();

    if (!currentUser) {
        return;
    }

    refreshActiveApiKey();

    loadSettings();
    setupNavigation();
    setupInput();
    setupAttachments();
    setupKeyboardShortcuts();
    setupSearch();

    renderChatHistory();
    updateApiKeyStatus();

    const chats = getChats();

    if (chats.length) {
        const lastChat = chats
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];

        if (lastChat) {
            openChat(lastChat.id);
            return;
        }
    }

    newChat();
}


/* =========================================================
   НАСТРОЙКИ
   ========================================================= */

function getSettings() {
    if (!currentUser) {
        return {};
    }

    return safeJSONParse(
        localStorage.getItem(
            getUserStorageKey('settings')
        ),
        {}
    );
}

function saveSettings(settings) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        getUserStorageKey('settings'),
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

    const modelSelect = $('#model-select');

    if (modelSelect) {
        modelSelect.value = selectedModel;
    }

    const themeSelect = $('#theme-select');

    if (themeSelect) {
        themeSelect.value =
            settings.theme ||
            'dark';
    }

    applyTheme(
        settings.theme ||
        'dark'
    );

    const temporaryToggle =
        $('#temporary-chat-toggle');

    if (temporaryToggle) {
        temporaryToggle.checked = temporaryChat;
    }

    const siteToggle =
        $('#site-builder-toggle');

    if (siteToggle) {
        siteToggle.checked = siteBuilderMode;
    }

    updateApiKeyStatus();
}

function saveModel() {
    const modelSelect = $('#model-select');

    if (!modelSelect) {
        return;
    }

    selectedModel = modelSelect.value;

    const settings = getSettings();

    settings.model = selectedModel;

    saveSettings(settings);

    showNotice(
        `Модель изменена: ${selectedModel}`,
        'success'
    );
}

function changeTheme() {
    const themeSelect = $('#theme-select');

    if (!themeSelect) {
        return;
    }

    const theme = themeSelect.value;

    applyTheme(theme);

    const settings = getSettings();

    settings.theme = theme;

    saveSettings(settings);
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}


/* =========================================================
   ВРЕМЕННЫЕ ЧАТЫ
   ========================================================= */

function setTemporaryChat(enabled) {
    temporaryChat = Boolean(enabled);

    const settings = getSettings();

    settings.temporaryChat = temporaryChat;

    saveSettings(settings);

    if (temporaryChat) {
        showNotice(
            'Временный чат включён. Этот чат не будет сохраняться в истории.',
            'success'
        );
    } else {
        showNotice(
            'Временный чат выключен. Новые чаты будут сохраняться.',
            'success'
        );
    }
}

function toggleTemporaryChat() {
    setTemporaryChat(!temporaryChat);

    const toggle = $('#temporary-chat-toggle');

    if (toggle) {
        toggle.checked = temporaryChat;
    }
}


/* =========================================================
   ХРАНИЛИЩЕ ЧАТОВ
   ========================================================= */

function getChats() {
    if (!currentUser) {
        return [];
    }

    return safeJSONParse(
        localStorage.getItem(
            getUserStorageKey('chats')
        ),
        []
    );
}

function saveChats(chats) {
    if (!currentUser) {
        return;
    }

    localStorage.setItem(
        getUserStorageKey('chats'),
        JSON.stringify(chats)
    );
}

function getChatById(id) {
    return getChats().find(
        chat => chat.id === id
    );
}

function saveCurrentChat() {
    if (!currentUser || !currentChatId) {
        return;
    }

    if (temporaryChat) {
        return;
    }

    if (!messages.length) {
        return;
    }

    const chats = getChats();

    const index = chats.findIndex(
        chat => chat.id === currentChatId
    );

    const firstUserMessage =
        messages.find(
            message => message.role === 'user'
        );

    const title =
        firstUserMessage ?
        createChatTitle(firstUserMessage.content) :
        'Новый чат';

    const chatData = {
        id: currentChatId,
        title,
        messages,
        createdAt:
            index >= 0 ?
            chats[index].createdAt :
            Date.now(),
        updatedAt: Date.now(),
        pinned:
            index >= 0 ?
            Boolean(chats[index].pinned) :
            false
    };

    if (index >= 0) {
        chats[index] = chatData;
    } else {
        chats.unshift(chatData);
    }

    chats.sort(
        (a, b) => b.updatedAt - a.updatedAt
    );

    saveChats(
        chats.slice(0, MAX_HISTORY_CHATS)
    );

    renderChatHistory();
}

function createChatTitle(text) {
    const clean = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!clean) {
        return 'Новый чат';
    }

    if (clean.length <= 42) {
        return clean;
    }

    return `${clean.slice(0, 42)}…`;
}

function newChat(options = {}) {
    saveCurrentChat();

    currentChatId = createId('chat');

    messages = [];
    attachedFiles = [];

    temporaryChat =
        options.temporary !== undefined ?
        options.temporary :
        temporaryChat;

    siteBuilderMode =
        options.siteBuilder !== undefined ?
        options.siteBuilder :
        false;

    clearAttachedFiles();

    renderMessages();
    renderChatHistory();

    updateChatTitle('Новый чат');

    showWelcomeScreen();

    const input = $('#user-input');

    if (input) {
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

function openChat(id) {
    const chat = getChatById(id);

    if (!chat) {
        return;
    }

    currentChatId = chat.id;
    messages = Array.isArray(chat.messages)
        ? chat.messages
        : [];

    temporaryChat = false;
    siteBuilderMode = false;

    renderMessages();
    updateChatTitle(chat.title || 'Чат');
    renderChatHistory();

    hideWelcomeScreen();
}

function deleteChat(id, event) {
    if (event) {
        event.stopPropagation();
    }

    const chats = getChats().filter(
        chat => chat.id !== id
    );

    saveChats(chats);

    if (currentChatId === id) {
        newChat();
    } else {
        renderChatHistory();
    }
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

    chat.pinned = !chat.pinned;

    saveChats(chats);

    renderChatHistory();
}


/* =========================================================
   ИСТОРИЯ ЧАТОВ
   ========================================================= */

function renderChatHistory() {
    const container =
        $('#chat-history') ||
        $('.chat-history');

    if (!container) {
        return;
    }

    let chats = getChats();

    if (currentSearchQuery) {
        const query =
            currentSearchQuery.toLowerCase();

        chats = chats.filter(chat =>
            String(chat.title || '')
                .toLowerCase()
                .includes(query)
        );
    }

    chats.sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
            return a.pinned ? -1 : 1;
        }

        return b.updatedAt - a.updatedAt;
    });

    container.innerHTML = '';

    if (!chats.length) {
        const empty = document.createElement('div');

        empty.className = 'chat-history-empty';
        empty.textContent =
            currentSearchQuery ?
            'Ничего не найдено' :
            'История чатов пуста';

        container.appendChild(empty);

        return;
    }

    chats.forEach(chat => {
        const item = document.createElement('div');

        item.className =
            `chat-item ${
                chat.id === currentChatId
                    ? 'active'
                    : ''
            }`;

        item.dataset.chatId = chat.id;

        const title = document.createElement('span');

        title.className = 'chat-item-title';

        title.textContent =
            chat.pinned ?
            `📌 ${chat.title || 'Новый чат'}` :
            (chat.title || 'Новый чат');

        const actions =
            document.createElement('div');

        actions.className = 'chat-item-actions';

        const pinButton =
            document.createElement('button');

        pinButton.className = 'chat-pin';
        pinButton.type = 'button';
        pinButton.title =
            chat.pinned ?
            'Открепить' :
            'Закрепить';

        pinButton.textContent =
            chat.pinned ?
            '📌' :
            '○';

        pinButton.addEventListener(
            'click',
            event => togglePinChat(
                chat.id,
                event
            )
        );

        const deleteButton =
            document.createElement('button');

        deleteButton.className = 'chat-delete';
        deleteButton.type = 'button';
        deleteButton.title = 'Удалить';
        deleteButton.textContent = '×';

        deleteButton.addEventListener(
            'click',
            event => deleteChat(
                chat.id,
                event
            )
        );

        actions.appendChild(pinButton);
        actions.appendChild(deleteButton);

        item.appendChild(title);
        item.appendChild(actions);

        item.addEventListener(
            'click',
            () => openChat(chat.id)
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
   НАВИГАЦИЯ
   ========================================================= */

function setupNavigation() {
    $$('.nav-item').forEach(item => {
        item.addEventListener(
            'click',
            () => {
                const action =
                    item.dataset.action ||
                    item.dataset.page ||
                    '';

                $$('.nav-item').forEach(
                    nav =>
                        nav.classList.remove('active')
                );

                item.classList.add('active');

                handleNavigation(action);
            }
        );
    });
}

function handleNavigation(action) {
    switch (action) {
        case 'chat':
        case 'home':
            hideWelcomeScreen();
            return;

        case 'library':
            openLibrary();
            return;

        case 'projects':
            openProjects();
            return;

        case 'plugins':
            openPlugins();
            return;

        case 'scheduled':
            openScheduled();
            return;

        case 'more':
            openMore();
            return;

        case 'site':
        case 'create-site':
            startSiteBuilder();
            return;

        default:
            return;
    }
}


/* =========================================================
   ВСПОМОГАТЕЛЬНЫЕ ПАНЕЛИ
   ========================================================= */

function openFeaturePanel(title, contentHTML) {
    let panel = $('#neuro-feature-panel');

    if (!panel) {
        panel = document.createElement('div');

        panel.id = 'neuro-feature-panel';

        Object.assign(panel.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '9000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.55)',
            padding: '20px'
        });

        panel.innerHTML = `
            <div class="neuro-feature-window"
                 style="
                    width:min(720px,100%);
                    max-height:90vh;
                    overflow:auto;
                    background:var(--panel-bg,#171717);
                    color:var(--text-color,#fff);
                    border-radius:18px;
                    padding:22px;
                 ">
                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:12px;
                    margin-bottom:18px;
                ">
                    <h2 id="neuro-feature-title"
                        style="margin:0"></h2>

                    <button
                        type="button"
                        id="neuro-feature-close"
                        style="
                            border:0;
                            background:transparent;
                            color:inherit;
                            font-size:28px;
                            cursor:pointer;
                        "
                    >×</button>
                </div>

                <div id="neuro-feature-body"></div>
            </div>
        `;

        document.body.appendChild(panel);

        $('#neuro-feature-close')
            .addEventListener(
                'click',
                () => panel.remove()
            );

        panel.addEventListener(
            'click',
            event => {
                if (event.target === panel) {
                    panel.remove();
                }
            }
        );
    }

    $('#neuro-feature-title').textContent = title;
    $('#neuro-feature-body').innerHTML = contentHTML;
}

function openLibrary() {
    const chats = getChats();

    openFeaturePanel(
        '📚 Библиотека',
        `
            <p>Здесь находятся сохранённые материалы Нейро-чата.</p>

            <div style="display:grid;gap:10px">
                <button class="library-action"
                        data-library-action="chats">
                    💬 История чатов (${chats.length})
                </button>

                <button class="library-action"
                        data-library-action="files">
                    📎 Прикреплённые файлы
                </button>

                <button class="library-action"
                        data-library-action="sites">
                    🌐 Созданные сайты
                </button>
            </div>
        `
    );

    $$('.library-action').forEach(button => {
        button.addEventListener('click', () => {
            const action =
                button.dataset.libraryAction;

            if (action === 'chats') {
                $('#neuro-feature-panel')?.remove();
                newChat();
            }

            if (action === 'sites') {
                $('#neuro-feature-panel')?.remove();
                startSiteBuilder();
            }

            if (action === 'files') {
                showNotice(
                    'Файлы доступны внутри соответствующих чатов.'
                );
            }
        });
    });
}

function openProjects() {
    openFeaturePanel(
        '🧩 Проекты',
        `
            <p>
                Создавай отдельные проекты и используй
                Нейро-чат как рабочее пространство.
            </p>

            <button
                type="button"
                id="create-project-button"
                style="padding:12px 16px;border-radius:10px;border:0;cursor:pointer"
            >
                ＋ Создать проект
            </button>
        `
    );

    $('#create-project-button')
        ?.addEventListener(
            'click',
            () => {
                $('#neuro-feature-panel')?.remove();

                newChat({
                    temporary: false
                });

                showNotice(
                    'Новый проект можно начать с описания задачи.',
                    'success'
                );
            }
        );
}

function openPlugins() {
    openFeaturePanel(
        '🔌 Плагины',
        `
            <p>
                Здесь можно подключать дополнительные возможности
                Нейро-чата.
            </p>

            <div style="display:grid;gap:10px">
                <button type="button"
                        class="plugin-action"
                        data-plugin="web">
                    🌐 Веб-поиск
                </button>

                <button type="button"
                        class="plugin-action"
                        data-plugin="files">
                    📎 Работа с файлами
                </button>

                <button type="button"
                        class="plugin-action"
                        data-plugin="site">
                    🧑‍💻 Создание сайтов
                </button>
            </div>
        `
    );

    $$('.plugin-action').forEach(button => {
        button.addEventListener(
            'click',
            () => {
                const plugin =
                    button.dataset.plugin;

                if (plugin === 'site') {
                    $('#neuro-feature-panel')?.remove();
                    startSiteBuilder();
                } else {
                    showNotice(
                        `Возможность «${button.textContent.trim()}» выбрана.`
                    );
                }
            }
        );
    });
}

function openScheduled() {
    openFeaturePanel(
        '⏰ Запланированные задачи',
        `
            <p>
                Создай локальную задачу с напоминанием.
            </p>

            <input
                id="schedule-text"
                type="text"
                placeholder="Например: проверить заказ"
                style="width:100%;padding:12px;border-radius:10px;border:1px solid #444;background:transparent;color:inherit;margin-bottom:10px"
            >

            <input
                id="schedule-time"
                type="datetime-local"
                style="width:100%;padding:12px;border-radius:10px;border:1px solid #444;background:transparent;color:inherit;margin-bottom:10px"
            >

            <button
                type="button"
                id="schedule-create"
                style="padding:12px 16px;border:0;border-radius:10px;cursor:pointer"
            >
                Создать напоминание
            </button>
        `
    );

    $('#schedule-create')
        ?.addEventListener(
            'click',
            createScheduledTask
        );
}

function createScheduledTask() {
    const text = $('#schedule-text')?.value.trim();
    const time = $('#schedule-time')?.value;

    if (!text || !time) {
        showNotice(
            'Укажи текст и время.',
            'error'
        );
        return;
    }

    const tasks = safeJSONParse(
        localStorage.getItem(
            getUserStorageKey('scheduled')
        ),
        []
    );

    tasks.push({
        id: createId('task'),
        text,
        time,
        createdAt: Date.now()
    });

    localStorage.setItem(
        getUserStorageKey('scheduled'),
        JSON.stringify(tasks)
    );

    $('#neuro-feature-panel')?.remove();

    showNotice(
        'Напоминание сохранено.',
        'success'
    );
}

function openMore() {
    openFeaturePanel(
        '⋯ Дополнительно',
        `
            <div style="display:grid;gap:10px">
                <button type="button" id="more-temp">
                    🕶️ Временный чат
                </button>

                <button type="button" id="more-site">
                    🌐 Создать сайт
                </button>

                <button type="button" id="more-clear">
                    🗑️ Очистить текущий чат
                </button>
            </div>
        `
    );

    $('#more-temp')?.addEventListener(
        'click',
        () => {
            toggleTemporaryChat();
            $('#neuro-feature-panel')?.remove();
        }
    );

    $('#more-site')?.addEventListener(
        'click',
        () => {
            $('#neuro-feature-panel')?.remove();
            startSiteBuilder();
        }
    );

    $('#more-clear')?.addEventListener(
        'click',
        () => {
            $('#neuro-feature-panel')?.remove();
            clearChat();
        }
    );
}


/* =========================================================
   СОЗДАНИЕ САЙТОВ
   ========================================================= */

function startSiteBuilder() {
    siteBuilderMode = true;

    const settings = getSettings();

    settings.siteBuilderMode = true;

    saveSettings(settings);

    newChat({
        temporary: false,
        siteBuilder: true
    });

    updateChatTitle('Создание сайта');

    const input = $('#user-input');

    if (input) {
        input.value =
            'Создай сайт: ';
        input.focus();

        input.setSelectionRange(
            input.value.length,
            input.value.length
        );
    }

    showNotice(
        'Режим создания сайтов включён.',
        'success'
    );
}

function buildSitePrompt(userRequest) {
    return `
Ты работаешь в режиме создания сайтов.

Пользователь хочет:
${userRequest}

Создай полноценный одностраничный сайт.

Верни результат строго в следующем формате:

TITLE:
Название сайта

HTML:
полный HTML-документ

END_HTML

Требования:
- HTML должен быть полноценным.
- CSS должен находиться внутри <style>.
- JavaScript должен находиться внутри <script>.
- Не используй внешние зависимости без необходимости.
- Интерфейс должен быть современным.
- Страница должна работать сразу после открытия HTML-файла.
- Все кнопки должны иметь реальные действия.
- Не пиши «в разработке».
- Не пиши пояснения внутри блока HTML.
- После END_HTML можешь кратко объяснить, что создано.
`;
}

function extractGeneratedHTML(text) {
    if (!text) {
        return '';
    }

    const match =
        text.match(
            /HTML:\s*([\s\S]*?)\s*END_HTML/i
        );

    if (match) {
        return match[1].trim();
    }

    const codeMatch =
        text.match(
            /```html\s*([\s\S]*?)```/i
        );

    if (codeMatch) {
        return codeMatch[1].trim();
    }

    if (
        text.includes('<!DOCTYPE html>') ||
        text.includes('<html')
    ) {
        const start =
            text.indexOf('<!DOCTYPE html>') >= 0
                ? text.indexOf('<!DOCTYPE html>')
                : text.indexOf('<html');

        return text.slice(start).trim();
    }

    return '';
}

function previewGeneratedSite(html) {
    if (!html) {
        showNotice(
            'В ответе не найден HTML-код сайта.',
            'error'
        );
        return;
    }

    const blob =
        new Blob(
            [html],
            { type: 'text/html;charset=utf-8' }
        );

    const url =
        URL.createObjectURL(blob);

    openFeaturePanel(
        '🌐 Предпросмотр сайта',
        `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                <button
                    type="button"
                    id="site-open-new"
                >
                    ↗ Открыть
                </button>

                <button
                    type="button"
                    id="site-download"
                >
                    ⬇ Скачать HTML
                </button>
            </div>

            <iframe
                id="site-preview-frame"
                sandbox="allow-scripts allow-forms allow-modals"
                style="
                    width:100%;
                    height:500px;
                    border:1px solid #444;
                    border-radius:12px;
                    background:#fff;
                "
            ></iframe>
        `
    );

    const iframe =
        $('#site-preview-frame');

    if (iframe) {
        iframe.src = url;
    }

    $('#site-open-new')
        ?.addEventListener(
            'click',
            () => {
                window.open(
                    url,
                    '_blank',
                    'noopener,noreferrer'
                );
            }
        );

    $('#site-download')
        ?.addEventListener(
            'click',
            () => {
                downloadTextFile(
                    html,
                    'neuro-chat-site.html',
                    'text/html;charset=utf-8'
                );
            }
        );

    const panel =
        $('#neuro-feature-panel');

    if (panel) {
        panel.addEventListener(
            'remove',
            () => URL.revokeObjectURL(url)
        );
    }
}


/* =========================================================
   СООБЩЕНИЯ
   ========================================================= */

function addMessage(
    role,
    content,
    extra = {}
) {
    const message = {
        id: createId('message'),
        role,
        content: String(content || ''),
        createdAt: Date.now(),
        ...extra
    };

    messages.push(message);

    renderMessages();

    return message;
}

function renderMessages() {
    const container = $('#messages');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    messages.forEach(message => {
        const element =
            document.createElement('div');

        element.className =
            `message message-${message.role}`;

        element.dataset.messageId =
            message.id;

        const content =
            document.createElement('div');

        content.className =
            'message-content';

        content.innerHTML =
            formatText(message.content);

        element.appendChild(content);

        if (message.role === 'assistant') {
            const actions =
                document.createElement('div');

            actions.className =
                'message-actions';

            actions.innerHTML = `
                <button
                    type="button"
                    data-action="copy"
                    title="Копировать"
                >📋</button>

                <button
                    type="button"
                    data-action="regenerate"
                    title="Повторить"
                >🔄</button>
            `;

            actions
                .querySelector('[data-action="copy"]')
                ?.addEventListener(
                    'click',
                    () => copyText(
                        message.content
                    )
                );

            actions
                .querySelector('[data-action="regenerate"]')
                ?.addEventListener(
                    'click',
                    () => regenerateMessage(
                        message.id
                    )
                );

            element.appendChild(actions);
        }

        if (message.role === 'user') {
            const actions =
                document.createElement('div');

            actions.className =
                'message-actions';

            actions.innerHTML = `
                <button
                    type="button"
                    data-action="copy"
                >📋</button>

                <button
                    type="button"
                    data-action="edit"
                >✏️</button>
            `;

            actions
                .querySelector('[data-action="copy"]')
                ?.addEventListener(
                    'click',
                    () => copyText(
                        message.content
                    )
                );

            actions
                .querySelector('[data-action="edit"]')
                ?.addEventListener(
                    'click',
                    () => editMessage(
                        message.id
                    )
                );

            element.appendChild(actions);
        }

        container.appendChild(element);
    });

    container.scrollTop =
        container.scrollHeight;
}

function hideWelcomeScreen() {
    const welcome = $('.welcome');

    if (welcome) {
        welcome.style.display = 'none';
    }
}

function showWelcomeScreen() {
    const welcome = $('.welcome');

    if (welcome) {
        welcome.style.display = '';
    }
}

function updateChatTitle(title) {
    const titleElement =
        $('#chat-title') ||
        $('.chat-title');

    if (titleElement) {
        titleElement.textContent =
            title || 'Новый чат';
    }
}


/* =========================================================
   ФОРМАТИРОВАНИЕ
   ========================================================= */

function formatText(text) {
    let value =
        escapeHTML(
            String(text || '')
        );

    value = value.replace(
        /```([\s\S]*?)```/g,
        '<pre><code>$1</code></pre>'
    );

    value = value.replace(
        /`([^`]+)`/g,
        '<code>$1</code>'
    );

    value = value.replace(
        /\*\*([^*]+)\*\*/g,
        '<strong>$1</strong>'
    );

    value = value.replace(
        /\*([^*]+)\*/g,
        '<em>$1</em>'
    );

    value = value.replace(
        /^### (.+)$/gm,
        '<h3>$1</h3>'
    );

    value = value.replace(
        /^## (.+)$/gm,
        '<h2>$1</h2>'
    );

    value = value.replace(
        /^# (.+)$/gm,
        '<h1>$1</h1>'
    );

    value = value.replace(
        /\n/g,
        '<br>'
    );

    return value;
}


/* =========================================================
   РЕДАКТИРОВАНИЕ / ПОВТОР
   ========================================================= */

function editMessage(id) {
    const message =
        messages.find(
            item => item.id === id
        );

    if (!message) {
        return;
    }

    const input = $('#user-input');

    if (!input) {
        return;
    }

    input.value =
        message.content;

    input.focus();

    messages =
        messages.filter(
            item =>
                item.createdAt <
                message.createdAt
        );

    renderMessages();
}

async function regenerateMessage(id) {
    const index =
        messages.findIndex(
            item => item.id === id
        );

    if (index < 0) {
        return;
    }

    if (messages[index].role !== 'assistant') {
        return;
    }

    messages.splice(index, 1);

    renderMessages();

    await requestAssistantResponse();
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(
            text
        );

        showNotice(
            'Скопировано.',
            'success'
        );
    } catch {
        showNotice(
            'Не удалось скопировать текст.',
            'error'
        );
    }
}


/* =========================================================
   ОТПРАВКА СООБЩЕНИЯ
   ========================================================= */

async function sendMessage() {
    if (isGenerating) {
        return;
    }

    const input = $('#user-input');

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (!text && !attachedFiles.length) {
        return;
    }

    hideWelcomeScreen();

    const userContent =
        text ||
        'Проанализируй прикреплённые файлы.';

    addMessage(
        'user',
        userContent,
        {
            attachments:
                attachedFiles.map(
                    file => ({
                        name: file.name,
                        type: file.type,
                        size: file.size
                    })
                )
        }
    );

    input.value = '';

    resizeInput();

    clearAttachedFiles();

    await requestAssistantResponse();
}

async function requestAssistantResponse() {
    if (isGenerating) {
        return;
    }

    refreshActiveApiKey();

    if (!OPENAI_API_KEY) {
        addMessage(
            'assistant',
            'API-ключ не задан. Добавьте пользовательский ключ в настройках или укажите основной ключ в `DEFAULT_API_KEY`.'
        );

        return;
    }

    isGenerating = true;

    currentAbortController =
        new AbortController();

    showTypingIndicator();

    try {
        let apiMessages =
            buildAPIMessages();

        if (siteBuilderMode) {
            const lastUser =
                [...messages]
                    .reverse()
                    .find(
                        message =>
                            message.role === 'user'
                    );

            if (lastUser) {
                apiMessages = [
                    {
                        role: 'system',
                        content:
                            buildSitePrompt(
                                lastUser.content
                            )
                    },
                    ...messages
                        .slice(
                            -MAX_CONTEXT_MESSAGES
                        )
                        .map(message => ({
                            role: message.role,
                            content:
                                message.content
                        }))
                ];
            }
        }

        const response =
            await fetch(
                `${API_BASE_URL}/chat/completions`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json',

                        'Authorization':
                            `Bearer ${OPENAI_API_KEY}`
                    },

                    signal:
                        currentAbortController.signal,

                    body: JSON.stringify({
                        model: selectedModel,
                        messages: apiMessages,
                        temperature: 0.7
                    })
                }
            );

        if (!response.ok) {
            const errorText =
                await response.text();

            throw new Error(
                formatAPIError(
                    response.status,
                    errorText
                )
            );
        }

        const data =
            await response.json();

        const answer =
            data?.choices?.[0]?.message?.content ||
            'Модель не вернула текстовый ответ.';

        hideTypingIndicator();

        addMessage(
            'assistant',
            answer
        );

        if (siteBuilderMode) {
            const html =
                extractGeneratedHTML(answer);

            if (html) {
                showSiteActions(html);
            }
        }

        if (!temporaryChat) {
            saveCurrentChat();
        }

    } catch (error) {
        hideTypingIndicator();

        if (error.name === 'AbortError') {
            addMessage(
                'assistant',
                'Генерация остановлена.'
            );
        } else {
            addMessage(
                'assistant',
                `Не удалось получить ответ.\n\n${error.message}`
            );
        }
    } finally {
        isGenerating = false;
        currentAbortController = null;

        if (!temporaryChat) {
            saveCurrentChat();
        }
    }
}

function buildAPIMessages() {
    const systemPrompt = `
Ты — Нейро-чат, интеллектуальный AI-помощник.

Отвечай на русском языке, если пользователь не попросил другой язык.

Правила:
- Отвечай конкретно.
- Не придумывай результаты действий, которых ты не выполнял.
- Если пользователь просит код — давай рабочий код.
- Если пользователь просит сайт — создавай полноценный HTML/CSS/JS.
- Не используй фразы «функция в разработке», если можно выполнить задачу другим способом.
- Используй Markdown там, где это улучшает читаемость.
`;

    const context =
        messages
            .slice(-MAX_CONTEXT_MESSAGES)
            .map(message => ({
                role: message.role,
                content: message.content
            }));

    return [
        {
            role: 'system',
            content: systemPrompt
        },
        ...context
    ];
}


/* =========================================================
   САЙТ: ДЕЙСТВИЯ ПОСЛЕ ГЕНЕРАЦИИ
   ========================================================= */

function showSiteActions(html) {
    const lastMessage =
        $('#messages')?.lastElementChild;

    if (!lastMessage) {
        return;
    }

    const actions =
        document.createElement('div');

    actions.className =
        'site-actions';

    actions.innerHTML = `
        <button
            type="button"
            data-site-action="preview"
        >
            👁️ Предпросмотр
        </button>

        <button
            type="button"
            data-site-action="download"
        >
            ⬇ Скачать HTML
        </button>
    `;

    actions
        .querySelector(
            '[data-site-action="preview"]'
        )
        ?.addEventListener(
            'click',
            () => previewGeneratedSite(html)
        );

    actions
        .querySelector(
            '[data-site-action="download"]'
        )
        ?.addEventListener(
            'click',
            () => downloadTextFile(
                html,
                'neuro-chat-site.html',
                'text/html;charset=utf-8'
            )
        );

    lastMessage.appendChild(actions);
}


/* =========================================================
   ФАЙЛЫ
   ========================================================= */

function setupAttachments() {
    const attachButton =
        $('#attach-button') ||
        $('.attach-btn');

    const attachMenu =
        $('#attach-menu') ||
        $('.attach-menu');

    if (attachButton && attachMenu) {
        attachButton.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                attachMenu.classList.toggle(
                    'open'
                );
            }
        );

        document.addEventListener(
            'click',
            () => {
                attachMenu.classList.remove(
                    'open'
                );
            }
        );
    }

    document.addEventListener(
        'click',
        event => {
            const target =
                event.target.closest(
                    '[data-attach]'
                );

            if (!target) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            openFilePicker(
                target.dataset.attach
            );
        }
    );
}

function openFilePicker(type) {
    const input =
        document.createElement('input');

    input.type = 'file';

    if (type === 'camera') {
        input.accept =
            'image/*';

        input.capture =
            'environment';
    }

    if (type === 'photo') {
        input.accept =
            'image/*';
    }

    if (type === 'video') {
        input.accept =
            'video/*';
    }

    if (type === '3d') {
        input.accept =
            '.stl,.obj,.step,.stp,.3mf,.gltf,.glb';
    }

    if (type === 'image') {
        input.accept =
            'image/*';
    }

    if (type === 'file') {
        input.accept = '*/*';
    }

    input.multiple = true;

    input.addEventListener(
        'change',
        event => {
            const files =
                Array.from(
                    event.target.files || []
                );

            attachedFiles.push(...files);

            renderAttachedFiles();
        }
    );

    input.click();
}

function renderAttachedFiles() {
    const container =
        $('#attached-files') ||
        $('.file-preview-list');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    attachedFiles.forEach(
        (file, index) => {
            const item =
                document.createElement('div');

            item.className =
                'file-preview';

            item.innerHTML = `
                <span class="file-preview-name">
                    ${escapeHTML(file.name)}
                </span>

                <button
                    type="button"
                    data-file-index="${index}"
                >
                    ×
                </button>
            `;

            item
                .querySelector('button')
                ?.addEventListener(
                    'click',
                    () => {
                        attachedFiles.splice(
                            index,
                            1
                        );

                        renderAttachedFiles();
                    }
                );

            container.appendChild(item);
        }
    );
}

function clearAttachedFiles() {
    attachedFiles = [];

    const container =
        $('#attached-files') ||
        $('.file-preview-list');

    if (container) {
        container.innerHTML = '';
    }
}


/* =========================================================
   ВВОД
   ========================================================= */

function setupInput() {
    const input = $('#user-input');

    if (!input) {
        return;
    }

    input.addEventListener(
        'input',
        resizeInput
    );

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

    resizeInput();
}

function resizeInput() {
    const input = $('#user-input');

    if (!input) {
        return;
    }

    input.style.height = 'auto';

    input.style.height =
        `${Math.min(
            input.scrollHeight,
            220
        )}px`;
}

function setupKeyboardShortcuts() {
    document.addEventListener(
        'keydown',
        event => {
            if (
                event.key === '/' &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
            ) {
                const active =
                    document.activeElement;

                if (
                    active &&
                    (
                        active.tagName === 'INPUT' ||
                        active.tagName === 'TEXTAREA'
                    )
                ) {
                    return;
                }

                $('#user-input')?.focus();
            }

            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() === 'k'
            ) {
                event.preventDefault();

                newChat();
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
   ПОИСК
   ========================================================= */

function setupSearch() {
    const search =
        $('#chat-search') ||
        $('.sidebar-search input');

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


/* =========================================================
   QUICK PROMPTS
   ========================================================= */

function setupSuggestionButtons() {
    $$('.suggestion').forEach(
        button => {
            button.addEventListener(
                'click',
                () => {
                    const text =
                        button.dataset.prompt ||
                        button.textContent.trim();

                    const input =
                        $('#user-input');

                    if (!input) {
                        return;
                    }

                    input.value = text;

                    resizeInput();

                    input.focus();
                }
            );
        }
    );
}


/* =========================================================
   ИНДИКАТОР ГЕНЕРАЦИИ
   ========================================================= */

function showTypingIndicator() {
    hideTypingIndicator();

    const container =
        $('#messages');

    if (!container) {
        return;
    }

    const typing =
        document.createElement('div');

    typing.id =
        'typing-indicator';

    typing.className =
        'message message-assistant typing';

    typing.innerHTML = `
        <div class="message-content">
            <span>●</span>
            <span>●</span>
            <span>●</span>
        </div>
    `;

    container.appendChild(typing);

    container.scrollTop =
        container.scrollHeight;
}

function hideTypingIndicator() {
    $('#typing-indicator')?.remove();
}

function stopGeneration() {
    if (
        currentAbortController
    ) {
        currentAbortController.abort();

        currentAbortController = null;
    }

    isGenerating = false;

    hideTypingIndicator();

    showNotice(
        'Генерация остановлена.'
    );
}


/* =========================================================
   ОШИБКИ API
   ========================================================= */

function formatAPIError(
    status,
    errorText
) {
    const parsed =
        safeJSONParse(
            errorText,
            null
        );

    const apiMessage =
        parsed?.error?.message ||
        parsed?.message ||
        '';

    if (status === 401) {
        return (
            'API-ключ недействителен или был отклонён. ' +
            'Проверь пользовательский ключ в настройках.'
        );
    }

    if (status === 429) {
        return (
            'Превышен лимит API-запросов или недостаточно доступного лимита.'
        );
    }

    if (status === 403) {
        return (
            'API запрещён для этого ключа или проекта.'
        );
    }

    if (status >= 500) {
        return (
            'Сервер API временно недоступен. Попробуй ещё раз.'
        );
    }

    return (
        apiMessage ||
        `Ошибка API (${status}).`
    );
}


/* =========================================================
   НАСТРОЙКИ / МОДАЛЬНЫЕ ОКНА
   ========================================================= */

function openSettings() {
    const modal =
        $('#settings-modal');

    if (modal) {
        modal.style.display = 'flex';
    }

    updateApiKeyStatus();
}

function closeSettings() {
    const modal =
        $('#settings-modal');

    if (modal) {
        modal.style.display = 'none';
    }
}

function openSupport() {
    const modal =
        $('#support-modal');

    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeSupport() {
    const modal =
        $('#support-modal');

    if (modal) {
        modal.style.display = 'none';
    }
}

function setupModals() {
    document.addEventListener(
        'click',
        event => {
            const target =
                event.target.closest(
                    '[data-modal-action]'
                );

            if (!target) {
                return;
            }

            const action =
                target.dataset.modalAction;

            if (action === 'settings') {
                openSettings();
            }

            if (action === 'close-settings') {
                closeSettings();
            }

            if (action === 'support') {
                openSupport();
            }

            if (action === 'close-support') {
                closeSupport();
            }
        }
    );

    $('#save-api-key')
        ?.addEventListener(
            'click',
            saveUserApiKey
        );

    $('#model-select')
        ?.addEventListener(
            'change',
            saveModel
        );

    $('#theme-select')
        ?.addEventListener(
            'change',
            changeTheme
        );

    $('#temporary-chat-toggle')
        ?.addEventListener(
            'change',
            event =>
                setTemporaryChat(
                    event.target.checked
                )
        );

    $('#site-builder-toggle')
        ?.addEventListener(
            'change',
            event => {
                siteBuilderMode =
                    event.target.checked;

                const settings =
                    getSettings();

                settings.siteBuilderMode =
                    siteBuilderMode;

                saveSettings(settings);
            }
        );

    document.addEventListener(
        'click',
        event => {
            if (
                event.target.classList.contains(
                    'modal'
                )
            ) {
                event.target.style.display =
                    'none';
            }
        }
    );
}


/* =========================================================
   СКАЧИВАНИЕ ФАЙЛОВ
   ========================================================= */

function downloadTextFile(
    content,
    filename,
    mimeType = 'text/plain;charset=utf-8'
) {
    const blob =
        new Blob(
            [content],
            { type: mimeType }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(
        () => URL.revokeObjectURL(url),
        1000
    );
}


/* =========================================================
   SIDEBAR
   ========================================================= */

function setupSidebar() {
    const menuButton =
        $('#menu-button') ||
        $('.menu-btn');

    const sidebar =
        $('.sidebar');

    if (
        !menuButton ||
        !sidebar
    ) {
        return;
    }

    menuButton.addEventListener(
        'click',
        () => {
            sidebar.classList.toggle(
                'open'
            );
        }
    );
}


/* =========================================================
   НОВЫЙ ЧАТ
   ========================================================= */

function setupNewChatButton() {
    $(
        '#new-chat-button, .new-chat-button'
    )?.addEventListener(
        'click',
        () => newChat()
    );
}


/* =========================================================
   CLEAR CHAT
   ========================================================= */

function setupClearButton() {
    $(
        '#clear-chat, [data-action="clear-chat"]'
    )?.addEventListener(
        'click',
        clearChat
    );
}


/* =========================================================
   SEND BUTTON
   ========================================================= */

function setupSendButton() {
    $(
        '#send-button, .send-btn'
    )?.addEventListener(
        'click',
        sendMessage
    );
}


/* =========================================================
   СОХРАНЕНИЕ ПРИ ВЫХОДЕ
   ========================================================= */

window.addEventListener(
    'beforeunload',
    () => {
        if (!temporaryChat) {
            saveCurrentChat();
        }
    }
);


/* =========================================================
   ГЛОБАЛЬНЫЕ ФУНКЦИИ
   ========================================================= */

window.newChat = newChat;
window.clearChat = clearChat;
window.sendMessage = sendMessage;
window.stopGeneration = stopGeneration;

window.login = login;
window.logout = logout;
window.nextStep = nextStep;
window.backToUsername = backToUsername;

window.openSettings = openSettings;
window.closeSettings = closeSettings;

window.openSupport = openSupport;
window.closeSupport = closeSupport;

window.saveUserApiKey = saveUserApiKey;
window.toggleTemporaryChat = toggleTemporaryChat;

window.startSiteBuilder = startSiteBuilder;
window.previewGeneratedSite = previewGeneratedSite;

window.deleteChat = deleteChat;
window.openChat = openChat;
window.searchChats = searchChats;


/* =========================================================
   СТАРТ
   ========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {
        setupSuggestionButtons();
        setupModals();
        setupSidebar();
        setupNewChatButton();
        setupClearButton();
        setupSendButton();

        const savedUser =
            getCurrentUser();

        if (savedUser) {
            currentUser = savedUser;

            const loginScreen =
                $('#login-screen');

            const app =
                $('#app');

            if (loginScreen) {
                loginScreen.style.display =
                    'none';
            }

            if (app) {
                app.style.display =
                    'flex';
            }

            initializeNeuroChat();
        }
    }
);
/* =========================================================
   NEURO-CHAT — FINAL COMPATIBILITY / FIX LAYER
   Исправляет конфликт script.js с inline JS из index.html.
   API-ключ намеренно НЕ изменяется.
   ========================================================= */

(function NeuroChatFinalFix() {
    'use strict';

    /*
     * Сохраняем настоящую логику из основного script.js
     * ДО того, как inline-скрипт index.html сможет её
     * переопределить.
     */
    const CORE = {
        newChat: window.newChat,
        clearChat: window.clearChat,
        sendMessage: window.sendMessage,
        stopGeneration: window.stopGeneration,

        login: window.login,
        logout: window.logout,

        openSettings: window.openSettings,
        closeSettings: window.closeSettings,
        openSupport: window.openSupport,
        closeSupport: window.closeSupport,

        saveUserApiKey: window.saveUserApiKey,
        toggleTemporaryChat: window.toggleTemporaryChat,

        startSiteBuilder: window.startSiteBuilder,
        previewGeneratedSite: window.previewGeneratedSite,

        deleteChat: window.deleteChat,
        openChat: window.openChat,
        searchChats: window.searchChats,

        addMessage: window.addMessage,
        renderMessages: window.renderMessages,
        renderChatHistory: window.renderChatHistory,

        requestAssistantResponse: window.requestAssistantResponse,
        initializeNeuroChat: window.initializeNeuroChat,

        openFilePicker: window.openFilePicker,
        renderAttachedFiles: window.renderAttachedFiles,
        clearAttachedFiles: window.clearAttachedFiles,

        updateApiKeyStatus: window.updateApiKeyStatus,
        saveModel: window.saveModel,
        changeTheme: window.changeTheme,

        resizeInput: window.resizeInput
    };


    /* =====================================================
       УТИЛИТЫ
       ===================================================== */

    function getElement(id) {
        return document.getElementById(id);
    }

    function showAuthError(id, message) {
        const element = getElement(id);

        if (element) {
            element.textContent = message || '';
        }
    }

    function clearAuthErrors() {
        showAuthError('login-error', '');
        showAuthError('register-error', '');
    }

    function normalizeUsername(value) {
        return String(value || '')
            .trim()
            .toLowerCase();
    }

    function getAccounts() {
        try {
            return JSON.parse(
                localStorage.getItem('neuro_accounts') || '{}'
            );
        } catch {
            return {};
        }
    }

    function saveAccounts(accounts) {
        localStorage.setItem(
            'neuro_accounts',
            JSON.stringify(accounts)
        );
    }


    /* =====================================================
       АВТОРИЗАЦИЯ
       ===================================================== */

    window.showLogin = function showLoginFixed() {
        const loginForm = getElement('login-form');
        const registerForm = getElement('register-form');

        if (loginForm) {
            loginForm.style.display = 'block';
        }

        if (registerForm) {
            registerForm.style.display = 'none';
        }

        clearAuthErrors();

        getElement('username')?.focus();
    };


    window.showRegister = function showRegisterFixed() {
        const loginForm = getElement('login-form');
        const registerForm = getElement('register-form');

        if (loginForm) {
            loginForm.style.display = 'none';
        }

        if (registerForm) {
            registerForm.style.display = 'block';
        }

        clearAuthErrors();

        getElement('register-username')?.focus();
    };


    /*
     * Регистрация.
     *
     * Сохраняем совместимость с существующим
     * localStorage форматом neuro_accounts.
     */
    window.register = async function registerFixed() {
        const usernameInput =
            getElement('register-username');

        const passwordInput =
            getElement('register-password');

        const phoneInput =
            getElement('register-phone');

        const emailInput =
            getElement('register-email');

        if (!usernameInput || !passwordInput) {
            return;
        }

        const username =
            normalizeUsername(usernameInput.value);

        const password =
            passwordInput.value;

        const phone =
            String(phoneInput?.value || '').trim();

        const email =
            String(emailInput?.value || '').trim();

        showAuthError('register-error', '');

        if (!username) {
            showAuthError(
                'register-error',
                'Введите имя пользователя.'
            );
            usernameInput.focus();
            return;
        }

        if (
            !/^[a-z0-9._-]+@neuro$/i.test(username)
        ) {
            showAuthError(
                'register-error',
                'Имя пользователя должно быть в формате username@neuro.'
            );
            usernameInput.focus();
            return;
        }

        if (password.length < 8) {
            showAuthError(
                'register-error',
                'Пароль должен содержать минимум 8 символов.'
            );
            passwordInput.focus();
            return;
        }

        const accounts = getAccounts();

        if (accounts[username]) {
            showAuthError(
                'register-error',
                'Такой пользователь уже существует.'
            );
            return;
        }

        /*
         * Сохраняем текущий формат аккаунта,
         * чтобы старые аккаунты не сломались.
         */
        accounts[username] = {
            username,
            password,
            phone,
            email,
            createdAt: Date.now()
        };

        saveAccounts(accounts);

        /*
         * Сохраняем обе версии ключа текущего пользователя:
         *
         * neuro_current_user
         * neurochat_current_user
         *
         * Это нужно для совместимости старой и новой логики.
         */
        localStorage.setItem(
            'neuro_current_user',
            username
        );

        localStorage.setItem(
            'neurochat_current_user',
            username
        );

        /*
         * Переносим данные в основную систему.
         */
        if (typeof setCurrentUser === 'function') {
            setCurrentUser(username);
        }

        showAuthError('register-error', '');

        const loginUsername =
            getElement('username');

        if (loginUsername) {
            loginUsername.value = username;
        }

        const loginPassword =
            getElement('password');

        if (loginPassword) {
            loginPassword.value = password;
        }

        window.showLogin();

        showNotice(
            'Аккаунт успешно создан.',
            'success'
        );

        /*
         * Открываем приложение через основную систему.
         */
        setTimeout(() => {
            window.login();
        }, 50);
    };


    /*
     * Вход.
     */
    window.login = async function loginFixed() {
        const usernameInput =
            getElement('username');

        const passwordInput =
            getElement('password');

        if (!usernameInput || !passwordInput) {
            return;
        }

        const username =
            normalizeUsername(usernameInput.value);

        const password =
            passwordInput.value;

        showAuthError('login-error', '');

        if (!username || !password) {
            showAuthError(
                'login-error',
                'Введите имя пользователя и пароль.'
            );
            return;
        }

        const accounts = getAccounts();
        const account = accounts[username];

        if (!account) {
            showAuthError(
                'login-error',
                'Пользователь не найден. Сначала зарегистрируйтесь.'
            );
            return;
        }

        /*
         * Поддерживаем старые аккаунты,
         * где пароль хранится в поле password.
         */
        if (
            typeof account.password === 'string' &&
            account.password !== password
        ) {
            showAuthError(
                'login-error',
                'Неверный пароль.'
            );
            return;
        }

        /*
         * Сохраняем обе версии сессии.
         */
        localStorage.setItem(
            'neuro_current_user',
            username
        );

        localStorage.setItem(
            'neurochat_current_user',
            username
        );

        if (typeof setCurrentUser === 'function') {
            setCurrentUser(username);
        }

        /*
         * Передаём пользователя основной системе.
         */
        if (
            typeof CORE.initializeNeuroChat ===
            'function'
        ) {
            CORE.initializeNeuroChat();
        }

        const loginScreen =
            getElement('login-screen');

        const app =
            getElement('app');

        if (loginScreen) {
            loginScreen.style.display = 'none';
        }

        if (app) {
            app.style.display = 'flex';
        }

        showAuthError('login-error', '');

        showNotice(
            `Добро пожаловать, ${username}!`,
            'success'
        );
    };


    /*
     * Выход.
     */
    window.logout = function logoutFixed() {
        try {
            if (
                typeof saveCurrentChat ===
                'function'
            ) {
                saveCurrentChat();
            }
        } catch {}

        localStorage.removeItem(
            'neuro_current_user'
        );

        localStorage.removeItem(
            'neurochat_current_user'
        );

        const app =
            getElement('app');

        const loginScreen =
            getElement('login-screen');

        if (app) {
            app.style.display = 'none';
        }

        if (loginScreen) {
            loginScreen.style.display = 'flex';
        }

        const username =
            getElement('username');

        const password =
            getElement('password');

        if (username) {
            username.value = '';
        }

        if (password) {
            password.value = '';
        }

        window.showLogin();

        showNotice(
            'Вы вышли из аккаунта.',
            'success'
        );
    };


    /* =====================================================
       SIDEBAR
       ===================================================== */

    window.toggleSidebar = function toggleSidebarFixed() {
        const sidebar =
            getElement('sidebar') ||
            document.querySelector('.sidebar');

        if (!sidebar) {
            return;
        }

        sidebar.classList.toggle('open');
    };


    /* =====================================================
       НАВИГАЦИЯ
       ===================================================== */

    function switchSectionFixed(sectionId) {
        if (!sectionId) {
            return;
        }

        const sections =
            document.querySelectorAll(
                '.app-section'
            );

        sections.forEach(section => {
            section.classList.remove('active');

            section.style.display = 'none';
        });

        const target =
            getElement(sectionId);

        if (target) {
            target.classList.add('active');

            /*
             * Чат и code используют flex.
             * Остальные страницы тоже нормально
             * показываем через flex.
             */
            target.style.display = 'flex';
        }

        document
            .querySelectorAll('.nav-item')
            .forEach(item => {
                item.classList.toggle(
                    'active',
                    item.dataset.section === sectionId
                );
            });

        if (
            window.innerWidth <= 800
        ) {
            const sidebar =
                getElement('sidebar');

            sidebar?.classList.remove('open');
        }
    }


    window.switchSection =
        switchSectionFixed;


    function setupNavigationFixed() {
        document
            .querySelectorAll('.nav-item')
            .forEach(item => {
                if (item.dataset.neuroFixed) {
                    return;
                }

                item.dataset.neuroFixed = '1';

                item.addEventListener(
                    'click',
                    event => {
                        event.preventDefault();

                        const section =
                            item.dataset.section;

                        switchSectionFixed(
                            section
                        );
                    }
                );
            });
    }


    /* =====================================================
       ИСТОРИЯ ЧАТОВ
       ===================================================== */

    function renderHistoryFixed() {
        /*
         * Основной контейнер в текущем index.html:
         * #recent-chats
         */
        const recent =
            getElement('recent-chats');

        const pinned =
            getElement('pinned-chats');

        if (
            !recent &&
            !pinned
        ) {
            return;
        }

        let chats = [];

        try {
            chats =
                typeof getChats === 'function'
                    ? getChats()
                    : [];
        } catch {
            chats = [];
        }

        const query =
            String(
                getElement('chat-search')?.value ||
                ''
            )
                .trim()
                .toLowerCase();

        if (query) {
            chats = chats.filter(chat =>
                String(chat.title || '')
                    .toLowerCase()
                    .includes(query)
            );
        }

        chats.sort((a, b) => {
            if (
                Boolean(a.pinned) !==
                Boolean(b.pinned)
            ) {
                return a.pinned ? -1 : 1;
            }

            return (
                Number(b.updatedAt || 0) -
                Number(a.updatedAt || 0)
            );
        });

        const pinnedChats =
            chats.filter(chat =>
                Boolean(chat.pinned)
            );

        const recentChats =
            chats.filter(chat =>
                !chat.pinned
            );

        function render(container, list) {
            if (!container) {
                return;
            }

            container.innerHTML = '';

            if (!list.length) {
                const empty =
                    document.createElement('div');

                empty.className =
                    'chat-history-empty';

                empty.textContent =
                    'Пока нет чатов';

                container.appendChild(
                    empty
                );

                return;
            }

            list.forEach(chat => {
                const item =
                    document.createElement('div');

                item.className =
                    'chat-item';

                if (
                    typeof currentChatId !==
                    'undefined' &&
                    chat.id === currentChatId
                ) {
                    item.classList.add(
                        'active'
                    );
                }

                item.textContent =
                    chat.title ||
                    'Новый чат';

                item.title =
                    chat.title ||
                    'Новый чат';

                item.addEventListener(
                    'click',
                    () => {
                        if (
                            typeof CORE.openChat ===
                            'function'
                        ) {
                            CORE.openChat(
                                chat.id
                            );
                        }
                    }
                );

                container.appendChild(
                    item
                );
            });
        }

        render(
            pinned,
            pinnedChats
        );

        render(
            recent,
            recentChats
        );
    }


    window.renderChatHistory =
        renderHistoryFixed;


    /* =====================================================
       ПОИСК
       ===================================================== */

    function setupSearchFixed() {
        const input =
            getElement('chat-search');

        if (!input) {
            return;
        }

        if (input.dataset.neuroSearchFixed) {
            return;
        }

        input.dataset.neuroSearchFixed =
            '1';

        input.addEventListener(
            'input',
            () => {
                renderHistoryFixed();
            }
        );
    }


    /* =====================================================
       QUICK PROMPTS
       ===================================================== */

    window.quickPrompt =
        function quickPromptFixed(text) {
            const input =
                getElement('user-input');

            if (!input) {
                return;
            }

            input.value =
                String(text || '').trim();

            if (
                typeof CORE.resizeInput ===
                'function'
            ) {
                CORE.resizeInput();
            }

            input.focus();

            /*
             * Быстрые кнопки действительно отправляют
             * сообщение, а не просто меняют поле.
             */
            if (input.value) {
                window.sendMessage();
            }
        };


    /* =====================================================
       ОТПРАВКА
       ===================================================== */

    /*
     * Возвращаем настоящую AI-отправку из script.js.
     */
    if (
        typeof CORE.sendMessage ===
        'function'
    ) {
        window.sendMessage =
            CORE.sendMessage;
    }


    /* =====================================================
       НОВЫЙ ЧАТ
       ===================================================== */

    if (
        typeof CORE.newChat ===
        'function'
    ) {
        window.newChat =
            CORE.newChat;
    }


    /* =====================================================
       ОЧИСТКА
       ===================================================== */

    if (
        typeof CORE.clearChat ===
        'function'
    ) {
        window.clearChat =
            CORE.clearChat;
    }


    /* =====================================================
       ОСТАНОВКА ГЕНЕРАЦИИ
       ===================================================== */

    if (
        typeof CORE.stopGeneration ===
        'function'
    ) {
        window.stopGeneration =
            CORE.stopGeneration;
    }


    /* =====================================================
       ФАЙЛЫ
       ===================================================== */

    window.toggleAttach =
        function toggleAttachFixed() {
            const menu =
                getElement('attach-menu');

            if (!menu) {
                return;
            }

            const hidden =
                menu.style.display === 'none' ||
                getComputedStyle(menu).display ===
                    'none';

            menu.style.display =
                hidden
                    ? 'block'
                    : 'none';
        };


    window.attachType =
        function attachTypeFixed(type) {
            const menu =
                getElement('attach-menu');

            if (menu) {
                menu.style.display =
                    'none';
            }

            /*
             * Используем существующий picker
             * из основного script.js.
             */
            if (
                typeof CORE.openFilePicker ===
                'function'
            ) {
                CORE.openFilePicker(type);
                return;
            }

            const ids = {
                file: 'file-input',
                photo: 'photo-input',
                camera: 'camera-input'
            };

            const input =
                getElement(ids[type]);

            input?.click();
        };


    /* =====================================================
       API KEY
       ===================================================== */

    window.saveApiKey =
        function saveApiKeyFixed() {
            const input =
                getElement('api-key');

            if (!input) {
                return;
            }

            const key =
                input.value.trim();

            /*
             * Используем тот же storage,
             * который уже использует script.js.
             */
            if (
                typeof getUserStorageKey ===
                'function'
            ) {
                const storageKey =
                    getUserStorageKey(
                        'api_key'
                    );

                if (key) {
                    localStorage.setItem(
                        storageKey,
                        key
                    );
                } else {
                    localStorage.removeItem(
                        storageKey
                    );
                }
            }

            /*
             * Обновляем поле основного интерфейса,
             * если оно существует.
             */
            const hiddenInput =
                getElement('api-key-input');

            if (hiddenInput) {
                hiddenInput.value = key;
            }

            if (
                typeof refreshActiveApiKey ===
                'function'
            ) {
                refreshActiveApiKey();
            }

            if (
                typeof updateApiKeyStatus ===
                'function'
            ) {
                updateApiKeyStatus();
            }

            const status =
                getElement('api-key-status');

            if (status) {
                status.textContent =
                    key
                        ? 'Ваш API-ключ сохранён.'
                        : 'Используется основной API-ключ.';
            }

            showNotice(
                key
                    ? 'API-ключ сохранён.'
                    : 'Пользовательский API-ключ удалён.',
                'success'
            );
        };


    /* =====================================================
       МОДЕЛЬ
       ===================================================== */

    function setupModelSelect() {
        const select =
            getElement('model');

        if (!select) {
            return;
        }

        if (select.dataset.neuroModelFixed) {
            return;
        }

        select.dataset.neuroModelFixed =
            '1';

        select.addEventListener(
            'change',
            () => {
                if (
                    typeof selectedModel !==
                    'undefined'
                ) {
                    selectedModel =
                        select.value;
                }

                if (
                    typeof getSettings ===
                    'function' &&
                    typeof saveSettings ===
                    'function'
                ) {
                    const settings =
                        getSettings();

                    settings.model =
                        select.value;

                    saveSettings(
                        settings
                    );
                }
            }
        );
    }


    /* =====================================================
       ТЕМА
       ===================================================== */

    window.changeTheme =
        function changeThemeFixed(theme) {
            const value =
                typeof theme === 'string'
                    ? theme
                    : getElement(
                        'theme-select'
                    )?.value || 'dark';

            if (
                typeof applyTheme ===
                'function'
            ) {
                applyTheme(value);
            } else {
                document.documentElement
                    .dataset.theme =
                    value;
            }

            if (
                typeof getSettings ===
                'function' &&
                typeof saveSettings ===
                'function'
            ) {
                const settings =
                    getSettings();

                settings.theme =
                    value;

                saveSettings(
                    settings
                );
            }
        };


    /* =====================================================
       КОДОВЫЙ РЕЖИМ
       ===================================================== */

    window.openCodeMode =
        function openCodeModeFixed() {
            switchSectionFixed(
                'code-section'
            );

            if (
                typeof loadCodeFile ===
                'function'
            ) {
                loadCodeFile();
            }
        };


    /* =====================================================
       ПОДДЕРЖКА
       ===================================================== */

    if (
        typeof CORE.openSupport ===
        'function'
    ) {
        window.openSupport =
            CORE.openSupport;
    }

    if (
        typeof CORE.closeSupport ===
        'function'
    ) {
        window.closeSupport =
            CORE.closeSupport;
    }


    /* =====================================================
       НАСТРОЙКИ
       ===================================================== */

    if (
        typeof CORE.openSettings ===
        'function'
    ) {
        window.openSettings =
            CORE.openSettings;
    }

    if (
        typeof CORE.closeSettings ===
        'function'
    ) {
        window.closeSettings =
            CORE.closeSettings;
    }


    /* =====================================================
       ПОСЛЕ ПОЛНОЙ ЗАГРУЗКИ DOM
       ===================================================== */

    document.addEventListener(
        'DOMContentLoaded',
        () => {
            /*
             * В этот момент inline JS из index.html
             * уже выполнен.
             *
             * Теперь возвращаем основной API.
             */

            if (
                typeof CORE.addMessage ===
                'function'
            ) {
                window.addMessage =
                    CORE.addMessage;
            }

            if (
                typeof CORE.renderMessages ===
                'function'
            ) {
                window.renderMessages =
                    CORE.renderMessages;
            }

            if (
                typeof CORE.requestAssistantResponse ===
                'function'
            ) {
                window.requestAssistantResponse =
                    CORE.requestAssistantResponse;
            }

            if (
                typeof CORE.newChat ===
                'function'
            ) {
                window.newChat =
                    CORE.newChat;
            }

            if (
                typeof CORE.clearChat ===
                'function'
            ) {
                window.clearChat =
                    CORE.clearChat;
            }

            if (
                typeof CORE.sendMessage ===
                'function'
            ) {
                window.sendMessage =
                    CORE.sendMessage;
            }

            if (
                typeof CORE.stopGeneration ===
                'function'
            ) {
                window.stopGeneration =
                    CORE.stopGeneration;
            }

            if (
                typeof CORE.deleteChat ===
                'function'
            ) {
                window.deleteChat =
                    CORE.deleteChat;
            }

            if (
                typeof CORE.openChat ===
                'function'
            ) {
                window.openChat =
                    CORE.openChat;
            }

            /*
             * Авторизация всегда должна использовать
             * текущие ID из index.html.
             */
            window.showLogin();
            window.showRegister();

            /*
             * После этого показываем правильную
             * форму входа.
             */
            const savedUser =
                localStorage.getItem(
                    'neurochat_current_user'
                ) ||
                localStorage.getItem(
                    'neuro_current_user'
                );

            if (savedUser) {
                const username =
                    normalizeUsername(
                        savedUser
                    );

                localStorage.setItem(
                    'neurochat_current_user',
                    username
                );

                localStorage.setItem(
                    'neuro_current_user',
                    username
                );

                if (
                    typeof setCurrentUser ===
                    'function'
                ) {
                    setCurrentUser(
                        username
                    );
                }

                const loginScreen =
                    getElement(
                        'login-screen'
                    );

                const app =
                    getElement('app');

                if (loginScreen) {
                    loginScreen.style.display =
                        'none';
                }

                if (app) {
                    app.style.display =
                        'flex';
                }

                /*
                 * Загружаем историю и настройки
                 * основной системой.
                 */
                if (
                    typeof CORE.initializeNeuroChat ===
                    'function'
                ) {
                    CORE.initializeNeuroChat();
                }
            } else {
                const loginScreen =
                    getElement(
                        'login-screen'
                    );

                const app =
                    getElement('app');

                if (loginScreen) {
                    loginScreen.style.display =
                        'flex';
                }

                if (app) {
                    app.style.display =
                        'none';
                }

                window.showLogin();
            }

            /*
             * Навигация.
             */
            setupNavigationFixed();

            /*
             * Поиск чатов.
             */
            setupSearchFixed();

            /*
             * Выбор модели.
             */
            setupModelSelect();

            /*
             * Исправляем отображение секций.
             */
            const active =
                document.querySelector(
                    '.nav-item.active'
                );

            switchSectionFixed(
                active?.dataset.section ||
                'chat-section'
            );

            /*
             * Кнопка меню.
             */
            const menu =
                document.querySelector(
                    '.menu-btn'
                );

            if (menu &&
                !menu.dataset.neuroMenuFixed) {

                menu.dataset.neuroMenuFixed =
                    '1';

                menu.addEventListener(
                    'click',
                    event => {
                        event.preventDefault();
                        window.toggleSidebar();
                    }
                );
            }

            /*
             * Resize input.
             */
            const input =
                getElement('user-input');

            if (input &&
                typeof CORE.resizeInput ===
                    'function') {

                CORE.resizeInput();
            }

            /*
             * Скрываем attach menu при
             * клике вне него.
             */
            document.addEventListener(
                'click',
                event => {
                    const menu =
                        getElement(
                            'attach-menu'
                        );

                    const button =
                        document.querySelector(
                            '.attach-btn'
                        );

                    if (
                        !menu ||
                        !button
                    ) {
                        return;
                    }

                    if (
                        !menu.contains(
                            event.target
                        ) &&
                        !button.contains(
                            event.target
                        )
                    ) {
                        menu.style.display =
                            'none';
                    }
                }
            );

            /*
             * Показываем историю.
             */
            renderHistoryFixed();
        }
    );

})();