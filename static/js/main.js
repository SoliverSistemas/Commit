const appData = window.__APP_DATA__;
const productsById = new Map(appData.produtos.map((p) => [p.id, p]));
const storageKey = `commit_cart_${appData.pizzaria.slug}`;

// Define CSS variables dinamicamente baseado nos dados da pizzaria
function setDynamicColors() {
    const p = appData.pizzaria;
    const root = document.documentElement;
    root.style.setProperty('--bg-main', p.cor_fundo_principal || '#0b0f1a');
    root.style.setProperty('--bg-secondary', p.cor_fundo_secundario || '#111827');
    root.style.setProperty('--title-color', p.cor_titulos || '#f9fafb');
    root.style.setProperty('--text-color', p.cor_texto || '#e5e7eb');
    root.style.setProperty('--text-soft', p.cor_texto_secundario || '#94a3b8');
    root.style.setProperty('--surface-1', p.cor_surface || '#ffffff');
    root.style.setProperty('--stroke', 'rgba(148,163,184,0.2)');
    root.style.setProperty('--btn-primary-bg', p.botao_primario_bg || '#ef4444');
    root.style.setProperty('--btn-primary-color', p.botao_primario_texto || '#ffffff');
    root.style.setProperty('--btn-primary-hover', p.botao_primario_hover || '#dc2626');
    root.style.setProperty('--btn-secondary-bg', p.botao_secundario_bg || '#1f2937');
    root.style.setProperty('--btn-secondary-color', p.botao_secundario_texto || '#ffffff');
    root.style.setProperty('--btn-secondary-hover', p.botao_secundario_hover || '#111827');
    root.style.setProperty('--btn-highlight-bg', p.botao_destaque_bg || '#f59e0b');
    root.style.setProperty('--btn-highlight-color', p.botao_destaque_texto || '#111827');
    root.style.setProperty('--btn-highlight-hover', p.botao_destaque_hover || '#d97706');
    root.style.setProperty('--btn-neutral-bg', p.botao_neutro_bg || '#e5e7eb');
    root.style.setProperty('--btn-neutral-color', p.botao_neutro_texto || '#111827');
    root.style.setProperty('--btn-neutral-hover', p.botao_neutro_hover || '#cbd5e1');
}
setDynamicColors();

appData.pizzaria.cupons = appData.pizzaria.cupons || [];
// Só mantém cupons visíveis (não ocultos)
appData.pizzaria.cupons = appData.pizzaria.cupons.filter(c => !c.oculto);
console.log('Cupons carregados:', appData.pizzaria.cupons);

// Renderizar cupons na página
function renderCuponsDisplay() {
    const cuponsDisplay = document.getElementById('cuponsDisplay');
    if (!cuponsDisplay) return;

    const cupons = appData.pizzaria.cupons || [];
    if (cupons.length === 0) {
        cuponsDisplay.innerHTML = '';
        return;
    }

    const cuponsHtml = cupons.map(c => {
        const valorDisplay = c.tipo === 'percent' ? `${c.valor}% OFF` : `R$ ${Number(c.valor).toFixed(2)} OFF`;
        return `<span class="cupom-tag">${c.codigo} - ${valorDisplay}</span>`;
    }).join('');

    cuponsDisplay.innerHTML = `
        <div class="cupons-section">
            <strong>Cupons disponíveis:</strong>
            <div class="cupons-list">${cuponsHtml}</div>
        </div>
    `;
}

// Chamar renderização de cupons
document.addEventListener('DOMContentLoaded', renderCuponsDisplay);
renderCuponsDisplay();

// Chave para rastrear cliques nos produtos (para sugerir pedidos)
const productClicksKey = `commit_product_clicks_${appData.pizzaria.slug}`;

let cart = JSON.parse(localStorage.getItem(storageKey) || "[]");
let currentProduct = null;
let currentSelection = {};
let currentObs = "";
let currentStepIndex = 0;
let lastSelectionByProduct = {};
let deliveryResult = null;
const customerStorageKey = `commit_customer_${appData.pizzaria.slug}`;
let deliveryDebounce = null;
let isCalculatingDelivery = false;
let isLookingUpCep = false;
let cepLookupDebounce = null;
let addressWasAutofilled = false;

// Histórico de pedidos (localStorage) para "Sugerir Pedido" e "Repetir Pedido"
const orderHistoryKey = `commit_order_history_${appData.pizzaria.slug}`;

function safeParseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

// Funções para rastrear cliques nos produtos
function loadProductClicks() {
    const raw = localStorage.getItem(productClicksKey);
    const fallback = {};
    if (!raw) return fallback;
    const parsed = safeParseJson(raw, fallback);
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed;
}

function persistProductClicks(clicks) {
    localStorage.setItem(productClicksKey, JSON.stringify(clicks));
}

function trackProductClick(productId) {
    const clicks = loadProductClicks();
    const now = Date.now();
    if (!clicks[productId]) {
        clicks[productId] = { count: 0, lastClick: 0 };
    }
    clicks[productId].count += 1;
    clicks[productId].lastClick = now;
    persistProductClicks(clicks);
}

function getMostClickedProducts(limit = 5) {
    const clicks = loadProductClicks();
    const products = Object.entries(clicks)
        .map(([productId, data]) => ({
            productId,
            count: data.count,
            lastClick: data.lastClick,
            product: productsById.get(productId)
        }))
        .filter(p => p.product)
        .sort((a, b) => b.count - a.count || b.lastClick - a.lastClick);
    return products.slice(0, limit);
}

function suggestOrderFromClicks() {
    const mostClicked = getMostClickedProducts(3);
    if (mostClicked.length === 0) return null;

    // Sugere o produto mais clicado
    const topProduct = mostClicked[0];
    const product = topProduct.product;

    // Cria um template de item baseado no produto mais clicado
    const itemsTemplate = [{
        productId: product.id,
        nome: product.nome,
        quantidade: 1,
        selection: {},
        observacoes: "",
        total: Number(product.preco_base || 0)
    }];

    return {
        signature: `click_${product.id}`,
        itemsTemplate,
        productName: product.nome,
        clickCount: topProduct.count
    };
}

function buildCartSignature(cartItems) {
    // Assinatura estável por item/seleções/observacoes/quantidade.
    // Usamos apenas ids das opções para manter consistente.
    const normalized = (cartItems || [])
        .map((item) => {
            const selection = item.selection || {};
            const secaoIds = Object.keys(selection).sort();
            const normalizedSelection = secaoIds.map((secaoId) => {
                const picked = (selection[secaoId] || [])
                    .map((opt) => String(opt.id || opt))
                    .sort();
                return { secaoId: String(secaoId), picked };
            });
            return {
                productId: String(item.productId || item.id || ""),
                quantity: Number(item.quantidade || 1),
                observacoes: String(item.observacoes || "").trim(),
                selection: normalizedSelection
            };
        })
        .sort((a, b) => {
            if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
            return a.quantity - b.quantity;
        });
    return JSON.stringify(normalized);
}

function normalizeItemsTemplateFromCart(cartItems) {
    // Removemos `id` e atributos transitórios para re-quantizar depois.
    return (cartItems || []).map((item) => ({
        productId: item.productId,
        nome: item.nome,
        quantidade: Number(item.quantidade || 1),
        selection: deepClone(item.selection || {}),
        observacoes: item.observacoes || "",
        total: Number(item.total || 0)
    }));
}

