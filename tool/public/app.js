/**
 * KOBO v0.1 — ヒアリングフォーム
 *
 * 対面の取材中に使うため、以下を最優先にしている。
 *   - 取材台本の質問文を各項目に表示する（これを読み上げながら埋める）
 *   - 入力のたびに自動保存する（90分ぶんの入力を失わない）
 *   - 「答えてもらえなかった」を未確認マークで記録し、単なる未入力と区別する
 */

const $ = (sel) => document.querySelector(sel);

const state = {
  sets: {},
  blocks: [],
  project: null,
  activeBlock: null,
  saveTimer: null,
  dirty: false,
};

// ── ドットパスの読み書き（lib/completion.ts と同じ規則） ──────────
const getByPath = (obj, path) =>
  path.split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);

function setByPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys.at(-1)] = value;
}

// ── 保存 ────────────────────────────────────────────────────
function scheduleSave() {
  state.dirty = true;
  setSaveStatus("自動保存中…", true);
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, 700);
}

async function save() {
  if (!state.project) return;
  try {
    const res = await fetch(`/api/projects/${state.project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.project),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const data = await res.json();
    state.dirty = false;
    renderMeters(data.completion);
    renderNav(data.completion);
    renderMissing(data.completion);
    const t = new Date(data.savedAt);
    setSaveStatus(`自動保存 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
  } catch (err) {
    setSaveStatus(`保存できません: ${err.message}`, true);
  }
}

/**
 * 保存の状態。**明示的な保存ボタンは置かない。**
 * 取材中に押し忘れる余地を作らないため、入力のたびに自動で保存する。
 * ただし「保存されている」ことは常に見えるようにしておく。
 */
function setSaveStatus(text, busy = false) {
  const el = $("#save-status");
  el.textContent = text;
  el.classList.toggle("saving", busy);
}

// 未保存のまま閉じようとしたら止める
addEventListener("beforeunload", (e) => {
  if (state.dirty) e.preventDefault();
});

// ── 未確認マーク ────────────────────────────────────────────
const isUnconfirmed = (path) => (state.project?.unconfirmed ?? []).includes(path);

/**
 * 未確認マークを付け外しする。
 *
 * 付けるときは「社長が実際に何と言ったか」も控える。
 * 第1回モック取材で精度を聞いたときの答えは「ミクロン単位ですね」だった。
 * 公差値ではないので項目の値にはできないが、この発言自体は捨ててはいけない。
 * 工場長への確認時に「社長はこうおっしゃっていました」と言えるかで確認の精度が変わる。
 */
function toggleUnconfirmed(path) {
  const list = (state.project.unconfirmed ??= []);
  const notes = (state.project.unconfirmedNotes ??= {});
  const i = list.indexOf(path);
  if (i >= 0) {
    list.splice(i, 1);
    delete notes[path];
  } else {
    list.push(path);
    const note = prompt("その場で何とおっしゃいましたか（空欄でも可）", notes[path] ?? "");
    if (note && note.trim()) notes[path] = note.trim();
  }
  scheduleSave();
}

const unconfirmedNote = (path) => state.project?.unconfirmedNotes?.[path] ?? "";

// ── 描画：メーター／ナビ／不足項目 ──────────────────────────
function renderMeters(c) {
  $("#bar-filled").style.width = `${c.filledPct}%`;
  $("#bar-covered").style.width = `${c.coveredPct}%`;
  $("#pct-filled").textContent = `${c.filledPct}%`;
  $("#pct-covered").textContent = `${c.coveredPct}%`;
}

function renderNav(c) {
  const nav = $("#blocks");
  nav.replaceChildren();
  for (const block of state.blocks) {
    const stat = c.byBlock.find((b) => b.id === block.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-current", String(block.id === state.activeBlock));
    btn.innerHTML =
      `<span class="nav-title"><span>${escapeHtml(block.title)}</span>` +
      `<span class="nav-meta">${stat ? `${stat.filled}/${stat.requiredTotal}` : ""}</span></span>` +
      `<span class="nav-meta">${escapeHtml(block.scriptBlock)}・${block.minutes}分</span>`;
    btn.onclick = () => {
      state.activeBlock = block.id;
      renderNav(c);
      renderBlock();
      scrollTo({ top: 0, behavior: "smooth" });
    };
    nav.append(btn);
  }
}

function renderMissing(c) {
  const el = $("#missing-summary");
  const parts = [`必須 ${c.filled}/${c.requiredTotal} 入力済`];
  if (c.unconfirmed.length) parts.push(`未確認 ${c.unconfirmed.length}件`);
  if (c.missing.length) parts.push(`未着手 ${c.missing.length}件`);
  else parts.push("聞き漏らしなし");
  el.textContent = parts.join(" ／ ");
}

// ── 描画：ブロック本体 ──────────────────────────────────────
function renderBlock() {
  const block = state.blocks.find((b) => b.id === state.activeBlock);
  const form = $("#form");
  form.replaceChildren();
  if (!block) return;

  const head = document.createElement("div");
  head.className = "block-head";
  head.innerHTML =
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="script">${escapeHtml(block.scriptBlock)}　想定 ${block.minutes}分</div>`;
  form.append(head);

  if (block.note) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = block.note;
    form.append(note);
  }

  // 追い質問は取材中ずっと画面に出しておく。
  // 分野知識がなくても掘れるようにするのが目的なので、畳まない（docs/15 改善B）
  if (block.followUps?.length) {
    const box = document.createElement("div");
    box.className = "followups";
    const head = document.createElement("div");
    head.className = "followups-head";
    head.textContent = "聞こえたら、そのまま掘る";
    box.append(head);
    for (const f of block.followUps) {
      const row = document.createElement("div");
      row.className = "followup";
      const trig = document.createElement("span");
      trig.className = "fu-trigger";
      trig.textContent = f.trigger;
      const ask = document.createElement("span");
      ask.className = "fu-ask";
      ask.textContent = f.ask;
      row.append(trig, ask);
      box.append(row);
    }
    form.append(box);
  }

  for (const field of block.fields) form.append(renderField(field));
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  if (isUnconfirmed(field.path)) wrap.classList.add("is-unconfirmed");

  const head = document.createElement("div");
  head.className = "field-head";
  const label = document.createElement("label");
  label.textContent = field.label;
  head.append(label);
  if (field.required) {
    const req = document.createElement("span");
    req.className = "req";
    req.textContent = "必須";
    head.append(req);
  }
  // list 型は要素ごとに確認するため、未確認マークは付けない
  if (field.type !== "list") {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "unconf-toggle";
    toggle.textContent = "未確認";
    toggle.title = "聞いたが、その場で答えてもらえなかった項目に付ける";
    toggle.setAttribute("aria-pressed", String(isUnconfirmed(field.path)));
    toggle.onclick = () => {
      toggleUnconfirmed(field.path);
      renderBlock();
    };
    head.append(toggle);
  }
  wrap.append(head);

  if (field.help) {
    const help = document.createElement("div");
    help.className = "help";
    help.textContent = field.help;
    wrap.append(help);
  }

  wrap.append(renderInput(field, field.path, state.project));

  if (isUnconfirmed(field.path) && unconfirmedNote(field.path)) {
    const note = document.createElement("div");
    note.className = "unconf-note";
    note.textContent = `その場の回答：「${unconfirmedNote(field.path)}」`;
    wrap.append(note);
  }
  return wrap;
}

/** 入力欄本体。root からの相対パス（list の要素内でも使えるようにする） */
function renderInput(field, path, target, localKey = null) {
  const read = () => (localKey ? target[localKey] : getByPath(state.project, path));
  const write = (v) => {
    if (localKey) target[localKey] = v;
    else setByPath(state.project, path, v);
    scheduleSave();
  };

  switch (field.type) {
    case "textarea": {
      const el = document.createElement("textarea");
      el.value = read() ?? "";
      el.placeholder = field.placeholder ?? "";
      el.oninput = () => write(el.value);
      return el;
    }
    case "number": {
      const el = document.createElement("input");
      el.type = "number";
      el.value = read() ?? "";
      el.oninput = () => write(el.value === "" ? undefined : Number(el.value));
      return el;
    }
    case "date": {
      const el = document.createElement("input");
      el.type = "date";
      el.value = read() ?? "";
      el.oninput = () => write(el.value || undefined);
      return el;
    }
    case "boolean": {
      const el = document.createElement("select");
      for (const [v, t] of [["", "未選択"], ["true", "はい"], ["false", "いいえ"]]) {
        el.append(new Option(t, v));
      }
      const cur = read();
      el.value = cur === undefined ? "" : String(cur);
      el.onchange = () => write(el.value === "" ? undefined : el.value === "true");
      return el;
    }
    case "select": {
      const el = document.createElement("select");
      el.append(new Option("未選択", ""));
      for (const opt of field.options ?? []) el.append(new Option(opt, opt));
      el.value = read() ?? "";
      el.onchange = () => write(el.value || undefined);
      return el;
    }
    case "multiselect": {
      const box = document.createElement("div");
      box.className = "choices";
      const cur = read() ?? [];
      for (const opt of field.options ?? []) {
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = cur.includes(opt);
        cb.onchange = () => {
          const next = (read() ?? []).filter((v) => v !== opt);
          if (cb.checked) next.push(opt);
          write(next);
        };
        label.append(cb, document.createTextNode(opt));
        box.append(label);
      }
      return box;
    }
    case "tags":
      return renderTags(field, read, write);
    case "list":
      return renderList(field, read, write);
    default: {
      const el = document.createElement("input");
      el.type = "text";
      el.value = read() ?? "";
      el.placeholder = field.placeholder ?? "";
      el.oninput = () => write(el.value);
      return el;
    }
  }
}

function renderTags(field, read, write) {
  const box = document.createElement("div");
  const chips = document.createElement("div");
  chips.className = "chips";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = field.placeholder ?? "入力して Enter（カンマ区切りでまとめて追加）";

  const draw = () => {
    chips.replaceChildren();
    for (const [i, tag] of (read() ?? []).entries()) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.append(document.createTextNode(tag));
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.setAttribute("aria-label", `${tag} を削除`);
      del.onclick = () => {
        const next = [...(read() ?? [])];
        next.splice(i, 1);
        write(next);
        draw();
      };
      chip.append(del);
      chips.append(chip);
    }
  };

  const add = () => {
    const parts = input.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const cur = read() ?? [];
    write([...cur, ...parts.filter((p) => !cur.includes(p))]);
    input.value = "";
    draw();
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  };
  input.onblur = add;

  draw();
  box.append(chips, input);
  return box;
}

function renderList(field, read, write) {
  const box = document.createElement("div");

  const draw = () => {
    box.replaceChildren();
    const items = read() ?? [];
    items.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "list-item";
      const head = document.createElement("div");
      head.className = "list-item-head";
      const title = document.createElement("strong");
      title.textContent = `${i + 1} 件目`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del-item";
      del.textContent = "削除";
      del.onclick = () => {
        const next = [...items];
        next.splice(i, 1);
        write(next);
        draw();
      };
      head.append(title, del);
      card.append(head);

      for (const sub of field.itemFields ?? []) {
        const sf = document.createElement("div");
        sf.className = "sub-field";
        const label = document.createElement("label");
        label.textContent = sub.help ? `${sub.label}　— ${sub.help}` : sub.label;
        sf.append(label, renderInput(sub, sub.path, item, sub.path));
        card.append(sf);
      }
      box.append(card);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-item";
    add.textContent = `＋ ${field.label}を追加`;
    add.onclick = () => {
      write([...(read() ?? []), {}]);
      draw();
    };
    box.append(add);

    const min = field.minItems ?? 1;
    if (items.length < min) {
      const hint = document.createElement("div");
      hint.className = "help";
      hint.textContent = `あと ${min - items.length} 件（最低 ${min} 件）`;
      box.append(hint);
    }
  };

  draw();
  return box;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ── 案件の読み込み ──────────────────────────────────────────
/**
 * 案件一覧。**商品ごとにグループを分ける。**
 * 製造業（90分・60項目）と汎用（30分・28項目）は別の商品なので、
 * 1つのリストに混ぜると取り違える。
 */
async function loadProjectList(selectId) {
  const list = await (await fetch("/api/projects")).json();
  const sel = $("#project-select");
  sel.replaceChildren();
  sel.append(new Option("案件を選択…", ""));

  const groups = [
    ["manufacturing", "製造業向け（980,000円）"],
    ["general", "汎用ベーシック（198,000円）"],
  ];
  for (const [key, label] of groups) {
    const items = list.filter((p) => (p.formSet ?? "manufacturing") === key);
    if (!items.length) continue;
    const g = document.createElement("optgroup");
    g.label = label;
    for (const p of items) {
      g.append(new Option(`${p.name || p.id}　${p.filledPct}%`, p.id));
    }
    sel.append(g);
  }
  if (selectId) sel.value = selectId;
  return list;
}

/** 案件IDの自動採番。日付＋連番。後から編集できる */
function suggestProjectId(list) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const used = new Set(list.map((p) => p.id));
  for (let n = 1; ; n++) {
    const id = `${stamp}-${n}`;
    if (!used.has(id)) return id;
  }
}

async function openProject(id) {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) return alert("案件を読み込めませんでした");
  const data = await res.json();
  state.project = data.project;
  // 案件ごとにフォームが違う（製造業 90分 / 汎用 30分）
  const set = state.sets[state.project.formSet ?? "manufacturing"] ?? state.sets.manufacturing;
  state.blocks = set.blocks;
  state.activeBlock = set.blocks[0]?.id ?? null;
  document.title = `KOBO — ${set.label}`;
  $("#empty").hidden = true;
  $("#main").hidden = false;
  renderMeters(data.completion);
  renderNav(data.completion);
  renderMissing(data.completion);
  renderBlock();
  setSaveStatus("自動保存されます");
}

// ── 起動 ────────────────────────────────────────────────────
(async function init() {
  const form = await (await fetch("/api/form")).json();
  state.sets = form.sets;
  state.blocks = form.sets.manufacturing.blocks;
  state.activeBlock = state.blocks[0]?.id ?? null;
  await loadProjectList();

  $("#project-select").onchange = (e) => {
    if (e.target.value) openProject(e.target.value);
  };

  // 新規案件は画面内のダイアログで完結させる。
  // 取材の直前にブラウザのポップアップを3回続けて出されるのは、現場で辛い
  const dialog = $("#new-dialog");
  const openNew = async () => {
    const list = await loadProjectList();
    $("#new-name").value = "";
    $("#new-id").value = suggestProjectId(list);
    $("#new-error").hidden = true;
    dialog.showModal();
    $("#new-name").focus();
  };
  $("#new-project").onclick = openNew;
  $("#new-project-empty").onclick = openNew;
  $("#new-cancel").onclick = () => dialog.close();

  $("#new-submit").onclick = async () => {
    const id = $("#new-id").value.trim();
    const name = $("#new-name").value.trim();
    const formSet = document.querySelector('input[name="formSet"]:checked').value;
    const err = $("#new-error");

    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      err.textContent = "案件IDは英数字・ハイフン・アンダースコアで入力してください。";
      err.hidden = false;
      return;
    }
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name, formSet }),
    });
    if (!res.ok) {
      err.textContent = (await res.json()).error;
      err.hidden = false;
      return;
    }
    dialog.close();
    await loadProjectList(id);
    await openProject(id);
  };
})();
