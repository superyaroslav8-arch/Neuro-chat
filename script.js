'use strict';

/*
 * NEURO-CHAT
 * Полная клиентская версия под текущий index.html
 *
 * server.js НЕ изменяется.
 * API-ключ НЕ хранится в браузере.
 */

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
let initialized = false;
let currentSearchQuery = '';

/* =========================================================
   DOM / UTILS
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
        .slice(2, 9)}`;
}

function storageKey(name) {
    return `${STORAGE_PREFIX}${name}`;
}

function userKey(name) {
    return currentUser
        ? `${STORAGE_PREFIX}${currentUser}_${name}`
        : storageKey(name);
}

function parseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function notify(message, type = 'info') {
    const container = $('#toast-container');

    if (!container) {
        console.log(`[${type}] ${message}`);
        return;
    }

    const toast = document.createElement('div');

    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');

        setTimeout(() => {
            toast.remove();
        }, 250);
    }, 2800);
}

/* =========================================================
   AUTH
========================================================= */

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

function getCurrentUser() {
    return localStorage.getItem(
        storageKey('current_user')
    ) || '';
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

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
}

function showLogin() {
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');

    if (loginForm) {
        loginForm.classList.remove('hidden');
        loginForm.style.display = '';
    }

    if (registerForm) {
        registerForm.classList.add('hidden');
        registerForm.style.display = 'none';
    }

    const message = $('#auth-message');

    if (message) {
        message.textContent = '';
    }
}

function showRegister() {
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');

    if (loginForm) {
        loginForm.classList.add('hidden');
        loginForm.style.display = 'none';
    }

    if (registerForm) {
        registerForm.classList.remove('hidden');
        registerForm.style.display = '';
    }

    const message = $('#auth-message');

    if (message) {
        message.textContent = '';
    }
}

function showAuthScreen() {
    const loginScreen = $('#login-screen');
    const mainApp = $('#main-app');

    if (mainApp) {
        mainApp.classList.add('hidden');

        mainApp.style.display = 'none';
        mainApp.style.visibility = 'hidden';
        mainApp.style.pointerEvents = 'none';
    }

    if (loginScreen) {
        loginScreen.classList.remove('hidden');

        loginScreen.style.display = 'flex';
        loginScreen.style.visibility = 'visible';
        loginScreen.style.pointerEvents = 'auto';
        loginScreen.style.position = 'fixed';
        loginScreen.style.inset = '0';
        loginScreen.style.zIndex = '99999';
    }
}

function showMainApplication() {
    const loginScreen = $('#login-screen');
    const mainApp = $('#main-app');

    /*
     * КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ:
     * login-screen полностью убирается из отображения,
     * а main-app принудительно включается.
     */

    if (loginScreen) {
        loginScreen.classList.add('hidden');

        loginScreen.style.display = 'none';
        loginScreen.style.visibility = 'hidden';
        loginScreen.style.pointerEvents = 'none';
        loginScreen.style.position = 'static';
    }

    if (mainApp) {
        mainApp.classList.remove('hidden');

        mainApp.style.display = 'flex';
        mainApp.style.visibility = 'visible';
        mainApp.style.pointerEvents = 'auto';
    }

    updateUserProfile();
}

function login(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const usernameInput = $('#username');
    const passwordInput = $('#password');

    const username = normalizeUsername(
        usernameInput?.value
    );

    const password = String(
        passwordInput?.value || ''
    );

    if (!username) {
        notify(
            'Введите имя пользователя.',
            'error'
        );

        usernameInput?.focus();

        return false;
    }

    if (!password) {
        notify(
            'Введите пароль.',
            'error'
        );

        passwordInput?.focus();

        return false;
    }

    const users = getUsers();

    if (!users[username]) {
        notify(
            'Пользователь не найден. Сначала создайте аккаунт.',
            'error'
        );

        return false;
    }

    if (users[username].password !== password) {
        notify(
            'Неверный пароль.',
            'error'
        );

        return false;
    }

    /*
     * Сохраняем сессию ДО показа приложения.
     */
    currentUser = username;

    setCurrentUser(username);

    showMainApplication();

    initializeApplication();

    notify(
        'Вход выполнен.',
        'success'
    );

    return false;
}

