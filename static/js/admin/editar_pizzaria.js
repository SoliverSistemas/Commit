const $ = (id) => document.getElementById(id);

const state = {
    categorias: [],
    produtos: [],
    modalConfig: null,
    autosaveTimer: null
};

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro de API");
    }
    if (response.status === 204) return null;
    return response.json();
}

function createButton(text, className, onClick) {
    const button = document.createElement("button");
    button.textContent = text;
    if (className) button.className = className;
    button.onclick = onClick;
    return button;
}

function rowTemplate(text, actions = []) {
    const row = document.createElement("div");
    row.className = "row";
    const title = document.createElement("span");
    title.textContent = text;
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";
    actions.forEach((item) => actionsWrap.appendChild(item));
    row.appendChild(title);
    row.appendChild(actionsWrap);
    return row;
}

function scheduleAutosave() {
    const status = $("saveStatus");
    if (status) status.textContent = "Salvando...";
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(async () => {
        try {
            await savePizzaria(false);
            if (status) status.textContent = "Salvo automaticamente";
        } catch (error) {
            if (status) status.textContent = "Erro ao salvar";
        }
    }, 700);
}

function openCrudModal(title, fields, onSave) {
    state.modalConfig = { fields, onSave };
    $("crudTitle").textContent = title;
    const fieldsRoot = $("crudFields");
    fieldsRoot.innerHTML = "";
    fields.forEach((field) => {
        const label = document.createElement("label");
        label.textContent = field.label;
        const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
        input.id = `crud_${field.id}`;
        input.value = field.value ?? "";
        input.type = field.type && field.type !== "textarea" ? field.type : "text";
        fieldsRoot.appendChild(label);
        fieldsRoot.appendChild(input);
    });
    $("crudModal").classList.remove("hidden");
}

function closeCrudModal() {
    $("crudModal").classList.add("hidden");
    state.modalConfig = null;
}

async function saveCrudModal() {
    if (!state.modalConfig) return;
    const payload = {};
    state.modalConfig.fields.forEach((field) => {
        payload[field.id] = $(`crud_${field.id}`).value;
    });
    await state.modalConfig.onSave(payload);
    closeCrudModal();
}

function applyThemePreview() {
    const preview = $("themePreview");
    if (!preview) return;
    const style = getComputedStyle(document.documentElement);
    const canvas = preview.querySelector(".preview-canvas");
    canvas.style.background = $("cor_fundo_principal").value || "#0b0f1a";
    canvas.style.color = $("cor_texto").value || "#e5e7eb";
    preview.querySelector(".preview-btn.primary").style.cssText = `background:${$("botao_primario_bg").value};color:${$("botao_primario_texto").value}`;
    preview.querySelector(".preview-btn.secondary").style.cssText = `background:${$("botao_secundario_bg").value};color:${$("botao_secundario_texto").value}`;
    preview.querySelector(".preview-btn.highlight").style.cssText = `background:${$("botao_destaque_bg").value};color:${$("botao_destaque_texto").value}`;
    preview.querySelector(".preview-btn.neutral").style.cssText = `background:${$("botao_neutro_bg").value};color:${$("botao_neutro_texto").value}`;
}

function refreshColorIndicators() {
    document.querySelectorAll('.color-input-wrap input[type="color"]').forEach((input) => {
        const valueEl = input.parentElement.querySelector(".color-value");
        if (!valueEl) return;
        valueEl.textContent = (input.value || "").toUpperCase();
        valueEl.style.borderColor = input.value;
        valueEl.style.boxShadow = `inset 0 0 0 1px ${input.value}33`;
    });
}

function isValidHexColor(value) {
    return /^#([0-9A-F]{6})$/i.test((value || "").trim());
}

