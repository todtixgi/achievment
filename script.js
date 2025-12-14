// script.js — полностью переписанный, рабочий файл
// ------------------------------------------------------------------
// Требует корректный supabase-config.js, который экспортирует:
//   export const supabase = createClient(...)
//   export const ADMIN_EMAIL = "..."
// ------------------------------------------------------------------

import { supabase, ADMIN_EMAIL } from "./supabase-config.js";

// ----------------------------
// Quill подключение (добавлено)
// ----------------------------

// Убедись, что в index.html ДО script.js есть:
// <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
// <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>

// Функция загрузки изображений из Quill в Supabase
async function uploadGuideImage(file) {
  const filename = `guides/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(filename, file, { contentType: file.type });

  if (uploadError) {
    console.error("Ошибка загрузки изображения гайда:", uploadError);
    alert("Не удалось загрузить изображение");
    return null;
  }

  const { data } = supabase.storage.from("images").getPublicUrl(filename);
  return data?.publicUrl || null;
}

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
  // Закрытие по клику вне модалки
  root.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  });
  document.body.appendChild(root);
}

function closeModal() {
  const m = document.getElementById("modalRoot");
  if (m) m.remove();
}

// Показываем alert и лог в консоль
function showError(msg, err) {
  console.error(msg, err);
  alert(msg + (err && err.message ? ": " + err.message : ""));
}

// ----------------------------
// AUTH (вход / регистрация / состояние)
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
  } catch (err) {
    console.error("loadUser error", err);
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

// Отслеживаем изменения сессии, чтобы UI обновлялся автоматически
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    currentUser = session.user;
    updateAuthUI(true);
  } else {
    currentUser = null;
    updateAuthUI(false);
  }
  startGamesListener();
});

// ----------------------------
// GAMES: загрузка / realtime / рендер
// ----------------------------
async function startGamesListener() {
  try {
    const { data, error } = await supabase.from("games").select("*").order("title");
    if (error) {
      console.error("startGamesListener select error", error);
      return;
    }
    gamesCache = data || [];
    renderGames(gamesCache);
  } catch (err) {
    console.error("startGamesListener error", err);
  }

  // убираем старый канал если есть
  if (gamesChannel) {
    try { supabase.removeChannel(gamesChannel); } catch (e) {}
    gamesChannel = null;
  }

  // создаём realtime канал (обновляем список при изменениях)
  try {
    gamesChannel = supabase
      .channel("games_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        async () => {
          const { data, error } = await supabase.from("games").select("*").order("title");
          if (!error) {
            gamesCache = data || [];
            renderGames(gamesCache);
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn("Realtime subscription failed:", err);
  }
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

    // клик по карточке открывает игру
    card.addEventListener("click", () => openGame(g.id));

    // cover
    const cover = document.createElement("div");
    cover.className = "game-cover";
    cover.style.position = "relative";

    if (g.cover) {
      const img = document.createElement("img");
      img.src = g.cover;
      img.alt = g.title || "cover";
      cover.appendChild(img);
    } else {
      const no = document.createElement("div");
      no.style.padding = "1rem";
      no.style.color = "#9ca3af";
      no.textContent = "Нет изображения";
      cover.appendChild(no);
    }

    if (isAdmin) {
      const btn = document.createElement("button");
      btn.className = "btn-small";
      btn.textContent = "Ред.";
      btn.style.position = "absolute";
      btn.style.right = "0.6rem";
      btn.style.bottom = "0.6rem";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        editGame(g.id);
      });
      cover.appendChild(btn);

      // === КНОПКА УДАЛЕНИЯ (твоя) ===
      const delBtn = document.createElement("button");
      delBtn.className = "btn-small";
      delBtn.textContent = "Удал.";
      delBtn.style.position = "absolute";
      delBtn.style.right = "3.6rem";
      delBtn.style.bottom = "0.6rem";
      delBtn.style.background = "#ef4444";
      delBtn.style.color = "white";

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        console.log("DELETE click handler fired, id=", g.id, "user=", currentUser?.email);
        if (!confirm(`Удалить игру \"${g.title || ""}\"?`)) return;
        try {
          const res = await supabase.from("games").delete().eq("id", g.id);
          console.log("Delete response ->", res);
          if (res.error) {
            console.error("Delete error detail:", res.error);
            return showError("Ошибка удаления игры", res.error);
          }
          console.log("Deleted data:", res.data);
          await startGamesListener();
        } catch (err) {
          console.error("Exception during delete:", err);
          showError("Ошибка при удалении", err);
        }
      });

      cover.appendChild(delBtn);
    }

    const header = document.createElement("div");
    header.className = "card-header";
    header.innerHTML = `<h2>${escapeHTML(g.title)}</h2>`;

    const footer = document.createElement("div");
    footer.className = "card-footer";
    footer.innerHTML = `<span class="pill">${escapeHTML(g.genre || "")}</span>`;

    card.appendChild(cover);
    card.appendChild(header);
    card.appendChild(footer);

    cardsContainer.appendChild(card);
  });
}

