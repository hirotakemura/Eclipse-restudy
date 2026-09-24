/**
 * KOBO — ヒアリングフォーム
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
    updateProjectOption(data.completion);
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
async function toggleUnconfirmed(field) {
  const path = field.path;
  const list = (state.project.unconfirmed ??= []);
  const notes = (state.project.unconfirmedNotes ??= {});
  const i = list.indexOf(path);

  if (i >= 0) {
    // 外すときは何も聞かない
    list.splice(i, 1);
    delete notes[path];
  } else {
    const note = await askUnconfirmedNote(field.label, notes[path] ?? "");
    if (note === null) return; // キャンセル
    list.push(path);
    if (note) notes[path] = note;
  }
  scheduleSave();
  refreshField(field);
}

/** ブラウザのポップアップは打ちにくいので、画面内のダイアログで聞く */
function askUnconfirmedNote(label, current) {
  return new Promise((resolve) => {
    const d = $("#unconf-dialog");
    const input = $("#unconf-note");
    $("#unconf-field").textContent = label;
    input.value = current;
    const done = (v) => { d.close(); resolve(v); };
    $("#unconf-ok").onclick = () => done(input.value.trim());
    $("#unconf-cancel").onclick = () => done(null);
    d.addEventListener("close", () => resolve(null), { once: true });
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); done(input.value.trim()); } };
    d.showModal();
    input.focus();
  });
}

/**
 * その項目だけを描き直す。
 *
 * **ブロック全体を描き直すとスクロール位置が失われ、画面の先頭に戻ってしまう。**
 * 取材中にこれが起きると、どこまで聞いたか見失う。
 */
function refreshField(field) {
  const old = document.querySelector(`.field[data-path="${CSS.escape(field.path)}"]`);
  if (old) old.replaceWith(renderField(field));
  else renderBlock();
}

const unconfirmedNote = (path) => state.project?.unconfirmedNotes?.[path] ?? "";

/**
 * 案件一覧に出している充足率を、保存のたびに書き換える。
 * 一覧のテキストは読み込み時のままなので、更新しないと古い数字が残り続ける
 */
function updateProjectOption(c) {
  if (!state.project) return;
  const opt = [...document.querySelectorAll("#project-select option")]
    .find((o) => o.value === state.project.id);
  if (!opt) return;
  const name = state.project.basics?.name || state.project.id;
  opt.textContent = `${name}　${c.filledPct}%`;
}

// ── 描画：メーター／ナビ／不足項目 ──────────────────────────
function renderMeters(c) {
  state.completion = c;
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
      `<span class="nav-meta">${stat?.requiredTotal ? `${stat.filled}/${stat.requiredTotal}` : ""}</span></span>` +
      `<span class="nav-meta">${escapeHtml(block.scriptBlock)}${block.minutes ? `・${block.minutes}分` : ""}</span>`;
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
    `<div class="script">${escapeHtml(block.scriptBlock)}${block.minutes ? `　想定 ${block.minutes}分` : ""}</div>`;
  form.append(head);

  if (block.note) {
    const note = document.createElement("div");
    note.className = "note";
    setRichText(note, block.note);
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
      setRichText(ask, f.ask);
      row.append(trig, ask);
      box.append(row);
    }
    form.append(box);
  }

  for (const field of block.fields) form.append(renderField(field));
}

/**
 * **説明文の `**…**` を太字にする**（D-470 で気づいた）。
 *
 * フォームの説明文は、強調したい所を `**…**` で書いている（43か所）。ところが画面は
 * `textContent` で出していたので、**取材中の画面に「**」がそのまま出ていた。**
 * HTMLとしては解釈しない——文字の並びを切って、太字の部分だけ `<strong>` にする。
 */
