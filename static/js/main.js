const appData = window.__APP_DATA__;
const productsById = new Map(appData.produtos.map((p) => [p.id, p]));
const storageKey = `commit_cart_${appData.pizzaria.slug}`;

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
        if (payload.name !== undefined) document.getElementById("customerName").value = payload.name;
        if (payload.phone !== undefined) document.getElementById("customerPhone").value = payload.phone;
        if (payload.cep !== undefined) document.getElementById("customerCep").value = payload.cep;
        if (payload.complement !== undefined) document.getElementById("customerComplement").value = payload.complement;
        if (payload.payment !== undefined) document.getElementById("customerPayment").value = payload.payment;
        if (payload.obs !== undefined) document.getElementById("customerObs").value = payload.obs;
    } catch (_) {}
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
    body.innerHTML = `<h2>${currentProduct.nome}</h2><p>${currentProduct.descricao || ""}</p><p><strong>Base: ${formatCurrency(currentProduct.preco_base)}</strong></p>`;

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
    group.innerHTML = `<h4>Etapa ${currentStepIndex + 1} de ${sections.length}: ${secao.nome} ${secao.obrigatorio ? "(obrigatorio)" : ""}</h4>`;
    (secao.opcoes || []).forEach((opcao) => {
        const row = document.createElement("label");
        row.className = "option-row";
        const type = secao.tipo === "multiple" ? "checkbox" : "radio";
        const name = `secao_${secao.id}`;
        const selected = (currentSelection[secao.id] || []).some((item) => item.id === opcao.id);
        row.innerHTML = `<span>${opcao.nome} (${formatCurrency(opcao.preco_adicional)})</span><input ${selected ? "checked" : ""} type="${type}" name="${name}" value="${opcao.id}">`;
        const input = row.querySelector("input");
        input.addEventListener("change", () => {
            const selectedValues = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) =>
                secao.opcoes.find((item) => item.id === el.value)
            );
            currentSelection[secao.id] = selectedValues;
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
    primaryButton.textContent = currentStepIndex === sections.length - 1 ? "Confirmar" : "Proxima secao";
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
        alert(`Selecione ao menos ${min} opcao(oes) em ${secao.nome}`);
        return;
    }
    if (selected.length > max) {
        alert(`Selecione no maximo ${max} opcao(oes) em ${secao.nome}`);
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
        alert(error);
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
    const endereco = (document.getElementById("customerAddress").value || "").trim();
    if (!cep && !endereco) {
        alert("Informe CEP ou endereco para calcular frete");
        return;
    }
    isCalculatingDelivery = true;
    const hint = document.getElementById("freteHint");
    hint.textContent = "Calculando frete...";
    try {
        const response = await fetch(`/api/frete/calcular/${appData.pizzaria.slug}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cep, endereco })
        });
        const data = await response.json();
        if (!response.ok || data.status === "erro") {
            deliveryResult = null;
            hint.textContent = data.erro || "Nao foi possivel calcular frete para este endereco.";
            renderCart();
            return;
        }
        deliveryResult = { frete: Number(data.frete || 0), distanciaKm: Number(data.distancia_km || 0) };
        hint.textContent = `Frete calculado: ${formatCurrency(deliveryResult.frete)} | Distancia aprox.: ${deliveryResult.distanciaKm.toFixed(2)} km`;
        renderCart();
    } catch (_) {
        deliveryResult = null;
        hint.textContent = "Erro de conexao ao calcular frete.";
        renderCart();
    } finally {
        isCalculatingDelivery = false;
    }
}

function scheduleDeliveryCalculation() {
    clearTimeout(deliveryDebounce);
    deliveryDebounce = setTimeout(() => {
        const cep = (document.getElementById("customerCep").value || "").trim();
        const endereco = (document.getElementById("customerAddress").value || "").trim();
        if (cep || endereco) calculateDeliveryByAddress();
    }, 650);
}

function renderCart() {
    const floating = document.getElementById("floatingCart");
    const count = cart.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
    const subtotal = cart.reduce((sum, item) => sum + Number(item.total || 0) * Number(item.quantidade || 1), 0);
    document.getElementById("floatingCount").textContent = `${count} itens`;
    document.getElementById("floatingTotal").textContent = formatCurrency(subtotal);
    floating.classList.toggle("hidden", cart.length === 0);

    const container = document.getElementById("cartItems");
    container.innerHTML = "";
    cart.forEach((item) => {
        const div = document.createElement("div");
        div.className = "cart-item";
        const details = Object.values(item.selection || {})
            .flat()
            .map((x) => x.nome)
            .join(", ");
        const qty = Number(item.quantidade || 1);
        div.innerHTML = `<strong>${item.nome}</strong><p>${details || "Sem opcoes"} ${item.observacoes ? `| Obs: ${item.observacoes}` : ""}</p><p>${qty}x ${formatCurrency(item.total)} = <strong>${formatCurrency(item.total * qty)}</strong></p>`;
        const qtyWrap = document.createElement("div");
        qtyWrap.style.display = "flex";
        qtyWrap.style.gap = "6px";
        const minusBtn = document.createElement("button");
        minusBtn.className = "btn-neutral";
        minusBtn.textContent = "-";
        minusBtn.onclick = () => decreaseItemQty(item.id);
        const plusBtn = document.createElement("button");
        plusBtn.className = "btn-neutral";
        plusBtn.textContent = "+";
        plusBtn.onclick = () => increaseItemQty(item.id);
        qtyWrap.appendChild(minusBtn);
        qtyWrap.appendChild(plusBtn);
        div.appendChild(qtyWrap);
        const btn = document.createElement("button");
        btn.className = "btn-neutral";
        btn.textContent = "Remover";
        btn.onclick = () => removeCartItem(item.id);
        div.appendChild(btn);
        container.appendChild(div);
    });

    const frete = deliveryResult ? deliveryResult.frete : null;
    document.getElementById("subtotalValue").textContent = formatCurrency(subtotal);
    document.getElementById("deliveryValue").textContent = frete === null ? "Calcular frete" : formatCurrency(frete);
    document.getElementById("totalValue").textContent = frete === null ? "-" : formatCurrency(subtotal + frete);
}

function toggleCartDrawer(open) {
    document.getElementById("cartDrawer").classList.toggle("hidden", !open);
}

function clearCart(skipConfirm = false) {
    if (!skipConfirm && !confirm("Deseja apagar todo o carrinho?")) return;
    cart = [];
    deliveryResult = null;
    const hint = document.getElementById("freteHint");
    if (hint) hint.textContent = "Informe CEP e endereco para calcular o frete automaticamente.";
    persistCart();
    renderCart();
}

function checkoutWhatsapp() {
    if (!cart.length) return alert("Carrinho vazio");

    const nome = document.getElementById("customerName").value.trim();
    const telefone = document.getElementById("customerPhone").value.trim();
    const endereco = document.getElementById("customerAddress").value.trim();

    if (!nome || !telefone || !endereco) {
        return alert("Preencha nome, telefone e endereço");
    }

    const subtotal = cart.reduce((sum, item) => {
        return sum + Number(item.total || 0) * Number(item.quantidade || 1);
    }, 0);

    const frete = deliveryResult ? deliveryResult.frete : null;
    if (frete === null) return alert("Calcule o frete antes de finalizar");

    const total = subtotal + frete;

    let message = "";

    message += `*NOVO PEDIDO - ${appData.pizzaria.nome}*\n\n`;

    message += `━━━━━━━━━━━━━━━\n`;
    message += `*ITENS DO PEDIDO*\n\n`;

    cart.forEach((item, idx) => {
        const picked = Object.values(item.selection || {}).flat();
        const options = picked.length
            ? picked.map(x => x.nome).join(", ")
            : "Sem opções";

        message += `${idx + 1}. ${item.nome}\n`;
        message += `Opções: ${options}\n`;
        message += `Quantidade: ${item.quantidade || 1}x\n`;
        message += `Valor: ${formatCurrency((item.total || 0) * (item.quantidade || 1))}\n`;

        if (item.observacoes) {
            message += `Obs: ${item.observacoes}\n`;
        }

        message += `\n`;
    });

    message += `━━━━━━━━━━━━━━━\n`;
    message += `*RESUMO*\n\n`;
    message += `Subtotal: ${formatCurrency(subtotal)}\n`;
    message += `Frete: ${formatCurrency(frete)}\n`;
    message += `*Total: ${formatCurrency(total)}*\n\n`;

    message += `━━━━━━━━━━━━━━━\n`;
    message += `*CLIENTE*\n\n`;
    message += `Nome: ${nome}\n`;
    message += `Telefone: ${telefone}\n`;
    message += `Endereço: ${endereco}\n`;

    const complemento = document.getElementById("customerComplement").value.trim();
    if (complemento) {
        message += `Complemento: ${complemento}\n`;
    }

    const pagamento = document.getElementById("customerPayment").value;
    message += `\nPagamento: ${pagamento}\n`;

    const obsFinal = document.getElementById("customerObs").value.trim();
    if (obsFinal) {
        message += `\nObservação:\n${obsFinal}\n`;
    }

    // 🔥 AQUI É O PONTO CRÍTICO
    const encodedMessage = encodeURIComponent(message);

    const link = `https://wa.me/${appData.pizzaria.whatsapp}?text=${encodedMessage}`;

    window.open(link, "_blank");

    clearCart(true);
    toggleCartDrawer(false);
}

document.querySelectorAll(".categoria-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

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

window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.toggleCartDrawer = toggleCartDrawer;
window.handleWizardPrimary = handleWizardPrimary;
window.repeatLastConfig = repeatLastConfig;
window.checkoutWhatsapp = checkoutWhatsapp;
window.clearCart = clearCart;
window.cancelProductFlow = closeProductModal;
window.toggleStoreInfo = (open) => document.getElementById("storeInfoModal").classList.toggle("hidden", !open);
window.calculateDeliveryByAddress = calculateDeliveryByAddress;

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProductModal();
    toggleCartDrawer(false);
    window.toggleStoreInfo(false);
});

renderCart();
restoreCustomerData();
