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

const state = {
  user: null,
  authenticated: false,
  guest: true,
  authMode: "login",
  currentChatId: null,
  currentModel: "neuro",
  temporaryChat: false,
  chats: [],
  selectedTool: null
};

const $ = (id) =>
  document.getElementById(id);

const homeScreen = $("homeScreen");
const chatScreen = $("chatScreen");
const messages = $("messages");

function show(element) {
  if (element) element.hidden = false;
}

function hide(element) {
  if (element) element.hidden = true;
}

function openModal(id) {
  show($(id));
}

function closeModal(id) {
  hide($(id));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
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
  state.user = user;
  state.authenticated = Boolean(user);
  state.guest = !user;

  $("accountButton").textContent =
    user ? user.username : "Войти";

  $("profileButtonText").textContent =
    user ? user.username : "Профиль";

  $("profileName").textContent =
    user ? user.username : "Гость";

  $("profileAuthButton").textContent =
    user ? "Профиль подключён" : "Войти";

  $("logoutButton").hidden = !user;
}

async function loadSession() {
  try {
    const data = await api(API.me);

    setAuth(
      data.authenticated
        ? data.user
        : null
    );
  } catch {
    setAuth(null);
  }

  if (state.authenticated) {
    await loadChats();
    await loadSettings();
  }
}

async function loadChats() {
  try {
    const data = await api(API.chats);

    state.chats = data.chats || [];

    renderChats();
  } catch {
    state.chats = [];
    renderChats();
  }
}

function renderChats() {
  const list = $("chatList");

  list.innerHTML = "";

  for (const chat of state.chats) {
    const button =
      document.createElement("button");

    button.className = "chat-item";
    button.textContent =
      chat.title || "Новый чат";

    button.addEventListener(
      "click",
      () => openChat(chat.id)
    );

    list.appendChild(button);
  }
}

async function createNewChat() {
  state.currentChatId = null;

  show(homeScreen);
  hide(chatScreen);

  messages.innerHTML = "";

  $("messageInput").focus();

  if (!state.authenticated) {
    return;
  }

  try {
    const data = await api(API.chats, {
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
    console.error(error);
  }
}

async function openChat(chatId) {
  state.currentChatId = chatId;

  hide(homeScreen);
  show(chatScreen);

  messages.innerHTML = "";

  try {
    const data = await api(
      `/api/chats/${encodeURIComponent(chatId)}/messages`
    );

    for (const message of data.messages || []) {
      addMessage(
        message.role,
        message.content
      );
    }

    messages.scrollTop =
      messages.scrollHeight;
  } catch (error) {
    addMessage(
      "assistant",
      `Не удалось открыть чат: ${error.message}`
    );
  }
}

function addMessage(role, text) {
  const wrapper =
    document.createElement("div");

  wrapper.className =
    `message ${role}`;

  const roleText =
    document.createElement("div");

  roleText.className = "message-role";

  roleText.textContent =
    role === "user"
      ? "Вы"
      : "Нейро";

  const bubble =
    document.createElement("div");

  bubble.className =
    "message-bubble";

  bubble.textContent =
    String(text || "");

  wrapper.appendChild(roleText);
  wrapper.appendChild(bubble);

  messages.appendChild(wrapper);

  messages.scrollTop =
    messages.scrollHeight;

  return wrapper;
}

async function sendMessage(input, chatMode = false) {
  const text =
    String(input.value || "").trim();

  if (!text) {
    return;
  }

  input.value = "";
  input.style.height = "auto";

  if (!chatMode) {
    hide(homeScreen);
    show(chatScreen);
  }

  addMessage("user", text);

  const loading =
    addMessage(
      "assistant",
      "Нейро думает…"
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
              text.slice(0, 50),
            model:
              state.currentModel
          })
        });

      state.currentChatId =
        created.chat?.id || null;

      await loadChats();
    }

    const history = [
      ...Array.from(
        messages.querySelectorAll(
          ".message"
        )
      )
      .slice(-30)
      .map((item) => ({
        role: item.classList.contains(
          "user"
        )
          ? "user"
          : "assistant",

        content:
          item.querySelector(
            ".message-bubble"
          )?.textContent || ""
      }))
    ];

    const response =
      await api(API.chat, {
        method: "POST",
        body: JSON.stringify({
          model: state.currentModel,
          messages: history
        })
      });

    loading.remove();

    addMessage(
      "assistant",
      response.message ||
        response.answer ||
        "Ответ получен."
    );

    if (
      state.authenticated &&
      state.currentChatId &&
      !state.temporaryChat
    ) {
      await api(
        `/api/chats/${encodeURIComponent(
          state.currentChatId
        )}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            role: "user",
            content: text
          })
        }
      );

      await api(
        `/api/chats/${encodeURIComponent(
          state.currentChatId
        )}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            role: "assistant",
            content:
              response.message ||
              response.answer ||
              ""
          })
        }
      );
    }
  } catch (error) {
    loading.remove();

    addMessage(
      "assistant",
      `Ошибка: ${error.message}`
    );
  }
}