function setRichText(el, text) {
  el.replaceChildren();
  const parts = String(text ?? "").split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const b = document.createElement("strong");
      b.textContent = part;
      el.append(b);
    } else {
      el.append(document.createTextNode(part));
    }
  });
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.dataset.path = field.path;
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
    // Tab は入力欄の間だけを移動させたい。取材中に毎回このボタンを経由すると打ちにくい
    toggle.tabIndex = -1;
    toggle.onclick = () => toggleUnconfirmed(field);
    head.append(toggle);
  }
  wrap.append(head);

  if (field.help) {
    const help = document.createElement("div");
    help.className = "help";
    setRichText(help, field.help);
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
    case "theme":
      return renderTheme(field, read, write);
    case "photos":
      return renderPhotos(field, read, write);
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

/**
 * サイトの見た目（配色・書体・雰囲気・レイアウト）。
 *
 * **テンプレートは1つしか持たない**（D-096）。見た目の違いはコードではなくデータで出す。
 * 選択肢の中身は `lib/theme.ts` が単一の正で、ここでは `/api/form` から受け取ったものを並べるだけ。
 * 画面側で選択肢を定義しない。**選べるのに反映されない、が一番まずい。**
 *
 * 取材のその場でお客様と一緒に選ぶので、**言葉ではなく見本で選べるようにする。**
 */
function renderTheme(field, read, write) {
  const opts = state.theme;
  const box = document.createElement("div");
  box.className = "theme-picker";
  if (!opts) {
    box.className = "theme-picker theme-stale";
    box.innerHTML =
      "<b>見た目の選択肢を読み込めませんでした。</b><br>" +
      "起動中のコードが古い可能性があります。<b>サーバーを一度止めて、起動し直してください。</b><br>" +
      "<span>ターミナルで Control + C → <code>npm start</code>／または start.command をダブルクリック</span>";
    return box;
  }

  /**
   * 旧 `layout` 軸（standard / sidebar / wide）を、新しい2軸に読み替える。
   *
   * **`lib/theme.ts` の migrateLayout と同じ規則。**
   * 片方だけ直すと、KOBOの画面と書き出されるサイトが食い違う（実際に食い違った）。
   */
  const normalize = (saved) => {
    const t = { ...opts.default, ...(saved ?? {}) };
    if (typeof saved?.layout === "string" && !saved.nav) {
      if (saved.layout === "sidebar") { t.nav = "sidebar"; t.hero = "headline"; }
      else if (saved.layout === "wide") { t.nav = "standard"; t.hero = "photo"; }
    }
    delete t.layout;
    /**
     * 型の保存を始める前のデータには `direction` が無い。
     * **9軸から逆算して補う。** 取材済みの案件は作り直せない（D-141と同じ配慮）。
     */
    if (!t.direction) {
      const guess = presetsForPlan(opts.presets, state.project?.formSet).find((p) =>
        ["palette", "font", "mood"].every((k) => p.theme[k] === t[k]),
      );
      if (guess) t.direction = guess.id;
    }
    return t;
  };
  const current = () => normalize(read());

  /**
   * ★「最初の画面」の軸は D-470 で取材から外したので、材料で選べるかの判定（写真・数字・地紋・対応範囲）は
   * ここでは使わない。**最初の画面は、書き出したサイトを見てこちらで決める。**
   */
  const preview = document.createElement("div");
  preview.className = "theme-preview";

  /**
   * **選ぶたびに作り直さない。**
   * 作り直すと一瞬だけ高さがゼロになり、ブラウザがスクロール位置を切り詰めて
   * 画面が上に飛ぶ。押した本人は「トップに戻された」と感じる。
   * 押された印と見本だけを更新する。
   */
  const sync = () => {
    const t = current();
    const presetId = matchPreset(presetsForPlan(opts.presets, state.project?.formSet), t);
    for (const row of box.querySelectorAll(".theme-row")) {
      const key = row.dataset.key;
      const selected = key === "preset" ? presetId : t[key];
      for (const btn of row.querySelectorAll(".theme-choice")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.value === selected));
      }
    }
    drawPreview(preview, opts, t);
  };

  const set = (key, value) => { write({ ...current(), [key]: value }); sync(); };

  const t0 = current();
  const rows = document.createElement("div");
  rows.append(
    // 型を押すと全部がまとめて決まる。そこから1軸だけ直す使い方を想定している
    /**
     * 型は**方向性**であって、9軸の別名ではない（D-187）。
     * 押した型のIDを `direction` として残す。
     * **配色を1つ直しても「精密加工を選んだ」という事実は消えない。**
     */
    choiceRow("preset", "型から選ぶ", presetsForPlan(opts.presets, state.project?.formSet), (id) => {
      const preset = (opts.presets ?? []).find((p) => p.id === id);
      /**
       * **型を押しても、文字の大きさは消さない**（D-470）。
       * 文字の大きさは、原稿のご確認のときに**社長ご本人の目で**選んでいただくもの（D-153・D-471）で、
       * 型の好みとは別の話。型の見本は文字の大きさも持っているので、押し直すと上書きされていた。
       */
      if (preset) { write({ ...preset.theme, direction: id, textSize: current().textSize }); sync(); }
    }, (p) => {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = opts.palettes.find((x) => x.id === p.theme.palette)?.accent ?? "#ccc";
      return sw;
    }),
  );

  /**
   * **取材で伺うのは「どれが御社らしいですか」の1問だけ**（D-470・D-471）。
   * 配色・書体・雰囲気・メニュー・最初の画面・章の区切り・見出し・表・**文字の大きさ**は、
   * 書き出したサイトを見てこちらが決め、原稿のご確認のときに実物でお見せして選んでいただく。
   * **小さな見本では、御社のサイトの見た目は決められない。**
   */

  box.append(rows, preview);
  sync();
  return box;
}

/**
 * その案件のプランで選べる型だけを出す（D-198）。
 * **製造業の型を汎用の商談で見せない。** 汎用は30分の取材なので、材料が違う。
 */
function presetsForPlan(presets, formSet) {
  const plan = formSet === "general" ? "general" : "manufacturing";
  const list = (presets ?? []).filter((p) => (p.plan ?? "manufacturing") === plan);
  return list.length ? list : (presets ?? []);
}

/**
 * いま選ばれている型（lib/theme.ts の matchPreset と同じ判定）。
 *
 * **保存された `direction` を正とする。** 無いのは型の保存を始める前のデータなので、
 * そのときだけ9軸から逆算する。
 */
