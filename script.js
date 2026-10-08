/* ===== Cấu hình: để DB_URL rỗng thì dùng localStorage ===== */
const CFG = { DB_URL: "https://duyyer-4476b-default-rtdb.firebaseio.com" };

/* ===== Rubric 6 tiêu chí (tổng 100 điểm) ===== */
const CRIT = [
  ["Tham gia đóng góp ý kiến", [["Đầy đủ",15],["Thường xuyên",10],["Một vài lần",5],["Không tham gia",0]]],
  ["Hoàn thành công việc đúng thời hạn", [["Tích cực",15],["Thường xuyên",10],["Thỉnh thoảng",5],["Không bao giờ",0]]],
  ["Hoàn thành công việc có chất lượng", [["Luôn luôn",15],["Thường xuyên",10],["Thỉnh thoảng",5],["Không bao giờ",0]]],
  ["Có ý tưởng mới, sáng tạo", [["Luôn luôn",20],["Thường xuyên",15],["Thỉnh thoảng",10],["Không bao giờ",0]]],
  ["Hợp tác tốt với thành viên khác", [["Luôn luôn",15],["Thường xuyên",10],["Thỉnh thoảng",5],["Không bao giờ",0]]],
  ["Thảo luận và điều hành nhóm", [["Tốt",20],["Khá",15],["Bình thường",10],["Không được tốt",5],["Kém",0]]]
];

/* ===== Quy tắc cảnh báo theo rubric (đổi số ở đây nếu thầy yêu cầu khác) ===== */
const RULE = { MIN_RATERS: 3, SELF_MAX: 90, GAP: 20, SHARE: 0.75 }; // tối thiểu 3 người chấm; tự chấm ≥90; "thấp" = thấp hơn tự chấm ≥20 điểm; từ 3/4 số người còn lại
const DESC6 = ["tham gia đầy đủ, hỗ trợ tốt", "vắng 1 buổi điều hành/thảo luận, hỗ trợ tốt", "tham gia đầy đủ, hỗ trợ bình thường/không hỗ trợ", "vắng 1 buổi điều hành/thảo luận, hỗ trợ bình thường", "vắng buổi điều hành và thảo luận, không hỗ trợ/hỗ trợ kém"];

/* ===== Trạng thái toàn cục ===== */
let S = null, meId = localStorage.getItem("tf_me"), tab = "tasks", gid = null, draft = {}, stat = "ok";

/* ===== Tiện ích ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const id = () => Math.random().toString(36).slice(2, 9);
const hue = n => [...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
const av = u => u ? `<span class="av" style="background:hsl(${hue(u.name)},60%,48%)" title="${esc(u.name)}">${esc(u.name.trim()[0] || "?").toUpperCase()}</span>` : "";
const user = i => S.users.find(u => u.id === i);
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); // ngày theo giờ máy
const today = () => ymd(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const dayDiff = (a, b) => { const p = x => { const [y, m, d] = x.split("-").map(Number); return new Date(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };
const addTo = (x, n) => { const [y, m, d] = x.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); }; // cộng ngày vào một ngày cho trước
const vnDate = x => x ? x.split("-").reverse().join("/") : "";
const fmt = ms => new Date(ms).toLocaleDateString("vi-VN");
let tf = { name: "", uid: "", due: today(), after: "" }; // nháp form giao việc: không mất khi render lại

/* ===== Dữ liệu mặc định: đổi mật khẩu admin tại đây ===== */
function seed() {
  return { users: [{ id: "admin", name: "Quản trị viên", user: "admin", pass: "admin123", admin: true }], groups: [], tasks: [], ratings: {}, finals: {} };
}

/* ===== Đọc / ghi Firebase REST (hoặc localStorage) ===== */
function norm(s) { s.users ||= []; s.groups ||= []; s.tasks ||= []; s.ratings ||= {}; s.finals ||= {}; s.applied ||= {}; return s; }
async function load() {
  if (!CFG.DB_URL) { const r = localStorage.getItem("tf_state"); return r ? norm(JSON.parse(r)) : seed(); }
  const r = await fetch(CFG.DB_URL + "/state.json");
  if (!r.ok) throw new Error("net");
  const v = await r.json();
  if (!v) { const s = seed(); await save(s); return s; }
  const s = JSON.parse(v);
  return norm(s);
}
async function save(s) {
  if (!CFG.DB_URL) { localStorage.setItem("tf_state", JSON.stringify(s)); return; }
  const r = await fetch(CFG.DB_URL + "/state.json", { method: "PUT", body: JSON.stringify(JSON.stringify(s)) });
  if (!r.ok) throw new Error("net");
}