// ----------------------------
// ОТКРЫТИЕ ОДНОЙ ИГРЫ (начало)
// ----------------------------
async function openGame(id) {
  try {
    const { data: game, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
    if (error) return showError("Ошибка загрузки игры", error);
    if (!game) return;

    breadcrumbs.style.display = "block";
    breadcrumbs.innerHTML = `<span onclick="goHome()">Игры</span> / <strong>${escapeHTML(game.title)}</strong>`;

    cardsContainer.className = "";
    cardsContainer.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "card game-guide";

    const titleHTML = `<h2>${escapeHTML(game.title)}</h2>`;
    const metaHTML = `<div class="game-guide-meta">Жанр: ${escapeHTML(game.genre || "")}</div>`;

    const coverHTML = game.cover
      ? `<img src="${game.cover}" style="width:100%;height:200px;object-fit:cover;border-radius:0.9rem;margin-top:10px;">`
      : `<div style="padding:1rem;color:#9ca3af;margin-top:10px;">Нет изображения</div>`;

    wrapper.innerHTML = titleHTML + metaHTML + coverHTML;

    const contentView = document.createElement("div");
    contentView.className = "game-guide-content";
    contentView.innerHTML = game.guide || "";

    // Старое textarea — будет заменено Quill
    const editor = document.createElement("div");
    editor.id = "quillEditor";
    editor.style.display = "none";

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

    wrapper.appendChild(contentView);
    wrapper.appendChild(editor);
    wrapper.appendChild(actions);

    cardsContainer.appendChild(wrapper);
    // ============================
    // ЕСЛИ АДМИН — ВКЛЮЧАЕМ РЕДАКТОР
    // ============================
    if (currentUser?.email === ADMIN_EMAIL) {

      // Прячем текст
      contentView.style.display = "none";
      editor.style.display = "block";
      actions.style.display = "flex";

      // ----------------------------
      // ИНИЦИАЛИЗАЦИЯ QUILL
      // ----------------------------
      const quill = new Quill("#quillEditor", {
        theme: "snow",
        placeholder: "Напишите гайд... Можно вставлять картинки.",
        modules: {
          toolbar: {
            container: [
              [{ header: [1, 2, 3, false] }],
              ["bold", "italic", "underline"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["image", "code-block"],
            ],
            handlers: {
              // КНОПКА "IMAGE" — НАША КАСТОМНАЯ
              image: function () {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.click();

                input.onchange = async () => {
                  const file = input.files[0];
                  if (!file) return;

                  // загружаем файл
                  const filename =
                    "guides/" +
                    id +
                    "_" +
                    Date.now() +
                    "_" +
                    file.name.replace(/\s+/g, "_");

                  const { error: uploadError } = await supabase.storage
                    .from("images")
                    .upload(filename, file, {
                      contentType: file.type,
                    });

                  if (uploadError) {
                    console.error(uploadError);
                    alert("Ошибка загрузки изображения");
                    return;
                  }

                  // Получаем публичный URL
                  const { data } = supabase.storage
                    .from("images")
                    .getPublicUrl(filename);

                  const url = data.publicUrl;

                  // Вставляем картинку в Quill
                  const range = quill.getSelection();
                  quill.insertEmbed(range.index, "image", url);
                };
              },
            },
          },
        },
      });

      // Загружаем существующий HTML
      quill.root.innerHTML = game.guide || "";

      // ----------------------------
      // КНОПКА "СОХРАНИТЬ"
      // ----------------------------
      saveBtn.onclick = async () => {
        try {
          const html = quill.root.innerHTML;

          const { error } = await supabase
            .from("games")
            .update({ guide: html })
            .eq("id", id);

          if (error) return showError("Ошибка сохранения гайда", error);

          openGame(id); // обновляем страницу игры
        } catch (err) {
          showError("Ошибка сохранения", err);
        }
      };

      cancelBtn.onclick = () => openGame(id);
    }
  } catch (err) {
    showError("openGame error", err);
  }
}
// ----------------------------
// ДОБАВЛЕНИЕ ИГРЫ
// ----------------------------
addGameBtn.addEventListener("click", () => {
  openModal(`
    <h3>Добавление игры</h3>
    <form id="addGameForm">
      <div style="margin:0.35rem 0;"><label>Название</label><br><input id="gameTitle" required style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Жанр</label><br><input id="gameGenre" style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Обложка</label><br><input type="file" id="gameCoverFile" accept="image/*"></div>

      <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem;">
        <button type="button" id="cancelAdd" class="btn-small">Отмена</button>
        <button type="submit" class="btn-small primary">Добавить</button>
      </div>
    </form>
  `);

  const cancel = document.getElementById("cancelAdd");
  const form = document.getElementById("addGameForm");

  cancel.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const title = document.getElementById("gameTitle").value.trim();
      const genre = document.getElementById("gameGenre").value.trim();
      const fileEl = document.getElementById("gameCoverFile");
      const file = fileEl?.files?.[0];

      let coverUrl = "";

      if (file) {
        const filename = `covers/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("images")
          .upload(filename, file, { contentType: file.type });

        if (uploadError) return showError("Ошибка при загрузке изображения", uploadError);

        const { data } = supabase.storage.from("images").getPublicUrl(filename);
        if (data?.publicUrl) coverUrl = data.publicUrl;
      }

      const { error: insertErr } = await supabase.from("games").insert({
        title,
        genre,
        cover: coverUrl,
        guide: ""
      });

      if (insertErr) return showError("Ошибка добавления игры", insertErr);

      await startGamesListener();
      closeModal();
    } catch (err) {
      showError("Добавление игры упало", err);
    }
  };
});


// ----------------------------
// РЕДАКТИРОВАНИЕ ИГРЫ
// ----------------------------
async function editGame(id) {
  try {
    const { data: game, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
    if (error) return showError("Ошибка чтения игры", error);
    if (!game) return alert("Игра не найдена");

    openModal(`
      <h3>Редактирование игры</h3>
      <form id="editGameForm">
        <div style="margin:0.35rem 0;"><label>Название</label><br><input id="editTitle" value="${escapeHTML(game.title)}" style="width:100%;"></div>
        <div style="margin:0.35rem 0;"><label>Жанр</label><br><input id="editGenre" value="${escapeHTML(game.genre || "")}" style="width:100%;"></div>
        <div style="margin:0.35rem 0;"><label>Новая обложка</label><br><input id="editCoverFile" type="file" accept="image/*"></div>

        <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem;">
          <button type="button" id="cancelEdit" class="btn-small">Отмена</button>
          <button type="submit" class="btn-small primary">Сохранить</button>
        </div>
      </form>
    `);

    document.getElementById("cancelEdit").onclick = closeModal;

    document.getElementById("editGameForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const title = document.getElementById("editTitle").value.trim();
        const genre = document.getElementById("editGenre").value.trim();
        const file = document.getElementById("editCoverFile").files[0];

        let coverUrl = game.cover || "";

        if (file) {
          const filename = `covers/${id}_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
          const { error: uploadError } = await supabase.storage
            .from("images")
            .upload(filename, file, { upsert: true, contentType: file.type });

          if (uploadError) return showError("Ошибка загрузки нового изображения", uploadError);

          const { data } = supabase.storage.from("images").getPublicUrl(filename);
          if (data?.publicUrl) coverUrl = data.publicUrl;
        }

        const { error: updateErr } = await supabase
          .from("games")
          .update({ title, genre, cover: coverUrl })
          .eq("id", id);

        if (updateErr) return showError("Ошибка сохранения игры", updateErr);

        await startGamesListener();
        closeModal();
        openGame(id);
      } catch (err) {
        showError("editGame error", err);
      }
    };
  } catch (err) {
    showError("Ошибка editGame", err);
  }
}
// ----------------------------
// ПОИСК
// ----------------------------
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const q = (searchInput.value || "").toLowerCase();
    const filtered = gamesCache.filter((g) => {
      return (
        (g.title || "").toLowerCase().includes(q) ||
        (g.genre || "").toLowerCase().includes(q) ||
        (g.platform || "").toLowerCase().includes(q)
      );
    });
    renderGames(filtered);
  });
}