function matchPreset(presets, t) {
  const list = presets ?? [];
  if (t.direction && list.some((p) => p.id === t.direction)) return t.direction;
  // 古いデータは配色・書体・雰囲気しか持たない（lib/theme.ts と同じ判定・D-201）
  return list.find((p) =>
    ["palette", "font", "mood"].every((k) => p.theme[k] === t[k]),
  )?.id ?? null;
}

function choiceRow(key, title, items, onPick, decorate) {
  const row = document.createElement("div");
  row.className = "theme-row";
  row.dataset.key = key;
  const h = document.createElement("div");
  h.className = "theme-row-title";
  h.textContent = title;
  row.append(h);

  const list = document.createElement("div");
  list.className = "theme-choices";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-choice";
    btn.dataset.value = item.id;
    btn.setAttribute("aria-pressed", "false");
    if (item.disabled) { btn.disabled = true; btn.classList.add("is-unavailable"); }
    if (decorate) btn.append(decorate(item));
    const label = document.createElement("span");
    label.className = "theme-label";
    label.textContent = item.label;
    btn.append(label);
    const note = document.createElement("span");
    note.className = "theme-note";
    note.textContent = item.note ?? "";
    btn.append(note);
    btn.onclick = () => onPick(item.id);
    list.append(btn);
  }
  row.append(list);
  return row;
}

/** 選んだ組み合わせの見本。**言葉で説明するより、出して見せたほうが早い** */
function drawPreview(el, opts, t) {
  const p = opts.palettes.find((x) => x.id === t.palette) ?? opts.palettes[0];
  const f = opts.fonts.find((x) => x.id === t.font) ?? opts.fonts[0];
  const m = opts.moods.find((x) => x.id === t.mood) ?? opts.moods[1];
  const nav = opts.navs.find((x) => x.id === t.nav) ?? opts.navs[0];

  const size = { normal: "14px", large: "15px", xlarge: "17px" }[t.textSize] ?? "14px";
  el.style.cssText =
    `font-size:${size};` +
    `--tp-accent:${p.accent};--tp-accent-dark:${p.accentDark};--tp-accent-soft:${p.accentSoft};` +
    `--tp-ink:${p.ink};--tp-ink-soft:${p.inkSoft};--tp-bg:${p.bg};--tp-bg-soft:${p.bgSoft};--tp-line:${p.tableLine};` +
    `--tp-body:${f.body};--tp-head:${f.heading};` +
    `--tp-radius:${m.radius};--tp-leading:${m.leading};--tp-line-width:${m.lineWidth}`;
  el.dataset.layout = nav.id === "sidebar" ? "sidebar" : t.hero === "photo" ? "wide" : "standard";
  el.dataset.headings = t.headings;
  el.dataset.tables = t.tables;

  const name = state.project?.basics?.name || "御社名";
  el.innerHTML =
    `<div class="tp-head"><b>${escapeHtml(name)}</b><span class="tp-btn">お問い合わせ</span></div>` +
    `<div class="tp-nav">${["トップ", "強み", "実績", "会社概要"].map((x) => `<span>${x}</span>`).join("")}</div>` +
    `<div class="tp-body">` +
      `<h4>他社様で難しいと言われた案件を、お受けしています</h4>` +
      `<p>ここに本文が入ります。行間や余白の詰まり具合、文字の形を見てください。</p>` +
      `<table><tr><th>対応材質</th><td>アルミ・ステンレス</td></tr><tr><th>最短納期</th><td>3日</td></tr></table>` +
      `<span class="tp-btn tp-btn-lg">お問い合わせはこちら</span>` +
    `</div>`;
}

/**
 * 写真。
 *
 * **先に置き場所を決めてから集める。**
 * 「とりあえず写真をください」と頼むと、何に使うか分からないまま撮りためた画像が
 * 大量に届いて、結局どれも使えない。サイトのどこに出るかを決めてから、必要な枚数だけ頼む。
 *
 * ファイルは projects/<案件ID>/photos/ に置き、project.json にはファイル名だけを持つ。
 * 案件フォルダを丸ごと渡せば写真も一緒に渡る（引き渡しパッケージ・docs/17）。
 */
// lib/schema.ts の PhotoCategory と同じ。サイトのどこに出るかと、目安の枚数
const PHOTO_PLACES = [
  ["外観", "トップ・会社概要", "1枚"],
  ["代表者", "代表挨拶・会社概要", "1枚"],
  ["工場・設備", "設備一覧・強み", "3〜8枚"],
  ["加工事例", "各事例ページ　★最も効く", "1〜3枚／件"],
  ["働く人", "採用情報", "2〜4枚"],
  ["ロゴ", "ヘッダー", "1枚"],
  ["その他", "置き場所は後で決める", "—"],
];

const photoUrl = (file) => `/api/projects/${state.project.id}/photos/${encodeURIComponent(file)}`;