function register(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const usernameInput =
        $('#register-username');

    const passwordInput =
        $('#register-password');

    const confirmInput =
        $('#register-password-confirm');

    const username = normalizeUsername(
        usernameInput?.value
    );

    const password = String(
        passwordInput?.value || ''
    );

    const confirmPassword = String(
        confirmInput?.value || ''
    );

    if (!username) {
        notify(
            'Введите имя пользователя.',
            'error'
        );

        usernameInput?.focus();

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

    if (password !== confirmPassword) {
        notify(
            'Пароли не совпадают.',
            'error'
        );

        confirmInput?.focus();

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

    showMainApplication();

    initializeApplication();

    notify(
        'Аккаунт успешно создан.',
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

    const username = $('#username');
    const password = $('#password');

    if (username) {
        username.value = '';
    }

    if (password) {
        password.value = '';
    }

    clearAttachedFiles();

    showAuthScreen();
    showLogin();

    notify(
        'Вы вышли из аккаунта.',
        'success'
    );
}

function restoreSession() {
    const savedUser = getCurrentUser();

    if (!savedUser) {
        showAuthScreen();
        showLogin();
        return false;
    }

    const users = getUsers();

    /*
     * Если в localStorage осталась повреждённая
     * сессия — удаляем её.
     */
    if (!users[savedUser]) {
        setCurrentUser('');
        showAuthScreen();
        showLogin();
        return false;
    }

    currentUser = savedUser;

    showMainApplication();

    initializeApplication();

    return true;
}

function updateUserProfile() {
    if (!currentUser) {
        return;
    }

    const username =
        $('#sidebar-username');

    const avatar =
        $('#user-avatar');

    if (username) {
        username.textContent =
            currentUser;
    }

    if (avatar) {
        avatar.textContent =
            currentUser
                .charAt(0)
                .toUpperCase();
    }
}

/* =========================================================
   SETTINGS
========================================================= */

function getSettings() {
    return parseJSON(
        localStorage.getItem(
            userKey('settings')
        ),
        {}
    );
}

function saveSettings(settings) {
    localStorage.setItem(
        userKey('settings'),
        JSON.stringify(settings)
    );
}

function modelFromUI(value) {
    switch (value) {
        case 'fast':
            return 'gpt-4o-mini';

        case 'smart':
            return 'gpt-4o';

        case 'default':
        default:
            return DEFAULT_MODEL;
    }
}

function modelToUI(model) {
    if (model === 'gpt-4o') {
        return 'smart';
    }

    return model === 'gpt-4o-mini'
        ? 'fast'
        : 'default';
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

    const model = $('#model');

    if (model) {
        model.value =
            modelToUI(selectedModel);
    }

    const theme = $('#theme');

    if (theme) {
        theme.value =
            settings.theme ||
            'dark';
    }

    const temporary =
        $('#temporary-chat');

    if (temporary) {
        temporary.checked =
            temporaryChat;
    }

    const siteBuilder =
        $('#site-builder-mode');

    if (siteBuilder) {
        siteBuilder.checked =
            siteBuilderMode;
    }

    applyTheme(
        settings.theme ||
        'dark'
    );
}

function saveAllSettings() {
    const model = $('#model');
    const theme = $('#theme');
    const temporary = $('#temporary-chat');
    const siteBuilder = $('#site-builder-mode');

    if (model) {
        selectedModel =
            modelFromUI(model.value);
    }

    if (temporary) {
        temporaryChat =
            temporary.checked;
    }

    if (siteBuilder) {
        siteBuilderMode =
            siteBuilder.checked;
    }

    saveSettings({
        model: selectedModel,
        theme:
            theme?.value ||
            'dark',
        temporaryChat,
        siteBuilderMode
    });

    applyTheme(
        theme?.value ||
        'dark'
    );

    closeModal('settings');

    notify(
        'Настройки сохранены.',
        'success'
    );
}

function saveApiKey() {
    /*
     * API-ключ намеренно не сохраняется.
     * Серверная часть должна использовать
     * переменную окружения.
     */
    notify(
        'API-ключ управляется сервером Neuro-chat.',
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
    } else if (theme === 'system') {
        document.body.classList.toggle(
            'light-theme',
            window.matchMedia &&
            window.matchMedia(
                '(prefers-color-scheme: light)'
            ).matches
        );
    } else {
        document.body.classList.remove(
            'light-theme'
        );
    }
}

function openSettings() {
    loadSettings();
    openModal('settings');
}

function closeSettings() {
    closeModal('settings');
}

/* =========================================================
   MODALS
========================================================= */

function openModal(name) {
    const modal =
        $(`#${name}-modal`);

    if (!modal) {
        return;
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeModal(name) {
    const modal =
        $(`#${name}-modal`);

    if (!modal) {
        return;
    }

    modal.classList.add('hidden');
    modal.style.display = 'none';
}

function closeSupport() {
    closeModal('support');
}

function openSupport() {
    openModal('support');
}

/* =========================================================
   CHATS
========================================================= */

function getChats() {
    return parseJSON(
        localStorage.getItem(
            userKey('chats')
        ),
        []
    );
}

function saveChats(chats) {
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

    return clean.length > 45
        ? `${clean.slice(0, 45)}…`
        : clean;
}

function saveCurrentChat() {
    if (
        !currentUser ||
        !currentChatId ||
        temporaryChat ||
        !messages.length
    ) {
        return;
    }

    const chats = getChats();

    const existingIndex =
        chats.findIndex(
            chat =>
                chat.id === currentChatId
        );

    const firstUserMessage =
        messages.find(
            message =>
                message.role === 'user'
        );

    const oldChat =
        existingIndex >= 0
            ? chats[existingIndex]
            : null;

    const chat = {
        id: currentChatId,
        title:
            oldChat?.title ||
            createChatTitle(
                firstUserMessage?.content
            ),
        messages: messages.slice(),
        createdAt:
            oldChat?.createdAt ||
            Date.now(),
        updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
        chats[existingIndex] = chat;
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

    $('#current-chat-title')
        ?.replaceChildren(
            document.createTextNode(
                'Новый чат'
            )
        );

    renderMessages();

    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display = '';
    }

    updateChatCount();
    renderChatHistory();

    $('#user-input')?.focus();
}

function clearChat() {
    messages = [];

    renderMessages();

    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display = '';
    }

    saveCurrentChat();
}

function selectChat(id) {
    const chats = getChats();

    const chat = chats.find(
        item =>
            item.id === id
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

    const title =
        $('#current-chat-title');

    if (title) {
        title.textContent =
            chat.title ||
            'Новый чат';
    }

    renderMessages();

    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display =
            messages.length
                ? 'none'
                : '';
    }

    renderChatHistory();

    closeSidebarMobile();
}

function deleteChat(id, event) {
    event?.stopPropagation();

    const chats =
        getChats().filter(
            chat =>
                chat.id !== id
        );

    saveChats(chats);

    if (currentChatId === id) {
        currentChatId = null;
        messages = [];
        newChat();
    }

    renderChatHistory();
    updateChatCount();
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

        chats =
            chats.filter(
                chat =>
                    String(
                        chat.title || ''
                    )
                        .toLowerCase()
                        .includes(query)
            );
    }

    container.innerHTML = '';

    chats.forEach(chat => {
        const item =
            document.createElement('button');

        item.type = 'button';
        item.className =
            'chat-history-item';

        if (
            chat.id ===
            currentChatId
        ) {
            item.classList.add('active');
        }

        const title =
            document.createElement('span');

        title.textContent =
            chat.title ||
            'Новый чат';

        const remove =
            document.createElement('span');

        remove.className =
            'chat-delete';

        remove.textContent = '×';

        remove.addEventListener(
            'click',
            event =>
                deleteChat(
                    chat.id,
                    event
                )
        );

        item.appendChild(title);
        item.appendChild(remove);

        item.addEventListener(
            'click',
            () =>
                selectChat(
                    chat.id
                )
        );

        container.appendChild(item);
    });

    updateChatCount();
}

function updateChatCount() {
    const counter =
        $('#chat-count');

    if (counter) {
        counter.textContent =
            String(
                getChats().length
            );
    }
}

function searchChats(value) {
    currentSearchQuery =
        String(value || '')
            .trim();

    renderChatHistory();
}

/* =========================================================
   MESSAGES
========================================================= */

function formatMessage(text) {
    let value =
        escapeHTML(text);

    value =
        value.replace(
            /```([\s\S]*?)```/g,
            '<pre><code>$1</code></pre>'
        );

    value =
        value.replace(
            /\*\*(.*?)\*\*/g,
            '<strong>$1</strong>'
        );

    value =
        value.replace(
            /`([^`]+)`/g,
            '<code>$1</code>'
        );

    value =
        value.replace(
            /\n/g,
            '<br>'
        );

    return value;
}

function renderMessages() {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    messages.forEach(
        message =>
            addMessageToDOM(
                message
            )
    );

    scrollMessages();
}

function addMessageToDOM(message) {
    const container =
        $('#messages');

    if (!container) {
        return;
    }

    const wrapper =
        document.createElement('div');

    wrapper.className =
        `message ${
            message.role === 'user'
                ? 'user-message'
                : 'assistant-message'
        }`;

    const bubble =
        document.createElement('div');

    bubble.className =
        'message-bubble';

    bubble.innerHTML =
        formatMessage(
            message.content
        );

    wrapper.appendChild(
        bubble
    );

    container.appendChild(
        wrapper
    );
}

function scrollMessages() {
    const container =
        $('#messages-container');

    if (!container) {
        return;
    }

    requestAnimationFrame(() => {
        container.scrollTop =
            container.scrollHeight;
    });
}

function quickPrompt(text) {
    const input =
        $('#user-input');

    if (!input) {
        return;
    }

    input.value = text;

    updateComposerState();

    input.focus();
}

function updateComposerState() {
    const input =
        $('#user-input');

    const button =
        $('#send-button');

    const counter =
        $('#char-counter');

    const length =
        input?.value.length || 0;

    if (button) {
        button.disabled =
            !length &&
            attachedFiles.length === 0;
    }

    if (counter) {
        counter.textContent =
            `${length} / 20000`;
    }
}

/* =========================================================
   AI
========================================================= */

async function callAI() {
    const context =
        messages
            .slice(-MAX_CONTEXT_MESSAGES)
            .map(message => ({
                role: message.role,
                content: message.content
            }));

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
                    model:
                        selectedModel ||
                        DEFAULT_MODEL,

                    messages:
                        context,

                    temperature: 0.7,

                    max_tokens: 8192
                }),

                signal:
                    abortController?.signal
            }
        );

    const data =
        await response.json()
            .catch(() => null);

    if (!response.ok) {
        throw new Error(
            data?.error ||
            'Ошибка AI-сервера.'
        );
    }

    if (!data?.message) {
        throw new Error(
            'AI не вернул ответ.'
        );
    }

    return data.message;
}

async function sendMessage(event) {
    event?.preventDefault();

    if (isGenerating) {
        return;
    }

    if (!currentUser) {
        notify(
            'Сначала войдите в аккаунт.',
            'error'
        );

        showAuthScreen();

        return;
    }

    const input =
        $('#user-input');

    if (!input) {
        return;
    }

    const text =
        input.value.trim();

    if (
        !text &&
        !attachedFiles.length
    ) {
        return;
    }

    if (!currentChatId) {
        currentChatId =
            createId('chat');
    }

    const userMessage = {
        id: createId('message'),
        role: 'user',
        content:
            text ||
            'Отправлены файлы.',
        createdAt: Date.now()
    };

    if (attachedFiles.length) {
        userMessage.attachments =
            attachedFiles.map(
                file => ({
                    name: file.name,
                    type: file.type,
                    size: file.size
                })
            );
    }

    messages.push(
        userMessage
    );

    input.value = '';

    clearAttachedFiles();
    updateComposerState();

    const welcome =
        $('#welcome-screen');

    if (welcome) {
        welcome.style.display =
            'none';
    }

    renderMessages();

    isGenerating = true;

    setConnectionStatus(
        '● Генерация…'
    );

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
                'Пустой ответ.',
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
                `⚠️ ${error?.message || 'Не удалось получить ответ.'}`,
            createdAt: Date.now()
        });

        renderMessages();

    } finally {
        hideTypingIndicator();

        isGenerating = false;
        abortController = null;

        setConnectionStatus(
            '● Готов'
        );

        updateComposerState();
    }
}

function stopGeneration() {
    abortController?.abort();

    abortController = null;
    isGenerating = false;

    hideTypingIndicator();

    setConnectionStatus(
        '● Готов'
    );
}

function setConnectionStatus(text) {
    const element =
        $('#connection-status');

    if (element) {
        element.textContent =
            text;
    }
}

function showTypingIndicator() {
    const indicator =
        $('#typing-indicator');

    if (indicator) {
        indicator.classList.remove(
            'hidden'
        );
    }
}

function hideTypingIndicator() {
    const indicator =
        $('#typing-indicator');

    if (indicator) {
        indicator.classList.add(
            'hidden'
        );
    }
}

/* =========================================================
   ATTACHMENTS
========================================================= */

function toggleAttach() {
    const menu =
        $('#attach-menu');

    if (!menu) {
        return;
    }

    menu.classList.toggle(
        'hidden'
    );
}

function attachType(type) {
    const inputMap = {
        file: '#file-input',
        photo: '#photo-input',
        camera: '#camera-input',
        model: '#model-file-input'
    };

    $('#attach-menu')
        ?.classList.add('hidden');

    const input =
        $(inputMap[type]);

    input?.click();
}

function handleFiles(fileList) {
    if (!fileList) {
        return;
    }

    attachedFiles.push(
        ...Array.from(fileList)
    );

    renderAttachedFiles();
    updateComposerState();
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
                document.createElement('div');

            item.className =
                'attached-file';

            item.innerHTML = `
                <span>
                    ${escapeHTML(file.name)}
                </span>
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

            container.appendChild(
                item
            );
        }
    );
}