function loadOrderHistory() {
    const raw = localStorage.getItem(orderHistoryKey);
    const fallback = { lastSignature: null, stats: {} };
    if (!raw) return fallback;
    const parsed = safeParseJson(raw, fallback);
    if (!parsed || typeof parsed !== "object") return fallback;
    if (!parsed.stats) parsed.stats = {};
    return parsed;
}

function persistOrderHistory(history) {
    localStorage.setItem(orderHistoryKey, JSON.stringify(history));
}

function restoreCartFromItemsTemplate(itemsTemplate) {
    cart = (itemsTemplate || []).map((item) => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        nome: item.nome,
        quantidade: Number(item.quantidade || 1),
        selection: deepClone(item.selection || {}),
        observacoes: item.observacoes || "",
        total: Number(item.total || 0)
    }));
    persistCart();
    deliveryResult = null;
    const hint = document.getElementById("freteHint");
    if (hint) hint.textContent = "Informe CEP e endereco para calcular o frete automaticamente.";
    renderCart();
}

function suggestBestOrderFromHistory() {
    // Primeiro tenta sugerir baseado no histórico de pedidos completados
    const history = loadOrderHistory();
    const entries = Object.entries(history.stats || {});

    let bestFromHistory = null;
    if (entries.length > 0) {
        for (const [signature, stat] of entries) {
            const count = Number(stat.count || 0);
            const totalSum = Number(stat.totalSum || 0);
            const bestTotal = Number(stat.bestTotal || 0);
            if (!count || !stat.itemsTemplate) continue;

            const avg = totalSum / count;
            const score = count * (avg || bestTotal || 0);

            if (!bestFromHistory || score > bestFromHistory.score || (score === bestFromHistory.score && stat.lastAt > bestFromHistory.lastAt)) {
                bestFromHistory = { signature, itemsTemplate: stat.itemsTemplate, score, lastAt: Number(stat.lastAt || 0), source: 'history' };
            }
        }
    }

    // Tenta sugerir baseado nos cliques nos produtos
    const bestFromClicks = suggestOrderFromClicks();

    // Se tem histórico de pedidos, usa ele; senão usa cliques
    if (bestFromHistory) {
        return bestFromHistory;
    }

    if (bestFromClicks) {
        return {
            signature: bestFromClicks.signature,
            itemsTemplate: bestFromClicks.itemsTemplate,
            score: bestFromClicks.clickCount,
            lastAt: Date.now(),
            source: 'clicks',
            productName: bestFromClicks.productName
        };
    }

    return null;
}

function repeatLastOrderFromHistory() {
    const history = loadOrderHistory();
    const sig = history.lastSignature;
    if (!sig || !history.stats || !history.stats[sig] || !history.stats[sig].itemsTemplate) return null;
    return history.stats[sig].itemsTemplate;
}

function formatCurrency(value) {
    return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function persistCart() {
    localStorage.setItem(storageKey, JSON.stringify(cart));
}

function persistCustomerData() {
    const payload = {
        name: document.getElementById("customerName")?.value || "",
        phone: document.getElementById("customerPhone")?.value || "",
        cep: document.getElementById("customerCep")?.value || "",
        address: document.getElementById("customerAddress")?.value || "",
        complement: document.getElementById("customerComplement")?.value || "",
        payment: document.getElementById("customerPayment")?.value || "PIX",
        obs: document.getElementById("customerObs")?.value || ""
    };
    localStorage.setItem(customerStorageKey, JSON.stringify(payload));
}

function restoreCustomerData() {
    const raw = localStorage.getItem(customerStorageKey);
    if (!raw) return;
    try {
        const payload = JSON.parse(raw);
        const setIfEmpty = (id, value) => {
            const el = document.getElementById(id);
            if (!el || value === undefined) return;
            const existing = String(el.value || "");
            if (!existing.trim()) el.value = value;
        };

        // Se o navegador já autofillou visualmente, não sobrepomos para não causar mismatch.
        setIfEmpty("customerName", payload.name);
        setIfEmpty("customerPhone", payload.phone);
        setIfEmpty("customerCep", payload.cep);
        setIfEmpty("customerComplement", payload.complement);
        setIfEmpty("customerPayment", payload.payment);
        setIfEmpty("customerObs", payload.obs);
        setIfEmpty("customerAddress", payload.address);

        // Se já existe endereço, assumimos que foi preenchido "de verdade".
        const addrEl = document.getElementById("customerAddress");
        if (addrEl && String(addrEl.value || "").trim()) {
            addressWasAutofilled = true;
        }
    } catch (_) { }
}

function normalizeCep(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
}

async function lookupCustomerCep() {
    if (isLookingUpCep) return;
    const cepInput = document.getElementById("customerCep");
    const hint = document.getElementById("freteHint");
    const cepDigits = normalizeCep(cepInput.value);
    if (cepDigits.length !== 8) return;

    isLookingUpCep = true;
    hint.textContent = "Buscando CEP...";
    try {
        const response = await fetch(`/api/cep/${cepDigits}`);
        const payload = await response.json();
        if (!response.ok || payload.status === "erro") {
            hint.textContent = "CEP nao encontrado.";
            return;
        }
        const cepData = payload.cep || {};
        const parts = [cepData.logradouro, cepData.bairro, cepData.cidade, cepData.estado].filter(Boolean);
        const suggestion = parts.join(", ");
        if (suggestion) {
            const addressEl = document.getElementById("customerAddress");
            if (!addressEl.value.trim() || addressWasAutofilled) {
                addressEl.value = suggestion;
                addressWasAutofilled = true;
            }
            hint.textContent = `CEP localizado: ${cepData.cidade || ""}/${cepData.estado || ""}`;
            persistCustomerData();
            scheduleDeliveryCalculation();
        } else {
            hint.textContent = "CEP localizado, informe numero/complemento no endereco.";
        }
    } catch (_) {
        hint.textContent = "Erro ao consultar CEP.";
    } finally {
        isLookingUpCep = false;
    }
}

function getSelectionTotal(product, selection) {
    let total = Number(product.preco_base || 0);
    (product.secoes || []).forEach((secao) => {
        const picked = selection[secao.id] || [];
        picked.forEach((item) => {
            total += Number(item.preco_adicional || 0);
        });
    });
    return total;
}

function openProductModal(productId) {
    const product = productsById.get(productId);
    if (!product) return;

    // Rastrear clique no produto
    trackProductClick(productId);

    currentProduct = product;
    currentSelection = {};
    currentObs = "";
    currentStepIndex = 0;

    const repeatButton = document.getElementById("repeatButton");
    repeatButton.style.display = lastSelectionByProduct[productId] ? "inline-block" : "none";

    renderWizardStep();
    document.getElementById("productModal").classList.remove("hidden");
}

function renderWizardStep() {
    if (!currentProduct) return;
    const body = document.getElementById("productModalBody");
    const sections = currentProduct.secoes || [];
    body.innerHTML = `
        <div class="wizard-header">
            <h2>${currentProduct.nome}</h2>
            <p class="wizard-subtitle">${currentProduct.descricao || ""}</p>
            <p class="wizard-base"><strong>Base: ${formatCurrency(currentProduct.preco_base)}</strong></p>
        </div>
    `;

    if (!sections.length) {
        const obs = document.createElement("textarea");
        obs.placeholder = "Observacoes deste item";
        obs.value = currentObs;
        obs.addEventListener("input", (event) => (currentObs = event.target.value || ""));
        body.appendChild(obs);
        document.getElementById("wizardPrimaryButton").textContent = "Confirmar";
        return;
    }

    const secao = sections[currentStepIndex];
    const group = document.createElement("div");
    group.className = "option-group";

    const stepNumber = currentStepIndex + 1;
    const totalSteps = sections.length;
    const percent = totalSteps ? Math.round((stepNumber / totalSteps) * 100) : 100;
    const dots = Array.from({ length: totalSteps }, (_, idx) => `<span class="wizard-dot ${idx < stepNumber ? "active" : ""}"></span>`).join("");

    group.innerHTML = `
        <div class="wizard-step-head">
            <h4>Etapa ${stepNumber} de ${totalSteps}: ${secao.nome} ${secao.obrigatorio ? "(obrigatorio)" : ""}</h4>
            <div class="wizard-progress-track" aria-hidden="true">
                <div class="wizard-progress-fill" style="width:${percent}%"></div>
            </div>
            <div class="wizard-progress-dots">${dots}</div>
        </div>
    `;
    (secao.opcoes || []).forEach((opcao) => {
        const row = document.createElement("label");
        row.className = "option-row";
        const type = secao.tipo === "multiple" ? "checkbox" : "radio";
        const name = `secao_${secao.id}`;
        const selected = (currentSelection[secao.id] || []).some((item) => item.id === opcao.id);
        row.innerHTML = `
            <span class="option-main">
                <span class="option-name">${opcao.nome}</span>
                <span class="option-price">${formatCurrency(opcao.preco_adicional)}</span>
            </span>
            <input ${selected ? "checked" : ""} class="option-input" type="${type}" name="${name}" value="${opcao.id}">
            <span class="option-check" aria-hidden="true">${selected ? "✓" : ""}</span>
        `;
        const input = row.querySelector("input");
        if (selected) row.classList.add("selected");
        input.addEventListener("change", () => {
            const selectedValues = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) =>
                secao.opcoes.find((item) => item.id === el.value)
            );
            currentSelection[secao.id] = selectedValues;

            // Atualiza aparência de checkmark.
            Array.from(document.querySelectorAll(`input[name="${name}"]`)).forEach((el) => {
                const parent = el.closest(".option-row");
                if (!parent) return;
                parent.classList.toggle("selected", !!el.checked);
                const checkEl = parent.querySelector(".option-check");
                if (checkEl) checkEl.textContent = el.checked ? "✓" : "";
            });
        });
        group.appendChild(row);
    });
    body.appendChild(group);

    const obs = document.createElement("textarea");
    obs.placeholder = "Observacoes deste item";
    obs.value = currentObs;
    obs.addEventListener("input", (event) => (currentObs = event.target.value || ""));
    body.appendChild(obs);

    const partialTotal = getSelectionTotal(currentProduct, currentSelection);
    const summary = document.createElement("div");
    summary.className = "option-group";
    summary.innerHTML = `<h4>Resumo parcial</h4><p>Subtotal do item: <strong>${formatCurrency(partialTotal)}</strong></p>`;
    body.appendChild(summary);

    const primaryButton = document.getElementById("wizardPrimaryButton");
    primaryButton.textContent = currentStepIndex === sections.length - 1 ? "Confirmar" : "Proxima Etapa";
}