/* ===== Mẫu ghi: tải mới nhất → sửa → lưu → render ===== */
async function mutate(fn, msg) {
  setSt("sv");
  try {
    const s = await load();
    const r = fn(s);
    if (typeof r === "string") { setSt("ok"); toast(r, "err"); return false; }
    await save(s); S = s; setSt("ok");
    if (msg) toast(msg);
    render(); return true;
  } catch (e) { setSt("off"); toast("Mất kết nối, chưa lưu được. Hãy thử lại.", "err"); return false; }
}

/* ===== Toast & chấm trạng thái ===== */
function toast(t, k = "") {
  const d = document.createElement("div"); d.className = "toast " + k; d.textContent = t;
  const box = $("#toasts"); box.append(d); while (box.children.length > 2) box.firstChild.remove(); // tối đa 2 toast
  setTimeout(() => d.remove(), 2600);
}
const stTxt = () => ({ ok: "🟢 Đã đồng bộ", sv: "🟡 Đang lưu…", off: "🔴 Mất kết nối" }[stat]);
function setSt(s) { stat = s; const e = $("#st"); if (e) e.textContent = stTxt(); }
function boom() { // confetti nhỏ
  for (let i = 0; i < 36; i++) {
    const e = document.createElement("span"); e.className = "confetti"; e.textContent = ["🎉", "✨", "🎊", "⭐"][i % 4];
    e.style.left = Math.random() * 100 + "vw"; e.style.animationDelay = Math.random() * .6 + "s";
    document.body.append(e); setTimeout(() => e.remove(), 3200);
  }
}

/* ===== Quyền & nhóm hiện tại ===== */
const me = () => user(meId);
const myGroups = () => me().admin ? S.groups : S.groups.filter(g => g.members.includes(meId));
const grp = () => myGroups().find(g => g.id === gid) || (gid = myGroups()[0]?.id, myGroups()[0]);
const isLead = g => g && (me().admin || g.leader === meId);
const gTasks = g => S.tasks.filter(t => t.gid === g.id);
const dependsOn = (ts, startId, targetId) => { let c = startId, n = 0; while (c && n++ < 200) { if (c === targetId) return true; c = ts.find(x => x.id === c)?.after; } return false; }; // việc start có (gián tiếp) phụ thuộc target?
const blocked = t => t.after && !t.done && !S.tasks.find(x => x.id === t.after)?.done;

/* ===== Điểm đánh giá ===== */
const score = a => a && a.length === 6 ? a.reduce((s, v, i) => s + CRIT[i][1][v][1], 0) : null;
const cls = n => n >= 85 ? "g" : n >= 60 ? "y" : "r";