function removeAttachedFile(index) {
    attachedFiles.splice(
        index,
        1
    );

    renderAttachedFiles();
    updateComposerState();
}

function clearAttachedFiles() {
    attachedFiles = [];

    const container =
        $('#attached-files');

    if (container) {
        container.innerHTML = '';
    }

    updateComposerState();
}

/* =========================================================
   SIDEBAR / NAVIGATION
========================================================= */

function toggleSidebar() {
    const sidebar =
        $('#sidebar');

    const overlay =
        $('#sidebar-overlay');

    sidebar?.classList.toggle(
        'open'
    );

    overlay?.classList.toggle(
        'visible'
    );
}

function closeSidebarMobile() {
    $('#sidebar')
        ?.classList.remove('open');

    $('#sidebar-overlay')
        ?.classList.remove('visible');
}

function navigate(sectionName) {
    const sections =
        $$('.app-section');

    sections.forEach(section => {
        section.classList.remove(
            'active'
        );

        section.style.display =
            'none';
    });

    const section =
        document.getElementById(
            sectionName
        );

    if (section) {
        section.classList.add(
            'active'
        );

        section.style.display =
            '';
    }

    $$('.nav-item').forEach(item => {
        item.classList.toggle(
            'active',
            item.dataset.section ===
                sectionName
        );
    });

    closeSidebarMobile();
}