function setupColorCodeInputs() {
    document.querySelectorAll('.color-input-wrap input[type="color"]').forEach((colorInput) => {
        if (colorInput.parentElement.querySelector(".color-code-input")) return;

        const codeInput = document.createElement("input");
        codeInput.type = "text";
        codeInput.className = "color-code-input";
        codeInput.maxLength = 7;
        codeInput.value = (colorInput.value || "").toUpperCase();
        colorInput.parentElement.appendChild(codeInput);

        colorInput.addEventListener("input", () => {
            codeInput.value = (colorInput.value || "").toUpperCase();
        });

        codeInput.addEventListener("input", () => {
            const typed = (codeInput.value || "").toUpperCase();
            if (typed.length === 7 && isValidHexColor(typed)) {
                colorInput.value = typed;
                colorInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
        });

        codeInput.addEventListener("blur", () => {
            if (!isValidHexColor(codeInput.value)) {
                codeInput.value = (colorInput.value || "").toUpperCase();
            }
        });
    });
}

async function loadCategorias() {
    state.categorias = await api(`/admin/api/categorias?pizzaria_id=${pizzaria.id}`);
    const list = $("listaCategorias");
    const select = $("produto_categoria");
    list.innerHTML = "";
    select.innerHTML = "";
    state.categorias.forEach((categoria) => {
        const option = document.createElement("option");
        option.value = categoria.id;
        option.textContent = categoria.nome;
        select.appendChild(option);

        const editBtn = createButton("Editar", "", () => openCrudModal("Editar categoria", [
            { id: "nome", label: "Nome", value: categoria.nome },
            { id: "icone", label: "Icone", value: categoria.icone || "" },
            { id: "button_variant", label: "Variant (primario/secundario/destaque/neutro)", value: categoria.button_variant }
        ], async (payload) => {
            await api(`/admin/api/categorias/${categoria.id}`, { method: "PUT", body: JSON.stringify(payload) });
            await loadCategorias();
        }));
        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm("Excluir categoria?")) return;
            await api(`/admin/api/categorias/${categoria.id}`, { method: "DELETE" });
            await loadCategorias();
            await loadProdutos();
        });
        const row = rowTemplate(`${categoria.icone || ""} ${categoria.nome} (${categoria.button_variant})`, [editBtn, removeBtn]);
        row.dataset.id = categoria.id;
        list.appendChild(row);
    });
    if (window.Sortable) {
        new Sortable(list, {
            animation: 150,
            onEnd: async () => {
                const items = Array.from(list.querySelectorAll(".row")).map((row, index) => ({ id: row.dataset.id, sort_order: index }));
                await api("/admin/api/reorder", { method: "POST", body: JSON.stringify({ entity: "categorias", items }) });
                await loadCategorias();
            }
        });
    }
}

async function loadOpcoes(secaoId, target) {
    const opcoes = await api(`/admin/api/opcoes?secao_id=${secaoId}`);
    opcoes.forEach((opcao) => {
        const editBtn = createButton("Editar", "", () => openCrudModal("Editar opcao", [
            { id: "nome", label: "Nome", value: opcao.nome },
            { id: "preco_adicional", label: "Preco adicional", value: opcao.preco_adicional, type: "number" }
        ], async (payload) => {
            payload.preco_adicional = Number(payload.preco_adicional || 0);
            await api(`/admin/api/opcoes/${opcao.id}`, { method: "PUT", body: JSON.stringify(payload) });
            await loadProdutos();
        }));
        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm("Excluir opcao?")) return;
            await api(`/admin/api/opcoes/${opcao.id}`, { method: "DELETE" });
            await loadProdutos();
        });
        const row = rowTemplate(`Opcao: ${opcao.nome} (+R$ ${Number(opcao.preco_adicional).toFixed(2)})`, [editBtn, removeBtn]);
        row.dataset.id = opcao.id;
        row.dataset.entity = "opcoes";
        target.appendChild(row);
    });
}

