const API = {
  me: "/api/auth/me",
  login: "/api/auth/login",
  register: "/api/auth/register",
  logout: "/api/auth/logout",

  chats: "/api/chats",
  chat: "/api/chat",

  settings: "/api/settings",
  permissions: "/api/permissions",
  plugins: "/api/plugins",

  image: "/api/generate/image",
  video: "/api/generate/video",
  music: "/api/generate/music",
  model3d: "/api/generate/3d"
};

const MODEL_NAMES = {
  neuro: "Нейро",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  grok: "Grok",
  "alice-1": "Алиса 1"
};

const state = {
  user: null,
  authenticated: false,
  guest: true,

  authMode: "login",

  currentChatId: null,
  currentModel: "neuro",

  temporaryChat: false,

  chats: [],

  selectedTool: null,

  sending: false
};

const $ = (id) =>
  document.getElementById(id);

const homeScreen = $("homeScreen");
const chatScreen = $("chatScreen");
const messages = $("messages");

function show(element) {
  if (element) {
    element.hidden = false;
  }
}

function hide(element) {
  if (element) {
    element.hidden = true;
  }
}

function openModal(id) {
  show($(id));
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  hide($(id));

  const openModalExists =
    document.querySelector(
      ".modal-overlay:not([hidden])"
    );

  if (!openModalExists) {
    document.body.classList.remove(
      "modal-open"
    );
  }
}

function closeAllModals() {
  document
    .querySelectorAll(".modal-overlay")
    .forEach((modal) => {
      modal.hidden = true;
    });

  document.body.classList.remove(
    "modal-open"
  );
}

async function api(url, options = {}) {
  const headers = new Headers(
    options.headers || {}
  );

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set(
      "content-type",
      "application/json"
    );
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error ||
      `Ошибка запроса: ${response.status}`
    );
  }

  return data;
}

function setAuth(user) {
  state.user = user || null;
  state.authenticated = Boolean(user);
  state.guest = !user;

  const accountButton =
    $("accountButton");

  const profileButtonText =
    $("profileButtonText");

  const profileName =
    $("profileName");

  const profileAuthButton =
    $("profileAuthButton");

  const logoutButton =
    $("logoutButton");

  if (accountButton) {
    accountButton.textContent =
      user?.username || "Войти";
  }

  if (profileButtonText) {
    profileButtonText.textContent =
      user?.username || "Профиль";
  }

  if (profileName) {
    profileName.textContent =
      user?.username || "Гость";
  }

  if (profileAuthButton) {
    profileAuthButton.textContent =
      user
        ? "Профиль подключён"
        : "Войти";
  }

  if (logoutButton) {
    logoutButton.hidden = !user;
  }
}

async function loadSession() {
  try {
    const data =
      await api(API.me);

    if (
      data.authenticated &&
      data.user
    ) {
      setAuth(data.user);

      await Promise.all([
        loadChats(),
        loadSettings()
      ]);
    } else {
      setAuth(null);
    }
  } catch {
    setAuth(null);
  }
}

async function loadChats() {
  if (!state.authenticated) {
    state.chats = [];
    renderChats();
    return;
  }

  try {
    const data =
      await api(API.chats);

    state.chats =
      Array.isArray(data.chats)
        ? data.chats
        : [];

    renderChats();
  } catch (error) {
    console.error(
      "Ошибка загрузки чатов:",
      error
    );

    state.chats = [];
    renderChats();
  }
}

function renderChats() {
  const list =
    $("chatList");

  if (!list) {
    return;
  }

  list.innerHTML = "";

  for (const chat of state.chats) {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "chat-item";

    button.textContent =
      chat.title || "Новый чат";

    button.title =
      chat.title || "Новый чат";

    button.addEventListener(
      "click",
      () => {
        openChat(chat.id);
      }
    );

    list.appendChild(button);
  }
}

async function createNewChat() {
  state.currentChatId = null;
  state.sending = false;

  messages.innerHTML = "";

  show(homeScreen);
  hide(chatScreen);

  const input =
    $("messageInput");

  if (input) {
    input.value = "";
    input.style.height = "auto";
    input.focus();
  }

  if (!state.authenticated) {
    return;
  }

  try {
    const data =
      await api(API.chats, {
        method: "POST",
        body: JSON.stringify({
          title: "Новый чат",
          model: state.currentModel
        })
      });

    state.currentChatId =
      data.chat?.id || null;

    await loadChats();
  } catch (error) {
    console.error(
      "Ошибка создания чата:",
      error
    );
  }
}