function closeProductModal() {
    document.getElementById("productModal").classList.add("hidden");
    currentProduct = null;
    currentSelection = {};
    currentObs = "";
}

function handleWizardPrimary() {
    if (!currentProduct) return;
    const sections = currentProduct.secoes || [];
    if (!sections.length) return addConfiguredItem();

    const secao = sections[currentStepIndex];
    const selected = currentSelection[secao.id] || [];
    const min = Number(secao.min_selecao || (secao.obrigatorio ? 1 : 0));
    const max = Number(secao.max_selecao || (secao.tipo === "multiple" ? 99 : 1));

    if (secao.obrigatorio && selected.length < min) {
        showAlert(`Selecione ao menos ${min} opcao(oes) em ${secao.nome}`, 'warning', 'Validação');
        return;
    }
    if (selected.length > max) {
        showAlert(`Selecione no maximo ${max} opcao(oes) em ${secao.nome}`, 'warning', 'Validação');
        return;
    }
    if (currentStepIndex < sections.length - 1) {
        currentStepIndex += 1;
        renderWizardStep();
        return;
    }
    addConfiguredItem();
}

function validateSelection(product, selection) {
    for (const secao of product.secoes || []) {
        const selected = selection[secao.id] || [];
        if (secao.obrigatorio && selected.length < Number(secao.min_selecao || 1)) {
            return `Selecione ${secao.nome}`;
        }
        if (selected.length > Number(secao.max_selecao || 1)) {
            return `Limite excedido em ${secao.nome}`;
        }
    }
    return null;
}

function addConfiguredItem() {
    if (!currentProduct) return;
    const error = validateSelection(currentProduct, currentSelection);
    if (error) {
        showAlert(error, 'error', 'Erro');
        return;
    }
    const total = getSelectionTotal(currentProduct, currentSelection);
    const item = {
        id: crypto.randomUUID(),
        productId: currentProduct.id,
        nome: currentProduct.nome,
        quantidade: 1,
        selection: JSON.parse(JSON.stringify(currentSelection)),
        observacoes: currentObs,
        total
    };
    cart.push(item);
    lastSelectionByProduct[currentProduct.id] = {
        selection: JSON.parse(JSON.stringify(currentSelection)),
        observacoes: currentObs
    };
    persistCart();
    renderCart();
    closeProductModal();
}

function repeatLastConfig() {
    if (!currentProduct) return;
    const productId = currentProduct.id;
    const saved = lastSelectionByProduct[currentProduct.id];
    if (!saved) return;
    currentSelection = JSON.parse(JSON.stringify(saved.selection));
    currentObs = saved.observacoes || "";
    currentStepIndex = 0;
    addConfiguredItem();
    openProductModal(productId);
}

function removeCartItem(id) {
    cart = cart.filter((item) => item.id !== id);
    persistCart();
    renderCart();
}

function increaseItemQty(id) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    item.quantidade = Number(item.quantidade || 1) + 1;
    persistCart();
    renderCart();
}

function decreaseItemQty(id) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    const next = Number(item.quantidade || 1) - 1;
    if (next <= 0) {
        removeCartItem(id);
        return;
    }
    item.quantidade = next;
    persistCart();
    renderCart();
}

