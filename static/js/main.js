const appData = window.__APP_DATA__ || { pizzaria: {}, produtos: [] };
console.log('[MAIN.JS] appData completo:', appData);
console.log('[MAIN.JS] appData.pizzaria keys:', Object.keys(appData.pizzaria).filter(k => k.includes('cor')));
console.log('[MAIN.JS] cor_texto_escuro:', appData.pizzaria.cor_texto_escuro);
console.log('[MAIN.JS] appData.produtos:', appData.produtos);
console.log('[MAIN.JS] appData.produtos.length:', appData.produtos ? appData.produtos.length : 0);
const productsById = new Map((appData.produtos || []).map((p) => [p.id, p]));
console.log('[MAIN.JS] productsById criado:', productsById);
console.log('[MAIN.JS] productsById.size:', productsById.size);
const storageKey = appData.pizzaria ? `commit_cart_${appData.pizzaria.slug}` : 'commit_cart';

// Função para gerar UUID compatível com todos os navegadores
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Define CSS variables dinamicamente baseado nos dados da pizzaria
function setDynamicColors() {
    const p = appData.pizzaria;
    const root = document.documentElement;
    // Usar as mesmas variáveis que o style_dark.css usa
    root.style.setProperty('--cor_primaria', p.botao_primario_bg || '#E81C1C');
    root.style.setProperty('--cor_primaria-deep', p.botao_primario_hover || '#B01010');
    root.style.setProperty('--cor_fundo_principal', p.cor_fundo_principal || '#0D0D0D');
    root.style.setProperty('--cor_fundo_secundario', p.cor_fundo_secundario || '#161616');
    root.style.setProperty('--cor_fundo', p.cor_surface || '#FFFFFF');
    root.style.setProperty('--cor_texto', p.cor_texto || '#000000');
    root.style.setProperty('--cor_texto_secundario', p.cor_texto_secundario || '#666666');
    root.style.setProperty('--cor_titulos', p.cor_titulos || '#f9fafb');
    console.log('[CORES] Cores aplicadas:', {
        cor_primaria: p.botao_primario_bg,
        cor_fundo_principal: p.cor_fundo_principal,
        cor_fundo: p.cor_surface
    });
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
    console.log('[DEBUG] openProductModal chamado com productId:', productId);
    console.log('[DEBUG] productsById:', productsById);
    console.log('[DEBUG] productsById.size:', productsById.size);

    const product = productsById.get(productId);
    console.log('[DEBUG] product encontrado:', product);

    if (!product) {
        console.error('[DEBUG] Produto não encontrado para ID:', productId);
        return;
    }

    console.log('Produto aberto:', product);
    console.log('Seções do produto:', product.secoes);

    currentProduct = product;
    currentSelection = {};
    currentObs = "";
    currentStepIndex = 0;

    const repeatButton = document.getElementById("repeatButton");
    if (repeatButton) {
        repeatButton.style.display = lastSelectionByProduct[productId] ? "inline-block" : "none";
    }

    console.log('[DEBUG] Chamando renderWizardStep()');
    renderWizardStep();
    console.log('[DEBUG] renderWizardStep() concluído');

    const modal = document.getElementById("productModal");
    console.log('[DEBUG] modal element:', modal);
    if (modal) {
        modal.style.display = "flex";
        console.log('[DEBUG] modal.style.display definido para flex');
    } else {
        console.error('[DEBUG] Modal não encontrado no DOM');
    }
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

    const partialTotal = getSelectionTotal(currentProduct, currentSelection);
    const summary = document.createElement("div");
    summary.className = "option-group";
    summary.innerHTML = `<h4>Resumo parcial</h4><p>Subtotal do item: <strong>${formatCurrency(partialTotal)}</strong></p>`;
    body.appendChild(summary);

    // Adicionar campo de observações apenas no último passo
    if (currentStepIndex === sections.length - 1) {
        const obs = document.createElement("textarea");
        obs.placeholder = "Observacoes deste item";
        obs.value = currentObs;
        obs.addEventListener("input", (event) => (currentObs = event.target.value || ""));
        body.appendChild(obs);
    }

    const primaryButton = document.getElementById("wizardPrimaryButton");
    primaryButton.textContent = currentStepIndex === sections.length - 1 ? "Confirmar" : "Proxima Etapa";
}

