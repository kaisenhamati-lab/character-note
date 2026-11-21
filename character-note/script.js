const STORAGE_KEY = "character-note-v1";

const $ = (id) => document.getElementById(id);
const listView = $("listView");
const detailView = $("detailView");
const editorView = $("editorView");
const characterList = $("characterList");
const emptyState = $("emptyState");
const form = $("characterForm");
const toast = $("toast");

let characters = loadCharacters();
let toastTimer;
let currentId = ""; // 閲覧中のキャラクターID
let editorImage = ""; // 編集中のアイコン画像（data URL）

// 閲覧画面で表示するカテゴリーと項目（[ラベル, データのキー]）
const DETAIL_SECTIONS = [
  {
    no: "01",
    title: "基本プロフィール",
    fields: [["名前", "name"], ["年齢", "age"], ["身長", "height"], ["髪の色", "hairColor"], ["目の色", "eyeColor"]]
  },
  {
    no: "02",
    title: "性格・人物像",
    fields: [["性格", "personality"], ["好きなもの・苦手なもの", "likes"], ["得意なこと・苦手なこと", "skills"]]
  },
  {
    no: "03",
    title: "話し方",
    fields: [["一人称・二人称", "pronouns"], ["口調・話し方", "speech"], ["セリフ例", "quotes"]]
  },
  {
    no: "04",
    title: "その他の設定",
    fields: [["人間関係", "relationships"], ["詳細", "details"]]
  }
];

function normalizeCharacter(item) {
  // 旧版の保存データも残しつつ、新しい項目へ移行する
  return {
    id: String(item.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now())),
    name: String(item.name || ""),
    age: String(item.age || item.profile || ""),
    height: String(item.height || ""),
    hairColor: String(item.hairColor || ""),
    eyeColor: String(item.eyeColor || ""),
    personality: String(item.personality || ""),
    likes: String(item.likes || ""),
    skills: String(item.skills || ""),
    pronouns: String(item.pronouns || ""),
    speech: String(item.speech || ""),
    quotes: String(item.quotes || ""),
    relationships: String(item.relationships || ""),
    details: String(item.details || item.notes || ""),
    image: isImageData(item.image) ? item.image : "",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function loadCharacters() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).map(normalizeCharacter) : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
}

// 画像は端末内に data URL として保存する（外部には送らない）
function isImageData(value) {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/.test(value);
}

// アイコン欄に、画像があれば画像を、なければ名前の頭文字を表示する
function fillAvatar(el, c) {
  el.replaceChildren();
  if (isImageData(c.image)) {
    const img = document.createElement("img");
    img.src = c.image;
    img.alt = "";
    img.draggable = false;
    el.append(img);
  } else {
    el.textContent = (c.name || "？").trim().slice(0, 1) || "？";
  }
}