async function openChat(chatId) {
  if (!chatId) {
    return;
  }

  state.currentChatId =
    String(chatId);

  hide(homeScreen);
  show(chatScreen);

  messages.innerHTML = "";

  try {
    const data =
      await api(
        `/api/chats/${encodeURIComponent(
          chatId
        )}/messages`
      );

    const chatMessages =
      Array.isArray(data.messages)
        ? data.messages
        : [];

    for (const message of chatMessages) {
      addMessage(
        message.role,
        message.content
      );
    }

    scrollMessagesToBottom();
  } catch (error) {
    addMessage(
      "assistant",
      `Не удалось открыть чат: ${error.message}`
    );
  }
}

function addMessage(
  role,
  text,
  options = {}
) {
  const wrapper =
    document.createElement("div");

  wrapper.className =
    `message ${
      role === "user"
        ? "user"
        : "assistant"
    }`;

  if (options.loading) {
    wrapper.dataset.loading =
      "true";
  }

  const roleText =
    document.createElement("div");

  roleText.className =
    "message-role";

  roleText.textContent =
    role === "user"
      ? "Вы"
      : "Нейро";

  const bubble =
    document.createElement("div");

  bubble.className =
    "message-bubble";

  if (
    typeof text === "string" ||
    typeof text === "number"
  ) {
    bubble.textContent =
      String(text);
  }

  wrapper.appendChild(roleText);
  wrapper.appendChild(bubble);

  messages.appendChild(wrapper);

  scrollMessagesToBottom();

  return wrapper;
}

function addImageMessage(
  dataURI,
  prompt = ""
) {
  if (!dataURI) {
    return null;
  }

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "message assistant";

  const roleText =
    document.createElement("div");

  roleText.className =
    "message-role";

  roleText.textContent =
    "Нейро";

  const bubble =
    document.createElement("div");

  bubble.className =
    "message-bubble";

  const image =
    document.createElement("img");

  image.src = dataURI;

  image.alt =
    prompt ||
    "Сгенерированное изображение";

  image.loading = "lazy";

  image.style.display =
    "block";

  image.style.width =
    "min(100%, 768px)";

  image.style.maxHeight =
    "70vh";

  image.style.objectFit =
    "contain";

  image.style.borderRadius =
    "16px";

  image.style.border =
    "1px solid rgba(255,255,255,.1)";

  image.style.marginTop =
    "4px";

  bubble.appendChild(image);

  wrapper.appendChild(roleText);
  wrapper.appendChild(bubble);

  messages.appendChild(wrapper);

  scrollMessagesToBottom();

  return wrapper;
}

function addToolResult(
  response,
  prompt,
  tool
) {
  if (!response) {
    addMessage(
      "assistant",
      "Инструмент не вернул результат."
    );

    return;
  }

  const imageData =
    extractImageData(response);

  if (
    tool === "image" &&
    imageData
  ) {
    addImageMessage(
      imageData,
      prompt
    );

    return;
  }

  const message =
    response.message ||
    response.answer ||
    response.response ||
    response.result?.message ||
    response.result?.response ||
    "";

  if (message) {
    addMessage(
      "assistant",
      message
    );

    return;
  }

  addMessage(
    "assistant",
    "Запрос обработан."
  );
}

function extractImageData(
  response
) {
  const candidates = [
    response?.dataURI,
    response?.dataUri,
    response?.image,
    response?.result?.dataURI,
    response?.result?.dataUri,
    response?.result?.image
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (
      typeof candidate === "string"
    ) {
      if (
        candidate.startsWith(
          "data:image/"
        )
      ) {
        return candidate;
      }

      return `data:image/jpeg;base64,${candidate}`;
    }
  }

  return null;
}

function scrollMessagesToBottom() {
  if (!messages) {
    return;
  }

  requestAnimationFrame(() => {
    messages.scrollTop =
      messages.scrollHeight;
  });
}

