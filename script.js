(() => {
  "use strict";

  /*
   * Нейро-чат
   * Основной клиентский JavaScript.
   *
   * Совместим с Cloudflare Worker API:
   *   POST /api/auth/register
   *   POST /api/auth/login
   *   GET  /api/auth/me
   *   POST /api/auth/logout
   *   POST /api/chat
   *   POST /api/generate/image
   *   POST /api/generate/video
   */

  const API = {
    session: "/api/auth/me",
    login: "/api/auth/login",
    register: "/api/auth/register",
    logout: "/api/auth/logout",
    chat: "/api/chat",
    image: "/api/generate/image",
    video: "/api/generate/video"
  };

  const state = {
    user: null,
    authenticated: false,
    currentChatId: null,
    chats: [],
    messages: [],
    busy: false,
    authMode: "login",
    temporaryChats: false,
    animationsEnabled: true,
    attachedFile: null,
    mediaRecorder: null,
    audioChunks: [],
    recording: false
  };

  const $ = (id) => document.getElementById(id);

  const elements = {
    authScreen: $("authScreen"),
    authForm: $("authForm"),
    username: $("username"),
    password: $("password"),
    loginButton: $("loginButton"),
    registerButton: $("registerButton"),
    authError: $("authError"),

    app: $("app"),
    sidebar: $("sidebar"),
    sidebarOverlay: $("sidebarOverlay"),
    openSidebarButton: $("openSidebarButton"),
    closeSidebarButton: $("closeSidebarButton"),
    newChatButton: $("newChatButton"),
    chatHistory: $("chatHistory"),

    settingsButton: $("settingsButton"),
    logoutButton: $("logoutButton"),
    profileButton: $("profileButton"),
    profileInitial: $("profileInitial"),

    profileModal: $("profileModal"),
    profileBigAvatar: $("profileBigAvatar"),
    profileName: $("profileName"),
    profileUsername: $("profileUsername"),
    profileLogoutButton: $("profileLogoutButton"),

    settingsModal: $("settingsModal"),
    temporaryChats: $("temporaryChats"),
    animationsEnabled: $("animationsEnabled"),

    welcomeScreen: $("welcomeScreen"),
    messages: $("messages"),
    messageInput: $("messageInput"),
    sendButton: $("sendButton"),
    attachButton: $("attachButton"),
    fileInput: $("fileInput"),
    voiceButton: $("voiceButton"),
    typingIndicator: $("typingIndicator"),

    toolModal: $("toolModal"),
    toolModalTitle: $("toolModalTitle"),
    toolModalDescription: $("toolModalDescription"),
    toolPrompt: $("toolPrompt"),
    toolRunButton: $("toolRunButton"),
    toolStatus: $("toolStatus"),

    toastContainer: $("toastContainer")
  };

  /* ---------------------------------------------------------
     Utilities
  --------------------------------------------------------- */

  function safeText(value) {
    return String(value ?? "");
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getInitial(value) {
    const text = safeText(value).trim();

    if (!text) {
      return "Н";
    }

    return text.charAt(0).toUpperCase();
  }

  function generateChatId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showElement(element) {
    if (!element) return;
    element.hidden = false;
    element.style.removeProperty("display");
  }

  function hideElement(element) {
    if (!element) return;
    element.hidden = true;
  }

  function setAuthError(message = "") {
    if (!elements.authError) return;

    elements.authError.textContent = message;
    elements.authError.hidden = !message;
  }

  function setBusy(value) {
    state.busy = Boolean(value);

    if (elements.sendButton) {
      elements.sendButton.disabled = state.busy;
    }

    if (elements.messageInput) {
      elements.messageInput.disabled = state.busy;
    }

    if (elements.typingIndicator) {
      elements.typingIndicator.hidden = !state.busy;
    }
  }

  function scrollMessagesToBottom() {
    if (!elements.messages) return;

    requestAnimationFrame(() => {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    });
  }

  function showToast(message, type = "info") {
    if (!elements.toastContainer) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = safeText(message);

    elements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");

      setTimeout(() => {
        toast.remove();
      }, 250);
    }, 3000);
  }

  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }

    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        message: text
      };
    }
  }

  async function apiRequest(url, options = {}) {
    const requestOptions = {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      }
    };

    if (
      requestOptions.body &&
      typeof requestOptions.body !== "string"
    ) {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    let response;

    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      throw new Error(
        "Не удалось подключиться к серверу. Проверь соединение с интернетом."
      );
    }

    const data = await readResponse(response);

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `Ошибка сервера (${response.status})`;

      throw new Error(message);
    }

    return data;
  }

  /* ---------------------------------------------------------
     Authentication
  --------------------------------------------------------- */

  async function restoreSession() {
    try {
      const data = await apiRequest(API.session, {
        method: "GET"
      });

      if (data && data.user) {
        state.user = data.user;
        state.authenticated = true;
        showApp();
        return true;
      }

      state.user = null;
      state.authenticated = false;
      showAuth();

      return false;
    } catch (error) {
      /*
       * 401/403 при отсутствии сессии — нормальная ситуация.
       * Не показываем пользователю техническую ошибку.
       */
      state.user = null;
      state.authenticated = false;
      showAuth();

      return false;
    }
  }

  async function login(event) {
    if (event) {
      event.preventDefault();
    }

    setAuthError("");

    const username = elements.username?.value.trim() || "";
    const password = elements.password?.value || "";

    if (!username) {
      setAuthError("Введите имя пользователя.");
      elements.username?.focus();
      return;
    }

    if (!password) {
      setAuthError("Введите пароль.");
      elements.password?.focus();
      return;
    }

    if (elements.loginButton) {
      elements.loginButton.disabled = true;
    }

    try {
      const data = await apiRequest(API.login, {
        method: "POST",
        body: {
          username,
          password
        }
      });

      if (!data?.user) {
        throw new Error("Сервер не вернул данные пользователя.");
      }

      state.user = data.user;
      state.authenticated = true;

      setAuthError("");
      showApp();

      showToast("Вы успешно вошли.", "success");
    } catch (error) {
      setAuthError(error.message || "Не удалось выполнить вход.");
    } finally {
      if (elements.loginButton) {
        elements.loginButton.disabled = false;
      }
    }
  }

  async function register(event) {
    if (event) {
      event.preventDefault();
    }

    setAuthError("");

    const username = elements.username?.value.trim() || "";
    const password = elements.password?.value || "";

    if (!username) {
      setAuthError("Введите имя пользователя.");
      elements.username?.focus();
      return;
    }

    if (password.length < 6) {
      setAuthError("Пароль должен содержать минимум 6 символов.");
      elements.password?.focus();
      return;
    }

    if (elements.registerButton) {
      elements.registerButton.disabled = true;
    }

    try {
      const data = await apiRequest(API.register, {
        method: "POST",
        body: {
          username,
          password
        }
      });

      if (!data?.user) {
        throw new Error("Сервер не вернул данные созданного пользователя.");
      }

      state.user = data.user;
      state.authenticated = true;

      setAuthError("");
      showApp();

      showToast("Аккаунт создан.", "success");
    } catch (error) {
      setAuthError(error.message || "Не удалось создать аккаунт.");
    } finally {
      if (elements.registerButton) {
        elements.registerButton.disabled = false;
      }
    }
  }

  async function logout() {
    try {
      await apiRequest(API.logout, {
        method: "POST"
      });
    } catch {
      /*
       * Даже если сервер уже удалил/потерял сессию,
       * локальное состояние всё равно должно очиститься.
       */
    }

    state.user = null;
    state.authenticated = false;
    state.currentChatId = null;
    state.messages = [];
    state.chats = [];

    closeAllModals();
    clearMessages();
    showAuth();

    if (elements.username) {
      elements.username.value = "";
    }

    if (elements.password) {
      elements.password.value = "";
    }

    showToast("Вы вышли из аккаунта.", "info");
  }

  function showAuth() {
    hideElement(elements.app);
    showElement(elements.authScreen);

    document.body.classList.remove("app-active");

    setTimeout(() => {
      elements.username?.focus();
    }, 50);
  }

  function showApp() {
    hideElement(elements.authScreen);
    showElement(elements.app);

    document.body.classList.add("app-active");

    updateProfileUI();
    createNewChat(false);
  }

  /* ---------------------------------------------------------
     Profile
  --------------------------------------------------------- */

  function updateProfileUI() {
    if (!state.user) {
      return;
    }

    const username =
      state.user.username ||
      state.user.name ||
      "Пользователь";

    const initial = getInitial(username);

    if (elements.profileInitial) {
      elements.profileInitial.textContent = initial;
    }

    if (elements.profileBigAvatar) {
      elements.profileBigAvatar.textContent = initial;
    }

    if (elements.profileName) {
      elements.profileName.textContent = username;
    }

    if (elements.profileUsername) {
      elements.profileUsername.textContent =
        state.user.username
          ? `@${state.user.username}`
          : "";
    }
  }

  function openProfileModal() {
    updateProfileUI();
    openModal(elements.profileModal);
  }

  /* ---------------------------------------------------------
     Chat
  --------------------------------------------------------- */

  function createNewChat(showToastMessage = true) {
    state.currentChatId = generateChatId();
    state.messages = [];

    clearMessages();

    if (elements.welcomeScreen) {
      showElement(elements.welcomeScreen);
    }

    renderChatHistory();

    if (showToastMessage) {
      showToast("Новый чат создан.", "info");
    }

    elements.messageInput?.focus();
  }

  function clearMessages() {
    if (!elements.messages) {
      return;
    }

    elements.messages.innerHTML = "";
  }

  function renderChatHistory() {
    if (!elements.chatHistory) {
      return;
    }

    elements.chatHistory.innerHTML = "";

    if (!state.chats.length) {
      return;
    }

    state.chats.forEach((chat) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "chat-history-item";

      if (chat.id === state.currentChatId) {
        button.classList.add("active");
      }

      button.textContent = chat.title || "Новый чат";

      button.addEventListener("click", () => {
        selectChat(chat.id);
      });

      elements.chatHistory.appendChild(button);
    });
  }

  function selectChat(chatId) {
    const chat = state.chats.find((item) => item.id === chatId);

    if (!chat) {
      return;
    }

    state.currentChatId = chat.id;
    state.messages = Array.isArray(chat.messages)
      ? [...chat.messages]
      : [];

    renderMessages();
    renderChatHistory();

    closeSidebar();
  }

  function saveCurrentChat() {
    if (state.temporaryChats) {
      return;
    }

    if (!state.currentChatId) {
      return;
    }

    const firstUserMessage = state.messages.find(
      (message) => message.role === "user"
    );

    const title = firstUserMessage
      ? safeText(firstUserMessage.content).slice(0, 40)
      : "Новый чат";

    const existing = state.chats.find(
      (chat) => chat.id === state.currentChatId
    );

    if (existing) {
      existing.title = title;
      existing.messages = [...state.messages];
    } else {
      state.chats.unshift({
        id: state.currentChatId,
        title,
        messages: [...state.messages]
      });
    }

    if (state.chats.length > 50) {
      state.chats = state.chats.slice(0, 50);
    }

    renderChatHistory();
  }

  function renderMessages() {
    if (!elements.messages) {
      return;
    }

    clearMessages();

    if (!state.messages.length) {
      if (elements.welcomeScreen) {
        showElement(elements.welcomeScreen);
      }

      return;
    }

    hideElement(elements.welcomeScreen);

    state.messages.forEach((message) => {
      appendMessage(
        message.role,
        message.content,
        false
      );
    });

    scrollMessagesToBottom();
  }

  function appendMessage(role, content, scroll = true) {
    if (!elements.messages) {
      return null;
    }

    hideElement(elements.welcomeScreen);

    const wrapper = document.createElement("div");
    wrapper.className = `message-row message-row-${role}`;

    const message = document.createElement("div");
    message.className = `message message-${role}`;

    const text = document.createElement("div");
    text.className = "message-content";

    text.textContent = safeText(content);

    message.appendChild(text);
    wrapper.appendChild(message);
    elements.messages.appendChild(wrapper);

    if (scroll) {
      scrollMessagesToBottom();
    }

    return wrapper;
  }

  function extractAssistantAnswer(data) {
    if (!data) {
      return "";
    }

    if (typeof data === "string") {
      return data;
    }

    if (typeof data.message === "string") {
      return data.message;
    }

    if (typeof data.answer === "string") {
      return data.answer;
    }

    if (typeof data.response === "string") {
      return data.response;
    }

    if (typeof data.content === "string") {
      return data.content;
    }

    if (typeof data.text === "string") {
      return data.text;
    }

    if (data.message && typeof data.message.content === "string") {
      return data.message.content;
    }

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    if (data.choices?.[0]?.text) {
      return data.choices[0].text;
    }

    return "";
  }

  async function sendMessage() {
    if (state.busy) {
      return;
    }

    const input = elements.messageInput;

    if (!input) {
      return;
    }

    const content = input.value.trim();

    if (!content && !state.attachedFile) {
      return;
    }

    if (!state.authenticated) {
      showAuth();
      return;
    }

    if (!state.currentChatId) {
      state.currentChatId = generateChatId();
    }

    let finalContent = content;

    if (state.attachedFile) {
      const fileName = state.attachedFile.name || "файл";

      finalContent = content
        ? `${content}\n\n[Прикреплённый файл: ${fileName}]`
        : `[Прикреплённый файл: ${fileName}]`;
    }

    const userMessage = {
      role: "user",
      content: finalContent
    };

    state.messages.push(userMessage);
    appendMessage("user", finalContent);

    input.value = "";
    state.attachedFile = null;

    updateInputHeight();

    setBusy(true);

    try {
      const data = await apiRequest(API.chat, {
        method: "POST",
        body: {
          chatId: state.currentChatId,
          messages: state.messages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        }
      });

      const answer = extractAssistantAnswer(data);

      if (!answer) {
        throw new Error(
          "Сервер вернул пустой ответ."
        );
      }

      const assistantMessage = {
        role: "assistant",
        content: answer
      };

      state.messages.push(assistantMessage);
      appendMessage("assistant", answer);

      saveCurrentChat();
    } catch (error) {
      const errorMessage =
        error?.message ||
        "Не удалось получить ответ от Нейро-чата.";

      appendMessage(
        "assistant",
        `Ошибка: ${errorMessage}`
      );
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  /* ---------------------------------------------------------
     Tools
  --------------------------------------------------------- */

  const tools = {
    image: {
      title: "Создание изображения",
      description:
        "Опишите изображение, которое нужно создать."
    },

    video: {
      title: "Создание видео",
      description:
        "Опишите видео, которое нужно создать."
    },

    music: {
      title: "Создание музыки",
      description:
        "Опишите стиль, настроение и содержание музыки."
    },

    model3d: {
      title: "3D-модель",
      description:
        "Опишите предмет или персонажа для 3D-модели."
    },

    website: {
      title: "Создание сайта",
      description:
        "Опишите сайт, который нужно создать."
    }
  };

  let currentTool = null;

  function openTool(toolName) {
    const tool = tools[toolName];

    if (!tool) {
      showToast("Этот инструмент не найден.", "error");
      return;
    }

    currentTool = toolName;

    if (elements.toolModalTitle) {
      elements.toolModalTitle.textContent = tool.title;
    }

    if (elements.toolModalDescription) {
      elements.toolModalDescription.textContent =
        tool.description;
    }

    if (elements.toolPrompt) {
      elements.toolPrompt.value = "";
    }

    if (elements.toolStatus) {
      elements.toolStatus.textContent = "";
    }

    openModal(elements.toolModal);

    elements.toolPrompt?.focus();
  }

  async function runTool() {
    if (!currentTool) {
      return;
    }

    const prompt =
      elements.toolPrompt?.value.trim() || "";

    if (!prompt) {
      if (elements.toolStatus) {
        elements.toolStatus.textContent =
          "Введите описание.";
      }

      return;
    }

    if (elements.toolRunButton) {
      elements.toolRunButton.disabled = true;
    }

    if (elements.toolStatus) {
      elements.toolStatus.textContent =
        "Обработка запроса…";
    }

    try {
      if (currentTool === "image") {
        await generateImage(prompt);
      } else if (currentTool === "video") {
        await generateVideo(prompt);
      } else {
        /*
         * Остальные инструменты пока передаются
         * в обычный чат, чтобы кнопка не была пустой.
         */
        closeModal(elements.toolModal);

        if (elements.messageInput) {
          elements.messageInput.value = prompt;
        }

        await sendMessage();
      }
    } catch (error) {
      if (elements.toolStatus) {
        elements.toolStatus.textContent =
          error.message || "Произошла ошибка.";
      }
    } finally {
      if (elements.toolRunButton) {
        elements.toolRunButton.disabled = false;
      }
    }
  }

  async function generateImage(prompt) {
    const data = await apiRequest(API.image, {
      method: "POST",
      body: {
        prompt
      }
    });

    const image =
      data?.image ||
      data?.url ||
      data?.result;

    if (!image) {
      throw new Error(
        "Сервер не вернул изображение."
      );
    }

    closeModal(elements.toolModal);

    const row = appendMessage(
      "assistant",
      "Изображение создано."
    );

    if (row) {
      const content = row.querySelector(
        ".message-content"
      );

      if (content) {
        const imageElement =
          document.createElement("img");

        imageElement.src = image;
        imageElement.alt = "Созданное изображение";
        imageElement.className = "generated-image";
        imageElement.loading = "lazy";

        content.appendChild(imageElement);
      }
    }

    showToast(
      "Изображение создано.",
      "success"
    );
  }

  async function generateVideo(prompt) {
    const data = await apiRequest(API.video, {
      method: "POST",
      body: {
        prompt
      }
    });

    const video =
      data?.video ||
      data?.url ||
      data?.result;

    if (!video) {
      throw new Error(
        "Сервер не вернул видео."
      );
    }

    closeModal(elements.toolModal);

    const row = appendMessage(
      "assistant",
      "Видео создано."
    );

    if (row) {
      const content = row.querySelector(
        ".message-content"
      );

      if (content) {
        const videoElement =
          document.createElement("video");

        videoElement.src = video;
        videoElement.controls = true;
        videoElement.className = "generated-video";
        videoElement.preload = "metadata";

        content.appendChild(videoElement);
      }
    }

    showToast(
      "Видео создано.",
      "success"
    );
  }

  /* ---------------------------------------------------------
     File upload
  --------------------------------------------------------- */

  function openFilePicker() {
    elements.fileInput?.click();
  }

  function handleFileChange(event) {
    const file = event?.target?.files?.[0];

    if (!file) {
      return;
    }

    state.attachedFile = file;

    showToast(
      `Файл «${file.name}» прикреплён.`,
      "success"
    );

    if (elements.messageInput) {
      elements.messageInput.focus();
    }
  }

  /* ---------------------------------------------------------
     Voice
  --------------------------------------------------------- */

  async function toggleVoice() {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showToast(
        "Голосовой ввод не поддерживается этим браузером.",
        "error"
      );

      return;
    }

    if (state.recording) {
      stopRecording();
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      state.audioChunks = [];
      state.mediaRecorder =
        new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) {
          state.audioChunks.push(event.data);
        }
      };

      state.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });

        showToast(
          "Запись завершена. Голосовой ввод готов.",
          "success"
        );
      };

      state.mediaRecorder.start();
      state.recording = true;

      elements.voiceButton?.classList.add(
        "recording"
      );

      showToast(
        "Идёт запись… Нажмите ещё раз для остановки.",
        "info"
      );
    } catch {
      showToast(
        "Не удалось получить доступ к микрофону.",
        "error"
      );
    }
  }

  function stopRecording() {
    if (
      state.mediaRecorder &&
      state.mediaRecorder.state !== "inactive"
    ) {
      state.mediaRecorder.stop();
    }

    state.recording = false;

    elements.voiceButton?.classList.remove(
      "recording"
    );
  }

  /* ---------------------------------------------------------
     Sidebar
  --------------------------------------------------------- */

  function openSidebar() {
    elements.sidebar?.classList.add("open");
    elements.sidebarOverlay?.classList.add("active");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    elements.sidebar?.classList.remove("open");
    elements.sidebarOverlay?.classList.remove("active");
    document.body.classList.remove("sidebar-open");
  }

  /* ---------------------------------------------------------
     Modals
  --------------------------------------------------------- */

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    if (
      !document.querySelector(
        ".modal.active"
      )
    ) {
      document.body.classList.remove(
        "modal-open"
      );
    }
  }

  function closeAllModals() {
    document
      .querySelectorAll(".modal.active")
      .forEach((modal) => {
        closeModal(modal);
      });
  }

  function openSettingsModal() {
    if (elements.temporaryChats) {
      elements.temporaryChats.checked =
        state.temporaryChats;
    }

    if (elements.animationsEnabled) {
      elements.animationsEnabled.checked =
        state.animationsEnabled;
    }

    openModal(elements.settingsModal);
  }

  /* ---------------------------------------------------------
     Settings
  --------------------------------------------------------- */

  function updateSettings() {
    if (elements.temporaryChats) {
      state.temporaryChats =
        elements.temporaryChats.checked;
    }

    if (elements.animationsEnabled) {
      state.animationsEnabled =
        elements.animationsEnabled.checked;
    }

    document.body.classList.toggle(
      "no-animations",
      !state.animationsEnabled
    );

    if (state.temporaryChats) {
      state.chats = [];
      renderChatHistory();
    }
  }

  /* ---------------------------------------------------------
     Input
  --------------------------------------------------------- */

  function updateInputHeight() {
    const input = elements.messageInput;

    if (!input) {
      return;
    }

    input.style.height = "auto";

    const maxHeight = 180;

    input.style.height =
      `${Math.min(input.scrollHeight, maxHeight)}px`;
  }

  /* ---------------------------------------------------------
     Event binding
  --------------------------------------------------------- */

  function bindEvents() {
    elements.authForm?.addEventListener(
      "submit",
      login
    );

    elements.loginButton?.addEventListener(
      "click",
      login
    );

    elements.registerButton?.addEventListener(
      "click",
      register
    );

    elements.logoutButton?.addEventListener(
      "click",
      logout
    );

    elements.profileLogoutButton?.addEventListener(
      "click",
      logout
    );

    elements.profileButton?.addEventListener(
      "click",
      openProfileModal
    );

    elements.settingsButton?.addEventListener(
      "click",
      openSettingsModal
    );

    elements.newChatButton?.addEventListener(
      "click",
      () => createNewChat(true)
    );

    elements.openSidebarButton?.addEventListener(
      "click",
      openSidebar
    );

    elements.closeSidebarButton?.addEventListener(
      "click",
      closeSidebar
    );

    elements.sidebarOverlay?.addEventListener(
      "click",
      closeSidebar
    );

    elements.sendButton?.addEventListener(
      "click",
      sendMessage
    );

    elements.messageInput?.addEventListener(
      "input",
      updateInputHeight
    );

    elements.messageInput?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendMessage();
        }
      }
    );

    elements.attachButton?.addEventListener(
      "click",
      openFilePicker
    );

    elements.fileInput?.addEventListener(
      "change",
      handleFileChange
    );

    elements.voiceButton?.addEventListener(
      "click",
      toggleVoice
    );

    elements.toolRunButton?.addEventListener(
      "click",
      runTool
    );

    elements.temporaryChats?.addEventListener(
      "change",
      updateSettings
    );

    elements.animationsEnabled?.addEventListener(
      "change",
      updateSettings
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;

        if (
          target instanceof HTMLElement &&
          target.matches("[data-close-modal]")
        ) {
          const modal = target.closest(".modal");

          if (modal) {
            closeModal(modal);
          }
        }
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          closeAllModals();
          closeSidebar();
        }
      }
    );

    /*
     * Поддержка кнопок инструментов из HTML.
     * Пример:
     * data-tool="image"
     * data-tool="video"
     * data-tool="music"
     * data-tool="model3d"
     * data-tool="website"
     */
    document.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest("[data-tool]");

        if (!button) {
          return;
        }

        const toolName =
          button.getAttribute("data-tool");

        if (toolName) {
          openTool(toolName);
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Initialization
  --------------------------------------------------------- */

  async function init() {
    bindEvents();

    document.body.classList.add(
      "neuro-chat"
    );

    /*
     * Убираем системное выделение старого логотипа
     * только если CSS/HTML уже предоставляет новый вариант.
     * Сам текст "Нейро-чат" будет установлен в index.html,
     * чтобы не создавать дубликаты через JS.
     */

    await restoreSession();
  }

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

  /* ---------------------------------------------------------
     Public API
  --------------------------------------------------------- */

  window.NeuroChat = {
    login,
    register,
    logout,
    sendMessage,
    createNewChat,
    openTool,
    openSettingsModal,
    openProfileModal,
    showToast
  };
})();