async function calculateDeliveryByAddress() {
    if (isCalculatingDelivery) return;
    const cep = (document.getElementById("customerCep").value || "").trim();
    if (!cep) {
        showAlert('Informe o CEP para calcular frete', 'warning', 'Atenção');
        return;
    }
    isCalculatingDelivery = true;
    const hint = document.getElementById("freteHint");
    hint.textContent = "Calculando frete...";
    try {
        const response = await fetch(`/api/frete/calcular/${appData.pizzaria.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cep })
        });
        const data = await response.json();
        if (!response.ok || data.status === "erro") {
            deliveryResult = null;
            if (response.status === 422) {
                hint.textContent = "Fora da área de entrega. Verifique se o CEP está correto ou entre em contato com a pizzaria.";
            } else {
                hint.textContent = data.erro || "Nao foi possivel calcular frete para este CEP.";
            }
            renderCart();
            return;
        }
        deliveryResult = { frete: Number(data.frete || 0), distanciaKm: Number(data.distancia_km || 0) };
        hint.textContent = `Frete calculado: ${formatCurrency(deliveryResult.frete)} | Distancia aprox.: ${deliveryResult.distanciaKm.toFixed(2)} km`;
        renderCart();
    } catch (_) {
        deliveryResult = null;
        hint.textContent = "Erro de conexao ao calcular frete. Tente novamente.";
        renderCart();
    } finally {
        isCalculatingDelivery = false;
    }
}

function scheduleDeliveryCalculation() {
    clearTimeout(deliveryDebounce);
    deliveryDebounce = setTimeout(() => {
        const cep = (document.getElementById("customerCep").value || "").trim();
        if (cep && cep.length >= 8) calculateDeliveryByAddress();
    }, 1000);
}

function renderCart() {
    const floating = document.getElementById("floatingCart");
    const count = cart.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
    const subtotal = cart.reduce((sum, item) => sum + Number(item.total || 0) * Number(item.quantidade || 1), 0);

    // Update floating cart
    if (floating) {
        document.getElementById("floatingCount").textContent = `${count} items`;
        document.getElementById("floatingTotal").textContent = formatCurrency(subtotal);
        floating.classList.toggle("hidden", count === 0);
    }

    // Update desktop sidebar
    const sidebarCount = document.getElementById("cartItemCount");
    const sidebarSubtotal = document.getElementById("cartSubtotal");
    const sidebarTotal = document.getElementById("cartTotal");
    if (sidebarCount) sidebarCount.textContent = `${count} items`;
    if (sidebarSubtotal) sidebarSubtotal.textContent = formatCurrency(subtotal);

    // Calculate total with or without delivery
    const discount = calculateDiscount(subtotal);
    const frete = deliveryResult ? deliveryResult.frete : 0;
    const finalTotal = Math.max(0, subtotal + frete - discount);

    if (sidebarTotal) sidebarTotal.textContent = formatCurrency(finalTotal);

    // Update Sidebar Cart (desktop) - com controles de quantidade
    const sidebarItems = document.getElementById("cartItems");
    if (sidebarItems) {
        if (cart.length === 0) {
            sidebarItems.innerHTML = '<div class="cart-empty">Carrinho vazio</div>';
        } else {
            sidebarItems.innerHTML = cart.map((item) => {
                const product = productsById.get(item.productId) || null;
                const img = product && product.imagem_url ? product.imagem_url : "";
                const qty = Number(item.quantidade || 1);

                return `
                    <div class="cart-item" data-id="${item.id}">
                        <div class="cart-item-image">
                            ${img ? `<img src="${img}" alt="${item.nome}">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--surface-2);font-size:1.5rem;">🍕</div>'}
                        </div>
                        <div class="cart-item-details" style="flex:1;min-width:0;">
                            <div class="cart-item-name">${item.nome}</div>
                            <div class="cart-item-price">${formatCurrency(item.total)} cada</div>
                            <div class="cart-item-controls">
                                <button class="cart-item-qty-btn" onclick="decreaseItemQty('${item.id}')">−</button>
                                <span class="cart-item-qty-display">${qty}</span>
                                <button class="cart-item-qty-btn" onclick="increaseItemQty('${item.id}')">+</button>
                                <button class="cart-item-remove" onclick="removeCartItem('${item.id}')">🗑️</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (sidebarCount) sidebarCount.textContent = `${count} items`;
        if (sidebarSubtotal) sidebarSubtotal.textContent = formatCurrency(subtotal);
        if (sidebarTotal) sidebarTotal.textContent = formatCurrency(finalTotal);
    }

    // Update Drawer Cart (mobile)
    const drawerItems = document.getElementById("cartDrawerItems");
    if (drawerItems) {
        drawerItems.innerHTML = "";
        cart.forEach((item) => {
            const div = document.createElement("div");
            div.className = "cart-item";

            const product = productsById.get(item.productId) || null;
            const img = product && product.imagem_url ? product.imagem_url : "";
            const details = Object.values(item.selection || {})
                .flat()
                .map((x) => x.nome)
                .join(", ");
            const qty = Number(item.quantidade || 1);

            div.innerHTML = `
                <div class="cart-item-media">
                    ${img ? `<img class="cart-item-thumb" loading="lazy" src="${img}" alt="${item.nome}">` : ""}
                </div>
                <div class="cart-item-body">
                    <div class="cart-item-title">${item.nome}</div>
                    <div class="cart-item-desc">${details || "Sem opcoes"}${item.observacoes ? ` | ${item.observacoes}` : ""}</div>
                    <div class="cart-item-price-line">
                        ${qty}x ${formatCurrency(item.total)} = <strong>${formatCurrency(item.total * qty)}</strong>
                    </div>
                </div>
            `;

            const qtyWrap = document.createElement("div");
            qtyWrap.className = "cart-item-qty";

            const minusBtn = document.createElement("button");
            minusBtn.className = "cart-qty-btn";
            minusBtn.textContent = "-";
            minusBtn.onclick = () => decreaseItemQty(item.id);

            const plusBtn = document.createElement("button");
            plusBtn.className = "cart-qty-btn";
            plusBtn.textContent = "+";
            plusBtn.onclick = () => increaseItemQty(item.id);

            const qtyCount = document.createElement("div");
            qtyCount.className = "cart-qty-count";
            qtyCount.textContent = String(qty);

            qtyWrap.appendChild(minusBtn);
            qtyWrap.appendChild(qtyCount);
            qtyWrap.appendChild(plusBtn);

            const removeBtn = document.createElement("button");
            removeBtn.className = "cart-remove-btn btn-neutral";
            removeBtn.textContent = "Remover";
            removeBtn.onclick = () => removeCartItem(item.id);

            const bottomRow = document.createElement("div");
            bottomRow.className = "cart-item-bottom";
            bottomRow.appendChild(qtyWrap);
            bottomRow.appendChild(removeBtn);

            const bodyEl = div.querySelector(".cart-item-body");
            if (bodyEl) bodyEl.appendChild(bottomRow);
            else div.appendChild(bottomRow);

            drawerItems.appendChild(div);
        });
    }

    const subtotalEl = document.getElementById("subtotalValue");
    const deliveryEl = document.getElementById("deliveryValue");
    const totalEl = document.getElementById("totalValue");
    const discountRow = document.getElementById("discountRow");
    const discountDisplay = document.getElementById("discountDisplay");
    const couponDiscountDiv = document.getElementById("couponDiscount");
    const discountValueEl = document.getElementById("discountValue");

    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (deliveryEl) deliveryEl.textContent = frete === 0 ? "Calcular frete" : formatCurrency(frete);
    if (totalEl) totalEl.textContent = formatCurrency(finalTotal);

    // Show/hide discount row
    if (discountRow) {
        discountRow.classList.toggle("hidden", discount <= 0);
        if (discountDisplay && discount > 0) {
            discountDisplay.textContent = `- ${formatCurrency(discount)}`;
        }
    }

    // Update coupon discount display
    if (couponDiscountDiv) {
        couponDiscountDiv.classList.toggle("hidden", discount <= 0);
        if (discountValueEl && discount > 0) {
            discountValueEl.textContent = `- ${formatCurrency(discount)}`;
        }
    }
}

function toggleCartDrawer(open) {
    document.getElementById("cartDrawer").classList.toggle("hidden", !open);
}

function toggleCartSidebar(open) {
    const sidebar = document.getElementById("cartSidebar");
    if (sidebar) {
        sidebar.classList.toggle("hidden", !open);
    }
}

function clearCart(skipConfirm = false) {
    if (!skipConfirm) {
        showConfirmModal(
            'Apagar Carrinho',
            'Deseja apagar todo o carrinho?',
            () => clearCart(true),
            () => { } // Do nothing on cancel
        );
        return;
    }
    cart = [];
    deliveryResult = null;
    const hint = document.getElementById("freteHint");
    if (hint) hint.textContent = "Informe CEP e endereco para calcular o frete automaticamente.";
    persistCart();
    renderCart();
}

function checkoutWhatsapp() {
    if (!cart.length) return showAlert('Carrinho vazio', 'warning', 'Atenção');

    const nome = document.getElementById("customerName").value.trim();
    const telefone = document.getElementById("customerPhone").value.trim();
    const endereco = document.getElementById("customerAddress").value.trim();

    if (!nome || !telefone || !endereco) {
        return showAlert('Preencha nome, telefone e endereço', 'warning', 'Campos Obrigatórios');
    }

    // Check if delivery is calculated
    if (!deliveryResult) {
        // Close cart drawer first
        toggleCartDrawer(false);

        // Show confirmation modal after a short delay
        setTimeout(() => {
            showConfirmModal(
                "Continuar sem Frete?",
                "Deseja continuar o pedido sem calcular o frete? O valor do frete será combinado posteriormente.",
                () => {
                    // User confirmed - proceed with order
                    processOrder();
                }
            );
        }, 300);
    } else {
        // Delivery is calculated - proceed directly
        processOrder();
    }
}

function processOrder() {
    const subtotal = cart.reduce((sum, item) => {
        return sum + Number(item.total || 0) * Number(item.quantidade || 1);
    }, 0);

    const frete = deliveryResult ? deliveryResult.frete : 0;
    const discount = calculateDiscount(subtotal);
    const finalTotal = Math.max(0, subtotal + frete - discount);

    let message = `*NOVO PEDIDO - ${appData.pizzaria.nome}*\n\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `*DADOS DO CLIENTE*\n\n`;
    message += `Nome: ${document.getElementById("customerName").value.trim()}\n`;
    message += `Telefone: ${document.getElementById("customerPhone").value.trim()}\n`;
    message += `Endereço: ${document.getElementById("customerAddress").value.trim()}\n`;
    message += `CEP: ${document.getElementById("customerCep").value || "Não informado"}\n`;
    message += `Complemento: ${document.getElementById("customerComplement").value || "Não informado"}\n`;
    message += `Forma de pagamento: ${document.getElementById("customerPayment").value}\n`;

    if (document.getElementById("customerObs").value.trim()) {
        message += `Observações: ${document.getElementById("customerObs").value.trim()}\n`;
    }

    message += `\n━━━━━━━━━━━━━━━\n`;
    message += `*ITENS DO PEDIDO*\n\n`;

    cart.forEach((item, idx) => {
        const picked = Object.values(item.selection || {}).flat();
        const options = picked.length
            ? picked.map(x => x.nome).join(", ")
            : "Sem opções";

        const qty = Number(item.quantidade || 1);
        const itemTotal = Number(item.total || 0) * qty;

        message += `${idx + 1}. *${item.nome}* (x${qty})\n`;
        message += `   Opções: ${options}\n`;
        if (item.observacoes) {
            message += `   Obs: ${item.observacoes}\n`;
        }
        message += `   Preço: ${formatCurrency(item.total)} cada = ${formatCurrency(itemTotal)}\n\n`;
    });

    message += `━━━━━━━━━━━━━━━\n`;
    message += `*RESUMO DOS VALORES*\n\n`;
    message += `Subtotal: ${formatCurrency(subtotal)}\n`;

    if (discount > 0) {
        const tipoLabel = currentCoupon.tipo === 'percent' ? '%' : 'R$';
        message += `Desconto (${currentCoupon.code} - ${currentCoupon.valor}${tipoLabel}): -${formatCurrency(discount)}\n`;
    }

    if (frete > 0) {
        message += `Frete: ${formatCurrency(frete)}\n`;
    } else {
        message += `Frete: A combinar\n`;
    }

    message += `*Total: ${formatCurrency(finalTotal)}*\n\n`;

    if (currentCoupon) {
        message += `Cupom aplicado: ${currentCoupon.code}\n\n`;
    }

    const whatsappUrl = `https://wa.me/${appData.pizzaria.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
}

function showConfirmModal(title, message, onConfirm, onCancel) {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const confirmBtn = document.getElementById("confirmBtn");
    const cancelBtn = modal.querySelector('.btn-neutral');

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Remove existing event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // Add new event listener for confirm
    newConfirmBtn.addEventListener("click", () => {
        closeConfirmModal();
        onConfirm();
    });

    // Add new event listener for cancel
    newCancelBtn.addEventListener("click", () => {
        closeConfirmModal();
        if (onCancel) {
            onCancel();
        } else {
            // Default behavior: reopen cart drawer
            toggleCartDrawer(true);
        }
    });

    modal.classList.remove("hidden");
}

// Notification System
function showNotification(message, type = 'info', title = null, duration = 5000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const titles = {
        success: title || 'Sucesso',
        error: title || 'Erro',
        warning: title || 'Atenção',
        info: title || 'Informação'
    };

    notification.innerHTML = `
        <div class="notification-icon">${icons[type]}</div>
        <div class="notification-content">
            <div class="notification-title">${titles[type]}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="removeNotification(this)">×</button>
    `;

    container.appendChild(notification);

    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeNotification(notification.querySelector('.notification-close'));
        }, duration);
    }
}

function removeNotification(button) {
    const notification = button.closest('.notification');
    if (notification) {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }
}

function showNotificationModal(title, message, icon = 'ℹ️', onOk = null) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    const okBtn = document.getElementById('notificationOkBtn');

    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;

    // Remove existing event listeners
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    // Add new event listener
    newOkBtn.addEventListener('click', () => {
        closeNotificationModal();
        if (onOk) onOk();
    });

    modal.classList.remove('hidden');
}

function closeNotificationModal() {
    document.getElementById('notificationModal')?.classList.add('hidden');
}

// Replace all alert() calls with notification system
function showAlert(message, type = 'info', title = null) {
    showNotification(message, type, title);
}

// Replace all confirm() calls with confirmation modal
function showConfirmDialog(message, onConfirm, onCancel = null) {
    showConfirmModal('Confirmar Ação', message, onConfirm, onCancel);
}

// Toggle category submenu (desktop)
function toggleCategorySubmenu(categoriaId) {
    const submenu = document.getElementById(`submenu-${categoriaId}`);
    if (submenu) {
        const isVisible = submenu.style.display !== 'none';
        submenu.style.display = isVisible ? 'none' : 'block';

        // Close other submenus
        document.querySelectorAll('.subcategories-menu').forEach(menu => {
            if (menu.id !== `submenu-${categoriaId}`) {
                menu.style.display = 'none';
            }
        });
    }
}

// Toggle mobile submenu
function toggleMobileSubmenu(categoriaId) {
    const submenu = document.getElementById(`mobile-submenu-${categoriaId}`);
    if (submenu) {
        const isVisible = submenu.style.display !== 'none';
        submenu.style.display = isVisible ? 'none' : 'block';

        // Close other mobile submenus
        document.querySelectorAll('.mobile-subcategories').forEach(menu => {
            if (menu.id !== `mobile-submenu-${categoriaId}`) {
                menu.style.display = 'none';
            }
        });
    }
}

// Close all submenus when clicking outside
document.addEventListener('click', function (event) {
    if (!event.target.closest('.categories-nav') && !event.target.closest('.categories-menu')) {
        document.querySelectorAll('.subcategories-menu, .mobile-subcategories').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

function applyProductSearch(term) {
    const normalized = String(term || "").trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll(".product-card"));
    const sections = Array.from(document.querySelectorAll(".category-section"));
    const aboutSection = document.querySelector(".about-section");
    const emptyState = document.getElementById("searchEmptyState");
    let visibleCards = 0;

    // Hide/show about section based on search
    if (aboutSection) {
        aboutSection.classList.toggle("hidden", normalized.length > 0);
    }

    cards.forEach((card) => {
        const source = card.dataset.searchText || "";
        const visible = !normalized || source.includes(normalized);
        card.classList.toggle("hidden", !visible);
        if (visible) visibleCards += 1;
    });

    sections.forEach((section) => {
        const anyVisible = !!section.querySelector(".product-card:not(.hidden)");
        section.classList.toggle("hidden", !anyVisible);
    });

    if (emptyState) {
        emptyState.classList.toggle("hidden", visibleCards > 0 || !normalized);
    }

    // Show search results count
    const searchInfo = document.getElementById("searchInfo");
    if (searchInfo) {
        if (normalized) {
            searchInfo.textContent = visibleCards > 0 ? `${visibleCards} produto(s) encontrado(s)` : "Nenhum produto encontrado";
            searchInfo.classList.remove("hidden");
        } else {
            searchInfo.classList.add("hidden");
        }
    }
}

["customerCep", "customerAddress"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => {
        if (id === "customerAddress") {
            addressWasAutofilled = false;
        }
        deliveryResult = null;
        const hint = document.getElementById("freteHint");
        if (hint) hint.textContent = "Dados alterados. Recalcule o frete.";
        persistCustomerData();
        scheduleDeliveryCalculation();
        renderCart();
    });
});
const cepEl = document.getElementById("customerCep");
if (cepEl) {
    cepEl.addEventListener("blur", lookupCustomerCep);
    cepEl.addEventListener("input", () => {
        const digits = normalizeCep(cepEl.value);
        cepEl.value = digits;
        clearTimeout(cepLookupDebounce);
        if (digits.length === 8) {
            cepLookupDebounce = setTimeout(() => {
                lookupCustomerCep();
            }, 350);
        }
    });
}

["customerName", "customerPhone", "customerComplement", "customerPayment", "customerObs"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", persistCustomerData);
});

const productSearchEl = document.getElementById("productSearch");
const clearSearchBtn = document.getElementById("clearSearchBtn");
if (productSearchEl) {
    productSearchEl.addEventListener("input", () => {
        const query = productSearchEl.value || "";
        applyProductSearch(query);
        if (clearSearchBtn) clearSearchBtn.classList.toggle("hidden", !query.trim());
    });

    // Add Enter key functionality
    productSearchEl.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const query = productSearchEl.value || "";
            applyProductSearch(query);

            // Scroll to first visible result
            const firstVisibleCard = document.querySelector(".product-card:not(.hidden)");
            if (firstVisibleCard) {
                firstVisibleCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    });
}
if (clearSearchBtn && productSearchEl) {
    clearSearchBtn.addEventListener("click", () => {
        productSearchEl.value = "";
        applyProductSearch("");
        clearSearchBtn.classList.add("hidden");
        productSearchEl.focus();
    });
}

// Sugerir pedido e repetir pedido (baseado em histórico local e cliques)
const suggestOrderBtn = document.getElementById("suggestOrderBtn");
const repeatOrderBtn = document.getElementById("repeatOrderBtn");

function updateSuggestButtonState() {
    if (!suggestOrderBtn) return;
    const history = loadOrderHistory();
    const hasHistory = Object.keys(history.stats || {}).length > 0;
    const hasClicks = Object.keys(loadProductClicks()).length > 0;
    suggestOrderBtn.disabled = !hasHistory && !hasClicks;
}

function updateRepeatButtonState() {
    if (!repeatOrderBtn) return;
    const history = loadOrderHistory();
    const hasLastOrder = history.lastSignature && history.stats?.[history.lastSignature]?.itemsTemplate;
    repeatOrderBtn.disabled = !hasLastOrder;
}

if (repeatOrderBtn) {
    updateRepeatButtonState();
    repeatOrderBtn.addEventListener("click", () => {
        const items = repeatLastOrderFromHistory();
        if (!items) {
            showAlert('Sem pedido anterior para repetir. Faça um pedido primeiro!', 'info', 'Informação');
            return;
        }
        restoreCartFromItemsTemplate(items);
        toggleCartDrawer(true);
    });
}

if (suggestOrderBtn) {
    updateSuggestButtonState();
    suggestOrderBtn.addEventListener("click", () => {
        showSuggestModal();
    });
}

window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.toggleCartDrawer = toggleCartDrawer;
window.toggleCartSidebar = toggleCartSidebar;
window.handleWizardPrimary = handleWizardPrimary;
window.repeatLastConfig = repeatLastConfig;
window.checkoutWhatsapp = checkoutWhatsapp;
window.clearCart = clearCart;
window.cancelProductFlow = closeProductModal;
window.toggleStoreInfo = (open) => document.getElementById("storeInfoModal").classList.toggle("hidden", !open);
window.calculateDeliveryByAddress = calculateDeliveryByAddress;
window.removeCartItem = removeCartItem;
window.increaseItemQty = increaseItemQty;
window.decreaseItemQty = decreaseItemQty;
window.repeatLastOrderFromHistory = repeatLastOrderFromHistory;

// Funções para o dropdown de categorias
window.toggleCategories = function () {
    const dropdown = document.getElementById("categoriesDropdown");
    dropdown.classList.toggle("open");
};

window.scrollToCategory = function (categoryId) {
    const element = document.getElementById(categoryId);
    if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Fechar dropdown
    document.getElementById("categoriesDropdown").classList.remove("open");
};

// Mostrar/esconder dropdown sticky de categorias ao rolar
const categoriesNav = document.querySelector('.categories-nav');
const categoriesSticky = document.getElementById('categoriesSticky');

if (categoriesNav && categoriesSticky) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                categoriesSticky.classList.add('visible');
            } else {
                categoriesSticky.classList.remove('visible');
            }
        });
    }, { threshold: 0 });

    observer.observe(categoriesNav);
}

// Fechar dropdown quando clicar fora
document.addEventListener("click", (event) => {
    const dropdown = document.getElementById("categoriesDropdown");
    if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove("open");
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProductModal();
    toggleCartDrawer(false);
    window.toggleStoreInfo(false);
    const dropdown = document.getElementById("categoriesDropdown");
    if (dropdown) dropdown.classList.remove("open");
    closeSuggestModal();
});

// ============================================
// COUPON SYSTEM
// ============================================
let currentCoupon = null;

function calculateDiscount(subtotal) {
    if (!currentCoupon) return 0;

    if (currentCoupon.tipo === 'percent') {
        return Math.round((subtotal * currentCoupon.valor / 100) * 100) / 100;
    }
    return currentCoupon.valor;
}

function applyCoupon() {
    const codeInput = document.getElementById("couponCode");
    const code = codeInput?.value?.trim().toUpperCase();

    if (!code) {
        showAlert('Digite um código de cupom', 'warning', 'Atenção');
        return;
    }

    // Check if coupon exists in pizzaria coupons (from admin) - case insensitive
    const coupons = appData.pizzaria.cupons || [];
    console.log('Procurando cupom:', code, 'em', coupons);
    const coupon = coupons.find(c => c.codigo && c.codigo.toUpperCase() === code);

    if (!coupon || coupon.valor <= 0) {
        showAlert('Cupom inválido ou expirado', 'error', 'Erro');
        currentCoupon = null;
        renderCart();
        return;
    }

    currentCoupon = {
        code: coupon.codigo,
        valor: Number(coupon.valor),
        tipo: coupon.tipo || 'fixed'
    };

    renderCart();

    const discount = calculateDiscount(cart.reduce((sum, item) => sum + Number(item.total || 0) * Number(item.quantidade || 1), 0));
    const discountDisplay = currentCoupon.tipo === 'percent'
        ? `${currentCoupon.valor}%`
        : `R$ ${currentCoupon.valor.toFixed(2)}`;
    showAlert(`Cupom ${code} aplicado! Desconto: ${discountDisplay}`, 'success', 'Cupom Aplicado');
}

window.applyCoupon = applyCoupon;

// ============================================
// IMPROVED SUGGEST ORDER MODAL
// ============================================
let currentSuggestion = null;

function closeSuggestModal() {
    document.getElementById("suggestOrderModal")?.classList.add("hidden");
}

function refreshSuggestion() {
    // Clear current suggestion to force regeneration with different options
    currentSuggestion = null;

    // Force regeneration by calling showSuggestModal
    showSuggestModal();

    // Add a small delay to ensure UI updates
    setTimeout(() => {
        const modal = document.getElementById("suggestOrderModal");
        if (modal && !modal.classList.contains("hidden")) {
            // If modal is still open, try to regenerate with different seed
            showSuggestModal();
        }
    }, 100);
}

function addSuggestedToCart() {
    if (!currentSuggestion) return;

    // Add the item to cart with its pre-selected options
    const item = {
        productId: currentSuggestion.product.id,
        nome: currentSuggestion.product.nome,
        quantidade: 1,
        selection: currentSuggestion.selection,
        observacoes: "",
        total: currentSuggestion.total
    };

    cart.push(item);
    persistCart();
    renderCart();
    closeSuggestModal();
    // Não abrir o carrinho automaticamente
}

function showSuggestModal() {
    const best = suggestBestOrderFromHistory();

    // Se não há histórico, pegar um produto aleatório
    if (!best) {
        const allProducts = Array.from(productsById.values());
        if (allProducts.length === 0) {
            showAlert('Nenhum produto disponível para sugestão!', 'info', 'Informação');
            return;
        }

        // Escolher produto aleatório
        const randomProduct = allProducts[Math.floor(Math.random() * allProducts.length)];

        // Build the suggestion with one option per section
        const selection = {};
        let total = Number(randomProduct.preco_base || 0);
        const sections = randomProduct.secoes || [];

        console.log("Sugerindo produto aleatório:", randomProduct.nome, "com seções:", sections);

        // For each section, pick a random option with better randomness
        sections.forEach(secao => {
            const opcoes = secao.opcoes || [];
            if (opcoes.length > 0) {
                // Use multiple random factors for better randomness
                const randomSeed = Date.now() + Math.random() * 1000;
                const randomIndex = Math.floor((randomSeed % 1) * opcoes.length);
                const randomOption = opcoes[randomIndex];
                selection[secao.id] = [randomOption];
                total += Number(randomOption.preco_adicional || 0);
                console.log(`Seção ${secao.nome}: escolhida opção ${randomOption.nome}`);
            }
        });

        currentSuggestion = { product: randomProduct, selection, total };

        // Render modal content
        const modal = document.getElementById("suggestOrderModal");
        const productDiv = document.getElementById("suggestedProduct");
        const optionsDiv = document.getElementById("suggestedOptions");

        productDiv.innerHTML = `
            <div class="suggested-product">
                <h4>${randomProduct.nome}</h4>
                <p>Total: ${formatCurrency(total)}</p>
            </div>
        `;

        optionsDiv.innerHTML = sections.map(secao => {
            const selectedOptions = selection[secao.id];
            if (!selectedOptions || !Array.isArray(selectedOptions) || selectedOptions.length === 0) return '';

            const option = selectedOptions[0]; // Get the first (and only) option
            if (!option) return '';

            return `
                <div class="suggested-option-group">
                    <h5>${secao.nome}</h5>
                    <p>${option.nome}${option.preco_adicional > 0 ? ` (+${formatCurrency(option.preco_adicional)})` : ''}</p>
                </div>
            `;
        }).join('');

        modal.classList.remove("hidden");
        return;
    }

    // Código original para quando há histórico
    const item = best.itemsTemplate[0];
    const product = productsById.get(item.productId);
    if (!product) {
        console.error("Produto não encontrado:", item.productId);
        return;
    }

    console.log("Sugerindo produto:", product.nome, "com seções:", product.secoes);

    // Build the suggestion with one option per section
    const selection = {};
    let total = Number(product.preco_base || 0);
    const sections = product.secoes || [];

    // For each section, pick a random option with better randomness
    sections.forEach(secao => {
        const opcoes = secao.opcoes || [];
        if (opcoes.length > 0) {
            // Use multiple random factors for better randomness
            const randomSeed = Date.now() + Math.random() * 1000;
            const randomIndex = Math.floor((randomSeed % 1) * opcoes.length);
            const randomOption = opcoes[randomIndex];
            selection[secao.id] = [randomOption];
            total += Number(randomOption.preco_adicional || 0);
            console.log(`Seção ${secao.nome}: escolhida opção ${randomOption.nome}`);
        }
    });

    currentSuggestion = { product, selection, total };

    // Render modal content
    const modal = document.getElementById("suggestOrderModal");
    const productDiv = document.getElementById("suggestedProduct");
    const optionsDiv = document.getElementById("suggestedOptions");

    productDiv.innerHTML = `
        <div class="suggested-product">
            <h4>${product.nome}</h4>
            <p>Total: ${formatCurrency(total)}</p>
        </div>
    `;

    optionsDiv.innerHTML = sections.map(secao => {
        const selectedOptions = selection[secao.id];
        if (!selectedOptions || !Array.isArray(selectedOptions) || selectedOptions.length === 0) return '';

        const option = selectedOptions[0]; // Get the first (and only) option
        if (!option) return '';

        return `
            <div class="suggested-option-group">
                <h5>${secao.nome}</h5>
                <p>${option.nome}${option.preco_adicional > 0 ? ` (+${formatCurrency(option.preco_adicional)})` : ''}</p>
            </div>
        `;
    }).join('');

    modal.classList.remove("hidden");
}

// Funções do Modal de Sugestão
function openSugestaoModal() {
    const modal = document.getElementById('sugestaoModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadSugestaoCategorias();
    }
}

function closeSugestaoModal() {
    const modal = document.getElementById('sugestaoModal');
    if (modal) {
        modal.classList.add('hidden');
        // Resetar estado
        document.getElementById('sugestaoCategorias').classList.remove('hidden');
        document.getElementById('sugestaoResult').classList.add('hidden');
    }
}

async function loadSugestaoCategorias() {
    try {
        const response = await fetch(`/api/sugestao-config/${window.__APP_DATA__.pizzaria.slug}`);
        const data = await response.json();

        const container = document.getElementById('sugestaoCategorias');
        container.innerHTML = '';

        if (data.success && data.data.length > 0) {
            data.data.forEach(config => {
                const button = document.createElement('button');
                button.className = 'sugestao-categoria-btn';
                button.innerHTML = `
                    <span class="sugestao-categoria-icon">${config.categorias.icone || '🍕'}</span>
                    <span>${config.categorias.nome}</span>
                `;
                button.onclick = () => gerarSugestao(config.categoria_id);
                container.appendChild(button);
            });
        } else {
            container.innerHTML = '<p style="text-align: center; color: #94a3b8;">Nenhuma categoria configurada para sugestões</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar categorias de sugestão:', error);
        document.getElementById('sugestaoCategorias').innerHTML = '<p style="text-align: center; color: #ef4444;">Erro ao carregar sugestões</p>';
    }
}

async function gerarSugestao(categoriaId) {
    try {
        console.log("Gerando sugestão para categoria:", categoriaId); // Debug

        const response = await fetch(`/api/sugestao-combo/${window.__APP_DATA__.pizzaria.slug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ categoria_id: categoriaId })
        });

        console.log("Response status:", response.status); // Debug
        const data = await response.json();
        console.log("Response data:", data); // Debug

        if (data.success) {
            mostrarSugestaoResult(data.data);
        } else {
            console.error("Erro na API:", data); // Debug
            showNotification('Erro', data.message || 'Não foi possível gerar sugestão', 'error');
        }
    } catch (error) {
        console.error('Erro ao gerar sugestão:', error);
        showNotification('Erro', 'Não foi possível gerar sugestão', 'error');
    }
}

