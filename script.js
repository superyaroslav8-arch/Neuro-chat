(() => {
  "use strict";

  /* =========================================================
     NEURO-CHAT — SCRIPT.JS
     ========================================================= */

  const STORAGE = {
    users: "neurochat_users",
    currentUser: "neurochat_current_user",
    chats: "neurochat_chats",
    settings: "neurochat_settings",
    projects: "neurochat_projects",
    scheduled: "neurochat_scheduled",
    apiKey: "neurochat_api_key"
  };

  const DEFAULT_SETTINGS = {
    model: "gpt-4o-mini",
    theme: "dark",
    temporaryChat: false,
    siteBuilderMode: false
  };

  let currentChatId = null;
  let attachedFiles = [];
  let isGenerating = false;
  let currentCodeFile = null;

  /* =========================================================
     HELPERS
     ========================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCurrentUser() {
    return localStorage.getItem(STORAGE.currentUser);
  }

  function getSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...getJSON(STORAGE.settings, {})
    };
  }

  function saveSettings(settings) {
    setJSON(STORAGE.settings, settings);
  }

  function getChats() {
    return getJSON(STORAGE.chats, []);
  }

  function saveChats(chats) {
    setJSON(STORAGE.chats, chats);
  }

  function getProjects() {
    return getJSON(STORAGE.projects, []);
  }

  function saveProjects(projects) {
    setJSON(STORAGE.projects, projects);
  }

  function getScheduled() {
    return getJSON(STORAGE.scheduled, []);
  }

  function saveScheduled(items) {
    setJSON(STORAGE.scheduled, items);
  }

  function showToast(message, type = "info") {
    let container = $("#toast-container");

    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");

      setTimeout(() => {
        toast.remove();
      }, 250);
    }, 2800);
  }

  function icon(name) {
    return `
      <svg class="icon" aria-hidden="true">
        <use href="#icon-${name}"></use>
      </svg>
    `;
  }

  /* =========================================================
     AUTH
     ========================================================= */

  function showLogin() {
    $("#register-form")?.classList.add("hidden");
    $("#login-form")?.classList.remove("hidden");
    $("#login-error").textContent = "";
  }

  function showRegister() {
    $("#login-form")?.classList.add("hidden");
    $("#register-form")?.classList.remove("hidden");
    $("#register-error").textContent = "";
  }

  function login() {
    const username = $("#username")?.value.trim();
    const password = $("#password")?.value;

    const error = $("#login-error");

    if (!username || !password) {
      if (error) {
        error.textContent = "Введите логин и пароль.";
      }
      return;
    }

    const users = getJSON(STORAGE.users, []);

    const user = users.find(
      u => u.username === username && u.password === password
    );

    if (!user) {
      if (error) {
        error.textContent = "Неверный логин или пароль.";
      }
      return;
    }

    localStorage.setItem(STORAGE.currentUser, username);

    if ($("#login-screen")) {
      $("#login-screen").classList.add("hidden");
    }

    $("#app")?.classList.remove("hidden");

    initApp();

    showToast("Добро пожаловать в Neuro-chat!", "success");
  }

  function register() {
    const username = $("#register-username")?.value.trim();
    const password = $("#register-password")?.value;
    const email = $("#register-email")?.value.trim();
    const phone = $("#register-phone")?.value.trim();

    const error = $("#register-error");

    if (!username || !password) {
      if (error) {
        error.textContent = "Заполните логин и пароль.";
      }
      return;
    }

    if (username.length < 3) {
      if (error) {
        error.textContent = "Логин должен содержать минимум 3 символа.";
      }
      return;
    }

    if (password.length < 4) {
      if (error) {
        error.textContent = "Пароль должен содержать минимум 4 символа.";
      }
      return;
    }

    const users = getJSON(STORAGE.users, []);

    if (users.some(u => u.username === username)) {
      if (error) {
        error.textContent = "Такой пользователь уже существует.";
      }
      return;
    }

    users.push({
      id: uid("user"),
      username,
      password,
      email,
      phone,
      createdAt: Date.now()
    });

    setJSON(STORAGE.users, users);

    localStorage.setItem(STORAGE.currentUser, username);

    $("#register-form")?.classList.add("hidden");
    $("#login-screen")?.classList.add("hidden");
    $("#app")?.classList.remove("hidden");

    initApp();

    showToast("Аккаунт создан!", "success");
  }

  function logout() {
    localStorage.removeItem(STORAGE.currentUser);

    $("#app")?.classList.add("hidden");
    $("#login-screen")?.classList.remove("hidden");

    showLogin();

    showToast("Вы вышли из аккаунта.");
  }

  /* =========================================================
     APP INIT
     ========================================================= */

  function initApp() {
    applySettings();
    renderHistory();
    renderProjects();
    renderScheduled();
    setupEvents();

    if (!currentChatId) {
      showWelcome();
    }
  }

  function setupEvents() {
    const sendButton = $("#send-button");
    const input = $("#user-input");

    sendButton?.addEventListener("click", sendMessage);

    input?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    input?.addEventListener("input", autoResizeInput);

    $("#chat-search")?.addEventListener("input", renderHistory);

    $$(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        const section =
          item.dataset.section ||
          item.dataset.action;

        if (section) {
          navigate(section);
        }
      });
    });

    $("#file-input")?.addEventListener("change", handleFiles);
    $("#photo-input")?.addEventListener("change", handleFiles);
    $("#camera-input")?.addEventListener("change", handleFiles);
    $("#model-file-input")?.addEventListener("change", handleFiles);

    $("#api-key")?.addEventListener("input", updateApiKeyStatus);
  }

  /* =========================================================
     NAVIGATION
     ========================================================= */

  function navigate(section) {
    const map = {
      chat: "chat-section",
      library: "library-section",
      projects: "projects-section",
      plugins: "plugins-section",
      scheduled: "scheduled-section",
      more: "more-section"
    };

    const targetId = map[section];

    if (!targetId) return;

    $$("[id$='-section']").forEach(el => {
      el.classList.add("hidden");
    });

    $(`#${targetId}`)?.classList.remove("hidden");

    $$(".nav-item").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.section === section ||
        item.dataset.action === section
      );
    });

    if (window.innerWidth < 850) {
      $("#sidebar")?.classList.remove("open");
    }
  }

  /* =========================================================
     SIDEBAR
     ========================================================= */

  function toggleSidebar() {
    const sidebar = $("#sidebar");

    if (!sidebar) return;

    sidebar.classList.toggle("open");
  }

  /* =========================================================
     CHATS
     ========================================================= */

  function newChat() {
    const chats = getChats();

    const chat = {
      id: uid("chat"),
      title: "Новый чат",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    chats.unshift(chat);

    saveChats(chats);

    currentChatId = chat.id;

    renderHistory();
    renderMessages();

    navigate("chat");

    showToast("Новый чат создан.", "success");
  }

  function clearChat() {
    if (!currentChatId) {
      showWelcome();
      return;
    }

    const chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);

    if (!chat) return;

    chat.messages = [];
    chat.updatedAt = Date.now();

    saveChats(chats);

    renderMessages();

    showToast("История текущего чата очищена.");
  }

  function selectChat(id) {
    const chats = getChats();
    const chat = chats.find(c => c.id === id);

    if (!chat) return;

    currentChatId = id;

    renderMessages();
    renderHistory();

    navigate("chat");
  }

  function deleteChat(id, event) {
    event?.stopPropagation();

    const chats = getChats().filter(chat => chat.id !== id);

    saveChats(chats);

    if (currentChatId === id) {
      currentChatId = null;
      showWelcome();
    }

    renderHistory();

    showToast("Чат удалён.");
  }

  function renderHistory() {
    const container = $("#chat-history");

    if (!container) return;

    const query =
      $("#chat-search")?.value
        ?.trim()
        .toLowerCase() || "";

    let chats = getChats();

    if (query) {
      chats = chats.filter(chat =>
        chat.title.toLowerCase().includes(query)
      );
    }

    if (!chats.length) {
      container.innerHTML = `
        <div class="empty-history">
          <div>${icon("chat")}</div>
          <span>История пока пуста</span>
        </div>
      `;
      return;
    }

    container.innerHTML = chats
      .map(chat => `
        <div
          class="history-item ${
            chat.id === currentChatId ? "active" : ""
          }"
          data-chat-id="${chat.id}"
        >
          <button
            class="history-main"
            type="button"
            onclick="selectChat('${chat.id}')"
          >
            ${icon("chat")}
            <span>${escapeHTML(chat.title)}</span>
          </button>

          <button
            class="history-delete"
            type="button"
            onclick="deleteChat('${chat.id}', event)"
            aria-label="Удалить"
          >
            ${icon("close")}
          </button>
        </div>
      `)
      .join("");
  }

  function showWelcome() {
    const messages = $("#messages");
    const welcome = $("#welcome-screen");

    if (messages) {
      messages.innerHTML = "";
    }

    welcome?.classList.remove("hidden");
  }

  function renderMessages() {
    const messages = $("#messages");
    const welcome = $("#welcome-screen");

    if (!messages) return;

    if (!currentChatId) {
      showWelcome();
      return;
    }

    const chat = getChats().find(c => c.id === currentChatId);

    if (!chat || !chat.messages.length) {
      messages.innerHTML = "";
      welcome?.classList.remove("hidden");
      return;
    }

    welcome?.classList.add("hidden");

    messages.innerHTML = chat.messages
      .map(message => renderMessage(message))
      .join("");

    scrollMessages();
  }

  function renderMessage(message) {
    const isUser = message.role === "user";

    return `
      <article class="message ${isUser ? "user-message" : "assistant-message"}">
        <div class="message-avatar">
          ${
            isUser
              ? icon("user")
              : icon("sparkles")
          }
        </div>

        <div class="message-body">
          <div class="message-name">
            ${isUser ? "Вы" : "Neuro"}
          </div>

          <div class="message-content">
            ${formatMessage(message.content)}
          </div>

          ${
            message.attachments?.length
              ? `
                <div class="message-attachments">
                  ${message.attachments
                    .map(file => `
                      <div class="attachment-chip">
                        ${icon("folder")}
                        <span>${escapeHTML(file.name)}</span>
                      </div>
                    `)
                    .join("")}
                </div>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  /* =========================================================
     MESSAGE FORMAT
     ========================================================= */

  function formatMessage(text) {
    if (!text) return "";

    let html = escapeHTML(text);

    html = html.replace(
      /```([\s\S]*?)```/g,
      (_, code) => `
        <pre class="code-block">
          <button
            class="copy-code"
            type="button"
            onclick="copyText(this.parentElement.querySelector('code').textContent)"
          >
            ${icon("code")} Копировать
          </button>
          <code>${code.trim()}</code>
        </pre>
      `
    );

    html = html.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );

    html = html.replace(
      /`([^`]+)`/g,
      "<code class=\"inline-code\">$1</code>"
    );

    html = html.replace(
      /\n/g,
      "<br>"
    );

    return html;
  }

  function copyText(text) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast("Скопировано.", "success"))
      .catch(() => showToast("Не удалось скопировать."));
  }

  /* =========================================================
     QUICK PROMPTS
     ========================================================= */

  function quickPrompt(text) {
    const input = $("#user-input");

    if (!input) return;

    input.value = text;
    autoResizeInput();

    sendMessage();
  }

  /* =========================================================
     SEND MESSAGE
     ========================================================= */

  async function sendMessage() {
    if (isGenerating) return;

    const input = $("#user-input");

    if (!input) return;

    const text = input.value.trim();

    if (!text && !attachedFiles.length) return;

    if (!currentChatId) {
      newChat();
    }

    const chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);

    if (!chat) return;

    $("#welcome-screen")?.classList.add("hidden");

    const userMessage = {
      id: uid("message"),
      role: "user",
      content: text || "Прикреплённые файлы",
      attachments: attachedFiles.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
      })),
      createdAt: Date.now()
    };

    chat.messages.push(userMessage);

    if (
      !chat.title ||
      chat.title === "Новый чат"
    ) {
      chat.title =
        text.length > 40
          ? `${text.slice(0, 40)}…`
          : text || "Новый чат";
    }

    chat.updatedAt = Date.now();

    saveChats(chats);

    input.value = "";
    autoResizeInput();

    const filesForRequest = [...attachedFiles];

    attachedFiles = [];
    renderAttachedFiles();

    renderMessages();
    renderHistory();

    await generateAIResponse(chat, filesForRequest);
  }

  /* =========================================================
     AI
     ========================================================= */

  async function generateAIResponse(chat, files) {
    isGenerating = true;

    setGeneratingState(true);

    const typingId = uid("typing");

    addTypingMessage(typingId);

    try {
      const settings = getSettings();

      /*
       * API KEY:
       * Используется существующий сохранённый ключ.
       * Сам ключ здесь не показывается.
       */
      const apiKey =
        localStorage.getItem(STORAGE.apiKey) || "";

      if (!apiKey) {
        removeTypingMessage(typingId);

        addAssistantMessage(
          chat,
          "Чтобы подключить AI, откройте **Настройки → API-ключ** и сохраните ваш ключ."
        );

        return;
      }

      const messages = chat.messages.map(message => ({
        role: message.role,
        content: message.content
      }));

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: settings.model || "gpt-4o-mini",
            messages,
            temperature: 0.7
          })
        }
      );

      if (!response.ok) {
        let errorMessage =
          `Ошибка API: ${response.status}`;

        try {
          const errorData = await response.json();

          if (
            errorData?.error?.message
          ) {
            errorMessage =
              errorData.error.message;
          }
        } catch {}

        throw new Error(errorMessage);
      }

      const data = await response.json();

      const answer =
        data?.choices?.[0]?.message?.content ||
        "Не удалось получить ответ от AI.";

      removeTypingMessage(typingId);

      addAssistantMessage(chat, answer);
    } catch (error) {
      console.error(error);

      removeTypingMessage(typingId);

      addAssistantMessage(
        chat,
        `Не удалось получить ответ AI.\n\n**Ошибка:** ${error.message}`
      );

      showToast(
        "Ошибка подключения к AI.",
        "error"
      );
    } finally {
      isGenerating = false;
      setGeneratingState(false);
    }
  }

  function addAssistantMessage(chat, content) {
    chat.messages.push({
      id: uid("message"),
      role: "assistant",
      content,
      createdAt: Date.now()
    });

    chat.updatedAt = Date.now();

    saveChats(getChats());

    renderMessages();
  }

  function addTypingMessage(id) {
    const messages = $("#messages");

    if (!messages) return;

    messages.insertAdjacentHTML(
      "beforeend",
      `
        <article
          class="message assistant-message typing-message"
          data-typing-id="${id}"
        >
          <div class="message-avatar">
            ${icon("sparkles")}
          </div>

          <div class="message-body">
            <div class="message-name">Neuro</div>

            <div class="message-content">
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </article>
      `
    );

    scrollMessages();
  }

  function removeTypingMessage(id) {
    $(`[data-typing-id="${id}"]`)?.remove();
  }

  function setGeneratingState(value) {
    const button = $("#send-button");

    if (!button) return;

    button.disabled = value;

    button.classList.toggle(
      "loading",
      value
    );
  }

  function scrollMessages() {
    const messages = $("#messages");

    if (!messages) return;

    requestAnimationFrame(() => {
      messages.scrollTop =
        messages.scrollHeight;
    });
  }

  /* =========================================================
     INPUT
     ========================================================= */

  function autoResizeInput() {
    const input = $("#user-input");

    if (!input) return;

    input.style.height = "auto";
    input.style.height =
      Math.min(input.scrollHeight, 180) + "px";
  }

  /* =========================================================
     ATTACHMENTS
     ========================================================= */

  function toggleAttach() {
    const menu = $("#attach-menu");

    if (!menu) return;

    menu.classList.toggle("hidden");
  }

  function attachType(type) {
    $("#attach-menu")?.classList.add("hidden");

    const inputs = {
      file: "#file-input",
      photo: "#photo-input",
      camera: "#camera-input",
      "3d": "#model-file-input"
    };

    const input = $(inputs[type]);

    if (!input) {
      showToast("Этот тип файла пока недоступен.");
      return;
    }

    input.click();
  }

  function handleFiles(event) {
    const files = [...(event.target.files || [])];

    if (!files.length) return;

    attachedFiles.push(...files);

    renderAttachedFiles();

    event.target.value = "";
  }

  function removeAttachedFile(index) {
    attachedFiles.splice(index, 1);
    renderAttachedFiles();
  }

  function renderAttachedFiles() {
    const container = $("#attached-files");

    if (!container) return;

    if (!attachedFiles.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = attachedFiles
      .map((file, index) => `
        <div class="file-preview">
          <div class="file-preview-icon">
            ${icon("folder")}
          </div>

          <div class="file-preview-info">
            <strong>${escapeHTML(file.name)}</strong>
            <span>${formatFileSize(file.size)}</span>
          </div>

          <button
            type="button"
            onclick="removeAttachedFile(${index})"
            aria-label="Удалить файл"
          >
            ${icon("close")}
          </button>
        </div>
      `)
      .join("");
  }

  function formatFileSize(bytes) {
    if (!bytes) return "0 Б";

    const units = [
      "Б",
      "КБ",
      "МБ",
      "ГБ"
    ];

    let size = bytes;
    let index = 0;

    while (
      size >= 1024 &&
      index < units.length - 1
    ) {
      size /= 1024;
      index++;
    }

    return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  /* =========================================================
     SETTINGS
     ========================================================= */

  function openSettings() {
    const modal = $("#settings-modal");

    if (!modal) return;

    const settings = getSettings();

    if ($("#model")) {
      $("#model").value = settings.model;
    }

    if ($("#theme")) {
      $("#theme").value = settings.theme;
    }

    if ($("#temporary-chat")) {
      $("#temporary-chat").checked =
        Boolean(settings.temporaryChat);
    }

    if ($("#site-builder-mode")) {
      $("#site-builder-mode").checked =
        Boolean(settings.siteBuilderMode);
    }

    if ($("#api-key")) {
      $("#api-key").value =
        localStorage.getItem(STORAGE.apiKey) || "";
    }

    updateApiKeyStatus();

    modal.classList.remove("hidden");
  }

  function closeSettings() {
    $("#settings-modal")?.classList.add("hidden");
  }

  function saveApiKey() {
    const input = $("#api-key");

    if (!input) return;

    const key = input.value.trim();

    if (!key) {
      showToast(
        "Введите API-ключ.",
        "error"
      );
      return;
    }

    localStorage.setItem(
      STORAGE.apiKey,
      key
    );

    API_KEY = key;

    updateApiKeyStatus();

    showToast(
      "API-ключ сохранён.",
      "success"
    );
  }

  function updateApiKeyStatus() {
    const status = $("#api-key-status");

    if (!status) return;

    const key =
      $("#api-key")?.value.trim() ||
      localStorage.getItem(STORAGE.apiKey) ||
      "";

    if (key) {
      status.textContent =
        "API-ключ подключён";
      status.className =
        "api-key-status connected";
    } else {
      status.textContent =
        "API-ключ не подключён";
      status.className =
        "api-key-status";
    }
  }

  function applySettings() {
    const settings = getSettings();

    document.documentElement.dataset.theme =
      settings.theme;

    document.body.dataset.theme =
      settings.theme;

    if (settings.theme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  }

  function saveAllSettings() {
    const settings = {
      model:
        $("#model")?.value ||
        DEFAULT_SETTINGS.model,

      theme:
        $("#theme")?.value ||
        DEFAULT_SETTINGS.theme,

      temporaryChat:
        Boolean($("#temporary-chat")?.checked),

      siteBuilderMode:
        Boolean($("#site-builder-mode")?.checked)
    };

    saveSettings(settings);
    applySettings();

    showToast(
      "Настройки сохранены.",
      "success"
    );
  }

  /* =========================================================
     SUPPORT
     ========================================================= */

  function openSupport() {
    $("#support-modal")?.classList.remove("hidden");
  }

  function closeSupport() {
    $("#support-modal")?.classList.add("hidden");
  }

  /* =========================================================
     PROJECTS
     ========================================================= */

  function createProject() {
    const name =
      prompt("Название проекта:");

    if (!name?.trim()) return;

    const projects = getProjects();

    projects.unshift({
      id: uid("project"),
      name: name.trim(),
      createdAt: Date.now()
    });

    saveProjects(projects);

    renderProjects();

    showToast(
      "Проект создан.",
      "success"
    );
  }

  function deleteProject(id) {
    const projects =
      getProjects().filter(
        project => project.id !== id
      );

    saveProjects(projects);

    renderProjects();
  }

  function renderProjects() {
    const container =
      $("#projects-list");

    if (!container) return;

    const projects = getProjects();

    if (!projects.length) {
      container.innerHTML = `
        <div class="empty-state">
          ${icon("folder")}
          <h3>Проектов пока нет</h3>
          <p>Создайте первый проект.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = projects
      .map(project => `
        <div class="project-card">
          <div class="project-icon">
            ${icon("folder")}
          </div>

          <div class="project-info">
            <strong>
              ${escapeHTML(project.name)}
            </strong>

            <span>
              ${new Date(project.createdAt)
                .toLocaleDateString("ru-RU")}
            </span>
          </div>

          <button
            type="button"
            onclick="deleteProject('${project.id}')"
          >
            ${icon("trash")}
          </button>
        </div>
      `)
      .join("");
  }

  /* =========================================================
     SCHEDULED TASKS
     ========================================================= */

  function createScheduledTask() {
    const text =
      prompt("Что нужно запланировать?");

    if (!text?.trim()) return;

    const date =
      prompt(
        "Дата и время, например: 15.09.2026 18:00"
      );

    if (!date?.trim()) return;

    const items = getScheduled();

    items.unshift({
      id: uid("scheduled"),
      text: text.trim(),
      date: date.trim(),
      createdAt: Date.now()
    });

    saveScheduled(items);

    renderScheduled();

    showToast(
      "Задача запланирована.",
      "success"
    );
  }

  function deleteScheduledTask(id) {
    const items =
      getScheduled().filter(
        item => item.id !== id
      );

    saveScheduled(items);

    renderScheduled();
  }

  function renderScheduled() {
    const container =
      $("#scheduled-list");

    if (!container) return;

    const items = getScheduled();

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          ${icon("clock")}
          <h3>Нет запланированных задач</h3>
          <p>Создайте новую задачу.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items
      .map(item => `
        <div class="scheduled-card">
          <div class="scheduled-icon">
            ${icon("clock")}
          </div>

          <div class="scheduled-info">
            <strong>
              ${escapeHTML(item.text)}
            </strong>

            <span>
              ${escapeHTML(item.date)}
            </span>
          </div>

          <button
            type="button"
            onclick="deleteScheduledTask('${item.id}')"
          >
            ${icon("trash")}
          </button>
        </div>
      `)
      .join("");
  }

  /* =========================================================
     CODE MODE
     ========================================================= */

  function openCodeMode() {
    $("#code-modal")?.classList.remove("hidden");

    const editor = $("#code-editor");

    if (editor && !editor.value) {
      editor.value =
`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мой сайт</title>
</head>
<body>

  <h1>Привет, Neuro-chat!</h1>
  <p>Это мой сайт.</p>

</body>
</html>`;
    }
  }

  function closeCodeMode() {
    $("#code-modal")?.classList.add("hidden");
  }

  function selectCodeFile() {
    const input = $("#code-file-input");

    if (!input) return;

    input.click();

    input.onchange = event => {
      const file = event.target.files?.[0];

      if (!file) return;

      currentCodeFile = file;

      const reader = new FileReader();

      reader.onload = () => {
        if ($("#code-editor")) {
          $("#code-editor").value =
            String(reader.result || "");
        }
      };

      reader.readAsText(file);
    };
  }

  function runCode() {
    const editor = $("#code-editor");

    if (!editor) return;

    const code = editor.value;

    const frame = $("#site-preview-frame");

    if (!frame) {
      showToast(
        "Окно предпросмотра не найдено.",
        "error"
      );
      return;
    }

    frame.srcdoc = code;

    $("#site-preview-modal")
      ?.classList.remove("hidden");

    showToast(
      "Код запущен.",
      "success"
    );
  }

  function openSitePreview() {
    const code =
      $("#code-editor")?.value || "";

    const frame =
      $("#site-preview-frame");

    if (!frame) return;

    frame.srcdoc = code;

    $("#site-preview-modal")
      ?.classList.remove("hidden");
  }

  function closeSitePreview() {
    $("#site-preview-modal")
      ?.classList.add("hidden");
  }

  async function askCodeAI() {
    const editor = $("#code-editor");

    if (!editor) return;

    const request =
      prompt(
        "Что изменить в коде?"
      );

    if (!request?.trim()) return;

    const apiKey =
      localStorage.getItem(STORAGE.apiKey) || "";

    if (!apiKey) {
      showToast(
        "Сначала подключите API-ключ в настройках.",
        "error"
      );
      return;
    }

    const oldCode = editor.value;

    showToast(
      "AI анализирует код..."
    );

    try {
      const settings = getSettings();

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              {
                role: "system",
                content:
                  "Ты профессиональный веб-разработчик. Возвращай только готовый код без лишних объяснений."
              },
              {
                role: "user",
                content:
`Измени этот код по запросу пользователя.

ЗАПРОС:
${request}

КОД:
${oldCode}`
              }
            ],
            temperature: 0.2
          })
        }
      );

      if (!response.ok) {
        throw new Error(
          `API ${response.status}`
        );
      }

      const data =
        await response.json();

      let result =
        data?.choices?.[0]?.message?.content ||
        "";

      result = result
        .replace(/^```[a-zA-Z0-9_-]*\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      if (result) {
        editor.value = result;

        showToast(
          "Код обновлён AI.",
          "success"
        );
      }
    } catch (error) {
      console.error(error);

      showToast(
        "Не удалось изменить код.",
        "error"
      );
    }
  }

  /* =========================================================
     MORE / LIBRARY
     ========================================================= */

  function openLibrary() {
    navigate("library");
  }

  /* =========================================================
     MODALS
     ========================================================= */

  function closeModalById(id) {
    $(`#${id}`)?.classList.add("hidden");
  }

  /* =========================================================
     KEYBOARD SHORTCUTS
     ========================================================= */

  document.addEventListener(
    "keydown",
    event => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        $("#chat-search")?.focus();
      }

      if (
        event.key === "Escape"
      ) {
        [
          "settings-modal",
          "support-modal",
          "code-modal",
          "site-preview-modal"
        ].forEach(id => {
          closeModalById(id);
        });

        $("#attach-menu")
          ?.classList.add("hidden");
      }
    }
  );

  /* =========================================================
     OUTSIDE CLICK
     ========================================================= */

  document.addEventListener(
    "click",
    event => {
      const menu = $("#attach-menu");
      const button = $("#attach-button");

      if (
        menu &&
        !menu.contains(event.target) &&
        !button?.contains(event.target)
      ) {
        menu.classList.add("hidden");
      }
    }
  );

  /* =========================================================
     CLOSE MODALS BY BACKDROP
     ========================================================= */

  $$(".modal").forEach(modal => {
    modal.addEventListener(
      "click",
      event => {
        if (event.target === modal) {
          modal.classList.add("hidden");
        }
      }
    );
  });

  /* =========================================================
     GLOBAL EXPORTS
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

  window.toggleAttach = toggleAttach;
  window.attachType = attachType;
  window.removeAttachedFile = removeAttachedFile;

  window.toggleSidebar = toggleSidebar;

  window.openSettings = openSettings;
  window.closeSettings = closeSettings;
  window.saveApiKey = saveApiKey;
  window.saveAllSettings = saveAllSettings;

  window.openSupport = openSupport;
  window.closeSupport = closeSupport;

  window.createProject = createProject;
  window.deleteProject = deleteProject;

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

  /* =========================================================
     START
     ========================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const currentUser =
        getCurrentUser();

      if (currentUser) {
        $("#login-screen")
          ?.classList.add("hidden");

        $("#app")
          ?.classList.remove("hidden");

        initApp();
      } else {
        $("#app")
          ?.classList.add("hidden");

        $("#login-screen")
          ?.classList.remove("hidden");

        showLogin();
      }

      /* Закрытие модальных окон */
      $$(".modal-close").forEach(button => {
        button.addEventListener(
          "click",
          () => {
            button.closest(".modal")
              ?.classList.add("hidden");
          }
        );
      });
    }
  );

})();