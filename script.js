// script.js — fixed

import { supabase, ADMIN_EMAIL } from "./supabase-config.js";

// ----------------------------
// DOM-элементы
// ----------------------------
const searchInput = document.getElementById("search");
const cardsContainer = document.getElementById("cardsContainer");
const breadcrumbs = document.getElementById("breadcrumbs");

const addGameBtn = document.getElementById("addGameBtn");
const suggestGameBtn = document.getElementById("suggestGameBtn");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");

let currentUser = null;
let gamesCache = [];
let gamesChannel = null;
let gamesListenerStarted = false;

// ----------------------------
// Утилиты
// ----------------------------
function escapeHTML(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openModal(innerHtml) {
  closeModal();
  const root = document.createElement("div");
  root.id = "modalRoot";
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">${innerHtml}</div>
    </div>
  `;
  root.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  });
  document.body.appendChild(root);
}

function closeModal() {
  const m = document.getElementById("modalRoot");
  if (m) m.remove();
}

function showError(msg, err) {
  console.error(msg, err);
  alert(msg + (err && err.message ? ": " + err.message : ""));
}

// ----------------------------
// AUTH
// ----------------------------
async function loadUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      currentUser = null;
      updateAuthUI(false);
      return;
    }
    currentUser = session.user;
    updateAuthUI(true);
  } catch {
    currentUser = null;
    updateAuthUI(false);
  }
}

function updateAuthUI(isLogged) {
  if (!isLogged || !currentUser) {
    userInfo.textContent = "";
    loginBtn.style.display = "inline-flex";
    registerBtn.style.display = "inline-flex";
    logoutBtn.style.display = "none";
    addGameBtn.style.display = "none";
    return;
  }

  const isAdmin = currentUser.email === ADMIN_EMAIL;
  userInfo.innerHTML = `Вы вошли как <b>${escapeHTML(currentUser.email)}</b>${isAdmin ? " (админ)" : ""}`;
  loginBtn.style.display = "none";
  registerBtn.style.display = "none";
  logoutBtn.style.display = "inline-flex";
  addGameBtn.style.display = isAdmin ? "inline-flex" : "none";
}

supabase.auth.onAuthStateChange(() => {
  loadUser();
  startGamesListener(true);
});

// ----------------------------
// GAMES
// ----------------------------
async function startGamesListener(force = false) {
  if (gamesListenerStarted && !force) return;
  gamesListenerStarted = true;

  const { data } = await supabase.from("games").select("*").order("title");
  gamesCache = data || [];
  renderGames(gamesCache);

  if (gamesChannel) {
    try { await supabase.removeChannel(gamesChannel); } catch {}
  }

  gamesChannel = supabase
    .channel("games_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games" },
      async () => {
        const { data } = await supabase.from("games").select("*").order("title");
        gamesCache = data || [];
        renderGames(gamesCache);
      }
    )
    .subscribe();
}

function renderGames(list) {
  breadcrumbs.style.display = "none";
  cardsContainer.className = "grid games";
  cardsContainer.innerHTML = "";

  if (!list || !list.length) {
    cardsContainer.innerHTML = `<div style="color:#9ca3af;">Ничего не найдено.</div>`;
    return;
  }

  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  list.forEach((g) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.position = "relative";
    card.addEventListener("click", () => openGame(g.id));

    const cover = document.createElement("div");
    cover.className = "game-cover";

    if (g.cover) {
      const img = document.createElement("img");
      img.src = g.cover;
      img.alt = g.title || "cover";
      cover.appendChild(img);
    } else {
      const no = document.createElement("div");
      no.textContent = "Нет изображения";
      cover.appendChild(no);
    }

    if (isAdmin) {
      const btn = document.createElement("button");
      btn.className = "btn-small";
      btn.textContent = "Ред.";
      btn.style.cssText = "position:absolute;right:0.6rem;bottom:0.6rem;z-index:5";
      btn.onclick = (e) => { e.stopPropagation(); editGame(g.id); };

      const delBtn = document.createElement("button");
      delBtn.className = "btn-small";
      delBtn.textContent = "Удал.";
      delBtn.style.cssText = "position:absolute;right:3.6rem;bottom:0.6rem;z-index:5;background:#ef4444;color:white";
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить игру "${g.title || ""}"?`)) return;
        await supabase.from("games").delete().eq("id", g.id);
        startGamesListener(true);
      };

      cover.append(btn, delBtn);
    }

    const header = document.createElement("div");
    header.innerHTML = `<h2>${escapeHTML(g.title)}</h2>`;

    card.append(cover, header);
    cardsContainer.appendChild(card);
  });
}