function closeProductModal() {
    const modal = document.getElementById("productModal");
    if (modal) {
        modal.style.display = "none";
    }
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
        id: generateUUID(),
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
        // Obter endereço completo
        const endereco = document.getElementById("customerAddress")?.value?.trim() || "";

        // Usar nova API que suporta CEP e endereço com Geoapify
        const response = await fetch(`/api/frete/calcular/${appData.pizzaria.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cep: cep || "",
                endereco: endereco
            })
        });
        const data = await response.json();
        if (!response.ok || data.status === "erro") {
            deliveryResult = null;
            if (response.status === 422) {
                hint.textContent = "Fora da área de entrega. Verifique se o CEP/endereço estão corretos ou entre em contato com a pizzaria.";
            } else {
                hint.textContent = data.erro || "Não foi possível calcular frete para este endereço.";
            }
            renderCart();
            return;
        }

        // Salvar dados completos do frete
        deliveryResult = {
            frete: Number(data.frete || 0),
            distanciaKm: Number(data.distancia_km || 0),
            faixaAplicada: data.faixa_aplicada || "",
            enderecoEncontrado: data.endereco_encontrado || "",
            apiUsadaGeocode: data.api_usada_geocode || "",
            apiUsadaDistance: data.api_usada_distance || ""
        };

        // Montar mensagem de frete com informações detalhadas
        let freteMessage = `Frete: ${formatCurrency(deliveryResult.frete)} | Distância: ${deliveryResult.distanciaKm.toFixed(2)} km`;

        if (deliveryResult.faixaAplicada) {
            freteMessage += ` | Faixa: ${deliveryResult.faixaAplicada}`;
        }

        if (data.aviso) {
            freteMessage += ` | ${data.aviso}`;
        }

        hint.textContent = freteMessage;
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
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('headerCartCount');
    const cartItemCount = document.getElementById('cartItemCount');
    const cartSubtotal = document.getElementById('cartSubtotal');
    const cartTotal = document.getElementById('cartTotal');

    // Mobile elements
    const floatingCartBar = document.getElementById('floatingCartBar');
    const floatingCartItems = document.getElementById('floatingCartItems');
    const floatingCartTotal = document.getElementById('floatingCartTotal');

    if (!cartItems) return;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <p>Carrinho vazio<br>Adicione itens para começar</p>
            </div>
        `;
        const total = 0;
        const itemCount = 0;

        // Update desktop
        if (cartCount) cartCount.textContent = '0';
        if (cartItemCount) cartItemCount.textContent = '0 itens';
        if (cartSubtotal) cartSubtotal.textContent = 'R$ 0,00';
        if (cartTotal) cartTotal.textContent = 'R$ 0,00';

        // Update mobile
        if (floatingCartItems) floatingCartItems.textContent = '0 itens';
        if (floatingCartTotal) floatingCartTotal.textContent = 'R$ 0,00';
        if (floatingCartBar) floatingCartBar.style.display = 'none';

        return;
    }

    let html = '<div class="cart-items-list">';
    let total = 0;
    let itemCount = 0;

    cart.forEach(item => {
        const itemTotal = item.total * item.quantidade;
        total += itemTotal;
        itemCount += item.quantidade;

        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nome}</div>
                    <div class="cart-item-details">
                        ${item.quantidade > 1 ? `<span>Qtd: ${item.quantidade}</span>` : ''}
                        ${item.observacoes ? `<span>Obs: ${item.observacoes}</span>` : ''}
                    </div>
                </div>
                <div class="cart-item-price">${formatCurrency(itemTotal)}</div>
                <button class="cart-item-remove" onclick="removeCartItem('${item.id}')">✕</button>
            </div>
        `;
    });

    html += '</div>';
    cartItems.innerHTML = html;

    // Update desktop
    if (cartCount) cartCount.textContent = itemCount.toString();
    if (cartItemCount) cartItemCount.textContent = `${itemCount} itens`;
    if (cartSubtotal) cartSubtotal.textContent = formatCurrency(total);

    // Calculate discount
    const discount = calculateDiscount(total);
    const finalTotal = total - discount;

    if (cartTotal) {
        if (discount > 0) {
            cartTotal.innerHTML = `
                <div style="text-decoration: line-through; color: #888; font-size: 0.875rem;">${formatCurrency(total)}</div>
                <div style="color: #4ade80; font-weight: bold;">${formatCurrency(finalTotal)}</div>
            `;
        } else {
            cartTotal.textContent = formatCurrency(total);
        }
    }

    // Update mobile - show bar when has items
    if (floatingCartItems) floatingCartItems.textContent = `${itemCount} itens`;
    if (floatingCartTotal) {
        if (discount > 0) {
            floatingCartTotal.innerHTML = `
                <span style="text-decoration: line-through; color: #888; font-size: 0.75rem;">${formatCurrency(total)}</span>
                <span style="color: #4ade80; font-weight: bold;">${formatCurrency(finalTotal)}</span>
            `;
        } else {
            floatingCartTotal.textContent = formatCurrency(total);
        }
    }
    if (floatingCartBar) floatingCartBar.style.display = 'flex';
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
        // Buscar apenas no nome do produto
        const productName = card.querySelector('.pizza-card-name')?.textContent?.toLowerCase() || "";
        const visible = !normalized || productName.includes(normalized);
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


window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.toggleCartDrawer = toggleCartDrawer;
window.toggleCartSidebar = toggleCartSidebar;
window.handleWizardPrimary = handleWizardPrimary;
window.repeatLastConfig = repeatLastConfig;
window.checkoutWhatsapp = checkoutWhatsapp;
window.clearCart = clearCart;
window.cancelProductFlow = closeProductModal;

// Função para toggle da barra de informações
window.toggleInfoBar = function () {
    const infoBar = document.getElementById("infoBar");
    const arrow = document.getElementById("infoToggleArrow");

    if (infoBar.style.display === "none" || infoBar.style.display === "") {
        infoBar.style.display = "flex";
        // Adiciona classe show para animação
        setTimeout(() => infoBar.classList.add("show"), 10);
        arrow.textContent = "▲";
    } else {
        infoBar.classList.remove("show");
        // Espera animação terminar antes de esconder
        setTimeout(() => {
            infoBar.style.display = "none";
        }, 300);
        arrow.textContent = "▼";
    }
};
window.calculateDeliveryByAddress = calculateDeliveryByAddress;
window.removeCartItem = removeCartItem;
window.increaseItemQty = increaseItemQty;
window.decreaseItemQty = decreaseItemQty;

// Toggle mobile submenu
function toggleMobileSubmenu(categoriaId) {
    const submenu = document.getElementById(`mobile-submenu-${categoriaId}`);
    if (submenu) {
        const isVisible = submenu.style.display !== 'none';
        submenu.style.display = isVisible ? 'none' : 'block';
    }
}

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
    // Simples: mostrar dropdown sticky quando rolar para baixo
    let lastScrollTop = 0;
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > 200) { // Mostrar depois de rolar 200px
            categoriesSticky.classList.add('visible');
        } else {
            categoriesSticky.classList.remove('visible');
        }

        lastScrollTop = scrollTop;
    });
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
    const couponMessage = document.getElementById("couponMessage");

    if (!code) {
        if (couponMessage) {
            couponMessage.innerHTML = '<span style="color: #ef4444;">❌ Digite um código de cupom</span>';
        }
        return;
    }

    // Check if coupon exists in pizzaria coupons (from admin) - case insensitive
    const coupons = appData.pizzaria.cupons || [];
    const coupon = coupons.find(c => c.codigo && c.codigo.toUpperCase() === code);

    if (!coupon || coupon.valor <= 0) {
        currentCoupon = null;
        if (couponMessage) {
            couponMessage.innerHTML = '<span style="color: #ef4444;">❌ Cupom inválido ou expirado</span>';
        }
        renderCart();
        renderCartDrawerItems();
        return;
    }

    currentCoupon = {
        code: coupon.codigo,
        valor: Number(coupon.valor),
        tipo: coupon.tipo || 'fixed'
    };

    renderCart();
    renderCartDrawerItems();

    const discount = calculateDiscount(cart.reduce((sum, item) => sum + Number(item.total || 0) * Number(item.quantidade || 1), 0));
    const discountDisplay = currentCoupon.tipo === 'percent'
        ? `${currentCoupon.valor}%`
        : `R$ ${currentCoupon.valor.toFixed(2)}`;

    if (couponMessage) {
        couponMessage.innerHTML = `<span style="color: #4ade80;">✅ Cupom ${code} aplicado! Desconto: ${discountDisplay}</span>`;
    }
}

window.applyCoupon = applyCoupon;




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


renderCart();
restoreCustomerData();

// ============================================
// FUNÇÕES ESSENCIAIS QUE FALTAVAM
// ============================================

function toggleCartSidebar(show) {
    const cartSidebar = document.getElementById('cartSidebar');
    if (!cartSidebar) return;

    if (show) {
        cartSidebar.style.display = 'block';
    } else {
        cartSidebar.style.display = 'none';
    }
}

function scrollToCategory(categoryId) {
    const element = document.getElementById(categoryId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function clearSearch() {
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.value = '';
        // Disparar evento de input para filtrar
        searchInput.dispatchEvent(new Event('input'));
    }
}

// Expor funções globalmente
window.toggleCartSidebar = toggleCartSidebar;
window.scrollToCategory = scrollToCategory;
window.clearSearch = clearSearch;
window.toggleCart = toggleCartSidebar;

// ============================================
// FUNÇÕES ADICIONAIS DO INDEX.HTML
// ============================================

function toggleStoreInfo() {
    const modal = document.getElementById('storeInfoModal');
    if (!modal) return;
    const isOpen = modal.style.display === 'flex';
    modal.style.display = isOpen ? 'none' : 'flex';
}

function toggleCartDrawer(show) {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return;
    if (show) {
        drawer.style.display = 'flex';
        renderCartDrawerItems();
    } else {
        drawer.style.display = 'none';
    }
}

function renderCartDrawerItems() {
    const itemsContainer = document.getElementById('cartDrawerItems');
    const totalContainer = document.getElementById('cartDrawerTotal');

    if (!itemsContainer || !totalContainer) return;

    if (cart.length === 0) {
        itemsContainer.innerHTML = '<p style="text-align: center; color: #888;">Carrinho vazio</p>';
        totalContainer.innerHTML = '';
        return;
    }

    // Lista de produtos (resumo) - acima do formulário
    let itemsHtml = '<div class="cart-drawer-list" style="border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px;">';
    let total = 0;
    cart.forEach(item => {
        total += item.total * item.quantidade;
        itemsHtml += `
            <div class="cart-drawer-item" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <div>
                    <strong>${item.nome}</strong>
                    <small style="display: block; color: #888;">Qtd: ${item.quantidade}</small>
                </div>
                <span>${formatCurrency(item.total * item.quantidade)}</span>
            </div>
        `;
    });
    itemsHtml += '</div>';
    itemsContainer.innerHTML = itemsHtml;

    // Valores (subtotal, desconto, total) - abaixo do formulário
    let totalHtml = '<div class="cart-values" style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #333;">';

    // Calcular desconto
    const discount = calculateDiscount(total);
    const finalTotal = total - discount;

    totalHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Subtotal:</span><strong>${formatCurrency(total)}</strong></div>`;

    if (discount > 0) {
        const discountDisplay = currentCoupon.tipo === 'percent'
            ? `${currentCoupon.valor}%`
            : `R$ ${currentCoupon.valor.toFixed(2)}`;
        totalHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #4ade80;"><span>Desconto (${discountDisplay}):</span><strong>-${formatCurrency(discount)}</strong></div>`;
    }

    totalHtml += `<div style="display: flex; justify-content: space-between; font-size: 1.3rem; margin-top: 10px; padding-top: 10px; border-top: 2px solid #E81C1C;"><span style="color: #E81C1C;">TOTAL:</span><strong style="color: #E81C1C;">${formatCurrency(finalTotal)}</strong></div>`;
    totalHtml += '</div>';
    totalContainer.innerHTML = totalHtml;
}

function submitOrder(event) {
    event.preventDefault();
    if (cart.length === 0) {
        alert('Carrinho vazio!');
        return;
    }
    const name = document.getElementById('customerName')?.value;
    const phone = document.getElementById('customerPhone')?.value;
    const address = document.getElementById('customerAddress')?.value;
    const cep = document.getElementById('customerCep')?.value;
    const notes = document.getElementById('customerNotes')?.value;
    if (!name || !phone || !address) {
        alert('Preencha todos os campos obrigatórios!');
        return;
    }
    // Montar mensagem WhatsApp
    let message = `*NOVO PEDIDO - ${appData.pizzaria.nome}*\n\n`;
    message += `*Cliente:* ${name}\n`;
    message += `*Telefone:* ${phone}\n`;
    message += `*Endereço:* ${address}${cep ? ' (CEP: ' + cep + ')' : ''}\n\n`;
    message += `*ITENS:*\n`;
    let total = 0;
    cart.forEach(item => {
        total += item.total * item.quantidade;
        message += `• ${item.nome} x${item.quantidade} = ${formatCurrency(item.total * item.quantidade)}\n`;
    });
    message += `\n*Total: ${formatCurrency(total)}*\n`;
    if (notes) message += `\n*Observações:* ${notes}\n`;
    // Abrir WhatsApp
    const whatsapp = appData.pizzaria.whatsapp.replace(/\D/g, '');
    const url = `https://wa.me/55${whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    // Limpar carrinho
    clearCart();
    toggleCartDrawer(false);
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocalização não suportada');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            alert('Localização obtida! Latitude: ' + position.coords.latitude.toFixed(4));
        },
        (error) => {
            alert('Erro ao obter localização: ' + error.message);
        }
    );
}

function cancelProductFlow() {
    closeProductModal();
}

// Expor funções adicionais
window.toggleStoreInfo = toggleStoreInfo;
window.toggleCartDrawer = toggleCartDrawer;
window.submitOrder = submitOrder;
window.getCurrentLocation = getCurrentLocation;
window.cancelProductFlow = cancelProductFlow;