function renderPhotos(field, read, write) {
  const box = document.createElement("div");
  box.className = "photos";

  const legend = document.createElement("table");
  legend.className = "photo-places";
  legend.innerHTML =
    "<thead><tr><th>置き場所</th><th>サイトのどこに出るか</th><th>目安</th></tr></thead><tbody>" +
    PHOTO_PLACES.map(([c, where, n]) =>
      `<tr><th>${escapeHtml(c)}</th><td>${escapeHtml(where)}</td><td>${escapeHtml(n)}</td></tr>`).join("") +
    "</tbody>";

  const grid = document.createElement("div");
  grid.className = "photo-grid";

  // OSの標準ボタン（Choose Files）は英語で出ることがあり、タブレットでは押しにくい。
  // ラベルで包んで、他のボタンと同じ見た目・同じ大きさにする
  const pick = document.createElement("input");
  pick.type = "file";
  pick.accept = "image/*";
  pick.multiple = true;
  pick.className = "photo-input";
  const pickLabel = document.createElement("label");
  pickLabel.className = "photo-pick";
  pickLabel.append("＋ 写真を追加", pick);

  const status = document.createElement("div");
  status.className = "help";

  const draw = () => {
    const items = read() ?? [];
    grid.replaceChildren();
    for (const [i, photo] of items.entries()) {
      grid.append(renderPhotoCard(photo, i, read, write, draw));
    }
    status.textContent = items.length ? `${items.length}枚お預かりしています` : "まだ1枚もありません";
  };

  pick.onchange = async () => {
    const files = [...pick.files];
    pick.value = "";
    for (const [i, f] of files.entries()) {
      status.textContent = `${i + 1}/${files.length} を保存中…`;
      try {
        const res = await fetch(
          `/api/projects/${state.project.id}/photos?name=${encodeURIComponent(f.name)}`,
          { method: "POST", body: f },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        // 置き場所は人が決める。ここで推測して勝手に振り分けない
        write([...(read() ?? []), { file: data.file, category: "その他" }]);
      } catch (err) {
        status.textContent = `保存できません：${err.message}`;
        return;
      }
    }
    draw();
  };

  draw();
  box.append(legend, pickLabel, status, grid);
  return box;
}

function renderPhotoCard(photo, i, read, write, draw) {
  const card = document.createElement("div");
  card.className = "photo-card";
  if (photo.category === "その他") card.classList.add("unplaced");

  // iPhoneの標準は HEIC で、ブラウザでは表示できないことが多い。
  // 表示できなくても「預かった」ことは分かるようにしておく
  const isHeic = /\.heic$/i.test(photo.file);
  if (isHeic) {
    const ph = document.createElement("div");
    ph.className = "photo-thumb no-preview";
    ph.textContent = "HEIC（この画面では表示できません）";
    card.append(ph);
  } else {
    const img = document.createElement("img");
    img.className = "photo-thumb";
    img.src = photoUrl(photo.file);
    img.alt = photo.caption || photo.file;
    img.loading = "lazy";
    card.append(img);
  }

  const set = (key, value) => {
    const next = [...(read() ?? [])];
    next[i] = { ...next[i], [key]: value };
    if (value === undefined || value === "") delete next[i][key];
    write(next);
  };

  const cat = document.createElement("select");
  for (const [c] of PHOTO_PLACES) cat.append(new Option(c, c));
  cat.value = photo.category ?? "その他";
  cat.onchange = () => { set("category", cat.value); draw(); };
  card.append(cat);

  // 事例の写真は、どの事例のものかが分からないと置き場所が決まらない
  if (photo.category === "加工事例") {
    const cases = state.project.cases ?? [];
    const which = document.createElement("select");
    which.append(new Option("どの事例か未選択", ""));
    cases.forEach((c, n) => which.append(new Option(`${n + 1}件目　${c.title ?? ""}`.trim(), String(n + 1))));
    which.value = photo.caseNo ? String(photo.caseNo) : "";
    which.onchange = () => set("caseNo", which.value ? Number(which.value) : undefined);
    card.append(which);
  }

  const caption = document.createElement("input");
  caption.type = "text";
  caption.placeholder = "ひとこと（任意）";
  caption.value = photo.caption ?? "";
  caption.oninput = () => set("caption", caption.value);
  card.append(caption);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "del-item";
  del.textContent = "削除";
  del.onclick = async () => {
    await fetch(photoUrl(photo.file), { method: "DELETE" });
    const next = [...(read() ?? [])];
    next.splice(i, 1);
    write(next);
    draw();
  };
  card.append(del);
  return card;
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
        setRichText(label, sub.help ? `${sub.label}　— ${sub.help}` : sub.label);
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
      // 描き直すと先頭に戻ってしまうので、追加した行の最初の欄にフォーカスを移す。
      // そのまま打ち始められるうえ、画面もその位置に追従する
      const inputs = box.querySelectorAll(".list-item:last-of-type input, .list-item:last-of-type textarea");
      inputs[0]?.focus({ preventScroll: false });
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

// ── 後日確認リスト（社内用） ────────────────────────────────
/**
 * 第1回の取材で埋まらなかった項目を並べ、**誰にいつ聞くか**を決めておく画面。
 *
 * **取材は2回に分ける**（D-147）。対応精度・公差・設備の型番は社長おひとりでは埋まらない、
 * というのは第1回モック取材の実測（docs/15）であって、取材が下手だからではない。
 * 埋まらない項目が出ることを前提にしたうえで、**落とさない仕組み**がこれ。
 *
 * マークを押せるだけで、後日の確認を支えるものが無かった（D-150）。
 */
function renderFollowup() {
  const p = state.project;
  const paths = p.unconfirmed ?? [];
  const plan = (p.unconfirmedPlan ??= {});
  const byPath = new Map();
  for (const block of state.blocks) {
    for (const f of block.fields) byPath.set(f.path, { field: f, block });
  }

  $("#fu-sub").textContent =
    `${p.basics?.name || p.id}　／　未確認 ${paths.length}件` +
    (p.hearingDate ? `　／　第1回 ${p.hearingDate}` : "");

  // 第2回の日程を決めないまま第1回を終えると、そのまま止まる
  const visit = (p.secondVisit ??= {});
  const dateEl = $("#fu-date");
  const whoEl = $("#fu-who");
  dateEl.value = visit.date ?? "";
  whoEl.value = visit.attendees ?? "";
  dateEl.oninput = () => { visit.date = dateEl.value || undefined; scheduleSave(); };
  whoEl.oninput = () => { visit.attendees = whoEl.value || undefined; scheduleSave(); };

  const body = $("#fu-body");
  body.replaceChildren();

  if (!paths.length) {
    const done = document.createElement("p");
    done.className = "fu-empty";
    done.textContent = "未確認の項目はありません。第2回取材で聞くことは、いまのところありません。";
    body.append(done);
    return;
  }

  for (const path of paths) {
    const found = byPath.get(path);
    const row = document.createElement("div");
    row.className = "fu-item";

    const head = document.createElement("div");
    head.className = "fu-item-head";
    const title = document.createElement("strong");
    title.textContent = found?.field.label ?? path;
    const where = document.createElement("span");
    where.className = "fu-where";
    where.textContent = found?.block.title ?? "";
    head.append(title, where);
    row.append(head);

    const note = unconfirmedNote(path);
    if (note) {
      const q = document.createElement("div");
      q.className = "fu-quote";
      q.textContent = `その場の回答：「${note}」`;
      row.append(q);
    }

    const label = document.createElement("label");
    label.className = "fu-ask";
    label.textContent = "誰に、いつまでに聞くか";
    const input = document.createElement("input");
    input.type = "text";
    input.value = plan[path] ?? "";
    input.placeholder = "例：工場長に第2回取材で／事務の方にメールで今週中";
    input.oninput = () => {
      if (input.value.trim()) plan[path] = input.value;
      else delete plan[path];
      scheduleSave();
    };
    label.append(input);
    row.append(label);

    // 第2回の現場で、その場で埋められるようにする
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "fu-jump";
    jump.textContent = "この項目を開く";
    jump.onclick = () => {
      closeFollowup();
      if (found) {
        state.activeBlock = found.block.id;
        renderNav(state.completion ?? { byBlock: [] });
        renderBlock();
        const el = document.querySelector(`.field[data-path="${CSS.escape(path)}"]`);
        el?.scrollIntoView({ block: "center" });
        el?.querySelector("input, textarea, select")?.focus();
      }
    };
    row.append(jump);
    body.append(row);
  }
}

function openFollowup() {
  renderFollowup();
  document.querySelector("header").hidden = true;
  document.querySelector("footer").hidden = true;
  $("#main").hidden = true;
  $("#followup").hidden = false;
  scrollTo({ top: 0 });
}

function closeFollowup() {
  $("#followup").hidden = true;
  document.querySelector("header").hidden = false;
  document.querySelector("footer").hidden = false;
  $("#main").hidden = false;
}

// ── 確認画面（お客様にお見せする） ──────────────────────────
/**
 * 取材の最後に、聞き取った内容をそのままお客様にお見せして確認していただく。
 *
 * 原稿を書いてから直すより、この場で直すほうが圧倒的に安い。
 * 数字・型番・材質・社名の誤りは、我々には検算しようがない（lib/verify.ts で弾けるのは
 * 「どこにも書いていないことを書いた」だけで、聞き間違いは弾けない）。
 *
 * **この画面には社内の言葉を出さない。**
 *   - 見出しの「強み（社長が自分では言えない部分）」を本人に向けるわけにはいかないので、
 *     customerTitle / customerLabel があればそちらを使う（lib/form-definition.ts）
 *   - 台本メモ・追い質問・充足率は出さない。あれは我々の道具であってお客様の資料ではない
 *   - 未確認欄に控えた発言（unconfirmedNotes）も出さない。
 *     あれは工場長に確認しにいくための手控えで、確定した事実ではない
 */
const PENDING_TEXT = "後日あらためて確認させてください";
const NOT_ASKED_TEXT = "うかがえていません";
/** lib/schema.ts の NEEDS_REVIEW_MARKER と同じ。取材中に書いた我々への申し送り */
const NEEDS_REVIEW = "{{要確認}}";

/**
 * {{要確認}} 以降を落とす。
 *
 * 「{{要確認}} 精度・歩留まりの数値実績を工場長に確認する」のような申し送りは、
 * **お客様に向ける文章ではない。**確定した部分だけを見せ、残りは後日に回す。
 */
function splitMarker(text) {
  if (!text.includes(NEEDS_REVIEW)) return { text, note: "" };
  const kept = text.split(NEEDS_REVIEW)[0].trim().replace(/[、。]$/, "");
  return kept
    ? { text: kept, note: `このほか、${PENDING_TEXT}` }
    : { text: "", note: PENDING_TEXT };
}

function jpDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 値を読める文字列にする。空なら null */
function reviewText(field, raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (Array.isArray(raw) && raw.length === 0) return null;
  switch (field.type) {
    case "boolean": return raw ? "はい" : "いいえ";
    case "date": return jpDate(raw);
    case "tags":
    case "multiselect": return raw.join("、");
    case "number": return String(raw);
    default: return String(raw);
  }
}

function reviewRow(label, value, { pending = false, note = "" } = {}) {
  const row = document.createElement("div");
  row.className = "review-row";
  const l = document.createElement("div");
  l.className = "review-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "review-value";
  v.textContent = value;
  if (pending) v.classList.add("pending");
  if (note) {
    const n = document.createElement("div");
    n.className = "review-pending-note pending";
    n.textContent = note;
    v.append(n);
  }
  row.append(l, v);
  return row;
}

/** 値のある行。{{要確認}} の申し送りをここで落とす */
function valueRow(label, text) {
  const { text: shown, note } = splitMarker(text);
  if (!shown) return reviewRow(label, note || PENDING_TEXT, { pending: true });
  return reviewRow(label, shown, { note });
}

/** 1項目ぶん。出すものが無ければ null（任意項目の空欄でお客様の画面を埋めない） */
function renderReviewField(field, blockTitle) {
  const label = field.customerLabel ?? field.label;

  if (isUnconfirmed(field.path)) return reviewRow(label, PENDING_TEXT, { pending: true });

  const raw = getByPath(state.project, field.path);

  if (field.type === "theme") {
    const t = { ...(state.theme?.default ?? {}), ...(raw ?? {}) };
    const name = (list, id) => (state.theme?.[list] ?? []).find((x) => x.id === id)?.label ?? "";
    /**
     * **お客様にお見せするのは、選んでいただいた1つだけ**（D-470・D-471）。
     * 配色や書体を並べると「それで決まった」と受け取られるが、そこはこちらが決め直す。
     */
    const look = (state.theme?.presets ?? []).find((p) => p.id === t.direction)?.label ?? "（お選びいただいていません）";
    return reviewRow(label, `近い見た目：${look}\n※ ご希望として伺いました。原稿のご確認のときに、御社の中身が入ったサイトを2〜3通りお見せして選んでいただきます`);
  }

  // 写真は、お預かりしたものをそのままお見せして「これを載せてよいか」を確認いただく。
  // 工場の写真には、社外に出せない設備や図面が写り込んでいることがある
  if (field.type === "photos") {
    const items = Array.isArray(raw) ? raw : [];
    if (!items.length) return null;
    const box = document.createElement("div");
    box.className = "review-list";
    const head = document.createElement("div");
    head.className = "review-label";
    head.textContent = `${label}（${items.length}枚）`;
    box.append(head);
    const grid = document.createElement("div");
    grid.className = "review-photos";
    for (const photo of items) {
      const fig = document.createElement("figure");
      if (!/\.heic$/i.test(photo.file)) {
        const img = document.createElement("img");
        img.src = photoUrl(photo.file);
        img.alt = photo.caption || "";
        img.loading = "lazy";
        fig.append(img);
      }
      const cap = document.createElement("figcaption");
      cap.textContent = [photo.category, photo.caption].filter(Boolean).join("／");
      fig.append(cap);
      grid.append(fig);
    }
    box.append(grid);
    return box;
  }

  if (field.type === "list") {
    const items = Array.isArray(raw) ? raw.filter((it) => it && Object.values(it).some((v) => v !== "" && v != null)) : [];
    if (!items.length) return field.required ? reviewRow(label, NOT_ASKED_TEXT, { pending: true }) : null;
    const box = document.createElement("div");
    box.className = "review-list";
    // 「加工事例」のように見出しと同じ名前のときは、二重に出さない
    if (label !== blockTitle) {
      const head = document.createElement("div");
      head.className = "review-label";
      head.textContent = label;
      box.append(head);
    }
    items.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "review-item";
      const title = document.createElement("div");
      title.className = "review-item-title";
      title.textContent = `${i + 1} 件目`;
      card.append(title);
      for (const sub of field.itemFields ?? []) {
        const text = reviewText(sub, item[sub.path]);
        if (text === null) continue;
        card.append(valueRow(sub.customerLabel ?? sub.label, text));
      }
      box.append(card);
    });
    return box;
  }

  const text = reviewText(field, raw);
  if (text === null) return field.required ? reviewRow(label, NOT_ASKED_TEXT, { pending: true }) : null;
  return valueRow(label, text);
}