// 選んだ画像を中央で正方形に切り抜き、256pxに縮小して JPEG 化する（保存容量を抑えるため）
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) throw new Error("empty image");
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fffdfa"; // 透過PNGの背景
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function updateImagePreview() {
  fillAvatar($("imagePreview"), { image: editorImage, name: $("nameInput").value });
  $("imageClearBtn").classList.toggle("hidden", !editorImage);
  $("imagePickBtn").textContent = editorImage ? "画像を変更" : "画像を選ぶ";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

// 3つの画面（一覧・閲覧・編集）のうち、指定した1つだけを表示する
function showView(view) {
  [listView, detailView, editorView].forEach((v) => v.classList.toggle("hidden", v !== view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showList() {
  currentId = "";
  showView(listView);
  renderList();
}

function showDetail(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) {
    showList();
    return;
  }
  currentId = id;
  renderDetail(normalizeCharacter(character));
  showView(detailView);
}

function renderDetail(c) {
  fillAvatar($("detailAvatar"), c);
  $("detailName").textContent = c.name || "名前未設定";

  const body = $("detailBody");
  body.replaceChildren();

  DETAIL_SECTIONS.forEach((section) => {
    // 未入力の項目は作らない
    const filled = section.fields.filter(([, key]) => String(c[key] || "").trim() !== "");
    if (filled.length === 0) return; // 項目が1つもないカテゴリーごと非表示

    const card = document.createElement("section");
    card.className = "detail-card";

    const label = document.createElement("div");
    label.className = "section-label";
    const no = document.createElement("span");
    no.textContent = section.no;
    label.append(no, document.createTextNode(` ${section.title}`));

    const list = document.createElement("dl");
    list.className = "detail-list";

    filled.forEach(([text, key]) => {
      const item = document.createElement("div");
      item.className = "detail-item";

      const dt = document.createElement("dt");
      dt.textContent = text;

      const dd = document.createElement("dd");
      dd.textContent = c[key].trim(); // 改行は CSS(white-space: pre-wrap) で保持
      if (key === "quotes") dd.classList.add("detail-quote");

      item.append(dt, dd);
      list.append(item);
    });

    card.append(label, list);
    body.append(card);
  });
}

function setValue(id, value) {
  $(id).value = value || "";
}

function showEditor(character = null) {
  form.reset();
  $("characterId").value = character?.id || "";
  $("editorEyebrow").textContent = character ? "EDIT CHARACTER" : "NEW CHARACTER";
  $("editorTitle").textContent = character ? "設定を編集" : "新しいキャラクター";
  $("backBtn").textContent = character ? "← 閲覧へ" : "← 一覧へ";

  if (character) {
    const c = normalizeCharacter(character);
    setValue("nameInput", c.name);
    setValue("ageInput", c.age);
    setValue("heightInput", c.height);
    setValue("hairColorInput", c.hairColor);
    setValue("eyeColorInput", c.eyeColor);
    setValue("personalityInput", c.personality);
    setValue("likesInput", c.likes);
    setValue("skillsInput", c.skills);
    setValue("pronounsInput", c.pronouns);
    setValue("speechInput", c.speech);
    setValue("quotesInput", c.quotes);
    setValue("relationshipsInput", c.relationships);
    setValue("detailsInput", c.details);
  }

  editorImage = character ? normalizeCharacter(character).image : "";
  $("imageFile").value = "";
  updateImagePreview();

  showView(editorView);
  $("nameInput").focus({ preventScroll: true });
}

// 編集画面から戻る（保存せず）: 既存キャラなら閲覧画面、新規なら一覧
function leaveEditor() {
  const id = $("characterId").value;
  if (id && characters.some((item) => item.id === id)) {
    showDetail(id);
  } else {
    showList();
  }
}

function openCharacter(id) {
  showDetail(id);
}

function renderList() {
  const query = $("searchInput").value.trim().toLowerCase();
  const filtered = characters.filter((character) => {
    const { image, ...searchable } = normalizeCharacter(character); // 画像データは検索対象外
    return Object.values(searchable).join(" ").toLowerCase().includes(query);
  });

  $("characterCount").textContent = `${characters.length}人`;
  characterList.replaceChildren();

  filtered.forEach((character) => {
    const c = normalizeCharacter(character);
    const card = document.createElement("article");
    card.className = "character-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${c.name || "名前未設定"}の設定を見る`);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    fillAvatar(avatar, c);

    const main = document.createElement("div");
    main.className = "card-main";

    const name = document.createElement("h2");
    name.className = "card-name";
    name.textContent = c.name || "名前未設定";

    const summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = c.personality || [c.age, c.height].filter(Boolean).join(" / ") || "";

    main.append(name, summary);

    const chevron = document.createElement("span");
    chevron.className = "card-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    card.append(avatar, main, chevron);
    card.addEventListener("click", () => openCharacter(c.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCharacter(c.id);
      }
    });
    characterList.append(card);
  });

  emptyState.classList.toggle("hidden", filtered.length > 0);
  if (characters.length > 0 && filtered.length === 0) {
    emptyState.querySelector("h2").textContent = "見つかりませんでした";
    emptyState.querySelector("p").textContent = "別のキーワードで検索してみてね。";
    $("emptyAddBtn").classList.add("hidden");
  } else {
    emptyState.querySelector("h2").textContent = "キャラクターはまだいません";
    emptyState.querySelector("p").textContent = "最初のキャラクターを登録してみよう。";
    $("emptyAddBtn").classList.remove("hidden");
  }
}

function deleteCharacter(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  if (!confirm(`「${character.name}」を削除しますか？\nこの操作は取り消せません。`)) return;

  characters = characters.filter((item) => item.id !== id);
  persist();
  showList();
  showToast("キャラクターを削除しました");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("nameInput").value.trim();
  if (!name) {
    $("nameInput").focus();
    return;
  }

  const id = $("characterId").value;
  const existing = characters.find((item) => item.id === id);
  const character = normalizeCharacter({
    id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    name,
    age: $("ageInput").value.trim(),
    height: $("heightInput").value.trim(),
    hairColor: $("hairColorInput").value.trim(),
    eyeColor: $("eyeColorInput").value.trim(),
    personality: $("personalityInput").value.trim(),
    likes: $("likesInput").value.trim(),
    skills: $("skillsInput").value.trim(),
    pronouns: $("pronounsInput").value.trim(),
    speech: $("speechInput").value.trim(),
    quotes: $("quotesInput").value.trim(),
    relationships: $("relationshipsInput").value.trim(),
    details: $("detailsInput").value.trim(),
    image: editorImage,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const previous = characters;
  if (existing) {
    characters = characters.map((item) => item.id === id ? character : normalizeCharacter(item));
  } else {
    characters = [character, ...characters];
  }

  try {
    persist();
  } catch {
    // 容量オーバーなどで保存できなかった場合は、メモリ上も元に戻す
    characters = previous;
    alert("保存できませんでした。端末の保存容量が足りない可能性があります。");
    return;
  }

  if (existing) {
    showDetail(character.id); // 編集後は閲覧画面へ
    showToast("設定を更新しました");
  } else {
    showList();
    showToast("キャラクターを登録しました");
  }
});

$("addBtn").addEventListener("click", () => showEditor());
$("emptyAddBtn").addEventListener("click", () => showEditor());
$("backBtn").addEventListener("click", leaveEditor);
$("cancelBtn").addEventListener("click", leaveEditor);
$("searchInput").addEventListener("input", renderList);

// アイコン画像
$("nameInput").addEventListener("input", updateImagePreview);
$("imagePickBtn").addEventListener("click", () => $("imageFile").click());
$("imageClearBtn").addEventListener("click", () => {
  editorImage = "";
  $("imageFile").value = "";
  updateImagePreview();
});
$("imageFile").addEventListener("change", async () => {
  const file = $("imageFile").files?.[0];
  if (!file) return;
  try {
    editorImage = await resizeImage(file);
    updateImagePreview();
  } catch {
    showToast("画像を読み込めませんでした");
  } finally {
    $("imageFile").value = "";
  }
});

// 閲覧画面の操作
$("detailTopBackBtn").addEventListener("click", showList);
$("detailListBtn").addEventListener("click", showList);
$("detailEditBtn").addEventListener("click", () => {
  const character = characters.find((item) => item.id === currentId);
  if (character) showEditor(character);
});
$("detailDeleteBtn").addEventListener("click", () => {
  if (currentId) deleteCharacter(currentId);
});

$("backupBtn").addEventListener("click", () => {
  const backup = {
    app: "character-note",
    version: 2,
    exportedAt: new Date().toISOString(),
    characters: characters.map(normalizeCharacter)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `character-note-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("バックアップを保存しました");
});

const importFile = $("importFile");
$("importBtn").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const imported = Array.isArray(data) ? data : data.characters;
    if (!Array.isArray(imported)) throw new Error("invalid format");

    if (!confirm("バックアップの内容で現在のキャラクター一覧を置き換えますか？")) return;

    characters = imported.map(normalizeCharacter);
    persist();
    showList(); // 閲覧中のキャラが消えている場合に備え、一覧へ戻す
    showToast("バックアップを復元しました");
  } catch {
    alert("このファイルはキャラノートのバックアップとして読み込めませんでした。");
  } finally {
    importFile.value = "";
  }
});

renderList();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker registration failed:", error);
    });
  });
}