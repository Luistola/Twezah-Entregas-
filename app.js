/* ═══════════════════════════════════════════════════════════
   TWEZAH DELIVERY — app.js
   ─────────────────────────────────────────────────────────
   CONFIGURAÇÃO — Altere as variáveis abaixo antes de publicar
═══════════════════════════════════════════════════════════ */

const CONFIG = {
  // URL do Google Apps Script (publicado como Web App)
  SCRIPT_URL: "https://script.google.com/macros/s/SEU_SCRIPT_ID_AQUI/exec",

  // Número WhatsApp da TWEZAH (inclua código do país, sem +)
  WHATSAPP_NUM: "244900000000",

  // Credenciais de entregadores  { user: "senha" }
  ENTREGADORES: {
    "entregador1": "senha123",
    "entregador2": "senha456",
    "joao":        "twezah2024",
  },

  // Credenciais admin
  ADMINS: {
    "admin":   "twezah@admin",
    "gestor":  "gestao2024",
  },
};

/* ─── ESTADO GLOBAL ──────────────────────────────────────── */
let state = {
  perfil:         null,
  historico:      [],
  lastPedido:     null,
  geoCoords:      null,
  entregadorUser: null,
  adminUser:      null,
  adminTodos:     [],
  pendingPedido:  null,  // dados para whatsapp após envio
};

/* ═══════════════════════════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
  // Splash de 1.8 s
  setTimeout(() => {
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    init();
  }, 1800);
});

function init() {
  // Carregar dados do localStorage
  state.perfil    = loadLS("twezah_perfil");
  state.historico = loadLS("twezah_historico") || [];
  state.lastPedido = loadLS("twezah_last_pedido");

  // Data de hoje no campo do pedido
  document.getElementById("pedido-date").textContent = formatDate(new Date());

  // Mostrar UI correta
  if (state.perfil) {
    mostrarPerfilView();
    document.getElementById("section-pedido").style.display = "flex";
    document.getElementById("section-pedido").style.flexDirection = "column";
    document.getElementById("section-pedido").style.gap = "14px";
  }

  renderHistorico();
}

/* ═══════════════════════════════════════════════════════════
   NAVEGAÇÃO
═══════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");

  if (tab === "historico") renderHistorico();
  if (tab === "entregador" && state.entregadorUser) carregarPendentes();
  if (tab === "admin" && state.adminUser) carregarAdmin();
}

/* ═══════════════════════════════════════════════════════════
   PERFIL DO CLIENTE
═══════════════════════════════════════════════════════════ */
function savePerfil() {
  const nome     = v("p-nome").trim();
  const tel      = v("p-tel").trim();
  const municipio = v("p-municipio");
  const bairro   = v("p-bairro").trim();

  if (!nome || !tel || !municipio || !bairro) {
    toast("⚠️ Preencha Nome, Telefone, Município e Bairro.");
    return;
  }

  state.perfil = {
    nome, tel, municipio,
    bairro,
    rua:    v("p-rua").trim(),
    bloco:  v("p-bloco").trim(),
    casa:   v("p-casa").trim(),
    apto:   v("p-apto").trim(),
    ref:    v("p-ref").trim(),
    geo:    state.geoCoords || "",
  };

  saveLS("twezah_perfil", state.perfil);
  mostrarPerfilView();
  document.getElementById("section-pedido").style.display = "flex";
  document.getElementById("section-pedido").style.flexDirection = "column";
  document.getElementById("section-pedido").style.gap = "14px";
  toast("✅ Dados guardados com sucesso!");
}

function mostrarPerfilView() {
  const p = state.perfil;
  if (!p) return;

  // Preencher campos do formulário
  setV("p-nome", p.nome); setV("p-tel", p.tel); setV("p-municipio", p.municipio);
  setV("p-bairro", p.bairro); setV("p-rua", p.rua); setV("p-bloco", p.bloco);
  setV("p-casa", p.casa); setV("p-apto", p.apto); setV("p-ref", p.ref);

  // Montar view
  const fields = [
    ["Nome", p.nome], ["Telefone", p.tel], ["Município", p.municipio],
    ["Bairro", p.bairro], ["Rua", p.rua || "—"], ["Bloco", p.bloco || "—"],
    ["Casa/Prédio", p.casa || "—"], ["Apartamento", p.apto || "—"],
    ["Referência", p.ref || "—"],
  ];
  document.getElementById("perfil-display").innerHTML = fields.map(([l, v]) =>
    `<div class="perfil-item"><span class="perfil-lbl">${l}</span><span class="perfil-val">${v}</span></div>`
  ).join("");

  document.getElementById("perfil-view").classList.remove("hidden");
  document.getElementById("perfil-form").classList.add("hidden");
  document.getElementById("btn-edit-perfil").textContent = "Editar";
}