function renderReview() {
  const p = state.project;
  $("#review-company").textContent = p.basics?.name || p.id;
  $("#review-date").textContent = `${jpDate(p.hearingDate)} 聞き取り`;

  const body = $("#review-body");
  body.replaceChildren();

  for (const block of state.blocks) {
    const title = block.customerTitle ?? block.title;
    const rows = [];
    for (const field of block.fields) {
      const el = renderReviewField(field, title);
      if (el) rows.push(el);
    }
    if (!rows.length) continue;
    const sec = document.createElement("section");
    sec.className = "review-block";
    const h = document.createElement("h2");
    // 内部向けの見出し（★最重要 など）をそのままお見せしない
    h.textContent = title;
    sec.append(h, ...rows);
    body.append(sec);
  }

  const pending = body.querySelectorAll(".pending").length;
  const foot = $("#review-foot");
  foot.textContent = pending
    ? `「${PENDING_TEXT}」と出ている項目が ${pending} 件あります。こちらからあらためてお尋ねします。`
    : "お気づきの点があれば、この場でお知らせください。その場で直します。";
}

function openReview() {
  renderReview();
  document.querySelector("header").hidden = true;
  document.querySelector("footer").hidden = true;
  $("#main").hidden = true;
  $("#review").hidden = false;
  scrollTo({ top: 0 });
}