function resizeTextarea(input) {
  input.style.height = "auto";
  input.style.height =
    `${Math.min(input.scrollHeight, 180)}px`;
}

function setupComposer(input, button, chatMode) {
  input.addEventListener(
    "input",
    () => resizeTextarea(input)
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
    () =>
      sendMessage(
        input,
        chatMode
      )
  );
}

function setModel(model) {
  state.currentModel = model;

  $("modelButtonText").textContent =
    getModelName(model);

  $("chatModelButtonText").textContent =
    getModelName(model);

  hide($("modelMenu"));
}

function getModelName(model) {
  const names = {
    neuro: "Нейро",
    chatgpt: "ChatGPT",
    gemini: "Gemini",
    grok: "Grok",
    "alice-1": "Алиса 1"
  };

  return names[model] || "Нейро";
}

function toggleModelMenu() {
  $("modelMenu").hidden =
    !$("modelMenu").hidden;
}

function openAuth(mode = "login") {
  state.authMode = mode;

  $("authTitle").textContent =
    mode === "login"
      ? "Войти"
      : "Создать аккаунт";

  $("authSubmitButton").textContent =
    mode === "login"
      ? "Войти"
      : "Создать аккаунт";

  $("authSwitchButton").textContent =
    mode === "login"
      ? "Создать аккаунт"
      : "У меня уже есть аккаунт";

  $("authError").textContent = "";

  openModal("authModal");
}

async function submitAuth() {
  const username =
    $("authUsername").value.trim();

  const password =
    $("authPassword").value;

  $("authError").textContent = "";

  try {
    const data = await api(
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

    closeModal("authModal");

    await loadChats();
    await loadSettings();
  } catch (error) {
    $("authError").textContent =
      error.message;
  }
}

async function doLogout() {
  try {
    await api(API.logout, {
      method: "POST"
    });
  } catch {
    // Cookie всё равно очищаем локально.
  }

  setAuth(null);

  state.currentChatId = null;
  state.chats = [];

  renderChats();

  closeModal("profileModal");

  show(homeScreen);
  hide(chatScreen);
}

async function loadSettings() {
  if (!state.authenticated) {
    return;
  }

  try {
    const settings =
      await api(API.settings);

    const value =
      settings.settings || {};

    state.temporaryChat =
      Boolean(value.temporaryChat);

    $("temporaryChatToggle").checked =
      state.temporaryChat;

    const keys =
      value.apiKeys || {};

    $("openaiKey").value =
      keys.openai || "";

    $("googleKey").value =
      keys.google || "";

    $("xaiKey").value =
      keys.xai || "";

    $("aliceKey").value =
      keys.alice || "";

    const permissions =
      await api(API.permissions);

    const p =
      permissions.permissions || {};

    $("permissionFiles").checked =
      Boolean(p.files);

    $("permissionMicrophone").checked =
      Boolean(p.microphone);

    $("permissionExternal").checked =
      Boolean(p.external);

    const plugins =
      await api(API.plugins);

    const pl =
      plugins.plugins || {};

    $("pluginGithub").checked =
      Boolean(pl.github);

    $("pluginGoogle").checked =
      Boolean(pl.google);

    $("pluginChatGPT").checked =
      Boolean(pl.chatgpt);

    $("pluginGrok").checked =
      Boolean(pl.grok);

  } catch (error) {
    console.error(error);
  }
}

async function saveAllSettings() {
  if (!state.authenticated) {
    openAuth();
    return;
  }

  await api(API.settings, {
    method: "POST",
    body: JSON.stringify({
      settings: {
        temporaryChat:
          $("temporaryChatToggle").checked,

        apiKeys: {
          openai:
            $("openaiKey").value.trim(),

          google:
            $("googleKey").value.trim(),

          xai:
            $("xaiKey").value.trim(),

          alice:
            $("aliceKey").value.trim()
        }
      }
    })
  });

  await api(API.permissions, {
    method: "POST",
    body: JSON.stringify({
      permissions: {
        files:
          $("permissionFiles").checked,

        microphone:
          $("permissionMicrophone").checked,

        external:
          $("permissionExternal").checked
      }
    })
  });

  await api(API.plugins, {
    method: "POST",
    body: JSON.stringify({
      plugins: {
        github:
          $("pluginGithub").checked,

        google:
          $("pluginGoogle").checked,

        chatgpt:
          $("pluginChatGPT").checked,

        grok:
          $("pluginGrok").checked
      }
    })
  });

  state.temporaryChat =
    $("temporaryChatToggle").checked;
}

function setupVoice(button, input) {
  button.addEventListener(
    "click",
    () => {
      if (!("webkitSpeechRecognition" in window ||
            "SpeechRecognition" in window)) {
        alert(
          "Голосовой ввод не поддерживается этим браузером."
        );
        return;
      }

      const Recognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      const recognition =
        new Recognition();

      recognition.lang = "ru-RU";
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        input.value +=
          event.results[0][0].transcript;

        resizeTextarea(input);
        input.focus();
      };

      recognition.start();
    }
  );
}