async function sendMessage(
  input,
  chatMode = false
) {
  if (
    !input ||
    state.sending
  ) {
    return;
  }

  const text =
    String(input.value || "")
      .trim();

  if (!text) {
    return;
  }

  state.sending = true;

  input.value = "";
  input.style.height = "auto";

  if (!chatMode) {
    hide(homeScreen);
    show(chatScreen);
  }

  addMessage(
    "user",
    text
  );

  /*
   * Сохраняем историю ДО создания
   * индикатора загрузки.
   * Поэтому "Нейро думает…"
   * никогда не попадает в AI.
   */
  const history =
    collectHistory(30);

  const loading =
    addMessage(
      "assistant",
      "Нейро думает…",
      {
        loading: true
      }
    );

  try {
    if (
      state.authenticated &&
      !state.currentChatId &&
      !state.temporaryChat
    ) {
      const created =
        await api(API.chats, {
          method: "POST",
          body: JSON.stringify({
            title:
              text.slice(0, 50) ||
              "Новый чат",
            model:
              state.currentModel
          })
        });

      state.currentChatId =
        created.chat?.id ||
        null;

      await loadChats();
    }

    const response =
      await api(API.chat, {
        method: "POST",
        body: JSON.stringify({
          model:
            state.currentModel,
          messages: history
        })
      });

    loading.remove();

    const answer =
      response.message ||
      response.answer ||
      response.response ||
      "";

    addMessage(
      "assistant",
      answer ||
        "Ответ получен."
    );

    if (
      state.authenticated &&
      state.currentChatId &&
      !state.temporaryChat
    ) {
      await saveMessagePair(
        state.currentChatId,
        text,
        answer
      );

      await loadChats();
    }
  } catch (error) {
    loading.remove();

    addMessage(
      "assistant",
      `Ошибка: ${
        error?.message ||
        "Не удалось получить ответ."
      }`
    );
  } finally {
    state.sending = false;

    input.focus();
  }
}

function collectHistory(limit = 30) {
  return Array.from(
    messages.querySelectorAll(
      ".message"
    )
  )
    .filter(
      (element) =>
        !element.dataset.loading
    )
    .slice(-limit)
    .map((element) => ({
      role:
        element.classList.contains(
          "user"
        )
          ? "user"
          : "assistant",

      content:
        element.querySelector(
          ".message-bubble"
        )?.textContent || ""
    }))
    .filter(
      (message) =>
        message.content.trim()
    );
}

async function saveMessagePair(
  chatId,
  userText,
  assistantText
) {
  await api(
    `/api/chats/${encodeURIComponent(
      chatId
    )}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        role: "user",
        content: userText
      })
    }
  );

  if (assistantText) {
    await api(
      `/api/chats/${encodeURIComponent(
        chatId
      )}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "assistant",
          content:
            assistantText
        })
      }
    );
  }
}

function resizeTextarea(input) {
  if (!input) {
    return;
  }

  input.style.height = "auto";

  input.style.height =
    `${Math.min(
      input.scrollHeight,
      180
    )}px`;
}

function setupComposer(
  input,
  button,
  chatMode
) {
  if (!input || !button) {
    return;
  }

  input.addEventListener(
    "input",
    () => {
      resizeTextarea(input);
    }
  );

  input.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();

        sendMessage(
          input,
          chatMode
        );
      }
    }
  );

  button.addEventListener(
    "click",
    () => {
      sendMessage(
        input,
        chatMode
      );
    }
  );
}

function setModel(model) {
  if (
    !MODEL_NAMES[model]
  ) {
    model = "neuro";
  }

  state.currentModel =
    model;

  const name =
    getModelName(model);

  const modelButtonText =
    $("modelButtonText");

  const chatModelButtonText =
    $("chatModelButtonText");

  if (modelButtonText) {
    modelButtonText.textContent =
      name;
  }

  if (chatModelButtonText) {
    chatModelButtonText.textContent =
      name;
  }

  hide($("modelMenu"));
}

function getModelName(model) {
  return (
    MODEL_NAMES[model] ||
    "Нейро"
  );
}

function toggleModelMenu() {
  const menu =
    $("modelMenu");

  if (!menu) {
    return;
  }

  menu.hidden =
    !menu.hidden;
}

function openAuth(
  mode = "login"
) {
  state.authMode =
    mode;

  const title =
    $("authTitle");

  const submit =
    $("authSubmitButton");

  const switchButton =
    $("authSwitchButton");

  const error =
    $("authError");

  if (title) {
    title.textContent =
      mode === "login"
        ? "Войти"
        : "Создать аккаунт";
  }

  if (submit) {
    submit.textContent =
      mode === "login"
        ? "Войти"
        : "Создать аккаунт";
  }

  if (switchButton) {
    switchButton.textContent =
      mode === "login"
        ? "Создать аккаунт"
        : "У меня уже есть аккаунт";
  }

  if (error) {
    error.textContent = "";
  }

  openModal("authModal");

  requestAnimationFrame(() => {
    $("authUsername")?.focus();
  });
}