/** 確認画面を閉じてふだんの画面構えに戻す。本文をどれにするかは呼び出し側が決める */
function closeReview() {
  $("#review").hidden = true;
  document.querySelector("header").hidden = false;
  document.querySelector("footer").hidden = false;
}

/** 最初の画面（案件を選ぶか、新規に作成してください）に戻す */
async function showHome(status) {
  clearTimeout(state.saveTimer);
  state.dirty = false;
  state.project = null;
  state.completion = null;
  closeReview();
  closeFollowup();
  $("#followup").hidden = true;
  $("#followup-open").hidden = true;
  $("#main").hidden = true;
  $("#empty").hidden = false;
  $("#to-list").hidden = true;
  $("#close-project").hidden = true;
  $("#delete-project").hidden = true;
  $("#project-select").value = "";
  setSaveStatus(status);
  await loadProjectList();
}

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
      /**
       * **案件IDも出す**（D-439）。
       *
       * 会社名しか出していなかったので、検証用のデモ案件（`demo` / `demo-2kai` /
       * `demo-industrial` / `demo-photo`）と本物の案件が、**一覧では見分けられなかった**——
       * 松原精機は検証用の架空会社なので、**同じ「有限会社 松原精機　100%」が5つ並ぶ。**
       * IDはフォルダ名であり、`npm run build:site -- <ID>` で使う名前でもある。
       */
      g.append(new Option(`${p.name || p.id}　${p.id}　${p.filledPct}%`, p.id));
    }
    sel.append(g);
  }
  if (selectId) sel.value = selectId;
  state.projectList = list;
  renderHome();
  return list;
}