// ----------------------------
// OPEN GAME
// ----------------------------
async function openGame(id) {
  const { data: game } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (!game) return;

  breadcrumbs.style.display = "block";
  breadcrumbs.innerHTML = `<span onclick="goHome()">Игры</span> / <strong>${escapeHTML(game.title)}</strong>`;

  cardsContainer.className = "";
  cardsContainer.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "card game-guide";

  wrapper.innerHTML = `
    <h2>${escapeHTML(game.title)}</h2>
    <div class="game-guide-meta">Жанр: ${escapeHTML(game.genre || "")}</div>
    ${game.cover ? `<img src="${game.cover}" style="width:100%;height:200px;object-fit:cover;border-radius:0.9rem;margin-top:10px;">` : ""}
  `;

  const contentView = document.createElement("div");
  contentView.className = "game-guide-content";
  contentView.innerHTML = game.guide || "";

  const editor = document.createElement("div");
  editor.id = "quillEditor";
  editor.style.display = "none";
  editor.innerHTML = "";

  const actions = document.createElement("div");
  actions.style.display = "none";
  actions.style.marginTop = "0.6rem";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-small primary";
  saveBtn.textContent = "Сохранить";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-small";
  cancelBtn.textContent = "Отменить";

  actions.append(saveBtn, cancelBtn);
  wrapper.append(contentView, editor, actions);
  cardsContainer.appendChild(wrapper);

  if (currentUser?.email === ADMIN_EMAIL) {
    contentView.style.display = "none";
    editor.style.display = "block";
    actions.style.display = "flex";

    const quill = new Quill("#quillEditor", {
      theme: "snow",
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["image"]
          ],
          handlers: {
            image: function () {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.click();

              input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;

                const filename = `guides/${id}_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
                await supabase.storage.from("images").upload(filename, file);
                const { data } = supabase.storage.from("images").getPublicUrl(filename);

                const range = quill.getSelection(true);
                const index = range ? range.index : quill.getLength();
                quill.insertEmbed(index, "image", data.publicUrl);
              };
            }
          }
        }
      }
    });

    quill.root.innerHTML = game.guide || "";

    saveBtn.onclick = async () => {
      await supabase.from("games").update({ guide: quill.root.innerHTML }).eq("id", id);
      openGame(id);
    };

    cancelBtn.onclick = () => openGame(id);
  }
}

// ----------------------------
// SEARCH
// ----------------------------
searchInput.addEventListener("input", () => {
  const q = (searchInput.value || "").toLowerCase();
  renderGames(
    gamesCache.filter(g =>
      (g.title || "").toLowerCase().includes(q) ||
      (g.genre || "").toLowerCase().includes(q)
    )
  );
});

// ----------------------------
// LOGOUT
// ----------------------------
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentUser = null;
  gamesListenerStarted = false;
  updateAuthUI(false);
  startGamesListener(true);
});

// ----------------------------
// HOME
// ----------------------------
window.goHome = () => {
  breadcrumbs.style.display = "none";
  searchInput.value = "";
  renderGames(gamesCache);
};

document.getElementById("logo").addEventListener("click", goHome);

// ----------------------------
// INIT
// ----------------------------
(async function init() {
  await loadUser();
  await startGamesListener();
})();
