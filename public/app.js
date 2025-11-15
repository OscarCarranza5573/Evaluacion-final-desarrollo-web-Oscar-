// Config
const API_BASE = ''; // mismo host/puerto del backend Express

// Utilidades
function setAuthStatus(text, ok = false) {
  const el = document.getElementById('auth-status');
  el.textContent = text;
  el.className = ok ? 'navbar-text text-light' : 'navbar-text';
}
function showFeedback(id, msg, type = 'muted') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `small text-${type}`;
}
function enableChatUI(enabled) {
  document.getElementById('message-content').disabled = !enabled;
  document.getElementById('send-btn').disabled = !enabled;
  document.getElementById('logout-btn').disabled = !enabled;
  const sendTab = document.querySelector('#view-tabs [data-view="send"]');
  const msgTab = document.querySelector('#view-tabs [data-view="messages"]');
  if (enabled) {
    sendTab.classList.remove('disabled');
    sendTab.removeAttribute('aria-disabled');
    msgTab.classList.remove('disabled');
    msgTab.removeAttribute('aria-disabled');
  } else {
    sendTab.classList.add('disabled');
    sendTab.setAttribute('aria-disabled', 'true');
    msgTab.classList.add('disabled');
    msgTab.setAttribute('aria-disabled', 'true');
  }
}
function extractJWTToken(possible) {
  // Intenta varias formas de obtener el token
  if (!possible) return null;
  if (typeof possible === 'string') {
    const str = possible.trim();
    if (str.startsWith('Bearer ')) return str.substring(7);
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(str)) return str;
    return null;
  }
  if (typeof possible === 'object') {
    for (const key of Object.keys(possible)) {
      const val = possible[key];
      const tok = extractJWTToken(val);
      if (tok) return tok;
    }
  }
  return null;
}

// Estado
let currentUser = null;
let bearerToken = null;

function loadStateFromStorage() {
  currentUser = localStorage.getItem('chat_user') || null;
  bearerToken = localStorage.getItem('chat_token') || null;
  if (bearerToken && currentUser) {
    setAuthStatus(`Autenticado como ${currentUser}`, true);
    enableChatUI(true);
  } else {
    setAuthStatus('No autenticado');
    enableChatUI(false);
  }
}

function setActiveView(view) {
  if ((!bearerToken || !currentUser) && view !== 'login') {
    showFeedback('login-feedback', 'Debes iniciar sesión primero', 'warning');
    view = 'login';
  }
  const sections = {
    login: document.getElementById('view-login'),
    send: document.getElementById('view-send'),
    messages: document.getElementById('view-messages'),
  };
  Object.keys(sections).forEach(key => {
    sections[key].classList.toggle('d-none', key !== view);
  });
  document.querySelectorAll('#view-tabs .nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
}

// Autenticación
async function login(username, password) {
  try {
    showFeedback('login-feedback', 'Autenticando...', 'primary');
    const body = { Username: username, Password: password };
    const resp = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.Message || 'Error de autenticación');
    }
    const token = extractJWTToken(data) || extractJWTToken(data?.token) || extractJWTToken(data?.Token);
    if (!token) {
      throw new Error('No se pudo extraer el Token Bearer del response');
    }
    bearerToken = token;
    currentUser = username;
    localStorage.setItem('chat_token', bearerToken);
    localStorage.setItem('chat_user', currentUser);
    setAuthStatus(`Autenticado como ${currentUser}`, true);
    enableChatUI(true);
    showFeedback('login-feedback', 'Autenticación exitosa. Token guardado.', 'success');
    setActiveView('send');
  } catch (err) {
    console.error(err);
    showFeedback('login-feedback', err.message, 'danger');
  }
}

function logout() {
  localStorage.removeItem('chat_token');
  localStorage.removeItem('chat_user');
  bearerToken = null;
  currentUser = null;
  setAuthStatus('No autenticado');
  enableChatUI(false);
}

// Envío de mensajes
async function sendMessage(content) {
  try {
    if (!bearerToken || !currentUser) throw new Error('Debes iniciar sesión primero');
    showFeedback('message-feedback', 'Enviando...', 'primary');
    const body = {
      Cod_Sala: 0,
      Login_Emisor: currentUser,
      Contenido: content,
    };
    const resp = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.Message || 'Error al enviar mensaje');
    showFeedback('message-feedback', 'Mensaje enviado correctamente.', 'success');
    document.getElementById('message-content').value = '';
    await loadMessages();
  } catch (err) {
    console.error(err);
    showFeedback('message-feedback', err.message, 'danger');
  }
}