// ── 案件一覧（D-469）─────────────────────────────────────────
const PLAN_LABEL = { manufacturing: "製造業向け", general: "汎用ベーシック" };

/** `2026-09-13` → `2026/09/13`。**取材日は日付だけ**なので、時刻に直さない */
const ymd = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10).replace(/-/g, "/") : "—");
/** 最終更新・確認日は時刻まで出す。**同じ日に何度も触る**ので、日付だけでは区別できない */
const stamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * **案件IDをコピーできるようにする。** IDは `npm run build:site -- <ID>` のように道具へ渡す名前で、
 * 手で打つと取り違える（`demo-2kai` と `demo-industrial` など、似た名前が並ぶ）。
 */
async function copyId(id, button) {
  try {
    await navigator.clipboard.writeText(id);
    button.textContent = "コピーしました";
  } catch {
    /** クリップボードが使えない環境（http で開いた別の端末など）では、選んで見せる */
    const r = document.createRange();
    r.selectNodeContents(button.previousElementSibling);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    button.textContent = "選択しました";
  }
  setTimeout(() => { button.textContent = "コピー"; }, 1500);
}

function renderHome() {
  const list = state.projectList ?? [];
  const q = ($("#home-filter")?.value ?? "").trim().toLowerCase();
  const rows = q ? list.filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(q)) : list;
  const body = $("#home-table tbody");
  if (!body) return;
  body.replaceChildren();
  for (const p of rows) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.dataset.id = p.id;
    const cell = (label, content, cls = "") => {
      const td = document.createElement("td");
      td.dataset.label = label;
      if (cls) td.className = cls;
      if (content instanceof Node) td.append(content); else td.textContent = content;
      tr.append(td);
      return td;
    };
    cell("会社名", p.name || "（会社名なし）", "home-name");
    const idBox = document.createElement("span");
    idBox.className = "home-id";
    const code = document.createElement("code");
    code.textContent = p.id;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-id";
    copy.textContent = "コピー";
    copy.setAttribute("aria-label", `案件ID ${p.id} をコピー`);
    /** **行を押すと案件が開く**ので、コピーのときは開かないようにする */
    copy.onclick = (e) => { e.stopPropagation(); copyId(p.id, copy); };
    idBox.append(code, copy);
    cell("案件ID", idBox);
    cell("商品", PLAN_LABEL[p.formSet] ?? p.formSet, "home-nowrap");
    cell("取材日", ymd(p.hearingDate), "home-nowrap");
    const pct = document.createElement("span");
    pct.className = "home-pct";
    pct.innerHTML = `<i style="width:${Math.max(0, Math.min(100, p.filledPct ?? 0))}%"></i>`;
    const pctText = document.createElement("b");
    pctText.textContent = `${p.filledPct ?? 0}%`;
    const pctBox = document.createElement("span");
    pctBox.className = "home-pct-box";
    pctBox.append(pct, pctText);
    cell("充足率", pctBox);
    /** 確認は「したか・いつか」が分かればよいので、日付だけ（時刻まで出すと列が広がって会社名が折れる） */
    cell("お客様の確認", p.reviewedAt ? `確認済み ${ymd(p.reviewedAt)}` : "まだ", p.reviewedAt ? "home-ok" : "home-muted");
    cell("最終更新", stamp(p.updatedAt), "home-muted");
    const open = () => openProject(p.id);
    tr.onclick = open;
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    body.append(tr);
  }
  $("#home-count").textContent = q
    ? `${list.length}件中 ${rows.length}件`
    : `${list.length}件（新しく触った順）`;
  $("#home-none").hidden = list.length > 0;
  $("#home-table").hidden = list.length === 0;
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
  $("#to-list").hidden = false;
  $("#project-select").value = id;
  $("#delete-project").hidden = false;
  $("#close-project").hidden = false;
  $("#followup-open").hidden = false;
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
  state.theme = form.theme;
  // 「pull したのに反映されていない気がする」を、画面で確かめられるようにする
  if (form.version) {
    const v = document.createElement("span");
    v.className = "code-version";
    v.textContent = `コード ${form.version}`;
    document.querySelector("footer").append(v);
  }
  state.blocks = form.sets.manufacturing.blocks;
  state.activeBlock = state.blocks[0]?.id ?? null;
  await loadProjectList();

  $("#project-select").onchange = (e) => {
    if (e.target.value) openProject(e.target.value);
  };
  /** 一覧へ戻る。**書きかけは先に保存する**（戻っただけで取材の入力が消えないように） */
  $("#to-list").onclick = async () => {
    if (state.dirty) await save();
    await showHome("保存しました");
  };
  $("#home-filter").oninput = renderHome;

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
  // 入力を終えたら、まずお客様に確認していただく。
  // 原稿を書いてから誤りが見つかると作り直しになるので、その場で潰す
  const reviewDialog = $("#review-dialog");
  $("#close-project").onclick = async () => {
    if (state.dirty) await save();
    const c = state.completion;
    const name = state.project.basics?.name || state.project.id;
    const lines = [name];
    if (c) {
      const parts = [`必須 ${c.filled}/${c.requiredTotal} 入力済`];
      if (c.unconfirmed.length) parts.push(`未確認 ${c.unconfirmed.length}件`);
      if (c.missing.length) parts.push(`未着手 ${c.missing.length}件`);
      lines.push(parts.join(" ／ "));
    }
    if (state.project.reviewedAt) lines.push(`前回の確認：${new Date(state.project.reviewedAt).toLocaleString("ja-JP")}`);
    $("#review-target").textContent = lines.join("\n");
    reviewDialog.showModal();
  };
  $("#followup-open").onclick = openFollowup;
  $("#fu-back").onclick = closeFollowup;
  $("#fu-print").onclick = () => print();

  $("#review-cancel").onclick = () => reviewDialog.close();
  $("#review-open").onclick = () => { reviewDialog.close(); openReview(); };

  // 直すところがあれば編集画面へ戻す
  $("#review-back").onclick = () => {
    closeReview();
    $("#main").hidden = false;
  };

  // 確認が済んだら、いつ確認していただいたかを残してから最初の画面に戻る
  $("#review-done").onclick = async () => {
    state.project.reviewedAt = new Date().toISOString();
    state.dirty = true;
    await save();
    await showHome("確認済みとして保存しました");
  };

  // 削除は「消す」のではなく「ゴミ箱に移す」。
  // 案件データには顧客の技術情報が入っており、取材90分ぶんが誤クリックで消えるのは割に合わない
  const delDialog = $("#delete-dialog");
  $("#delete-project").onclick = () => {
    if (!state.project) return;
    const c = state.completion;
    const name = state.project.basics?.name || state.project.id;
    // 94%まで入力した案件を消すのは重大事。何を失うのかを数字で見せる
    const detail = c ? `必須 ${c.filled}/${c.requiredTotal} 項目を入力済み` : "";
    $("#delete-target").textContent = `${name}　（${state.project.id}）\n${detail}`;
    delDialog.showModal();
  };
  $("#delete-cancel").onclick = () => delDialog.close();
  $("#delete-confirm").onclick = async () => {
    const id = state.project.id;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    delDialog.close();
    if (!res.ok) return alert((await res.json()).error);
    // 保存待ちのタイマーが残っていると、消した案件を書き戻してしまう。showHome で止める
    await showHome("削除しました");
  };

  $("#new-project").onclick = openNew;
  $("#new-project-empty").onclick = openNew;
  $("#new-cancel").onclick = () => dialog.close();

  $("#new-submit").onclick = async () => {
    const id = $("#new-id").value.trim();
    const name = $("#new-name").value.trim();
    const formSet = document.querySelector('input[name="formSet"]:checked').value;
    const err = $("#new-error");

    // 会社名は必須。無いと一覧が案件ID（20260913-1）だけになり、後から探せなくなる
    if (!name) {
      err.textContent = "会社名を入力してください。";
      err.hidden = false;
      $("#new-name").focus();
      return;
    }
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