function toggleEditPerfil() {
  const form = document.getElementById("perfil-form");
  const view = document.getElementById("perfil-view");
  const btn  = document.getElementById("btn-edit-perfil");
  const editing = form.classList.contains("hidden");

  if (editing) {
    form.classList.remove("hidden"); view.classList.add("hidden"); btn.textContent = "Cancelar";
  } else {
    form.classList.add("hidden"); view.classList.remove("hidden"); btn.textContent = "Editar";
  }
}

/* ═══════════════════════════════════════════════════════════
   GEOLOCALIZAÇÃO
═══════════════════════════════════════════════════════════ */
function captureLocation() {
  const icon   = document.getElementById("geo-icon");
  const status = document.getElementById("geo-status");

  if (!navigator.geolocation) {
    status.textContent = "Geolocalização não suportada.";
    return;
  }
  icon.textContent = "⏳";
  status.textContent = "A obter localização…";

  navigator.geolocation.getCurrentPosition(
    pos => {
      state.geoCoords = `${pos.coords.latitude},${pos.coords.longitude}`;
      icon.textContent = "✅";
      status.textContent = `Localização capturada: ${state.geoCoords}`;
    },
    err => {
      icon.textContent = "📍";
      status.textContent = "Não foi possível obter localização.";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ═══════════════════════════════════════════════════════════
   COUNTER INPUTS
═══════════════════════════════════════════════════════════ */
function changeVal(id, delta) {
  const el  = document.getElementById(id);
  const cur = parseInt(el.value) || 0;
  el.value  = Math.max(0, cur + delta);

  // Se litros alterado, recalcular bidões sugeridos
  if (id === "litros") sugerirBidoes(parseInt(el.value));
}

function sugerirBidoes(total) {
  if (total <= 0) return;
  const b20 = Math.floor(total / 20);
  const rem = total % 20;
  const b10 = Math.floor(rem / 10);
  const b5  = Math.floor((rem % 10) / 5);
  document.getElementById("bidao20").value = b20;
  document.getElementById("bidao10").value = b10;
  document.getElementById("bidao5").value  = b5;
}

/* ═══════════════════════════════════════════════════════════
   ENVIAR PEDIDO
═══════════════════════════════════════════════════════════ */
function enviarPedido() {
  if (!state.perfil) { toast("⚠️ Guarde os seus dados primeiro."); return; }

  const litros  = parseInt(v("litros")) || 0;
  const b20     = parseInt(v("bidao20")) || 0;
  const b10     = parseInt(v("bidao10")) || 0;
  const b5      = parseInt(v("bidao5")) || 0;
  const pagam   = document.querySelector("input[name='pagamento']:checked")?.value || "";
  const obs     = v("obs").trim();

  if (litros === 0 && b20 === 0 && b10 === 0 && b5 === 0) {
    toast("⚠️ Indique a quantidade de água."); return;
  }
  if (!pagam) { toast("⚠️ Seleccione a forma de pagamento."); return; }

  const id   = gerarID();
  const data = new Date();

  const pedido = {
    id,
    dataPedido:  data.toISOString(),
    nome:        state.perfil.nome,
    tel:         state.perfil.tel,
    municipio:   state.perfil.municipio,
    bairro:      state.perfil.bairro,
    rua:         state.perfil.rua,
    bloco:       state.perfil.bloco,
    casa:        state.perfil.casa,
    apto:        state.perfil.apto,
    ref:         state.perfil.ref,
    geo:         state.perfil.geo || state.geoCoords || "",
    litros, b20, b10, b5,
    pagamento:   pagam,
    obs,
    status:      "Pendente",
    entregador:  "",
    horaEntrega: "",
  };

  // Guardar localmente
  state.historico.unshift(pedido);
  saveLS("twezah_historico", state.historico);
  state.lastPedido = { litros, b20, b10, b5 };
  saveLS("twezah_last_pedido", state.lastPedido);
  state.pendingPedido = pedido;

  // Enviar para Google Sheets
  enviarParaSheet(pedido);

  // Mostrar mensagem de sucesso
  document.getElementById("msg-sucesso").classList.remove("hidden");

  // Reset quantidades
  ["litros","bidao20","bidao10","bidao5"].forEach(id => document.getElementById(id).value = 0);
  document.querySelectorAll("input[name='pagamento']").forEach(r => r.checked = false);
  document.getElementById("obs").value = "";

  // Scroll para mensagem
  document.getElementById("msg-sucesso").scrollIntoView({ behavior: "smooth", block: "center" });
}

function enviarParaSheet(dados) {
  const url   = CONFIG.SCRIPT_URL;
  const body  = JSON.stringify({ action: "addPedido", data: dados });

  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  })
  .then(r => r.json())
  .then(res => {
    if (res.status === "ok") toast("☁️ Pedido sincronizado com sucesso.");
    else toast("⚠️ Pedido guardado localmente. Verifique a ligação.");
  })
  .catch(() => {
    toast("⚠️ Pedido guardado localmente. Será sincronizado mais tarde.");
  });
}

/* ═══════════════════════════════════════════════════════════
   REPETIR ÚLTIMO PEDIDO
═══════════════════════════════════════════════════════════ */
function repetirUltimo() {
  if (!state.lastPedido) { toast("Ainda não tem pedidos anteriores."); return; }
  const lp = state.lastPedido;
  document.getElementById("litros").value  = lp.litros || 0;
  document.getElementById("bidao20").value = lp.b20    || 0;
  document.getElementById("bidao10").value = lp.b10    || 0;
  document.getElementById("bidao5").value  = lp.b5     || 0;
  toast("🔁 Quantidades do último pedido preenchidas.");
}

/* ═══════════════════════════════════════════════════════════
   WHATSAPP
═══════════════════════════════════════════════════════════ */
function abrirWhatsApp() {
  const p = state.pendingPedido;
  if (!p) return;

  const msg = encodeURIComponent(
    `Olá TWEZAH. Acabei de fazer um pedido.\n\n` +
    `🆔 ID: ${p.id}\n` +
    `👤 Nome: ${p.nome}\n` +
    `📞 Telefone: ${p.tel}\n` +
    `📍 Endereço: ${[p.bairro, p.rua, p.bloco, p.casa, p.apto].filter(Boolean).join(", ")}\n` +
    `💧 Quantidade: ${p.litros} litros\n` +
    `   Bidões 20L: ${p.b20} | 10L: ${p.b10} | 5L: ${p.b5}\n` +
    `💳 Pagamento: ${p.pagamento}\n\n` +
    `Obrigado! 🙏`
  );

  const url = `https://wa.me/${CONFIG.WHATSAPP_NUM}?text=${msg}`;
  window.open(url, "_blank");
}

/* ═══════════════════════════════════════════════════════════
   HISTÓRICO
═══════════════════════════════════════════════════════════ */
function renderHistorico() {
  const el   = document.getElementById("historico-list");
  const hist = state.historico;

  if (!hist || hist.length === 0) {
    el.innerHTML = `<p class="empty-state">Ainda não tem pedidos registados.</p>`;
    return;
  }

  el.innerHTML = hist.slice(0, 30).map(p => `
    <div class="historico-card">
      <div class="historico-card-top">
        <span class="historico-id">#${p.id}</span>
        <span class="status-badge status-${p.status}">${p.status}</span>
        <span class="historico-data">${formatDate(new Date(p.dataPedido))}</span>
      </div>
      <div class="historico-qty">💧 ${p.litros}L — Bidões: ${p.b20}×20L ${p.b10}×10L ${p.b5}×5L</div>
      <div class="historico-pay">💳 ${p.pagamento}${p.entregador ? ` · 🚚 ${p.entregador}` : ""}</div>
      ${p.obs ? `<div style="font-size:.8rem;color:var(--text-muted)">${p.obs}</div>` : ""}
    </div>
  `).join("");
}

/* ═══════════════════════════════════════════════════════════
   LOGIN ENTREGADOR
═══════════════════════════════════════════════════════════ */
function loginEntregador() {
  const user = v("e-user").trim().toLowerCase();
  const pass = v("e-pass");
  const err  = document.getElementById("login-err");

  if (CONFIG.ENTREGADORES[user] && CONFIG.ENTREGADORES[user] === pass) {
    state.entregadorUser = user;
    document.getElementById("login-entregador").classList.add("hidden");
    document.getElementById("painel-entregador").classList.remove("hidden");
    document.getElementById("topbar-user").textContent = `🚚 ${user}`;
    document.getElementById("btn-logout").classList.remove("hidden");
    err.classList.add("hidden");
    carregarPendentes();
  } else {
    err.classList.remove("hidden");
  }
}

function carregarPendentes() {
  const el = document.getElementById("pedidos-pendentes");
  el.innerHTML = `<p class="empty-state">A carregar…</p>`;

  fetch(`${CONFIG.SCRIPT_URL}?action=getPendentes`)
    .then(r => r.json())
    .then(data => {
      if (!data.pedidos || data.pedidos.length === 0) {
        el.innerHTML = `<p class="empty-state">Sem pedidos pendentes. ✅</p>`;
        return;
      }
      el.innerHTML = data.pedidos.map(p => `
        <div class="pedido-card">
          <div class="pedido-card-header">
            <span>#${p.id}</span>
            <span>${formatDate(new Date(p.dataPedido))}</span>
          </div>
          <div class="pedido-card-body">
            <p class="pedido-info"><strong>👤</strong> ${p.nome}</p>
            <p class="pedido-info"><strong>📞</strong> <a href="tel:${p.tel}">${p.tel}</a></p>
            <p class="pedido-info"><strong>📍</strong> ${[p.bairro, p.rua, p.bloco, p.casa, p.apto].filter(Boolean).join(", ")}</p>
            <p class="pedido-info"><strong>🏠</strong> Ref: ${p.ref || "—"}</p>
            <p class="pedido-info"><strong>💧</strong> ${p.litros}L (20L×${p.b20} | 10L×${p.b10} | 5L×${p.b5})</p>
            <p class="pedido-info"><strong>💳</strong> ${p.pagamento}</p>
            ${p.obs ? `<p class="pedido-info"><strong>📝</strong> ${p.obs}</p>` : ""}
            ${p.geo ? `<p class="pedido-info"><strong>🗺️</strong> <a href="https://maps.google.com/?q=${p.geo}" target="_blank">Ver no mapa</a></p>` : ""}
            <button class="btn-entregar" onclick="confirmarEntrega('${p.id}', this)">
              ✅ ENTREGAR
            </button>
          </div>
        </div>
      `).join("");
    })
    .catch(() => {
      el.innerHTML = `<p class="empty-state">⚠️ Erro ao carregar pedidos. Verifique a ligação.</p>`;
    });
}

function confirmarEntrega(id, btn) {
  if (!confirm(`Confirmar entrega do pedido #${id}?`)) return;
  btn.disabled = true;
  btn.textContent = "A confirmar…";

  const horaEntrega = new Date().toISOString();

  fetch(CONFIG.SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "confirmarEntrega",
      data: { id, entregador: state.entregadorUser, horaEntrega },
    }),
  })
  .then(r => r.json())
  .then(res => {
    if (res.status === "ok") {
      btn.closest(".pedido-card").style.opacity = ".4";
      btn.textContent = "✅ Entregue";
      toast("Pedido #" + id + " marcado como entregue!");
      setTimeout(() => carregarPendentes(), 1500);
    } else {
      btn.disabled = false; btn.textContent = "✅ ENTREGAR";
      toast("⚠️ Erro ao confirmar. Tente novamente.");
    }
  })
  .catch(() => {
    btn.disabled = false; btn.textContent = "✅ ENTREGAR";
    toast("⚠️ Sem ligação. Tente novamente.");
  });
}