/* ===== Render chính ===== */
function render() {
  const app = $("#app");
  if (!S) { app.innerHTML = `<div class="empty"><b>⏳</b>Đang tải dữ liệu…</div>`; return; }
  if (!meId || !me()) { if (meId) { meId = null; localStorage.removeItem("tf_me"); } return app.innerHTML = loginView(); }
  const u = me(), g = grp();
  if (tab === "sum" && !isLead(g)) tab = "tasks";
  if (tab === "admin" && !u.admin) tab = "tasks";
  if (tab === "rate" && u.admin) tab = "tasks"; // admin không phải thành viên nên không chấm điểm
  const tabs = [["tasks", "📋 Nhiệm vụ"], ...(u.admin ? [] : [["rate", "⭐ Đánh giá"]]), ...(isLead(g) ? [["sum", "📊 Tổng hợp"]] : []), ...(u.admin ? [["admin", "⚙️ Quản trị"]] : [])];
  const groupSel = myGroups().length > 1 ? `<select data-f="grp">${myGroups().map(x => `<option value="${x.id}" ${x.id === g.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
  app.innerHTML = `<header><span class="logo">✨ TeamFlow</span>
    <nav>${tabs.map(([k, l]) => `<button class="tab ${tab === k ? "on" : ""}" data-a="tab" data-v="${k}">${l}</button>`).join("")}</nav>
    <span class="dot" id="st">${stTxt()}</span>${av(u)}<span class="uname">${esc(u.name)}</span>
    <button class="btn sm" data-a="pwd" data-v="${u.id}" title="Đổi mật khẩu">🔑<span class="hm"> Đổi mật khẩu</span></button><button class="btn sm" data-a="logout" title="Đăng xuất">🚪<span class="hm"> Đăng xuất</span></button></header>
    <main>${groupSel ? `<div class="row">Nhóm: ${groupSel}</div>` : ""}${{ tasks: tasksView, rate: rateView, sum: sumView, admin: adminView }[tab](g)}</main>`;
}

/* ===== Đăng nhập ===== */
function loginView() {
  return `<div class="login"><i class="blob b1"></i><i class="blob b2"></i><div class="glass" id="lg">
    <div class="logo">✨ TeamFlow</div><p class="mu">Giao việc rõ ràng, đánh giá công bằng.</p>
    <input id="lu" placeholder="Tên đăng nhập" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"><input id="lp" type="password" placeholder="Mật khẩu" autocomplete="current-password">
    <button class="btn pri" data-a="login">Đăng nhập</button></div></div>`;
}

/* ===== Tab Nhiệm vụ ===== */
function tasksView(g) {
  if (!g) return empty("👥", me().admin ? "Chưa có nhóm nào – hãy tạo nhóm ở tab Quản trị." : "Bạn chưa thuộc nhóm nào. Hãy nhờ admin thêm bạn vào nhóm.");
  const ts = gTasks(g), done = ts.filter(t => t.done).length, pct = ts.length ? Math.round(done / ts.length * 100) : 0;
  const mem = g.members.map(user).filter(Boolean);
  const lead = isLead(g);
  let h = `<div class="card"><h3>${esc(g.name)} ${g.leader ? `<span class="mu">· Trưởng nhóm: ${esc(user(g.leader)?.name)}</span>` : `<span class="chip warn">Chưa có trưởng nhóm</span>`}</h3>
    <div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b> <span class="mu">(${done}/${ts.length} việc)</span>
    ${pct === 100 && ts.length ? `<p><b>🎉 Cả nhóm đã hoàn thành!</b></p>` : ""}
    <div class="row">${mem.map(m => { const mt = ts.filter(t => t.uid === m.id); return `<span class="chip">${esc(m.name)}: ${mt.filter(t => t.done).length}/${mt.length}</span>`; }).join("")}</div></div>`;
  if (lead) {
    if (!mem.some(m => m.id === tf.uid)) tf.uid = mem[0]?.id || "";
    if (!ts.some(t => t.id === tf.after)) tf.after = "";
    h += mem.length ? `<div class="card"><h3>➕ Giao việc mới</h3><div class="fg">
      <label class="fl w2">Tên nhiệm vụ<input data-f="tf" data-k="name" value="${esc(tf.name)}" placeholder="VD: Viết báo cáo chương 2" maxlength="120" autocomplete="off"></label>
      <label class="fl">Người phụ trách<select data-f="tf" data-k="uid">${mem.map(m => `<option value="${m.id}" ${m.id === tf.uid ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
      <label class="fl">Làm sau việc<select data-f="tf" data-k="after"><option value="">(không)</option>${ts.map(t => `<option value="${t.id}" ${t.id === tf.after ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
      <div class="fl w2"><label for="td">Hạn chót <span class="mu">(chạm vào ô để mở lịch)</span></label><input id="td" type="date" data-f="tf" data-k="due" value="${esc(tf.due)}">
        <div class="qd">${[[0, "Hôm nay"], [1, "+1 ngày"], [2, "+2 ngày"], [3, "+3 ngày"]].map(([n, l]) => `<button type="button" class="pill" data-a="dueq" data-v="${n}">${l}</button>`).join("")}<button type="button" class="pill" data-a="dueq" data-v="x">Không hạn</button></div></div>
      <button class="btn pri w2" data-a="addTask">➕ Thêm việc</button></div></div>` : empty("👤", "Nhóm chưa có thành viên – thêm ở tab Quản trị.");
  }
  h += ts.length ? ts.map(taskCard(lead)).join("") : empty("📝", "Chưa có nhiệm vụ nào – hãy giao việc đầu tiên!");
  return h;
}
const taskCard = lead => t => {
  const u = user(t.uid), bl = blocked(t), pre = t.after && S.tasks.find(x => x.id === t.after), can = t.uid === meId || lead;
  let st, dl = "";
  if (t.done) { // đã xong: so ngày xong với hạn chót
    st = `<span class="chip ok">✔ Hoàn thành · ${fmt(t.doneAt)}</span>`;
    if (t.due) { const d = dayDiff(ymd(new Date(t.doneAt)), t.due); dl = d < 0 ? `<span class="chip warn">⏰ Trễ ${-d} ngày</span>` : `<span class="chip ok">Đúng hạn${d ? ` · sớm ${d} ngày` : ""}</span>`; }
  } else { // chưa xong: so hôm nay với hạn chót
    st = bl ? `<span class="chip">🔒 Chờ việc trước</span>` : `<span class="chip">Đang làm</span>`;
    if (t.due) { const d = dayDiff(today(), t.due); dl = d < 0 ? `<span class="chip bad">Quá hạn ${-d} ngày</span>` : d === 0 ? `<span class="chip warn">Hạn hôm nay</span>` : `<span class="chip">Còn ${d} ngày</span>`; }
  }
  const acts = (can && !t.done && !bl ? `<button class="btn pri sm" data-a="done" data-v="${t.id}">✔ Done</button>` : "")
    + (can && t.done ? `<button class="btn sm" data-a="undo" data-v="${t.id}">↩ Hoàn tác</button>` : "")
    + (lead ? `<button class="btn sm" data-a="editTask" data-v="${t.id}">✏️ Sửa</button>` : "")
    + (lead ? `<button class="btn sm dan" data-a="delTask" data-v="${t.id}">🗑 Xoá</button>` : "");
  return `<div class="card task ${t.done ? "done" : ""}">${av(u)}<div class="nm"><b>${esc(t.name)}</b><br><span class="mu">${esc(u?.name)}${t.due ? " · 📅 " + vnDate(t.due) : ""}${pre ? ` · ↳ Sau: ${esc(pre.name)}` : ""}</span></div>
    <div class="chs">${st}${dl}</div>${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;
};
const empty = (e, t) => `<div class="card empty"><b>${e}</b>${t}</div>`;

/* ===== Tab Đánh giá ===== */
function rateView(g) {
  if (!g) return empty("⭐", "Chưa có nhóm để đánh giá.");
  const mem = g.members.map(user).filter(Boolean);
  if (!mem.length) return empty("👤", "Nhóm chưa có thành viên.");
  if (!g.leader) return empty("👑", "Nhóm chưa có trưởng nhóm – hãy nhờ admin chọn trưởng nhóm.");
  let h = `<p class="mu">Chấm điểm cho tất cả thành viên, kể cả chính bạn. Chỉ lưu những dòng đã chọn đủ 6 tiêu chí.</p>`;
  h += mem.map(m => {
    const k = g.id + "|" + m.id, saved = S.ratings[g.id]?.[meId]?.[m.id];
    const d = draft[k] ||= saved ? saved.slice() : [];
    const tot = score(Array.from({ length: 6 }, (_, i) => d[i]).every(x => x != null) ? Array.from({ length: 6 }, (_, i) => d[i]) : null);
    const part = d.reduce((s, v, i) => s + (v != null ? CRIT[i][1][v][1] : 0), 0);
    return `<div class="card">${tot != null ? `<span class="badge ${cls(tot)}">${tot}/100</span>` : `<span class="badge y">~${part}</span>`}
      <h3>${av(m)} ${esc(m.name)} ${m.id === meId ? "(bạn)" : ""}</h3>
      ${CRIT.map(([n, ls], c) => `<div><b>${c + 1}. ${n}</b><div class="pills">${ls.map(([l, p], v) => `<button class="pill ${d[c] === v ? "on" : ""}" data-a="pick" data-k="${k}" data-c="${c}" data-v="${v}">${l} (${p})</button>`).join("")}</div>${c === 5 ? `<ul class="lg">${ls.map(([l], v) => `<li><b>${l}</b>: ${DESC6[v]}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>`;
  }).join("");
  return h + `<button class="btn pri" data-a="saveRate">💾 Lưu đánh giá</button>`;
}

/* ===== Tính điểm tổng hợp & điều kiện cảnh báo cho 1 thành viên ===== */
function calc(st, g, mid) {
  const R = st.ratings[g.id] || {};
  const self = score(R[mid]?.[mid]), ld = score(R[g.leader]?.[mid]);
  const avgOf = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const avg = avgOf(g.members.filter(x => x !== mid && x !== g.leader).map(x => score(R[x]?.[mid])).filter(x => x != null)); // TB các thành viên khác (không tính bản thân & trưởng nhóm)
  const W = g.members.filter(x => x !== mid).map(x => score(R[x]?.[mid])).filter(x => x != null); // tất cả người còn lại đã chấm
  const low = self != null ? W.filter(x => self - x >= RULE.GAP).length : 0;
  const warn = self != null && self >= RULE.SELF_MAX && W.length >= RULE.MIN_RATERS && low / W.length >= RULE.SHARE;
  return { self, ld, avg, W, low, warn, base: avg ?? avgOf(W), rated: W.length + (self != null ? 1 : 0) };
}

/* ===== Tab Tổng hợp (Bảng 5) ===== */
function sumView(g) {
  if (!g || !g.leader) return empty("👑", "Cần có nhóm và trưởng nhóm để tổng hợp.");
  const mem = g.members.map(user).filter(Boolean), F = S.finals[g.id] || {}, AP = S.applied?.[g.id] || {};
  const rows = mem.map(m => { const c = calc(S, g, m.id); return { m, ...c, fin: F[m.id] ?? c.ld }; });
  const best = Math.max(...rows.map(r => r.fin ?? -1));
  return `<div class="card tw"><h3>📊 Bảng tổng hợp – ${esc(g.name)}</h3><table class="st"><tr class="hd"><th>Thành viên</th><th>Vị trí</th><th>Tự đánh giá</th><th>TB thành viên khác</th><th>Trưởng nhóm chấm</th><th>Điểm cuối</th></tr>
  ${rows.map(r => `<tr class="${r.fin === best && best >= 0 ? "best" : ""}"><td class="who">${av(r.m)} <span>${esc(r.m.name)}<div class="mu">Đã chấm: ${r.rated}/${mem.length}</div></span></td><td data-l="Vị trí">${r.m.id === g.leader ? "Trưởng nhóm" : "Thành viên"}</td>
    <td data-l="Tự đánh giá">${r.self ?? "–"}</td><td data-l="TB thành viên khác">${r.avg ?? "–"}</td><td data-l="Trưởng nhóm chấm">${r.ld ?? "–"}</td>
    <td data-l="Điểm cuối"><span><input type="number" min="0" max="100" data-f="fin" data-u="${r.m.id}" value="${r.fin ?? ""}" aria-label="Điểm cuối của ${esc(r.m.name)}">${r.fin === best && best >= 0 ? " 🏆" : ""}</span>
    ${AP[r.m.id] ? `<span class="chip ok">✔ Đã dùng điểm TB</span> <button class="btn sm" data-a="unavg" data-v="${r.m.id}">Bỏ áp dụng</button>` : ""}</td></tr>
    ${r.warn ? `<tr class="wr"><td colspan="6"><div class="warnbox">⚠️ <b>${esc(r.m.name)}</b> tự chấm ${r.self} (mức tối đa) nhưng ${r.low}/${r.W.length} người còn lại chấm thấp hơn từ ${RULE.GAP} điểm. Theo rubric, trưởng nhóm có quyền dùng điểm trung bình${r.base != null ? ` (${r.base})` : ""}.${!AP[r.m.id] && r.base != null ? `<div class="row"><button class="btn sm pri" data-a="useavg" data-v="${r.m.id}">Dùng điểm trung bình</button></div>` : ""}</div></td></tr>` : ""}`).join("")}</table>
  <p class="mu">Quy tắc cảnh báo: tự chấm ≥ ${RULE.SELF_MAX}, có ít nhất ${RULE.MIN_RATERS} người khác chấm, và từ ${RULE.SHARE * 100}% số người đó chấm thấp hơn tự chấm ≥ ${RULE.GAP} điểm. Cảnh báo chỉ mang tính gợi ý; trưởng nhóm quyết định điểm cuối.</p></div>`;
}

/* ===== Tab Quản trị ===== */
function adminView() {
  return `<div class="card"><h3>👤 Tài khoản</h3><div class="row"><input id="nn" placeholder="Họ tên"><input id="nu" placeholder="Tên đăng nhập" autocapitalize="off" autocorrect="off" spellcheck="false"><input id="np" placeholder="Mật khẩu" autocapitalize="off" autocorrect="off" spellcheck="false">
    <button class="btn pri" data-a="addUser">Tạo tài khoản</button></div>
    ${S.users.filter(u => !u.admin).map(u => `<div class="row">${av(u)}<b>${esc(u.name)}</b><span class="mu">${esc(u.user)} / ${esc(u.pass)}</span><button class="btn sm" data-a="pwd" data-v="${u.id}">🔑 Đổi MK</button><button class="btn sm dan" data-a="delUser" data-v="${u.id}">Xoá</button></div>`).join("") || `<p class="mu">Chưa có thành viên nào.</p>`}</div>
  <div class="card"><h3>👥 Nhóm</h3><div class="row"><input id="gn" placeholder="Tên nhóm"><button class="btn pri" data-a="addGroup">Tạo nhóm</button></div></div>
  ${S.groups.map(g => `<div class="card"><h3>${esc(g.name)} <button class="btn sm dan" data-a="delGroup" data-v="${g.id}">Xoá nhóm</button></h3>
    <div class="row">${S.users.filter(u => !u.admin).map(u => `<label class="chip"><input type="checkbox" data-f="mem" data-g="${g.id}" data-u="${u.id}" ${g.members.includes(u.id) ? "checked" : ""}> ${esc(u.name)}</label>`).join("") || `<span class="mu">Hãy tạo tài khoản trước.</span>`}</div>
    <div class="row">Trưởng nhóm: <select data-f="lead" data-g="${g.id}"><option value="">(chưa chọn)</option>${g.members.map(user).filter(Boolean).map(u => `<option value="${u.id}" ${g.leader === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div></div>`).join("")}`;
}

/* ===== Xử lý click (event delegation, data-a) ===== */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a, v = b.dataset.v, val = i => ($(i)?.value || "").trim();
  if (a === "login") { // đăng nhập
    const u = S.users.find(x => x.user.toLowerCase() === val("#lu").toLowerCase() && x.pass === $("#lp").value);
    if (!u) { const l = $("#lg"); l.classList.remove("shake"); void l.offsetWidth; l.classList.add("shake"); return toast("Sai tên đăng nhập hoặc mật khẩu", "err"); }
    meId = u.id; localStorage.setItem("tf_me", meId); gid = null; draft = {}; tab = "tasks"; render();
  }
  if (a === "logout") { meId = null; localStorage.removeItem("tf_me"); render(); }
  if (a === "tab") { tab = v; render(); }
  if (a === "pick") { (draft[b.dataset.k] ||= [])[+b.dataset.c] = +v; render(); } // chọn mức
  if (a === "addTask") { // thêm nhiệm vụ (đọc từ nháp tf)
    const name = tf.name.trim(), g = gid; if (!name) return toast("Hãy nhập tên nhiệm vụ", "err");
    if (!tf.uid) return toast("Hãy chọn người phụ trách", "err");
    const t = { id: id(), gid: g, name, uid: tf.uid, due: tf.due || "", after: tf.after || "", done: false, doneAt: null };
    mutate(s => { s.tasks.push(t); }, "Đã giao việc").then(ok => { if (ok) { tf.name = ""; tf.after = ""; render(); } });
  }
  if (a === "dueq") { tf.due = v === "x" ? "" : addDays(+v); $("#td").value = tf.due; } // chọn nhanh hạn chót
  if (a === "editTask") openEdit(v);
  if (a === "dueq2") { const c = $("#ed").value; $("#ed").value = v === "x" ? "" : v[0] === "r" ? addTo(c || today(), +v.slice(1)) : addDays(+v); } // gia hạn tính từ hạn hiện tại
  if (a === "editSave") { // lưu chỉnh sửa nhiệm vụ (đọc lại state mới nhất trước khi sửa)
    const name = $("#en").value.trim(), uid = $("#eu").value, due = $("#ed").value, after = $("#ea").value;
    if (!name) return toast("Tên nhiệm vụ không được để trống", "err");
    mutate(s => {
      const t = s.tasks.find(x => x.id === v); if (!t) return "Nhiệm vụ không còn tồn tại";
      if (after && (after === t.id || dependsOn(s.tasks, after, t.id))) return "Việc này sẽ tạo vòng lặp phụ thuộc";
      Object.assign(t, { name, uid, due, after });
    }, "Đã cập nhật nhiệm vụ").then(ok => ok && closeModal());
  }
  if (a === "useavg") { const g = grp(); mutate(s => { const c = calc(s, s.groups.find(x => x.id === g.id), v); if (c.base == null) return "Chưa có điểm trung bình để áp dụng"; (s.finals[g.id] ||= {})[v] = c.base; (s.applied[g.id] ||= {})[v] = true; }, "Đã dùng điểm trung bình"); }
  if (a === "unavg") { const g = gid; mutate(s => { delete s.finals[g]?.[v]; delete s.applied[g]?.[v]; }, "Đã bỏ áp dụng"); }
  if (a === "pwd") openPw(v);
  if (a === "closeM" && e.target === b) closeModal();
  if (a === "pwSave") { // lưu mật khẩu mới
    const o = $("#pw0")?.value || "", n = $("#pw1").value, n2 = $("#pw2").value;
    if (n.length < 4) return toast("Mật khẩu mới cần ít nhất 4 ký tự", "err");
    if (n !== n2) return toast("Hai mật khẩu mới không khớp", "err");
    mutate(s => { const u = s.users.find(x => x.id === v); if (!u) return "Tài khoản không còn tồn tại"; if (v === meId && u.pass !== o) return "Mật khẩu hiện tại không đúng"; u.pass = n; }, "Đã đổi mật khẩu").then(ok => ok && closeModal());
  }
  if (a === "done" || a === "undo") { // Done / Hoàn tác
    let all = false;
    mutate(s => {
      const t = s.tasks.find(x => x.id === v); if (!t) return "Nhiệm vụ không còn tồn tại";
      if (a === "done") {
        const p = t.after && s.tasks.find(x => x.id === t.after);
        if (p && !p.done) return "Việc trước chưa hoàn thành";
        t.done = true; t.doneAt = Date.now();
        const ts = s.tasks.filter(x => x.gid === t.gid); all = ts.every(x => x.done);
      } else { t.done = false; t.doneAt = null; }
    }, a === "done" ? "Đã hoàn thành ✔" : "Đã hoàn tác").then(() => { if (all) boom(); });
  }
  if (a === "delTask" && confirm("Xoá nhiệm vụ này?")) mutate(s => { s.tasks = s.tasks.filter(t => t.id !== v); s.tasks.forEach(t => { if (t.after === v) t.after = ""; }); }, "Đã xoá");
  if (a === "saveRate") { // lưu các dòng đã đủ 6 tiêu chí
    const g = grp(); let n = 0;
    mutate(s => {
      ((s.ratings[g.id] ||= {})[meId] ||= {});
      g.members.forEach(m => {
        const d = Array.from({ length: 6 }, (_, i) => (draft[g.id + "|" + m][i]));
        if (d.every(x => x != null)) { s.ratings[g.id][meId][m] = d; n++; }
      });
      if (!n) return "Chưa có dòng nào chọn đủ 6 tiêu chí";
    }, "Đã lưu đánh giá");
  }
  if (a === "addUser") {
    const n = val("#nn"), u = val("#nu").toLowerCase(), p = val("#np");
    if (!n || !u || !p) return toast("Điền đủ họ tên, tên đăng nhập, mật khẩu", "err");
    mutate(s => { if (s.users.some(x => x.user.toLowerCase() === u)) return "Tên đăng nhập đã tồn tại"; s.users.push({ id: id(), name: n, user: u, pass: p, admin: false }); }, "Đã tạo tài khoản");
  }
  if (a === "delUser" && confirm("Xoá tài khoản và dữ liệu liên quan?")) mutate(s => {
    s.users = s.users.filter(u => u.id !== v);
    s.groups.forEach(g => { g.members = g.members.filter(m => m !== v); if (g.leader === v) g.leader = ""; });
    const gone = s.tasks.filter(t => t.uid === v).map(t => t.id);
    s.tasks = s.tasks.filter(t => t.uid !== v); s.tasks.forEach(t => { if (gone.includes(t.after)) t.after = ""; });
  }, "Đã xoá tài khoản");
  if (a === "addGroup") { const n = val("#gn"); if (!n) return toast("Hãy nhập tên nhóm", "err"); mutate(s => { s.groups.push({ id: id(), name: n, members: [], leader: "" }); }, "Đã tạo nhóm"); }
  if (a === "delGroup" && confirm("Xoá nhóm và toàn bộ nhiệm vụ của nhóm?")) mutate(s => { s.groups = s.groups.filter(g => g.id !== v); s.tasks = s.tasks.filter(t => t.gid !== v); }, "Đã xoá nhóm");
});

/* ===== Hộp thoại đổi mật khẩu (nằm ngoài #app nên không bị render xoá) ===== */
function openPw(t) {
  const u = user(t), own = t === meId; if (!u) return; closeModal();
  const m = document.createElement("div"); m.id = "modal"; m.className = "ov"; m.dataset.a = "closeM";
  m.innerHTML = `<div class="card mdl" role="dialog" aria-modal="true"><h3>🔑 Đổi mật khẩu${own ? "" : " – " + esc(u.name)}</h3>
    ${own ? `<label class="fl">Mật khẩu hiện tại<input id="pw0" type="password" autocomplete="current-password"></label>` : ""}
    <label class="fl">Mật khẩu mới (từ 4 ký tự)<input id="pw1" type="password" autocomplete="new-password"></label>
    <label class="fl">Nhập lại mật khẩu mới<input id="pw2" type="password" autocomplete="new-password"></label>
    <div class="row"><button class="btn pri" data-a="pwSave" data-v="${t}">Lưu mật khẩu</button><button class="btn" data-a="closeM">Huỷ</button></div></div>`;
  document.body.append(m); (own ? $("#pw0") : $("#pw1")).focus();
}
function openEdit(tid) {
  const t = S.tasks.find(x => x.id === tid), g = t && S.groups.find(x => x.id === t.gid); if (!t || !g) return; closeModal();
  const mem = g.members.map(user).filter(Boolean), opts = S.tasks.filter(x => x.gid === t.gid && x.id !== t.id && !dependsOn(S.tasks, x.id, t.id));
  const m = document.createElement("div"); m.id = "modal"; m.className = "ov"; m.dataset.a = "closeM";
  m.innerHTML = `<div class="card mdl" role="dialog" aria-modal="true"><h3>✏️ Sửa nhiệm vụ</h3>
    <label class="fl">Tên nhiệm vụ<input id="en" value="${esc(t.name)}" maxlength="120" autocomplete="off"></label>
    <label class="fl">Người phụ trách<select id="eu">${mem.map(u => `<option value="${u.id}" ${u.id === t.uid ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label>
    <div class="fl"><label for="ed">Hạn chót <span class="mu">(chạm vào ô để mở lịch)</span></label><input id="ed" type="date" value="${esc(t.due || "")}">
      <div class="qd">${[["0", "Hôm nay"], ["1", "+1 ngày"], ["2", "+2 ngày"], ["r1", "Gia hạn +1"], ["r3", "Gia hạn +3"], ["x", "Không hạn"]].map(([k, l]) => `<button type="button" class="pill" data-a="dueq2" data-v="${k}">${l}</button>`).join("")}</div></div>
    <label class="fl">Làm sau việc<select id="ea"><option value="">(không)</option>${opts.map(x => `<option value="${x.id}" ${x.id === t.after ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
    ${t.done ? `<p class="mu">Việc đã hoàn thành: đổi hạn chót sẽ tính lại "đúng hạn / trễ hạn" theo ngày đã xong.</p>` : ""}
    <div class="row"><button class="btn pri" data-a="editSave" data-v="${t.id}">Lưu thay đổi</button><button class="btn" data-a="closeM">Huỷ</button></div></div>`;
  document.body.append(m); $("#en").focus();
}
const closeModal = () => $("#modal")?.remove();
/* Chạm vào ô ngày là mở bảng chọn lịch */
document.addEventListener("click", e => { if (e.target.type === "date") { try { e.target.showPicker(); } catch {} } });
/* Lưu nháp form giao việc ngay khi gõ/chọn */
document.addEventListener("input", e => { const d = e.target.dataset; if (d.f === "tf") tf[d.k] = e.target.value; });

/* ===== Xử lý change (data-f): chọn nhóm, thành viên, trưởng nhóm, điểm cuối ===== */
document.addEventListener("change", e => {
  const f = e.target.dataset.f, d = e.target.dataset; if (!f) return;
  if (f === "tf") tf[d.k] = e.target.value;
  if (f === "grp") { gid = e.target.value; draft = {}; render(); }
  if (f === "mem") mutate(s => { const g = s.groups.find(x => x.id === d.g); g.members = g.members.filter(m => m !== d.u); if (e.target.checked) g.members.push(d.u); else if (g.leader === d.u) g.leader = ""; });
  if (f === "lead") mutate(s => { s.groups.find(x => x.id === d.g).leader = e.target.value; }, "Đã chọn trưởng nhóm");
  if (f === "fin") { const raw = e.target.value.trim(), g = gid; mutate(s => { const F = (s.finals[g] ||= {}); if (raw === "") delete F[d.u]; else F[d.u] = Math.min(100, Math.max(0, +raw)); if (s.applied[g]) delete s.applied[g][d.u]; }, "Đã lưu điểm cuối"); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
  if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
  const k = e.target.dataset.k === "name" ? "addTask" : { lu: "login", lp: "login", nn: "addUser", nu: "addUser", np: "addUser", gn: "addGroup", en: "editSave", pw0: "pwSave", pw1: "pwSave", pw2: "pwSave" }[e.target.id];
  if (k) $(`[data-a=${k}]`)?.click();
});

const formDirty = () => [...document.querySelectorAll("#nn,#nu,#np,#gn")].some(i => i.value);

/* ===== Khởi động & tự đồng bộ mỗi 6 giây ===== */
(async function init() {
  render();
  try { S = await load(); } catch { setSt("off"); toast("Không kết nối được Firebase", "err"); S = seed(); }
  render();
  setInterval(async () => {
    if (!meId) return;
    const a = document.activeElement, typing = a && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
    try {
      const s = await load(); setSt("ok");
      if (JSON.stringify(s) !== JSON.stringify(S)) { S = s; if (!typing && tab !== "rate" && !(tab === "admin" && formDirty())) render(); }
    } catch { setSt("off"); }
  }, 6000);
})();