// ----------------------------
// ПРЕДЛОЖИТЬ ИГРУ
// ----------------------------
suggestGameBtn.addEventListener("click", () => {
  openModal(`
    <h3>Предложить игру</h3>
    <form id="suggestForm">
      <div style="margin:0.35rem 0;"><label>Название</label><br><input id="suggestTitle" required style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Платформа</label><br><input id="suggestPlatform" style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Причина</label><br><textarea id="suggestReason" style="width:100%;"></textarea></div>

      <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem;">
        <button type="button" id="cancelSuggest" class="btn-small">Отмена</button>
        <button type="submit" class="btn-small primary">Отправить</button>
      </div>
    </form>
  `);

  document.getElementById("cancelSuggest").onclick = closeModal;

  document.getElementById("suggestForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const title = document.getElementById("suggestTitle").value.trim();
      const platform = document.getElementById("suggestPlatform").value.trim();
      const reason = document.getElementById("suggestReason").value.trim();

      const { error } = await supabase.from("suggestions").insert({ title, platform, reason });
      if (error) return showError("Ошибка отправки предложения", error);

      alert("Спасибо! Предложение отправлено.");
      closeModal();
    } catch (err) {
      showError("suggestForm error", err);
    }
  };
});

// ----------------------------
// AUTH MODALS: Login / Register / Logout
// ----------------------------
loginBtn.addEventListener("click", () => {
  openModal(`
    <h3>Вход</h3>
    <form id="loginForm">
      <div style="margin:0.35rem 0;"><label>Email</label><br><input id="loginEmail" type="email" required style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Пароль</label><br><input id="loginPassword" type="password" required style="width:100%;"></div>

      <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem;">
        <button type="button" id="cancelLogin" class="btn-small">Отмена</button>
        <button type="submit" class="btn-small primary">Войти</button>
      </div>
    </form>
  `);

  const cancelLogin = document.getElementById("cancelLogin");
  const loginForm = document.getElementById("loginForm");

  cancelLogin.onclick = closeModal;

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return showError("Ошибка входа", error);

      // сразу обновляем UI и данные — без F5
      await loadUser();
      await startGamesListener();
      closeModal();
    } catch (err) {
      showError("login error", err);
    }
  };
});