async function loadSecoes(produtoId, target) {
    const secoes = await api(`/admin/api/secoes?produto_id=${produtoId}`);
    for (const secao of secoes) {
        const addOptionBtn = createButton("+ Opcao", "", async () => {
            openCrudModal("Nova opcao", [
                { id: "nome", label: "Nome", value: "" },
                { id: "preco_adicional", label: "Preco adicional", value: 0, type: "number" }
            ], async (payload) => {
                payload.secao_id = secao.id;
                payload.preco_adicional = Number(payload.preco_adicional || 0);
                await api("/admin/api/opcoes", { method: "POST", body: JSON.stringify(payload) });
                await loadProdutos();
            });
        });
        const editBtn = createButton("Editar", "", () => openCrudModal("Editar secao", [
            { id: "nome", label: "Nome", value: secao.nome },
            { id: "tipo", label: "Tipo (single/multiple)", value: secao.tipo },
            { id: "obrigatorio", label: "Obrigatorio (true/false)", value: String(secao.obrigatorio) },
            { id: "min_selecao", label: "Min selecao", value: secao.min_selecao, type: "number" },
            { id: "max_selecao", label: "Max selecao", value: secao.max_selecao, type: "number" }
        ], async (payload) => {
            payload.obrigatorio = String(payload.obrigatorio).toLowerCase() === "true";
            payload.min_selecao = Number(payload.min_selecao || 0);
            payload.max_selecao = Number(payload.max_selecao || 1);
            await api(`/admin/api/secoes/${secao.id}`, { method: "PUT", body: JSON.stringify(payload) });
            await loadProdutos();
        }));
        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm("Excluir secao?")) return;
            await api(`/admin/api/secoes/${secao.id}`, { method: "DELETE" });
            await loadProdutos();
        });

        const row = rowTemplate(`Secao: ${secao.nome} (${secao.tipo}) min:${secao.min_selecao} max:${secao.max_selecao}`, [addOptionBtn, editBtn, removeBtn]);
        row.dataset.id = secao.id;
        row.dataset.entity = "secoes";
        target.appendChild(row);
        await loadOpcoes(secao.id, target);
    }
}

async function loadProdutos() {
    state.produtos = await api(`/admin/api/produtos?pizzaria_id=${pizzaria.id}`);
    const list = $("listaProdutos");
    list.innerHTML = "";
    for (const produto of state.produtos) {
        const addSectionBtn = createButton("+ Secao", "", () => openCrudModal("Nova secao", [
            { id: "nome", label: "Nome", value: "" },
            { id: "tipo", label: "Tipo (single/multiple)", value: "single" },
            { id: "obrigatorio", label: "Obrigatorio (true/false)", value: "true" },
            { id: "min_selecao", label: "Min selecao", value: 1, type: "number" },
            { id: "max_selecao", label: "Max selecao", value: 1, type: "number" }
        ], async (payload) => {
            payload.produto_id = produto.id;
            payload.obrigatorio = String(payload.obrigatorio).toLowerCase() === "true";
            payload.min_selecao = Number(payload.min_selecao || 0);
            payload.max_selecao = Number(payload.max_selecao || 1);
            await api("/admin/api/secoes", { method: "POST", body: JSON.stringify(payload) });
            await loadProdutos();
        }));
        const editBtn = createButton("Editar", "", () => openCrudModal("Editar produto", [
            { id: "nome", label: "Nome", value: produto.nome },
            { id: "descricao", label: "Descricao", value: produto.descricao || "", type: "textarea" },
            { id: "imagem_url", label: "Imagem URL", value: produto.imagem_url || "" },
            { id: "preco_base", label: "Preco base", value: produto.preco_base, type: "number" }
        ], async (payload) => {
            payload.preco_base = Number(payload.preco_base || 0);
            await api(`/admin/api/produtos/${produto.id}`, { method: "PUT", body: JSON.stringify(payload) });
            await loadProdutos();
        }));
        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm("Excluir produto?")) return;
            await api(`/admin/api/produtos/${produto.id}`, { method: "DELETE" });
            await loadProdutos();
        });
        const row = rowTemplate(`${produto.nome} - R$ ${Number(produto.preco_base).toFixed(2)}`, [addSectionBtn, editBtn, removeBtn]);
        row.dataset.id = produto.id;
        list.appendChild(row);
        await loadSecoes(produto.id, list);
    }
    if (window.Sortable) {
        new Sortable(list, {
            animation: 150,
            filter: '[data-entity="secoes"], [data-entity="opcoes"]',
            onEnd: async () => {
                const items = Array.from(list.querySelectorAll('.row[data-id]:not([data-entity])')).map((row, index) => ({ id: row.dataset.id, sort_order: index }));
                await api("/admin/api/reorder", { method: "POST", body: JSON.stringify({ entity: "produtos", items }) });
                await loadProdutos();
            }
        });
    }
}

