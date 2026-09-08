// ===================== НАСТРОЙКИ =====================
const DEFAULT_API_KEY = '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';
const API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5';

let OPENAI_API_KEY = localStorage.getItem('neuro_api_key') || DEFAULT_API_KEY;
// =====================================================

let currentUser = null;
let messages = [];

function nextStep() {
  const username = document.getElementById('username').value.trim();
  if (!username) return alert('Введите имя пользователя');
  document.getElementById('step-username').style.display = 'none';
  document.getElementById('step-password').style.display = 'block';
  document.getElementById('password').focus();
}

function backToUsername() {
  document.getElementById('step-password').style.display = 'none';
  document.getElementById('step-username').style.display = 'block';
}

function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!password) return alert('Введите пароль');

  let users = JSON.parse(localStorage.getItem('neuro_users') || '{}');

  if (!users[username]) {
    users[username] = { password: password };
  } else if (users[username].password !== password) {
    return alert('Неверный пароль');
  }

  localStorage.setItem('neuro_users', JSON.stringify(users));
  currentUser = username;
  localStorage.setItem('neuro_current_user', username);

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  newChat();
}

function logout() {
  localStorage.removeItem('neuro_current_user');
  location.reload();
}

window.onload = () => {
  const savedUser = localStorage.getItem('neuro_current_user');
  if (savedUser) {
    currentUser = savedUser;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    newChat();
  }

  const savedKey = localStorage.getItem('neuro_api_key');
  if (savedKey) {
    OPENAI_API_KEY = savedKey;
  }
};

function newChat() {
  messages = [];
  document.getElementById('chat-title').textContent = 'Временный чат';
  document.getElementById('messages').innerHTML = `
    <div class="welcome">
      <div class="welcome-logo-text">Нейро-чат</div>
      <p>Чем я могу помочь?</p>
      <div class="suggestions">
        <button onclick="quickPrompt('Создай современный сайт-портфолио')">Создать сайт</button>
        <button onclick="quickPrompt('Напиши код на Python')">Написать код</button>
        <button onclick="quickPrompt('Создай сценарий короткого видео')">Создать видео</button>
        <button onclick="quickPrompt('Сочини песню')">Создать музыку</button>
        <button onclick="quickPrompt('Сделай 3D-модель куба для печати')">3D-модель</button>
      </div>
    </div>`;
}

function quickPrompt(text) {
  document.getElementById('user-input').value = text;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessage('user', text);

  let systemPrompt = `Ты — Нейро-чат, умный русскоязычный ассистент. Отвечай только на русском языке. Будь полезным, точным и дружелюбным.`;

  const lower = text.toLowerCase();

  if (lower.includes('сайт') || lower.includes('лендинг')) {
    systemPrompt += `\nПользователь хочет создать сайт. Сгенерируй полный рабочий HTML + CSS + JS код в одном файле.`;
  } else if (lower.includes('код') || lower.includes('программ') || lower.includes('скрипт')) {
    systemPrompt += `\nПользователь хочет код. Напиши чистый рабочий код с комментариями на русском.`;
  } else if (lower.includes('видео')) {
    systemPrompt += `\nПользователь хочет видео. Напиши подробный сценарий + готовый промпт для генерации видео.`;
  } else if (lower.includes('музык') || lower.includes('песн')) {
    systemPrompt += `\nПользователь хочет музыку. Напиши текст песни + структуру + промпт для Suno/Udio.`;
  } else if (lower.includes('3d') || lower.includes('модель') || lower.includes('печат')) {
    systemPrompt += `\nПользователь хочет 3D-модель. Сгенерируй код на OpenSCAD + инструкцию.`;
  }

  addMessage('bot', 'Думаю...');

  try {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: document.getElementById('model')?.value || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text
          })),
          { role: 'user', content: text }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.error) {
      updateLastBotMessage('Ошибка API: ' + (data.error.message || 'Неизвестная ошибка'));
      return;
    }

    const reply = data.choices[0].message.content;
    updateLastBotMessage(reply);
    messages.push({ role: 'bot', text: reply });

  } catch (err) {
    updateLastBotMessage('Ошибка соединения. Проверьте интернет или API-ключ.');
  }
}

function addMessage(role, text) {
  messages.push({ role, text });
  const container = document.getElementById('messages');
  if (container.querySelector('.welcome')) container.innerHTML = '';

  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function updateLastBotMessage(text) {
  const bots = document.querySelectorAll('.message.bot');
  if (bots.length) bots[bots.length - 1].textContent = text;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function toggleAttach() {
  const menu = document.getElementById('attach-menu');
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

function attachType(type) {
  alert('Функция «' + type + '» пока в разработке');
  toggleAttach();
}

function openSettings() {
  document.getElementById('settings-modal').style.display = 'flex';
  document.getElementById('api-key').value = OPENAI_API_KEY;
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveApiKey() {
  const key = document.getElementById('api-key').value.trim();
  if (key) {
    OPENAI_API_KEY = key;
    localStorage.setItem('neuro_api_key', key);
    alert('API-ключ сохранён!');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('user-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});