/* =========================================================
   PROJECTS
========================================================= */

function getProjects() {
    return parseJSON(
        localStorage.getItem(
            userKey('projects')
        ),
        []
    );
}

function saveProjects(projects) {
    localStorage.setItem(
        userKey('projects'),
        JSON.stringify(projects)
    );
}

function openProjectModal() {
    openModal('project');

    $('#project-name')?.focus();
}

function closeProjectModal() {
    closeModal('project');
}

function createProject() {
    openProjectModal();
}

function saveProjectFromForm(event) {
    event.preventDefault();

    const name =
        $('#project-name')?.value.trim();

    const description =
        $('#project-description')?.value.trim();

    if (!name) {
        notify(
            'Введите название проекта.',
            'error'
        );

        return;
    }

    const projects =
        getProjects();

    projects.unshift({
        id: createId('project'),
        name,
        description,
        createdAt: Date.now()
    });

    saveProjects(projects);

    $('#project-form')?.reset();

    closeProjectModal();

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
    const grid =
        $('#projects-grid');

    const empty =
        $('#projects-empty');

    if (!grid) {
        return;
    }

    const projects =
        getProjects();

    grid.innerHTML = '';

    if (!projects.length) {
        if (empty) {
            empty.style.display = '';
        }

        return;
    }

    if (empty) {
        empty.style.display =
            'none';
    }

    projects.forEach(project => {
        const card =
            document.createElement('article');

        card.className =
            'project-card';

        card.innerHTML = `
            <div class="project-card-content">
                <h3>${escapeHTML(project.name)}</h3>
                <p>${escapeHTML(project.description || 'Без описания')}</p>
            </div>
            <button type="button">Удалить</button>
        `;

        card
            .querySelector('button')
            .addEventListener(
                'click',
                () =>
                    deleteProject(
                        project.id
                    )
            );

        grid.appendChild(card);
    });
}