async function loadFrete() {
    const regras = await api(`/admin/api/frete-regras?pizzaria_id=${pizzaria.id}`);
    const list = $("listaFrete");
    list.innerHTML = "";
    regras.forEach((regra) => {
        const editBtn = createButton("Editar", "", () => openCrudModal("Editar frete", [
            { id: "distancia_km_min", label: "Km min", value: regra.distancia_km_min, type: "number" },
            { id: "distancia_km_max", label: "Km max", value: regra.distancia_km_max, type: "number" },
            { id: "valor", label: "Valor", value: regra.valor, type: "number" }
        ], async (payload) => {
            payload.distancia_km_min = Number(payload.distancia_km_min || 0);
            payload.distancia_km_max = Number(payload.distancia_km_max || 0);
            payload.valor = Number(payload.valor || 0);
            await api(`/admin/api/frete-regras/${regra.id}`, { method: "PUT", body: JSON.stringify(payload) });
            await loadFrete();
        }));
        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm("Excluir regra de frete?")) return;
            await api(`/admin/api/frete-regras/${regra.id}`, { method: "DELETE" });
            await loadFrete();
        });
        const row = rowTemplate(`${regra.distancia_km_min}km a ${regra.distancia_km_max}km = R$ ${Number(regra.valor).toFixed(2)}`, [editBtn, removeBtn]);
        row.dataset.id = regra.id;
        list.appendChild(row);
    });
    if (window.Sortable) {
        new Sortable(list, {
            animation: 150,
            onEnd: async () => {
                const items = Array.from(list.querySelectorAll(".row")).map((row, index) => ({ id: row.dataset.id, sort_order: index }));
                await api("/admin/api/reorder", { method: "POST", body: JSON.stringify({ entity: "frete", items }) });
                await loadFrete();
            }
        });
    }
}

async function savePizzaria(showAlert = true) {
    const payload = {
        nome: $("nome").value,
        slug: $("slug").value,
        whatsapp: $("whatsapp").value,
        cep: $("cep").value,
        latitude: $("latitude").value === "" ? null : Number($("latitude").value),
        longitude: $("longitude").value === "" ? null : Number($("longitude").value),
        endereco: $("endereco").value,
        logo_url: $("logo_url").value,
        banner_url: $("banner_url").value,
        horario_abertura: $("horario_abertura").value,
        horario_fechamento: $("horario_fechamento").value,
        status_override: $("status_override").value,
        tempo_entrega_min: Number($("tempo_entrega_min").value || 30),
        tempo_entrega_max: Number($("tempo_entrega_max").value || 50),
        cor_fundo_principal: $("cor_fundo_principal").value,
        cor_fundo_secundario: $("cor_fundo_secundario").value,
        cor_titulos: $("cor_titulos").value,
        cor_texto: $("cor_texto").value,
        cor_texto_secundario: $("cor_texto_secundario").value,
        botao_primario_bg: $("botao_primario_bg").value,
        botao_primario_texto: $("botao_primario_texto").value,
        botao_primario_hover: $("botao_primario_hover").value,
        botao_secundario_bg: $("botao_secundario_bg").value,
        botao_secundario_texto: $("botao_secundario_texto").value,
        botao_secundario_hover: $("botao_secundario_hover").value,
        botao_destaque_bg: $("botao_destaque_bg").value,
        botao_destaque_texto: $("botao_destaque_texto").value,
        botao_destaque_hover: $("botao_destaque_hover").value,
        botao_neutro_bg: $("botao_neutro_bg").value,
        botao_neutro_texto: $("botao_neutro_texto").value,
        botao_neutro_hover: $("botao_neutro_hover").value,
        texto_botao_mais: $("texto_botao_mais").value,
        texto_botao_finalizar: $("texto_botao_finalizar").value,
        texto_botao_cancelar: $("texto_botao_cancelar").value,
        texto_botao_ver_mais: $("texto_botao_ver_mais").value
    };
    await api(`/admin/api/pizzarias/${pizzaria.id}`, { method: "PUT", body: JSON.stringify(payload) });
    if (showAlert) alert("Configuracoes salvas");
}