/* ═══════════════════════════════════════════════════════════
   ADMIN
═══════════════════════════════════════════════════════════ */
function loginAdmin() {
  const user = v("a-user").trim().toLowerCase();
  const pass = v("a-pass");
  const err  = document.getElementById("admin-login-err");

  if (CONFIG.ADMINS[user] && CONFIG.ADMINS[user] === pass) {
    state.adminUser = user;
    document.getElementById("login-admin").classList.add("hidden");
    document.getElementById("painel-admin").classList.remove("hidden");
    document.getElementById("topbar-user").textContent = `📊 ${user}`;
    document.getElementById("btn-logout").classList.remove("hidden");
    err.classList.add("hidden");
    carregarAdmin();
  } else {
    err.classList.remove("hidden");
  }
}

function carregarAdmin() {
  fetch(`${CONFIG.SCRIPT_URL}?action=getTodos`)
    .then(r => r.json())
    .then(data => {
      state.adminTodos = data.pedidos || [];
      filtrarAdmin();
    })
    .catch(() => toast("⚠️ Erro ao carregar dados."));
}

function filtrarAdmin() {
  const todos     = state.adminTodos;
  const fData     = v("f-data");
  const fBairro   = v("f-bairro").trim().toLowerCase();
  const fEntregad = v("f-entregador").trim().toLowerCase();
  const fPagam    = v("f-pagamento");
  const hoje      = new Date().toISOString().slice(0,10);

  let filtrados = todos.filter(p => {
    const dataP = (p.dataPedido || "").slice(0,10);
    if (fData     && dataP !== fData)                          return false;
    if (fBairro   && !(p.bairro||"").toLowerCase().includes(fBairro)) return false;
    if (fEntregad && !(p.entregador||"").toLowerCase().includes(fEntregad)) return false;
    if (fPagam    && p.pagamento !== fPagam)                   return false;
    return true;
  });

  // KPIs — sempre baseados em HOJE
  const pedidosHoje = todos.filter(p => (p.dataPedido || "").slice(0,10) === hoje);
  set("kpi-total",    pedidosHoje.length);
  set("kpi-litros",   pedidosHoje.reduce((a,p) => a + (parseInt(p.litros)||0), 0) + "L");
  set("kpi-pendentes",  pedidosHoje.filter(p => p.status === "Pendente").length);
  set("kpi-entregues",  pedidosHoje.filter(p => p.status === "Entregue").length);
  set("kpi-cancelados", pedidosHoje.filter(p => p.status === "Cancelado").length);

  // Tabela
  const wrap = document.getElementById("admin-table-wrap");
  if (filtrados.length === 0) {
    wrap.innerHTML = `<p class="empty-state">Sem resultados.</p>`; return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Data</th><th>Cliente</th><th>Bairro</th>
        <th>Litros</th><th>Pagamento</th><th>Status</th><th>Entregador</th>
      </tr></thead>
      <tbody>
        ${filtrados.map(p => `
          <tr>
            <td>#${p.id}</td>
            <td>${formatDate(new Date(p.dataPedido))}</td>
            <td>${p.nome}<br><small>${p.tel}</small></td>
            <td>${p.bairro}</td>
            <td>${p.litros}L</td>
            <td>${p.pagamento}</td>
            <td><span class="status-badge status-${p.status}">${p.status}</span></td>
            <td>${p.entregador || "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ═══════════════════════════════════════════════════════════
   LOGOUT
═══════════════════════════════════════════════════════════ */
function logout() {
  state.entregadorUser = null;
  state.adminUser      = null;
  document.getElementById("topbar-user").textContent = "";
  document.getElementById("btn-logout").classList.add("hidden");

  // Reset paineis
  document.getElementById("login-entregador").classList.remove("hidden");
  document.getElementById("painel-entregador").classList.add("hidden");
  document.getElementById("login-admin").classList.remove("hidden");
  document.getElementById("painel-admin").classList.add("hidden");

  ["e-user","e-pass","a-user","a-pass"].forEach(id => document.getElementById(id).value = "");
  switchTab("pedido");
  toast("Sessão terminada.");
}

/* ═══════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════ */
function v(id)      { return document.getElementById(id)?.value ?? ""; }
function setV(id,val){ const el = document.getElementById(id); if(el) el.value = val || ""; }
function set(id,val) { const el = document.getElementById(id); if(el) el.textContent = val; }

function saveLS(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}
function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
}

function gerarID() {
  const now   = new Date();
  const ymd   = now.toISOString().slice(0,10).replace(/-/g,"");
  const rnd   = Math.floor(Math.random() * 9000 + 1000);
  return `TW${ymd}${rnd}`;
}

function formatDate(d) {
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-PT", { day:"2-digit", month:"2-digit", year:"numeric" }) +
         " " + d.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