function setupFiles(button, input) {
  button.addEventListener(
    "click",
    () => input.click()
  );

  input.addEventListener(
    "change",
    () => {
      const files =
        Array.from(input.files || []);

      if (!files.length) return;

      const names =
        files
          .map((file) => file.name)
          .join(", ");

      const target =
        button.closest(".composer")
          ?.querySelector("textarea");

      if (target) {
        target.value +=
          target.value
            ? `\n\n[Файлы: ${names}]`
            : `[Файлы: ${names}]`;

        resizeTextarea(target);
      }

      input.value = "";
    }
  );
}

const toolInfo = {
  image: {
    title: "Создание изображения",
    description:
      "Опишите изображение, которое нужно создать.",
    endpoint: API.image
  },

  video: {
    title: "Создание видео",
    description:
      "Опишите видео, которое нужно создать.",
    endpoint: API.video
  },

  music: {
    title: "Создание музыки",
    description:
      "Опишите музыку, которую нужно создать.",
    endpoint: API.music
  },

  "3d": {
    title: "Создание 3D-модели",
    description:
      "Опишите 3D-модель, которую нужно подготовить.",
    endpoint: API.model3d
  },

  website: {
    title: "Создание сайта",
    description:
      "Опишите сайт. Нейро-чат подготовит структуру и код.",
    endpoint: API.chat
  }
};

function openTool(tool) {
  const info = toolInfo[tool];

  if (!info) return;

  state.selectedTool = tool;

  $("toolTitle").textContent =
    info.title;

  $("toolDescription").textContent =
    info.description;

  $("toolPrompt").value = "";

  $("toolError").textContent = "";

  openModal("toolModal");
}

async function runTool() {
  const tool =
    state.selectedTool;

  const info =
    toolInfo[tool];

  const prompt =
    $("toolPrompt").value.trim();

  if (!prompt) {
    $("toolError").textContent =
      "Введите описание.";
    return;
  }

  $("toolError").textContent =
    "Выполняю…";

  try {
    if (tool === "website") {
      closeModal("toolModal");

      hide(homeScreen);
      show(chatScreen);

      await sendMessage(
        {
          value:
            `Создай сайт по этому описанию:\n${prompt}`,
          style: {
            height: "auto"
          }
        },
        true
      );

      return;
    }

    const response =
      await api(info.endpoint, {
        method: "POST",
        body: JSON.stringify({
          prompt
        })
      });

    closeModal("toolModal");

    hide(homeScreen);
    show(chatScreen);

    addMessage(
      "assistant",
      response.message ||
        "Запрос обработан."
    );

  } catch (error) {
    $("toolError").textContent =
      error.message;
  }
}

function setupUI() {
  $("newChatButton")
    .addEventListener(
      "click",
      createNewChat
    );

  $("settingsButton")
    .addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          openAuth();
          return;
        }

        openModal("settingsModal");
      }
    );

  $("profileButton")
    .addEventListener(
      "click",
      () =>
        openModal("profileModal")
    );

  $("accountButton")
    .addEventListener(
      "click",
      () => {
        if (state.authenticated) {
          openModal("profileModal");
        } else {
          openAuth();
        }
      }
    );

  $("profileAuthButton")
    .addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          closeModal("profileModal");
          openAuth();
        }
      }
    );

  $("logoutButton")
    .addEventListener(
      "click",
      doLogout
    );

  $("authSubmitButton")
    .addEventListener(
      "click",
      submitAuth
    );

  $("authSwitchButton")
    .addEventListener(
      "click",
      () =>
        openAuth(
          state.authMode === "login"
            ? "register"
            : "login"
        )
    );

  $("continueGuestButton")
    .addEventListener(
      "click",
      () =>
        closeModal("authModal")
    );

  $("modelButton")
    .addEventListener(
      "click",
      toggleModelMenu
    );

  $("chatModelButton")
    .addEventListener(
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
        () =>
          setModel(
            button.dataset.model
          )
      );
    });

  document
    .querySelectorAll(
      "[data-close]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          closeModal(
            button.dataset.close
          )
      );
    });

  document
    .querySelectorAll(
      ".tool-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          openTool(
            button.dataset.tool
          )
      );
    });

  $("toolRunButton")
    .addEventListener(
      "click",
      runTool
    );

  $("saveSettingsButton")
    .addEventListener(
      "click",
      async () => {
        try {
          await saveAllSettings();
          closeModal("settingsModal");
        } catch (error) {
          alert(error.message);
        }
      }
    );

  $("openSidebarButton")
    .addEventListener(
      "click",
      () =>
        $("sidebar")
          .classList
          .add("open")
    );

  $("closeSidebarButton")
    .addEventListener(
      "click",
      () =>
        $("sidebar")
          .classList
          .remove("open")
    );
}

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