function mostrarSugestaoResult(data) {
    const categoriasContainer = document.getElementById('sugestaoCategorias');
    const resultContainer = document.getElementById('sugestaoResult');
    const mensagemEl = resultContainer.querySelector('.sugestao-mensagem');
    const produtosEl = document.getElementById('sugestaoProdutos');

    // Esconder categorias e mostrar resultado
    categoriasContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    // Mostrar mensagem
    mensagemEl.textContent = data.mensagem || 'Sugestões para você:';

    // Mostrar produtos
    produtosEl.innerHTML = '';
    data.produtos.forEach(produto => {
        const item = document.createElement('div');
        item.className = 'sugestao-produto-item';
        item.innerHTML = `
            <div class="sugestao-produto-info">
                <div class="sugestao-produto-nome">${produto.nome}</div>
                <div class="sugestao-produto-preco">R$ ${Number(produto.preco_base).toFixed(2)}</div>
            </div>
            <div class="sugestao-produto-actions">
                <button class="btn-primary" onclick="openProductModal('${produto.id}')">Ver Detalhes</button>
                <button class="btn-secondary" onclick="adicionarProdutoAoCarrinho('${produto.id}')">Adicionar</button>
            </div>
        `;
        produtosEl.appendChild(item);
    });

    // Configurar botão "Sugerir Novamente"
    document.getElementById('sugestaoNovamenteBtn').onclick = () => {
        resultContainer.classList.add('hidden');
        categoriasContainer.classList.remove('hidden');
    };
}