async function submitAuth() {
  const username =
    $("authUsername")
      ?.value
      .trim();

  const password =
    $("authPassword")
      ?.value || "";

  const error =
    $("authError");

  if (error) {
    error.textContent = "";
  }

  if (!username) {
    if (error) {
      error.textContent =
        "Введите имя пользователя.";
    }

    return;
  }

  if (!password) {
    if (error) {
      error.textContent =
        "Введите пароль.";
    }

    return;
  }

  try {
    const data =
      await api(
        state.authMode === "login"
          ? API.login
          : API.register,
        {
          method: "POST",
          body: JSON.stringify({
            username,
            password
          })
        }
      );

    setAuth(data.user);

    closeModal(
      "authModal"
    );

    $("authPassword").value =
      "";

    await Promise.all([
      loadChats(),
      loadSettings()
    ]);
  } catch (requestError) {
    if (error) {
      error.textContent =
        requestError.message;
    }
  }
}

async function doLogout() {
  try {
    await api(
      API.logout,
      {
        method: "POST"
      }
    );
  } catch {
    // Локальное состояние
    // очищается в любом случае.
  }

  setAuth(null);

  state.currentChatId =
    null;

  state.chats = [];

  state.temporaryChat =
    false;

  renderChats();

  closeModal(
    "profileModal"
  );

  messages.innerHTML = "";

  show(homeScreen);
  hide(chatScreen);
}

async function loadSettings() {
  if (!state.authenticated) {
    return;
  }

  try {
    const [
      settingsData,
      permissionsData,
      pluginsData
    ] = await Promise.all([
      api(API.settings),
      api(API.permissions),
      api(API.plugins)
    ]);

    const settings =
      settingsData.settings || {};

    state.temporaryChat =
      Boolean(
        settings.temporaryChat
      );

    setChecked(
      "temporaryChatToggle",
      state.temporaryChat
    );

    const keys =
      settings.apiKeys || {};

    setValue(
      "openaiKey",
      keys.openai || ""
    );

    setValue(
      "googleKey",
      keys.google || ""
    );

    setValue(
      "xaiKey",
      keys.xai || ""
    );

    setValue(
      "aliceKey",
      keys.alice || ""
    );

    const permissions =
      permissionsData.permissions ||
      {};

    setChecked(
      "permissionFiles",
      Boolean(
        permissions.files
      )
    );

    setChecked(
      "permissionMicrophone",
      Boolean(
        permissions.microphone
      )
    );

    setChecked(
      "permissionExternal",
      Boolean(
        permissions.external
      )
    );

    const plugins =
      pluginsData.plugins || {};

    setChecked(
      "pluginGithub",
      Boolean(
        plugins.github
      )
    );

    setChecked(
      "pluginGoogle",
      Boolean(
        plugins.google
      )
    );

    setChecked(
      "pluginChatGPT",
      Boolean(
        plugins.chatgpt
      )
    );

    setChecked(
      "pluginGrok",
      Boolean(
        plugins.grok
      )
    );
  } catch (error) {
    console.error(
      "Ошибка загрузки настроек:",
      error
    );
  }
}

function setChecked(
  id,
  value
) {
  const element = $(id);

  if (element) {
    element.checked =
      Boolean(value);
  }
}

function setValue(
  id,
  value
) {
  const element = $(id);

  if (element) {
    element.value =
      String(value ?? "");
  }
}

async function saveAllSettings() {
  if (!state.authenticated) {
    openAuth();
    return;
  }

  const settings =
    {
      temporaryChat:
        Boolean(
          $("temporaryChatToggle")
            ?.checked
        ),

      apiKeys: {
        openai:
          $("openaiKey")
            ?.value
            .trim() || "",

        google:
          $("googleKey")
            ?.value
            .trim() || "",

        xai:
          $("xaiKey")
            ?.value
            .trim() || "",

        alice:
          $("aliceKey")
            ?.value
            .trim() || ""
      }
    };

  const permissions = {
    files:
      Boolean(
        $("permissionFiles")
          ?.checked
      ),

    microphone:
      Boolean(
        $("permissionMicrophone")
          ?.checked
      ),

    external:
      Boolean(
        $("permissionExternal")
          ?.checked
      )
  };

  const plugins = {
    github:
      Boolean(
        $("pluginGithub")
          ?.checked
      ),

    google:
      Boolean(
        $("pluginGoogle")
          ?.checked
      ),

    chatgpt:
      Boolean(
        $("pluginChatGPT")
          ?.checked
      ),

    grok:
      Boolean(
        $("pluginGrok")
          ?.checked
      )
  };

  await api(
    API.settings,
    {
      method: "POST",
      body: JSON.stringify({
        settings
      })
    }
  );

  await api(
    API.permissions,
    {
      method: "POST",
      body: JSON.stringify({
        permissions
      })
    }
  );

  await api(
    API.plugins,
    {
      method: "POST",
      body: JSON.stringify({
        plugins
      })
    }
  );

  state.temporaryChat =
    settings.temporaryChat;
}