document.addEventListener("DOMContentLoaded", async () => {
    $("btnSalvar").addEventListener("click", savePizzaria);
    $("crudCancel").addEventListener("click", closeCrudModal);
    $("crudSave").addEventListener("click", saveCrudModal);

    $("refreshPreview").addEventListener("click", () => {
        const frame = $("storePreviewFrame");
        frame.src = `/${$("slug").value || pizzaria.slug}?v=${Date.now()}`;
    });

    $("geocodeStoreButton").addEventListener("click", async () => {
        const payload = {
            cep: $("cep").value,
            endereco: $("endereco").value
        };
        const status = $("saveStatus");
        if (status) status.textContent = "Buscando geolocalizacao...";
        try {
            const result = await api("/admin/api/geocode", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            $("latitude").value = result.latitude ?? "";
            $("longitude").value = result.longitude ?? "";
            if (status) status.textContent = "Lat/Lng atualizados";
            scheduleAutosave();
        } catch (error) {
            if (status) status.textContent = "Nao foi possivel geocodificar";
            alert("Nao foi possivel geocodificar endereco/CEP");
        }
    });

    $("cep").addEventListener("blur", async () => {
        const cepDigits = String($("cep").value || "").replace(/\D/g, "").slice(0, 8);
        if (cepDigits.length !== 8) return;
        const status = $("saveStatus");
        if (status) status.textContent = "Buscando CEP...";
        try {
            const response = await api(`/admin/api/cep/${cepDigits}`);
            const data = response.cep || {};
            const suggested = [data.logradouro, data.bairro, data.cidade, data.estado].filter(Boolean).join(", ");
            if (suggested && !$("endereco").value.trim()) {
                $("endereco").value = suggested;
                scheduleAutosave();
            }
            if (status) status.textContent = `CEP localizado: ${data.cidade || ""}/${data.estado || ""}`;
        } catch (_) {
            if (status) status.textContent = "CEP nao encontrado";
        }
    });

    [
        "nome", "slug", "whatsapp", "cep", "latitude", "longitude", "endereco", "logo_url", "banner_url", "horario_abertura", "horario_fechamento",
        "status_override", "tempo_entrega_min", "tempo_entrega_max", "cor_fundo_principal", "cor_fundo_secundario",
        "cor_titulos", "cor_texto", "cor_texto_secundario", "botao_primario_bg", "botao_primario_texto",
        "botao_primario_hover", "botao_secundario_bg", "botao_secundario_texto", "botao_secundario_hover",
        "botao_destaque_bg", "botao_destaque_texto", "botao_destaque_hover", "botao_neutro_bg", "botao_neutro_texto",
        "botao_neutro_hover", "texto_botao_mais", "texto_botao_finalizar", "texto_botao_cancelar", "texto_botao_ver_mais"
    ].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener("input", scheduleAutosave);
    });

    [
        "cor_fundo_principal", "cor_fundo_secundario", "cor_titulos", "cor_texto", "cor_texto_secundario",
        "botao_primario_bg", "botao_primario_texto", "botao_secundario_bg", "botao_secundario_texto",
        "botao_destaque_bg", "botao_destaque_texto", "botao_neutro_bg", "botao_neutro_texto"
    ].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener("input", () => {
            applyThemePreview();
            refreshColorIndicators();
        });
    });
    applyThemePreview();
    setupColorCodeInputs();
    refreshColorIndicators();

    $("addCategoria").addEventListener("click", async () => {
        const payload = {
            pizzaria_id: pizzaria.id,
            nome: $("categoria_nome").value,
            icone: $("categoria_icone").value,
            button_variant: $("categoria_variant").value
        };
        await api("/admin/api/categorias", { method: "POST", body: JSON.stringify(payload) });
        $("categoria_nome").value = "";
        $("categoria_icone").value = "";
        await loadCategorias();
    });

    $("addProduto").addEventListener("click", async () => {
        const payload = {
            pizzaria_id: pizzaria.id,
            categoria_id: $("produto_categoria").value,
            nome: $("produto_nome").value,
            preco_base: Number($("produto_preco").value || 0),
            descricao: $("produto_descricao").value,
            imagem_url: $("produto_imagem").value
        };
        await api("/admin/api/produtos", { method: "POST", body: JSON.stringify(payload) });
        $("produto_nome").value = "";
        $("produto_preco").value = "";
        $("produto_descricao").value = "";
        $("produto_imagem").value = "";
        await loadProdutos();
    });

    $("addFrete").addEventListener("click", async () => {
        const payload = {
            pizzaria_id: pizzaria.id,
            distancia_km_min: Number($("frete_min").value || 0),
            distancia_km_max: Number($("frete_max").value || 0),
            valor: Number($("frete_valor").value || 0)
        };
        await api("/admin/api/frete-regras", { method: "POST", body: JSON.stringify(payload) });
        $("frete_min").value = "";
        $("frete_max").value = "";
        $("frete_valor").value = "";
        await loadFrete();
    });

    await loadCategorias();
    await loadProdutos();
    await loadFrete();
});
