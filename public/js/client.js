const socket = io();
let currentUser = null;

const authDiv = document.getElementById('auth');
const appDiv = document.getElementById('app');
const status = document.getElementById('status');
const feed = document.getElementById('feed');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const postBtn = document.getElementById('postBtn');
const contentInput = document.getElementById('content');
const currentUserSpan = document.getElementById('currentUser');

// Helpers
function highlightHashtags(text){
  return text.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

async function checkSession(){
  const res = await fetch('/api/me', { credentials: 'include' });
  const data = await res.json();
  if (data.authenticated){
    currentUser = data.user;
    showApp();
  } else {
    showAuth();
  }
}

function showAuth(){
  authDiv.style.display = 'block';
  appDiv.style.display = 'none';
}

function showApp(){
  authDiv.style.display = 'none';
  appDiv.style.display = 'block';
  currentUserSpan.textContent = '@' + currentUser;
  loadPosts();
}

document.getElementById('registerBtn').onclick = async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) return status.textContent = 'Completa usuario y contraseña';
  const res = await fetch('/api/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, password }),
    credentials: 'include'
  });
  const data = await res.json();
  status.textContent = data.success ? 'Usuario creado. Conectando...' : (data.message || 'Error al registrar');
  if (data.success){
    currentUser = data.user;
    showApp();
  }
};

document.getElementById('loginBtn').onclick = async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) return status.textContent = 'Completa usuario y contraseña';
  const res = await fetch('/api/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, password }),
    credentials: 'include'
  });
  const data = await res.json();
  status.textContent = data.success ? 'Conectado' : ('❌ ' + (data.message || 'Error'));
  if (data.success){
    currentUser = data.user;
    showApp();
  }
};

document.getElementById('logoutBtn').onclick = async () => {
  await fetch('/api/logout', { method:'POST', credentials:'include' });
  currentUser = null;
  showAuth();
};

postBtn.onclick = async () => {
  const content = contentInput.value.trim();
  if (!content) return;
  await fetch('/api/posts', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ content })
  });
  contentInput.value = '';
};

// Load posts
async function loadPosts(){
  const res = await fetch('/api/posts', { credentials:'include' });
  const posts = await res.json();
  renderPosts(posts);
}

function renderPosts(posts){
  feed.innerHTML = '';
  posts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'post';
    div.id = p._id;
    div.innerHTML = `
      <div><b>@${p.user}</b> <span class="meta">${new Date(p.createdAt).toLocaleString()}</span></div>
      <div class="content">${highlightHashtags(p.content)}</div>
      <div class="actions">
        <span class="likeBtn">❤️ ${p.likes || 0}</span>
        <span class="replyBtn">💬 Responder</span>
      </div>
      <div class="replies"></div>
    `;
    // attach events
    div.querySelector('.likeBtn').addEventListener('click', async () => {
      await fetch(`/api/posts/${p._id}/like`, { method:'POST', credentials:'include' });
    });
    div.querySelector('.replyBtn').addEventListener('click', async () => {
      const text = prompt('Tu respuesta:');
      if (!text) return;
      await fetch(`/api/posts/${p._id}/reply`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body: JSON.stringify({ content: text })
      });
    });
    const repliesDiv = div.querySelector('.replies');
    if (p.replies && p.replies.length) {
      p.replies.forEach(r => {
        const rdiv = document.createElement('div');
        rdiv.className = 'reply';
        rdiv.innerHTML = `<b>@${r.user}</b> ${r.content}`;
        repliesDiv.appendChild(rdiv);
      });
    }
    feed.appendChild(div);
  });
}

// Socket listeners
socket.on('new_post', post => {
  loadPosts(); // simple approach: reload list (keeps ordering consistent)
});
socket.on('new_reply', data => {
  const postDiv = document.getElementById(data.postId);
  if (postDiv) {
    const repliesDiv = postDiv.querySelector('.replies');
    const rdiv = document.createElement('div');
    rdiv.className = 'reply';
    rdiv.innerHTML = `<b>@${data.reply.user}</b> ${data.reply.content}`;
    repliesDiv.appendChild(rdiv);
  } else {
    loadPosts();
  }
});
socket.on('update_likes', data => {
  const postDiv = document.getElementById(data.id);
  if (postDiv) {
    const likeSpan = postDiv.querySelector('.likeBtn');
    if (likeSpan) likeSpan.textContent = `❤️ ${data.likes}`;
  } else {
    loadPosts();
  }
});

// Initialize
checkSession();