function setupVoice(
  button,
  input
) {
  if (!button || !input) {
    return;
  }

  button.addEventListener(
    "click",
    () => {
      const Recognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (!Recognition) {
        alert(
          "Голосовой ввод не поддерживается этим браузером."
        );

        return;
      }

      const recognition =
        new Recognition();

      recognition.lang =
        "ru-RU";

      recognition.interimResults =
        false;

      recognition.continuous =
        false;

      recognition.onresult =
        (event) => {
          const transcript =
            event
              ?.results?.[0]?.[0]
              ?.transcript || "";

          if (!transcript) {
            return;
          }

          input.value =
            input.value
              ? `${input.value} ${transcript}`
              : transcript;

          resizeTextarea(input);

          input.focus();
        };

      recognition.onerror =
        (event) => {
          console.error(
            "SpeechRecognition:",
            event.error
          );
        };

      try {
        recognition.start();
      } catch (error) {
        console.error(
          "Не удалось запустить микрофон:",
          error
        );
      }
    }
  );
}

function setupFiles(
  button,
  input
) {
  if (!button || !input) {
    return;
  }

  button.addEventListener(
    "click",
    () => {
      input.click();
    }
  );

  input.addEventListener(
    "change",
    () => {
      const files =
        Array.from(
          input.files || []
        );

      if (!files.length) {
        return;
      }

      const names =
        files
          .map(
            (file) =>
              file.name
          )
          .join(", ");

      const target =
        button
          .closest(".composer")
          ?.querySelector(
            "textarea"
          );

      if (target) {
        target.value +=
          target.value
            ? `\n\n[Файлы: ${names}]`
            : `[Файлы: ${names}]`;

        resizeTextarea(target);
        target.focus();
      }

      input.value = "";
    }
  );
}

const toolInfo = {
  image: {
    title:
      "Создание изображения",

    description:
      "Опишите изображение, которое нужно создать.",

    endpoint:
      API.image
  },

  video: {
    title:
      "Создание видео",

    description:
      "Опишите видео, которое нужно создать.",

    endpoint:
      API.video
  },

  music: {
    title:
      "Создание музыки",

    description:
      "Опишите музыку, которую нужно создать.",

    endpoint:
      API.music
  },

  "3d": {
    title:
      "Создание 3D-модели",

    description:
      "Опишите 3D-модель, которую нужно подготовить.",

    endpoint:
      API.model3d
  },

  website: {
    title:
      "Создание сайта",

    description:
      "Опишите сайт. Нейро подготовит структуру и код.",

    endpoint:
      API.chat
  }
};

function openTool(tool) {
  const info =
    toolInfo[tool];

  if (!info) {
    return;
  }

  state.selectedTool =
    tool;

  $("toolTitle").textContent =
    info.title;

  $("toolDescription").textContent =
    info.description;

  $("toolPrompt").value =
    "";

  $("toolError").textContent =
    "";

  openModal(
    "toolModal"
  );

  requestAnimationFrame(() => {
    $("toolPrompt")
      ?.focus();
  });
}

async function runTool() {
  const tool =
    state.selectedTool;

  const info =
    toolInfo[tool];

  if (!info) {
    return;
  }

  const prompt =
    $("toolPrompt")
      ?.value
      .trim();

  const errorElement =
    $("toolError");

  if (!prompt) {
    if (errorElement) {
      errorElement.textContent =
        "Введите описание.";
    }

    return;
  }

  if (errorElement) {
    errorElement.textContent =
      "Выполняю…";
  }

  try {
    if (tool === "website") {
      closeModal(
        "toolModal"
      );

      hide(homeScreen);
      show(chatScreen);

      const websiteInput = {
        value:
          `Создай сайт по этому описанию:\n${prompt}`,
        style: {
          height: "auto"
        }
      };

      await sendMessage(
        websiteInput,
        true
      );

      return;
    }

    const response =
      await api(
        info.endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            prompt
          })
        }
      );

    closeModal(
      "toolModal"
    );

    hide(homeScreen);
    show(chatScreen);

    addToolResult(
      response,
      prompt,
      tool
    );
  } catch (error) {
    if (errorElement) {
      errorElement.textContent =
        error.message ||
        "Не удалось выполнить действие.";
    }
  }
}

