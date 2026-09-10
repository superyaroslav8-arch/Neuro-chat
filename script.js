(() => {
  "use strict";

  /*
   * Нейро-чат
   * №3 — script.js
   *
   * Клиентская логика интерфейса.
   * API подключается через /api/... и будет реализовано
   * в серверных файлах проекта.
   */

  const API = {
    me: "/api/auth/me",
    login: "/api/auth/login",
    register: "/api/auth/register",
    logout: "/api/auth/logout",

    chats: "/api/chats",
    chat: "/api/chat",

    image: "/api/generate/image",
    video: "/api/generate/video"
  };

  const MODELS = {
    neuro: "Нейро",
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    grok: "Grok",
    "alice-1": "Алиса 1"
  };

  const state = {
    user: null,
    currentChatId: null,
    chats: [],
    selectedModel: "neuro",
    temporaryChat: false,
    isSending: false,
    authMode: "login"
  };

  const $ = (id) => document.getElementById(id);

  const elements = {
    app: $("app"),

    sidebar: $("sidebar"),
    newChatButton: $("newChatButton"),
    closeSidebarButton: $("closeSidebarButton"),
    openSidebarButton: $("openSidebarButton"),
    settingsButton: $("settingsButton"),
    profileButton: $("profileButton"),
    chatList: document.querySelector(".chat-list"),
    historyEmpty: $("historyEmpty"),

    brand: document.querySelector(".brand"),
    accountButton: $("accountButton"),

    homeScreen: $("homeScreen"),
    chatScreen: $("chatScreen"),

    composerForm: $("composerForm"),
    messageInput: $("messageInput"),
    sendButton: $("sendButton"),

    attachButton: $("attachButton"),
    fileInput: $("fileInput"),
    voiceButton: $("voiceButton"),

    modelButton: $("modelButton"),
    selectedModelLabel: $("selectedModelLabel"),
    modelMenu: $("modelMenu"),
    modelOptions: document.querySelectorAll(".model-option"),

    messages: $("messages"),

    chatComposerForm: $("chatComposerForm"),
    chatMessageInput: $("chatMessageInput"),
    chatSendButton: $("chatSendButton"),
    chatAttachButton: $("chatAttachButton"),
    chatFileInput: $("chatFileInput"),
    chatVoiceButton: $("chatVoiceButton"),
    chatModelButton: $("chatModelButton"),
    chatSelectedModelLabel: $("chatSelectedModelLabel"),

    authModal: $("authModal"),
    authTitle: $("authTitle"),
    authDescription: $("authDescription"),
    authForm: $("authForm"),
    authSubmitButton: $("authSubmitButton"),
    authError: $("authError"),

    loginTab: $("loginTab"),
    registerTab: $("registerTab"),

    usernameInput: $("usernameInput"),
    passwordInput: $("passwordInput"),
    confirmPasswordGroup: $("confirmPasswordGroup"),
    confirmPasswordInput: $("confirmPasswordInput"),

    settingsModal: $("settingsModal"),
    temporaryChatButton: $("temporaryChatButton"),
    temporaryChatState: $("temporaryChatState"),

    profileModal: $("profileModal"),
    profileUsername: $("profileUsername"),
    logoutButton: $("logoutButton"),

    toast: $("toast")
  };

  /* =========================================================
     ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
     ========================================================= */

  function isElement(element) {
    return element instanceof HTMLElement;
  }

  function showElement(element) {
    if (isElement(element)) {
      element.hidden = false;
    }
  }

  function hideElement(element) {
    if (isElement(element)) {
      element.hidden = true;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    if (!elements.toast) {
      return;
    }

    elements.toast.textContent = String(message || "");
    showElement(elements.toast);

    window.clearTimeout(showToast.timer);

    showToast.timer = window.setTimeout(() => {
      hideElement(elements.toast);
    }, 3000);
  }

  function setAuthError(message) {
    if (!elements.authError) {
      return;
    }

    elements.authError.textContent = String(message || "");

    if (message) {
      showElement(elements.authError);
    } else {
      hideElement(elements.authError);
    }
  }

  async function parseResponse(response) {
    const contentType =
      response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }

    const text = await response.text();

    return {
      message: text
    };
  }

  async function apiFetch(url, options = {}) {
    const requestOptions = {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, requestOptions);
    const data = await parseResponse(response);

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `Ошибка сервера: ${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }

  function setButtonLoading(button, loading, loadingText = "Загрузка…") {
    if (!button) {
      return;
    }

    if (loading) {
      button.dataset.originalText =
        button.textContent || "";

      button.textContent = loadingText;
      button.disabled = true;
      return;
    }

    button.disabled = false;

    if (button.dataset.originalText !== undefined) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }

  /* =========================================================
     МОБИЛЬНОЕ МЕНЮ
     ========================================================= */

  function openSidebar() {
    if (!elements.sidebar) {
      return;
    }

    elements.sidebar.classList.remove("is-hidden");
  }

  function closeSidebar() {
    if (!elements.sidebar) {
      return;
    }

    if (window.matchMedia("(max-width: 900px)").matches) {
      elements.sidebar.classList.add("is-hidden");
    }
  }

  /* =========================================================
     МОДАЛЬНЫЕ ОКНА
     ========================================================= */

  function openModal(modal) {
    if (!modal) {
      return;
    }

    showElement(modal);
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    hideElement(modal);

    const anyModalOpen = [
      elements.authModal,
      elements.settingsModal,
      elements.profileModal
    ].some((item) => item && !item.hidden);

    if (!anyModalOpen) {
      document.body.classList.remove("modal-open");
    }
  }

  function closeAllModals() {
    closeModal(elements.authModal);
    closeModal(elements.settingsModal);
    closeModal(elements.profileModal);
  }

  /* =========================================================
     АВТОРИЗАЦИЯ
     ========================================================= */

  function setAuthMode(mode) {
    state.authMode = mode === "register"
      ? "register"
      : "login";

    const isRegister = state.authMode === "register";

    if (elements.authTitle) {
      elements.authTitle.textContent = isRegister
        ? "Создать аккаунт"
        : "Войти в Нейро-чат";
    }

    if (elements.authDescription) {
      elements.authDescription.textContent = isRegister
        ? "Введите имя пользователя и пароль."
        : "Введите имя пользователя и пароль.";
    }

    if (elements.loginTab) {
      elements.loginTab.classList.toggle(
        "is-active",
        !isRegister
      );
      elements.loginTab.setAttribute(
        "aria-selected",
        String(!isRegister)
      );
    }

    if (elements.registerTab) {
      elements.registerTab.classList.toggle(
        "is-active",
        isRegister
      );
      elements.registerTab.setAttribute(
        "aria-selected",
        String(isRegister)
      );
    }

    if (elements.confirmPasswordGroup) {
      elements.confirmPasswordGroup.hidden = !isRegister;
    }

    if (elements.confirmPasswordInput) {
      elements.confirmPasswordInput.required = isRegister;
    }

    if (elements.passwordInput) {
      elements.passwordInput.autocomplete = isRegister
        ? "new-password"
        : "current-password";
    }

    if (elements.authSubmitButton) {
      elements.authSubmitButton.textContent = isRegister
        ? "Создать аккаунт"
        : "Войти";
    }

    setAuthError("");
  }

  function openAuth(mode = "login") {
    setAuthMode(mode);

    if (elements.authForm) {
      elements.authForm.reset();
    }

    setAuthMode(mode);
    openModal(elements.authModal);

    window.setTimeout(() => {
      elements.usernameInput?.focus();
    }, 50);
  }

  async function login(username, password) {
    const data = await apiFetch(API.login, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    state.user = data.user || null;

    updateAccountUI();
    closeModal(elements.authModal);

    return data;
  }

  async function register(username, password, confirmPassword) {
    if (password !== confirmPassword) {
      throw new Error("Пароли не совпадают.");
    }

    const data = await apiFetch(API.register, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    state.user = data.user || null;

    updateAccountUI();
    closeModal(elements.authModal);

    return data;
  }

  async function logout() {
    try {
      await apiFetch(API.logout, {
        method: "POST"
      });
    } catch {
      /*
       * Даже если серверная сессия уже недействительна,
       * локальное состояние всё равно очищаем.
       */
    }

    state.user = null;
    state.currentChatId = null;
    state.chats = [];

    updateAccountUI();
    renderChatList();
    showHomeScreen();

    closeAllModals();

    showToast("Вы вышли из аккаунта.");
  }

  async function restoreSession() {
    try {
      const data = await apiFetch(API.me, {
        method: "GET"
      });

      state.user = data.user || null;
    } catch {
      state.user = null;
    }

    updateAccountUI();
  }

  function updateAccountUI() {
    const username =
      state.user?.username ||
      state.user?.name ||
      "";

    if (elements.accountButton) {
      elements.accountButton.textContent =
        username || "Войти";
    }

    if (elements.profileUsername) {
      elements.profileUsername.textContent =
        username
          ? `Имя пользователя: ${username}`
          : "Вы не вошли.";
    }
  }

  /* =========================================================
     МОДЕЛЬ
     ========================================================= */

  function setSelectedModel(model) {
    if (!MODELS[model]) {
      model = "neuro";
    }

    state.selectedModel = model;

    const label = MODELS[model];

    if (elements.selectedModelLabel) {
      elements.selectedModelLabel.textContent = label;
    }

    if (elements.chatSelectedModelLabel) {
      elements.chatSelectedModelLabel.textContent = label;
    }

    elements.modelOptions?.forEach((option) => {
      const selected =
        option.dataset.model === model;

      option.classList.toggle(
        "is-selected",
        selected
      );

      option.setAttribute(
        "aria-selected",
        String(selected)
      );
    });

    closeModelMenu();
  }

  function openModelMenu() {
    if (!elements.modelMenu) {
      return;
    }

    showElement(elements.modelMenu);

    elements.modelButton?.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function closeModelMenu() {
    if (!elements.modelMenu) {
      return;
    }

    hideElement(elements.modelMenu);

    elements.modelButton?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function toggleModelMenu() {
    if (!elements.modelMenu) {
      return;
    }

    if (elements.modelMenu.hidden) {
      openModelMenu();
    } else {
      closeModelMenu();
    }
  }

  /* =========================================================
     ЭКРАНЫ
     ========================================================= */

  function showHomeScreen() {
    showElement(elements.homeScreen);
    hideElement(elements.chatScreen);

    elements.messageInput?.focus();
  }

  function showChatScreen() {
    hideElement(elements.homeScreen);
    showElement(elements.chatScreen);

    scrollMessagesToBottom();
    elements.chatMessageInput?.focus();
  }

  /* =========================================================
     ЧАТЫ
     ========================================================= */

  function createLocalChat(title = "Новый чат") {
    return {
      id: crypto.randomUUID(),
      title,
      localOnly: true,
      messages: []
    };
  }

  async function createServerChat(title = "Новый чат") {
    const data = await apiFetch(API.chats, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title
      })
    });

    return data.chat || data;
  }

  async function createNewChat() {
    state.currentChatId = null;

    clearMessages();
    showHomeScreen();

    if (elements.messageInput) {
      elements.messageInput.value = "";
    }

    if (elements.chatMessageInput) {
      elements.chatMessageInput.value = "";
    }

    closeSidebar();

    if (state.user && !state.temporaryChat) {
      try {
        const chat = await createServerChat("Новый чат");

        if (chat?.id) {
          state.currentChatId = chat.id;

          state.chats.unshift({
            ...chat,
            title: chat.title || "Новый чат"
          });

          renderChatList();
        }
      } catch {
        /*
         * Чат будет создан сервером автоматически
         * при первой отправке, если это предусмотрено API.
         */
      }
    }
  }

  async function loadChats() {
    if (!state.user) {
      state.chats = [];
      renderChatList();
      return;
    }

    try {
      const data = await apiFetch(API.chats, {
        method: "GET"
      });

      state.chats = Array.isArray(data.chats)
        ? data.chats
        : [];

      renderChatList();
    } catch {
      state.chats = [];
      renderChatList();
    }
  }

  async function loadChat(chatId) {
    if (!chatId) {
      return;
    }

    if (!state.user) {
      return;
    }

    try {
      const data = await apiFetch(
        `${API.chats}/${encodeURIComponent(chatId)}/messages`,
        {
          method: "GET"
        }
      );

      state.currentChatId = chatId;

      clearMessages();

      const messages = Array.isArray(data.messages)
        ? data.messages
        : [];

      messages.forEach((message) => {
        appendMessage(
          message.role === "user"
            ? "user"
            : "assistant",
          message.content || ""
        );
      });

      showChatScreen();
      closeSidebar();
    } catch (error) {
      showToast(
        error.message || "Не удалось открыть чат."
      );
    }
  }

  async function deleteChat(chatId) {
    if (!chatId || !state.user) {
      return;
    }

    try {
      await apiFetch(
        `${API.chats}/${encodeURIComponent(chatId)}`,
        {
          method: "DELETE"
        }
      );

      state.chats = state.chats.filter(
        (chat) => String(chat.id) !== String(chatId)
      );

      if (
        String(state.currentChatId) === String(chatId)
      ) {
        state.currentChatId = null;
        clearMessages();
        showHomeScreen();
      }

      renderChatList();
    } catch (error) {
      showToast(
        error.message || "Не удалось удалить чат."
      );
    }
  }

  function renderChatList() {
    if (!elements.chatList) {
      return;
    }

    elements.chatList
      .querySelectorAll(".chat-list__item")
      .forEach((item) => item.remove());

    if (!state.chats.length) {
      showElement(elements.historyEmpty);
      return;
    }

    hideElement(elements.historyEmpty);

    state.chats.forEach((chat) => {
      const item = document.createElement("div");

      item.className = "chat-list__item";

      const button = document.createElement("button");

      button.type = "button";
      button.className = "sidebar-action";
      button.textContent =
        chat.title ||
        chat.name ||
        "Новый чат";

      button.addEventListener("click", () => {
        loadChat(chat.id);
      });

      const deleteButton =
        document.createElement("button");

      deleteButton.type = "button";
      deleteButton.className = "chat-delete-button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute(
        "aria-label",
        "Удалить чат"
      );

      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const confirmed = window.confirm(
          "Удалить этот чат?"
        );

        if (confirmed) {
          deleteChat(chat.id);
        }
      });

      item.append(button, deleteButton);
      elements.chatList.appendChild(item);
    });
  }

  /* =========================================================
     СООБЩЕНИЯ
     ========================================================= */

  function clearMessages() {
    if (elements.messages) {
      elements.messages.replaceChildren();
    }
  }

  function appendMessage(role, content) {
    if (!elements.messages) {
      return null;
    }

    const message = document.createElement("article");

    message.className =
      role === "user"
        ? "message message--user"
        : "message message--assistant";

    const meta = document.createElement("div");

    meta.className = "message__meta";
    meta.textContent =
      role === "user"
        ? "Вы"
        : "Нейро-чат";

    const bubble = document.createElement("div");

    bubble.className = "message__bubble";

    /*
     * Не вставляем пользовательский текст через innerHTML.
     * Это предотвращает выполнение HTML/скриптов,
     * пришедших из сообщения.
     */
    bubble.textContent = String(content ?? "");

    message.append(meta, bubble);
    elements.messages.appendChild(message);

    scrollMessagesToBottom();

    return message;
  }

  function appendTypingMessage() {
    if (!elements.messages) {
      return null;
    }

    const message = document.createElement("article");

    message.className =
      "message message--assistant message--typing";

    const meta = document.createElement("div");

    meta.className = "message__meta";
    meta.textContent = "Нейро-чат";

    const bubble = document.createElement("div");

    bubble.className = "message__bubble";
    bubble.textContent = "Думаю…";

    message.append(meta, bubble);
    elements.messages.appendChild(message);

    scrollMessagesToBottom();

    return message;
  }

  function scrollMessagesToBottom() {
    if (!elements.messages) {
      return;
    }

    window.requestAnimationFrame(() => {
      elements.messages.scrollTop =
        elements.messages.scrollHeight;
    });
  }

  /* =========================================================
     ОТПРАВКА СООБЩЕНИЙ
     ========================================================= */

  function getMessageText(input) {
    return String(input?.value || "").trim();
  }

  function clearInput(input) {
    if (!input) {
      return;
    }

    input.value = "";
    autoResizeTextarea(input);
  }

  async function sendMessage(text, inputElement) {
    if (state.isSending) {
      return;
    }

    const message = String(text || "").trim();

    if (!message) {
      return;
    }

    state.isSending = true;

    if (elements.sendButton) {
      elements.sendButton.disabled = true;
    }

    if (elements.chatSendButton) {
      elements.chatSendButton.disabled = true;
    }

    /*
     * Если пользователь не вошёл, открываем авторизацию.
     * Никаких дополнительных проверок аккаунта здесь нет:
     * только наличие серверной сессии.
     */
    if (!state.user) {
      state.isSending = false;

      if (elements.sendButton) {
        elements.sendButton.disabled = false;
      }

      if (elements.chatSendButton) {
        elements.chatSendButton.disabled = false;
      }

      openAuth("login");
      return;
    }

    const temporary = state.temporaryChat;

    showChatScreen();

    appendMessage("user", message);

    clearInput(inputElement);

    const typingMessage = appendTypingMessage();

    try {
      const payload = {
        message,
        model: state.selectedModel,
        temporaryChat: temporary
      };

      if (state.currentChatId) {
        payload.chatId = state.currentChatId;
      }

      const data = await apiFetch(API.chat, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const answer =
        data?.message ??
        data?.answer ??
        data?.response;

      if (typingMessage) {
        typingMessage.remove();
      }

      if (
        typeof answer !== "string" ||
        !answer.trim()
      ) {
        throw new Error(
          "Сервер не вернул текст ответа."
        );
      }

      appendMessage("assistant", answer);

      if (data.chatId) {
        state.currentChatId = data.chatId;
      }

      if (!temporary) {
        await loadChats();
      }
    } catch (error) {
      if (typingMessage) {
        typingMessage.remove();
      }

      appendMessage(
        "assistant",
        `Не удалось получить ответ: ${
          error.message || "неизвестная ошибка"
        }`
      );
    } finally {
      state.isSending = false;

      if (elements.sendButton) {
        elements.sendButton.disabled = false;
      }

      if (elements.chatSendButton) {
        elements.chatSendButton.disabled = false;
      }
    }
  }

  /* =========================================================
     TEXTAREA
     ========================================================= */

  function autoResizeTextarea(textarea) {
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    const height = Math.min(
      textarea.scrollHeight,
      220
    );

    textarea.style.height = `${height}px`;
  }

  function handleTextareaKeydown(event) {
    if (event.key !== "Enter") {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    if (window.innerWidth <= 600) {
      return;
    }

    event.preventDefault();

    const form = event.currentTarget.closest("form");

    form?.requestSubmit();
  }

  /* =========================================================
     ФАЙЛЫ
     ========================================================= */

  function openFilePicker(input) {
    input?.click();
  }

  function handleFileSelected(input) {
    const file = input?.files?.[0];

    if (!file) {
      return;
    }

    /*
     * На этом этапе показываем выбранный файл.
     * Реальная передача файла AI будет реализована
     * серверной частью следующих файлов.
     */
    showToast(`Выбран файл: ${file.name}`);

    input.value = "";
  }

  /* =========================================================
     ГОЛОС
     ========================================================= */

  function startVoiceInput(targetInput) {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast(
        "Голосовой ввод не поддерживается этим браузером."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "ru-RU";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = "";

    recognition.onresult = (event) => {
      let interim = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        const result = event.results[i];

        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (targetInput) {
        targetInput.value =
          `${finalText}${interim}`.trim();

        autoResizeTextarea(targetInput);
      }
    };

    recognition.onerror = () => {
      showToast("Не удалось распознать речь.");
    };

    recognition.onend = () => {
      if (targetInput) {
        autoResizeTextarea(targetInput);
      }
    };

    try {
      recognition.start();
    } catch {
      showToast(
        "Не удалось запустить голосовой ввод."
      );
    }
  }

  /* =========================================================
     ВРЕМЕННЫЙ ЧАТ
     ========================================================= */

  function updateTemporaryChatUI() {
    const enabled = state.temporaryChat;

    if (elements.temporaryChatButton) {
      elements.temporaryChatButton.setAttribute(
        "aria-pressed",
        String(enabled)
      );
    }

    if (elements.temporaryChatState) {
      elements.temporaryChatState.textContent =
        enabled
          ? "Включён"
          : "Выключен";
    }
  }

  function toggleTemporaryChat() {
    state.temporaryChat =
      !state.temporaryChat;

    updateTemporaryChatUI();

    showToast(
      state.temporaryChat
        ? "Временный чат включён."
        : "Временный чат выключен."
    );
  }

  /* =========================================================
     СОБЫТИЯ
     ========================================================= */

  function bindEvents() {
    elements.newChatButton?.addEventListener(
      "click",
      createNewChat
    );

    elements.openSidebarButton?.addEventListener(
      "click",
      openSidebar
    );

    elements.closeSidebarButton?.addEventListener(
      "click",
      closeSidebar
    );

    elements.accountButton?.addEventListener(
      "click",
      () => {
        if (state.user) {
          openModal(elements.profileModal);
        } else {
          openAuth("login");
        }
      }
    );

    elements.settingsButton?.addEventListener(
      "click",
      () => {
        openModal(elements.settingsModal);
        closeSidebar();
      }
    );

    elements.profileButton?.addEventListener(
      "click",
      () => {
        openModal(elements.profileModal);
        closeSidebar();
      }
    );

    elements.modelButton?.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        toggleModelMenu();
      }
    );

    elements.modelOptions?.forEach((option) => {
      option.addEventListener("click", () => {
        setSelectedModel(
          option.dataset.model || "neuro"
        );
      });
    });

    elements.composerForm?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        sendMessage(
          getMessageText(elements.messageInput),
          elements.messageInput
        );
      }
    );

    elements.chatComposerForm?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();

        sendMessage(
          getMessageText(elements.chatMessageInput),
          elements.chatMessageInput
        );
      }
    );

    elements.messageInput?.addEventListener(
      "input",
      () => autoResizeTextarea(elements.messageInput)
    );

    elements.chatMessageInput?.addEventListener(
      "input",
      () => autoResizeTextarea(elements.chatMessageInput)
    );

    elements.messageInput?.addEventListener(
      "keydown",
      handleTextareaKeydown
    );

    elements.chatMessageInput?.addEventListener(
      "keydown",
      handleTextareaKeydown
    );

    elements.attachButton?.addEventListener(
      "click",
      () => openFilePicker(elements.fileInput)
    );

    elements.chatAttachButton?.addEventListener(
      "click",
      () => openFilePicker(elements.chatFileInput)
    );

    elements.fileInput?.addEventListener(
      "change",
      () => handleFileSelected(elements.fileInput)
    );

    elements.chatFileInput?.addEventListener(
      "change",
      () => handleFileSelected(elements.chatFileInput)
    );

    elements.voiceButton?.addEventListener(
      "click",
      () => startVoiceInput(elements.messageInput)
    );

    elements.chatVoiceButton?.addEventListener(
      "click",
      () => startVoiceInput(elements.chatMessageInput)
    );

    elements.loginTab?.addEventListener(
      "click",
      () => setAuthMode("login")
    );

    elements.registerTab?.addEventListener(
      "click",
      () => setAuthMode("register")
    );

    elements.authForm?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (!elements.usernameInput ||
            !elements.passwordInput) {
          return;
        }

        const username =
          elements.usernameInput.value.trim();

        const password =
          elements.passwordInput.value;

        const confirmPassword =
          elements.confirmPasswordInput?.value || "";

        setAuthError("");

        if (!username) {
          setAuthError(
            "Введите имя пользователя."
          );
          return;
        }

        if (!password) {
          setAuthError(
            "Введите пароль."
          );
          return;
        }

        if (
          state.authMode === "register" &&
          password !== confirmPassword
        ) {
          setAuthError(
            "Пароли не совпадают."
          );
          return;
        }

        setButtonLoading(
          elements.authSubmitButton,
          true,
          state.authMode === "register"
            ? "Создание…"
            : "Вход…"
        );

        try {
          if (state.authMode === "register") {
            await register(
              username,
              password,
              confirmPassword
            );

            showToast(
              "Аккаунт создан."
            );
          } else {
            await login(
              username,
              password
            );

            showToast(
              "Вы вошли в Нейро-чат."
            );
          }

          await loadChats();
        } catch (error) {
          setAuthError(
            error.message ||
            "Не удалось выполнить операцию."
          );
        } finally {
          setButtonLoading(
            elements.authSubmitButton,
            false
          );
        }
      }
    );

    elements.logoutButton?.addEventListener(
      "click",
      logout
    );

    elements.temporaryChatButton?.addEventListener(
      "click",
      toggleTemporaryChat
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;

        if (
          elements.modelMenu &&
          !elements.modelMenu.hidden &&
          !elements.modelMenu.contains(target) &&
          !elements.modelButton?.contains(target)
        ) {
          closeModelMenu();
        }
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        const closeButton =
          event.target.closest?.(
            "[data-close-modal]"
          );

        if (!closeButton) {
          return;
        }

        const modalId =
          closeButton.dataset.closeModal;

        if (!modalId) {
          return;
        }

        closeModal($(modalId));
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") {
          return;
        }

        closeModelMenu();
        closeAllModals();
      }
    );
  }

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ
     ========================================================= */

  async function init() {
    /*
     * Никаких inline-стилей для дизайна здесь нет:
     * внешний вид полностью находится в style.css.
     */

    setSelectedModel("neuro");
    updateTemporaryChatUI();
    updateAccountUI();

    bindEvents();

    if (window.matchMedia("(max-width: 900px)").matches) {
      closeSidebar();
    }

    await restoreSession();

    if (state.user) {
      await loadChats();
    } else {
      renderChatList();
    }

    showHomeScreen();
  }

  window.NeuroChat = {
    state,
    models: MODELS,
    openAuth,
    logout,
    createNewChat,
    setSelectedModel,
    showToast
  };

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();