// Lectura de mensajes
function pickTimestampKey(row) {
  const keys = Object.keys(row);
  // preferencia explícita de nombres conocidos
  const known = ['Fec_Creacion', 'Fecha', 'Fecha_Creacion', 'fecha', 'creado', 'createdAt'];
  const byKnown = known.find(k => keys.includes(k));
  if (byKnown) return byKnown;
  const candidates = keys.filter(k => /fec|fecha|time|crea/i.test(k));
  return candidates[0] || null;
}
function pickIdKey(row) {
  const keys = Object.keys(row);
  const known = ['Cod_Mensaje', 'Cod', 'Id', 'id'];
  const byKnown = known.find(k => keys.includes(k));
  if (byKnown) return byKnown;
  const candidates = keys.filter(k => /id|cod|codigo/i.test(k));
  return candidates[0] || null;
}
function pickContenidoKey(row) {
  const keys = Object.keys(row);
  const known = ['Contenido', 'contenido', 'Mensaje', 'mensaje', 'Texto', 'texto'];
  const byKnown = known.find(k => keys.includes(k));
  if (byKnown) return byKnown;
  return keys.find(k => /contenido|mensaje|text/i.test(k)) || keys[0];
}
function pickEmisorKey(row) {
  const keys = Object.keys(row);
  const known = ['Login_Emisor', 'Emisor', 'Usuario', 'User', 'login'];
  const byKnown = known.find(k => keys.includes(k));
  if (byKnown) return byKnown;
  return keys.find(k => /emisor|login|usuario|user/i.test(k));
}
function formatDate(value) {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return d.toLocaleString('es-GT', { hour12: false });
  } catch {
    return String(value || '');
  }
}
async function loadMessages() {
  try {
    if (!bearerToken || !currentUser) {
      document.getElementById('messages-list').innerHTML = '';
      document.getElementById('msg-count').textContent = '0';
      showFeedback('messages-feedback', 'Debes iniciar sesión para ver mensajes', 'warning');
      return;
    }
    const pane = document.getElementById('messages-pane');
    const list = document.getElementById('messages-list');
    const resp = await fetch(`${API_BASE}/api/messages`, {
      headers: { Authorization: `Bearer ${bearerToken}` }
    });
    if (resp.status === 401) {
      document.getElementById('messages-list').innerHTML = '';
      document.getElementById('msg-count').textContent = '0';
      showFeedback('messages-feedback', 'No autorizado. Inicia sesión nuevamente.', 'danger');
      setActiveView('login');
      return;
    }
    if (!resp.ok) {
      let data = null;
      try { data = await resp.json(); } catch {}
      const msg = data?.Message || `Error cargando mensajes (HTTP ${resp.status})`;
      showFeedback('messages-feedback', msg, 'danger');
      return;
    }
    const rows = await resp.json();

    showFeedback('messages-feedback', '', 'muted');
    // Ordenación cronológica: más antiguos arriba, más recientes al final
    let sorted = [...rows];
    if (rows.length > 0) {
      const tKey = pickTimestampKey(rows[0]);
      if (tKey) {
        sorted.sort((a, b) => new Date(a[tKey]) - new Date(b[tKey]));
      } else {
        const idKey = pickIdKey(rows[0]);
        if (idKey) sorted.sort((a, b) => (a[idKey] || 0) - (b[idKey] || 0));
      }
    }

    list.innerHTML = '';
    for (const row of sorted) {
      const tKey = pickTimestampKey(row);
      const contenidoKey = pickContenidoKey(row);
      const emisorKey = pickEmisorKey(row);
      const fecha = tKey ? formatDate(row[tKey]) : '';
      const emisor = emisorKey ? row[emisorKey] : '';
      const contenidoRaw = row[contenidoKey];
      const contenido = contenidoRaw == null ? '' : String(contenidoRaw);
      const isMe = emisor && currentUser && String(emisor).toLowerCase() === String(currentUser).toLowerCase();

      const item = document.createElement('div');
      item.className = 'list-group-item border-0 bg-transparent';
      item.innerHTML = `
        <div class="chat-bubble ${isMe ? 'me' : 'other'}">
          <div class="chat-meta">
            <strong>${emisor || 'Desconocido'}</strong>
            <small>${fecha || ''}</small>
          </div>
          <div class="text-break">${contenido}</div>
        </div>
      `;
      list.appendChild(item);
    }
    document.getElementById('msg-count').textContent = String(sorted.length);

    // Auto-scroll al final
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    }
  } catch (err) {
    console.error('Error cargando mensajes:', err);
    showFeedback('messages-feedback', err.message || 'Error cargando mensajes', 'danger');
  }
}

// Eventos UI
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromStorage();
  setActiveView('login');
  loadMessages();

  const tabContainer = document.getElementById('view-tabs');
  tabContainer.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    e.preventDefault();
    if (link.classList.contains('disabled')) return; // bloquea si está deshabilitado
    const view = link.dataset.view;
    setActiveView(view);
  });

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) {
      showFeedback('login-feedback', 'Completa usuario y contraseña', 'warning');
      return;
    }
    login(username, password);
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    logout();
    setActiveView('login');
  });

  document.getElementById('message-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const content = document.getElementById('message-content').value.trim();
    if (!content) {
      showFeedback('message-feedback', 'Escribe un mensaje', 'warning');
      return;
    }
    sendMessage(content);
  });

  // Enviar con Ctrl+Enter
  const msgContentEl = document.getElementById('message-content');
  msgContentEl.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter' && !document.getElementById('send-btn').disabled) {
      e.preventDefault();
      document.getElementById('message-form').requestSubmit();
    }
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    document.getElementById('message-content').value = '';
  });

  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadMessages();
    setActiveView('messages');
  });

  // Auto-actualización cada 10s
  setInterval(loadMessages, 10000);
});