function setupUI() {
  $("newChatButton")
    ?.addEventListener(
      "click",
      createNewChat
    );

  $("settingsButton")
    ?.addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          openAuth();
          return;
        }

        openModal(
          "settingsModal"
        );
      }
    );

  $("profileButton")
    ?.addEventListener(
      "click",
      () => {
        openModal(
          "profileModal"
        );
      }
    );

  $("accountButton")
    ?.addEventListener(
      "click",
      () => {
        if (state.authenticated) {
          openModal(
            "profileModal"
          );
        } else {
          openAuth();
        }
      }
    );

  $("profileAuthButton")
    ?.addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          closeModal(
            "profileModal"
          );

          openAuth();
        }
      }
    );

  $("logoutButton")
    ?.addEventListener(
      "click",
      doLogout
    );

  $("authSubmitButton")
    ?.addEventListener(
      "click",
      submitAuth
    );

  $("authSwitchButton")
    ?.addEventListener(
      "click",
      () => {
        openAuth(
          state.authMode ===
            "login"
            ? "register"
            : "login"
        );
      }
    );

  $("continueGuestButton")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "authModal"
        );
      }
    );

  $("authPassword")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter"
        ) {
          event.preventDefault();
          submitAuth();
        }
      }
    );

  $("modelButton")
    ?.addEventListener(
      "click",
      toggleModelMenu
    );

  $("chatModelButton")
    ?.addEventListener(
      "click",
      toggleModelMenu
    );

  document
    .querySelectorAll(
      "#modelMenu button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setModel(
            button.dataset.model
          );
        }
      );
    });

  document
    .querySelectorAll(
      "[data-close]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          closeModal(
            button.dataset.close
          );
        }
      );
    });

  document
    .querySelectorAll(
      ".modal-overlay"
    )
    .forEach((overlay) => {
      overlay.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            overlay
          ) {
            closeModal(
              overlay.id
            );
          }
        }
      );
    });

  document
    .querySelectorAll(
      ".tool-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openTool(
            button.dataset.tool
          );
        }
      );
    });

  $("toolRunButton")
    ?.addEventListener(
      "click",
      runTool
    );

  $("toolPrompt")
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" &&
          (event.metaKey ||
            event.ctrlKey)
        ) {
          event.preventDefault();
          runTool();
        }
      }
    );

  $("saveSettingsButton")
    ?.addEventListener(
      "click",
      async () => {
        const button =
          $("saveSettingsButton");

        if (button) {
          button.disabled = true;
          button.textContent =
            "Сохранение…";
        }

        try {
          await saveAllSettings();

          closeModal(
            "settingsModal"
          );
        } catch (error) {
          alert(
            error.message ||
            "Не удалось сохранить настройки."
          );
        } finally {
          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Сохранить настройки";
          }
        }
      }
    );

  $("openSidebarButton")
    ?.addEventListener(
      "click",
      () => {
        $("sidebar")
          ?.classList
          .add("open");
      }
    );

  $("closeSidebarButton")
    ?.addEventListener(
      "click",
      () => {
        $("sidebar")
          ?.classList
          .remove("open");
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeAllModals();

        $("modelMenu").hidden =
          true;

        $("sidebar")
          ?.classList
          .remove("open");
      }
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      const menu =
        $("modelMenu");

      if (
        menu &&
        !menu.hidden &&
        !event.target.closest(
          "#modelMenu"
        ) &&
        !event.target.closest(
          "#modelButton"
        ) &&
        !event.target.closest(
          "#chatModelButton"
        )
      ) {
        menu.hidden = true;
      }
    }
  );
}

function initialize() {
  setupComposer(
    $("messageInput"),
    $("sendButton"),
    false
  );

  setupComposer(
    $("chatMessageInput"),
    $("chatSendButton"),
    true
  );

  setupVoice(
    $("voiceButton"),
    $("messageInput")
  );

  setupVoice(
    $("chatVoiceButton"),
    $("chatMessageInput")
  );

  setupFiles(
    $("attachButton"),
    $("fileInput")
  );

  setupFiles(
    $("chatAttachButton"),
    $("chatFileInput")
  );

  setupUI();

  setModel("neuro");

  loadSession();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initialize,
    {
      once: true
    }
  );
} else {
  initialize();
}