/* =========================================================
   SCHEDULED
========================================================= */

function getScheduledTasks() {
    return parseJSON(
        localStorage.getItem(
            userKey('scheduled')
        ),
        []
    );
}

function saveScheduledTasks(tasks) {
    localStorage.setItem(
        userKey('scheduled'),
        JSON.stringify(tasks)
    );
}

function openScheduledModal() {
    openModal('scheduled');
}

function createScheduledTask() {
    openScheduledModal();
}

function saveScheduledFromForm(event) {
    event.preventDefault();

    const title =
        $('#scheduled-title')
            ?.value.trim();

    const date =
        $('#scheduled-date')
            ?.value;

    const time =
        $('#scheduled-time')
            ?.value;

    if (!title || !date || !time) {
        notify(
            'Заполните все поля.',
            'error'
        );

        return;
    }

    const tasks =
        getScheduledTasks();

    tasks.unshift({
        id: createId('task'),
        title,
        date,
        time,
        createdAt: Date.now()
    });

    saveScheduledTasks(tasks);

    $('#scheduled-form')?.reset();

    closeModal('scheduled');

    renderScheduledTasks();

    notify(
        'Задача создана.',
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

    const empty =
        $('#scheduled-empty');

    if (!container) {
        return;
    }

    const tasks =
        getScheduledTasks();

    container.innerHTML = '';

    if (!tasks.length) {
        if (empty) {
            empty.style.display = '';
        }

        return;
    }

    if (empty) {
        empty.style.display =
            'none';
    }

    tasks.forEach(task => {
        const item =
            document.createElement('div');

        item.className =
            'scheduled-item';

        item.innerHTML = `
            <div>
                <strong>${escapeHTML(task.title)}</strong>
                <small>${escapeHTML(task.date)} ${escapeHTML(task.time)}</small>
            </div>
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
   LIBRARY
========================================================= */

function openLibraryUpload() {
    $('#file-input')?.click();
}

function renderLibrary() {
    /*
     * Файлы пока хранятся только как вложения
     * текущего браузера. Для настоящего облачного
     * хранилища потребуется R2/backend.
     */
}

/* =========================================================
   CODE STUDIO
========================================================= */

function openCodeMode() {
    openModal('code');
}

function closeCodeMode() {
    closeModal('code');
}

function selectCodeFile() {
    $('#code-file-input')?.click();
}

function loadCodeFile(event) {
    const file =
        event.target.files?.[0];

    if (!file) {
        return;
    }

    const reader =
        new FileReader();

    reader.onload = () => {
        const editor =
            $('#code-editor');

        if (editor) {
            editor.value =
                String(
                    reader.result || ''
                );
        }

        notify(
            'Файл открыт.',
            'success'
        );
    };

    reader.readAsText(file);

    event.target.value = '';
}

function runCode() {
    const editor =
        $('#code-editor');

    if (!editor) {
        return;
    }

    const preview =
        window.open(
            '',
            '_blank'
        );

    if (!preview) {
        notify(
            'Разрешите всплывающие окна для предпросмотра.',
            'error'
        );

        return;
    }

    preview.document.open();

    preview.document.write(
        editor.value
    );

    preview.document.close();
}

function openSitePreview() {
    const editor =
        $('#code-editor');

    const frame =
        $('#site-preview-frame');

    if (!editor || !frame) {
        return;
    }

    frame.srcdoc =
        editor.value;

    openModal(
        'site-preview'
    );
}

function closeSitePreview() {
    closeModal(
        'site-preview'
    );
}

async function askCodeAI() {
    const editor =
        $('#code-editor');

    if (!editor) {
        return;
    }

    const request =
        prompt(
            'Что нужно изменить в коде?'
        );

    if (!request?.trim()) {
        return;
    }

    const originalMessages =
        messages;

    messages = [
        {
            role: 'user',
            content:
                `Ты профессиональный разработчик.
Измени код по запросу пользователя.

Запрос:
${request}

Текущий код:
\`\`\`
${editor.value}
\`\`\`

Верни только готовый полный код без пояснений.`
        }
    ];

    try {
        const answer =
            await callAI();

        editor.value =
            answer.content ||
            editor.value;

        notify(
            'AI обновил код.',
            'success'
        );
    } catch (error) {
        notify(
            error.message,
            'error'
        );
    } finally {
        messages =
            originalMessages;
    }
}

/* =========================================================
   VOICE
========================================================= */

function startVoiceInput() {
    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        notify(
            'Голосовой ввод не поддерживается этим браузером.',
            'error'
        );

        return;
    }

    const recognition =
        new SpeechRecognition();

    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult =
        event => {
            const text =
                event.results?.[0]?.[0]?.transcript;

            if (text) {
                const input =
                    $('#user-input');

                if (input) {
                    input.value =
                        `${
                            input.value
                        }${input.value ? ' ' : ''}${text}`;

                    updateComposerState();
                }
            }
        };

    recognition.onerror =
        () => {
            notify(
                'Не удалось распознать речь.',
                'error'
            );
        };

    recognition.start();
}