function adicionarProdutoAoCarrinho(produtoId) {
    const produto = productsById.get(produtoId);
    if (!produto) return;

    // Adicionar produto com opções padrão
    const selection = {};
    let total = Number(produto.preco_base || 0);

    // Para cada seção, escolher a primeira opção
    (produto.secoes || []).forEach(secao => {
        const opcoes = secao.opcoes || [];
        if (opcoes.length > 0) {
            const firstOption = opcoes[0];
            selection[secao.id] = [firstOption];
            total += Number(firstOption.preco_adicional || 0);
        }
    });

    const item = {
        productId: produto.id,
        nome: produto.nome,
        quantidade: 1,
        selection: selection,
        observacoes: "",
        total: total
    };

    cart.push(item);
    persistCart();
    renderCart();
    showNotification('Sucesso', `${produto.nome} adicionado ao carrinho!`, 'success');
}

// Event listener para o botão flutuante
document.addEventListener('DOMContentLoaded', () => {
    const sugestaoBtn = document.getElementById('sugestaoPedidoBtn');
    if (sugestaoBtn) {
        sugestaoBtn.addEventListener('click', openSugestaoModal);
    }
});

window.getCurrentLocation = function () {
    if (!navigator.geolocation) {
        showAlert('Seu navegador não suporta geolocalização', 'error', 'Erro');
        return;
    }

    const hint = document.getElementById("freteHint");
    hint.textContent = "Obtendo sua localização...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                // Usar API reversa para obter CEP a partir das coordenadas
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&country=Brazil`);
                const data = await response.json();

                if (data && data.address) {
                    const cep = data.address.postcode;
                    if (cep) {
                        document.getElementById("customerCep").value = cep.replace(/\D/g, '');
                        persistCustomerData();
                        scheduleDeliveryCalculation();
                        hint.textContent = `CEP encontrado: ${cep}`;
                    } else {
                        hint.textContent = "Não foi possível obter o CEP da sua localização";
                    }
                } else {
                    hint.textContent = "Não foi possível obter o endereço da sua localização";
                }
            } catch (error) {
                hint.textContent = "Erro ao obter CEP da localização";
            }
        },
        (error) => {
            hint.textContent = "Erro ao obter localização. Verifique as permissões do navegador.";
        }
    );
};

window.closeSuggestModal = closeSuggestModal;
window.refreshSuggestion = refreshSuggestion;
window.addSuggestedToCart = addSuggestedToCart;

// Suggest button handler is already set up above

renderCart();
restoreCustomerData();