registerBtn.addEventListener("click", () => {
  openModal(`
    <h3>Регистрация</h3>
    <form id="registerForm">
      <div style="margin:0.35rem 0;"><label>Имя</label><br><input id="regName" required style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Email</label><br><input id="regEmail" type="email" required style="width:100%;"></div>
      <div style="margin:0.35rem 0;"><label>Пароль</label><br><input id="regPassword" type="password" required style="width:100%;"></div>

      <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.6rem;">
        <button type="button" id="cancelReg" class="btn-small">Отмена</button>
        <button type="submit" class="btn-small primary">Зарегистрироваться</button>
      </div>
    </form>
  `);

  const cancelReg = document.getElementById("cancelReg");
  const registerForm = document.getElementById("registerForm");

  cancelReg.onclick = closeModal;

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return showError("Ошибка регистрации", error);

      // если пользователь сразу создан, добавим профиль в users (таблица)
      if (data?.user) {
        const { error: insertProfileErr } = await supabase.from("users").insert({
          email,
          name,
          is_admin: email === ADMIN_EMAIL
        });
        if (insertProfileErr) console.warn("users insert warning:", insertProfileErr.message);
      }

      // обновляем UI (в ряде случаев нужно подтвердить email)
      await loadUser();
      await startGamesListener();
      closeModal();
    } catch (err) {
      showError("register error", err);
    }
  };
});

logoutBtn.addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    updateAuthUI(false);
    await startGamesListener();
  } catch (err) {
    showError("logout error", err);
  }
});
// ----------------------------
// HOME / GO BACK
// ----------------------------
window.goHome = () => {
  breadcrumbs.style.display = "none";
  searchInput.value = "";
  renderGames(gamesCache);
};

document.getElementById("logo").addEventListener("click", () => {
  goHome();
});

// ----------------------------
// INIT
// ----------------------------
(async function init() {
  await loadUser();
  await startGamesListener();
})();