/* =========================================================
   COPY
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
   EVENTS
========================================================= */

function setupEvents() {
    /*
     * AUTH
     */

    $('#login-form')
        ?.addEventListener(
            'submit',
            login
        );

    $('#register-form')
        ?.addEventListener(
            'submit',
            register
        );

    $('#show-register-button')
        ?.addEventListener(
            'click',
            showRegister
        );

    $('#show-login-button')
        ?.addEventListener(
            'click',
            showLogin
        );

    /*
     * CHAT
     */

    $('#new-chat-button')
        ?.addEventListener(
            'click',
            newChat
        );

    $('#clear-chat-button')
        ?.addEventListener(
            'click',
            clearChat
        );

    $('#send-button')
        ?.addEventListener(
            'click',
            sendMessage
        );

    $('#user-input')
        ?.addEventListener(
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

    $('#user-input')
        ?.addEventListener(
            'input',
            updateComposerState
        );

    /*
     * SEARCH
     */

    $('#chat-search')
        ?.addEventListener(
            'input',
            event =>
                searchChats(
                    event.target.value
                )
        );

    /*
     * ATTACHMENTS
     */

    $('#attach-button')
        ?.addEventListener(
            'click',
            toggleAttach
        );

    $$('[data-attach]')
        .forEach(button => {
            button.addEventListener(
                'click',
                () =>
                    attachType(
                        button.dataset.attach
                    )
            );
        });

    [
        '#file-input',
        '#photo-input',
        '#camera-input',
        '#model-file-input'
    ].forEach(selector => {
        $(selector)
            ?.addEventListener(
                'change',
                event => {
                    handleFiles(
                        event.target.files
                    );

                    event.target.value = '';
                }
            );
    });

    /*
     * SIDEBAR
     */

    $('#mobile-open-sidebar')
        ?.addEventListener(
            'click',
            toggleSidebar
        );

    $('#mobile-close-sidebar')
        ?.addEventListener(
            'click',
            closeSidebarMobile
        );

    $('#sidebar-overlay')
        ?.addEventListener(
            'click',
            closeSidebarMobile
        );

    /*
     * NAVIGATION
     */

    $$('.nav-item')
        .forEach(item => {
            item.addEventListener(
                'click',
                () =>
                    navigate(
                        item.dataset.section
                    )
            );
        });

    /*
     * SETTINGS
     */

    $('#open-settings-button')
        ?.addEventListener(
            'click',
            openSettings
        );

    $('#top-settings-button')
        ?.addEventListener(
            'click',
            openSettings
        );

    $('#save-settings-button')
        ?.addEventListener(
            'click',
            saveAllSettings
        );

    $('#cancel-settings-button')
        ?.addEventListener(
            'click',
            closeSettings
        );

    /*
     * SUPPORT
     */

    $('#open-support-button')
        ?.addEventListener(
            'click',
            openSupport
        );

    $('#close-support-button')
        ?.addEventListener(
            'click',
            closeSupport
        );

    /*
     * LOGOUT
     */

    $('#logout-button')
        ?.addEventListener(
            'click',
            logout
        );

    /*
     * PROJECTS
     */

    $('#create-project-button')
        ?.addEventListener(
            'click',
            createProject
        );

    $('#project-form')
        ?.addEventListener(
            'submit',
            saveProjectFromForm
        );

    /*
     * SCHEDULED
     */

    $('#create-scheduled-button')
        ?.addEventListener(
            'click',
            createScheduledTask
        );

    $('#scheduled-form')
        ?.addEventListener(
            'submit',
            saveScheduledFromForm
        );

    /*
     * CODE
     */

    $('#open-code-button')
        ?.addEventListener(
            'click',
            openCodeMode
        );

    $('#code-file-button')
        ?.addEventListener(
            'click',
            selectCodeFile
        );

    $('#run-code-button')
        ?.addEventListener(
            'click',
            runCode
        );

    $('#preview-site-button')
        ?.addEventListener(
            'click',
            openSitePreview
        );

    $('#ask-code-ai-button')
        ?.addEventListener(
            'click',
            askCodeAI
        );

    $('#code-file-input')
        ?.addEventListener(
            'change',
            loadCodeFile
        );

    /*
     * LIBRARY
     */

    $('#library-upload-button')
        ?.addEventListener(
            'click',
            openLibraryUpload
        );

    /*
     * VOICE
     */

    $('#voice-button')
        ?.addEventListener(
            'click',
            startVoiceInput
        );

    /*
     * MODALS
     */

    $$('[data-close-modal]')
        .forEach(element => {
            element.addEventListener(
                'click',
                () => {
                    closeModal(
                        element.dataset.closeModal
                    );
                }
            );
        });

    /*
     * PLUGINS
     */

    $$('.plugin-button')
        .forEach(button => {
            button.addEventListener(
                'click',
                () => {
                    const plugin =
                        button.dataset.plugin;

                    if (
                        plugin === 'code'
                    ) {
                        openCodeMode();
                    } else if (
                        plugin === 'web'
                    ) {
                        notify(
                            'Веб-поиск будет подключён через серверный модуль.',
                            'info'
                        );
                    } else if (
                        plugin === '3d'
                    ) {
                        notify(
                            '3D Studio готов к подключению.',
                            'info'
                        );
                    } else {
                        notify(
                            'Creative Studio готов к подключению.',
                            'info'
                        );
                    }
                }
            );
        });

    /*
     * QUICK PROMPTS
     */

    $$('.quick-prompt')
        .forEach(button => {
            button.addEventListener(
                'click',
                () =>
                    quickPrompt(
                        button.dataset.prompt
                    )
            );
        });

    /*
     * ESC
     */

    document.addEventListener(
        'keydown',
        event => {
            if (
                event.key === 'Escape'
            ) {
                if (isGenerating) {
                    stopGeneration();
                }

                closeSidebarMobile();
            }
        }
    );
}

/* =========================================================
   INITIALIZATION
========================================================= */

function initializeApplication() {
    if (initialized) {
        updateUserProfile();
        loadSettings();
        renderChatHistory();
        renderProjects();
        renderScheduledTasks();
        return;
    }

    initialized = true;

    updateUserProfile();
    loadSettings();

    setupEvents();

    renderChatHistory();
    renderProjects();
    renderScheduledTasks();

    const chats =
        getChats();

    if (
        chats.length &&
        !currentChatId
    ) {
        chats.sort(
            (a, b) =>
                b.updatedAt -
                a.updatedAt
        );

        selectChat(
            chats[0].id
        );
    } else if (!currentChatId) {
        newChat();
    }

    updateComposerState();
}

function initialize() {
    /*
     * Сначала восстанавливаем сессию.
     * Только после этого открываем приложение.
     */
    restoreSession();
}

/* =========================================================
   GLOBAL FUNCTIONS
   Для совместимости с другими частями проекта.
========================================================= */

window.login = login;
window.register = register;
window.logout = logout;

window.showLogin = showLogin;
window.showRegister = showRegister;

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

window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveApiKey = saveApiKey;
window.saveAllSettings =
    saveAllSettings;

window.openSupport = openSupport;
window.closeSupport = closeSupport;

window.createProject = createProject;
window.deleteProject = deleteProject;

window.createScheduledTask =
    createScheduledTask;

window.deleteScheduledTask =
    deleteScheduledTask;

window.openCodeMode = openCodeMode;
window.closeCodeMode = closeCodeMode;
window.selectCodeFile =
    selectCodeFile;

window.runCode = runCode;
window.openSitePreview =
    openSitePreview;

window.closeSitePreview =
    closeSitePreview;

window.askCodeAI = askCodeAI;

window.copyText = copyText;

window.navigate = navigate;
window.toggleSidebar =
    toggleSidebar;

/* =========================================================
   START
========================================================= */

document.addEventListener(
    'DOMContentLoaded',
    initialize,
    {
        once: true
    }
);

window.addEventListener(
    'beforeunload',
    () => {
        saveCurrentChat();
    }
);