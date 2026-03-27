const $ = (id) => document.getElementById(id);

const state = {
    categorias: [],
    produtos: [],
    modalConfig: null,
    autosaveTimer: null,
    cupons: [],
    categoriaCombos: [],
    subcategoriaCombos: [],
    sugestaoConfig: []
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
    const response = await api(`/admin/api/categorias?pizzaria_id=${pizzaria.id}`);

    // Achatar a estrutura: categorias principais + subcategorias
    state.categorias = [];

    response.forEach(categoria => {
        // Adicionar categoria principal
        state.categorias.push({
            ...categoria,
            parent_id: null // Garantir que não tenha parent_id
        });

        // Adicionar subcategorias
        if (categoria.subcategorias && categoria.subcategorias.length > 0) {
            categoria.subcategorias.forEach(sub => {
                state.categorias.push({
                    ...sub,
                    parent_id: categoria.id // Garantir parent_id correto
                });
            });
        }
    });

    console.log("Categorias carregadas (achatadas):", state.categorias); // Debug
    renderCategorias();
}

async function renderCategorias() {
    const container = $("listaCategorias");
    container.innerHTML = "";

    // Separar categorias principais e subcategorias
    const mainCategories = state.categorias.filter(c => !c.parent_id);

    mainCategories.forEach(category => {
        // Renderizar categoria principal
        const editBtn = createButton("Editar", "", () => {
            openCrudModal("Editar Categoria", [
                { id: "nome", label: "Nome", value: category.nome },
                { id: "icone", label: "Ícone", value: category.icone },
                { id: "button_variant", label: "Variante", value: category.button_variant }
            ], async (data) => {
                await api(`/admin/api/categorias/${category.id}`, {
                    method: "PUT",
                    body: JSON.stringify(data)
                });
                await loadCategorias();
                await updateCategoriaSelects();
            });
        });

        const removeBtn = createButton("Excluir", "ghost", async () => {
            if (!confirm(`Excluir categoria "${category.nome}"?`)) return;
            await api(`/admin/api/categorias/${category.id}`, { method: "DELETE" });
            await loadCategorias();
            await updateCategoriaSelects();
        });

        const categoryItem = rowTemplate(`${category.icone} ${category.nome}`, [editBtn, removeBtn]);
        categoryItem.className += " category-item";
        categoryItem.dataset.id = category.id;
        container.appendChild(categoryItem);

        // Renderizar subcategorias
        const subcategories = state.categorias.filter(c => c.parent_id === category.id);
        subcategories.forEach(subcategory => {
            const subEditBtn = createButton("Editar", "", () => {
                openCrudModal("Editar Subcategoria", [
                    { id: "nome", label: "Nome", value: subcategory.nome },
                    { id: "icone", label: "Ícone", value: subcategory.icone },
                    { id: "button_variant", label: "Variante", value: subcategory.button_variant }
                ], async (data) => {
                    await api(`/admin/api/categorias/${subcategory.id}`, {
                        method: "PUT",
                        body: JSON.stringify(data)
                    });
                    await loadCategorias();
                    await updateCategoriaSelects();
                });
            });

            const subRemoveBtn = createButton("Excluir", "ghost", async () => {
                if (!confirm(`Excluir subcategoria "${subcategory.nome}"?`)) return;
                await api(`/admin/api/categorias/${subcategory.id}`, { method: "DELETE" });
                await loadCategorias();
                await updateCategoriaSelects();
            });

            const subItem = rowTemplate(`└── ${subcategory.icone} ${subcategory.nome}`, [subEditBtn, subRemoveBtn]);
            subItem.className += " subcategory-item";
            subItem.dataset.id = subcategory.id;
            container.appendChild(subItem);
        });
    });

    new Sortable(container, {
        animation: 150,
        handle: ".sort-handle",
        onEnd: async (evt) => {
            const items = Array.from(container.children);
            const updates = items.map((el, idx) => ({
                id: el.dataset.id,
                sort_order: idx
            }));
            await api("/admin/api/reorder", {
                method: "POST",
                body: JSON.stringify({ entity: "categorias", items: updates })
            });
            await loadCategorias();
        }
    });
}

async function updateComboSelects() {
    console.log("Atualizando selects de combos..."); // Debug
    console.log("Categorias disponíveis:", state.categorias); // Debug

    const mainCategories = state.categorias.filter(c => !c.parent_id);
    const allSubcategories = state.categorias.filter(c => c.parent_id);

    console.log("Categorias principais:", mainCategories); // Debug
    console.log("Subcategorias:", allSubcategories); // Debug

    // Update sugestao categoria select
    const sugestaoSelect = $("sugestao_categoria");
    if (sugestaoSelect) {
        sugestaoSelect.innerHTML = '<option value="">Selecione uma categoria</option>';
        mainCategories.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat.id;
            option.textContent = `${cat.icone} ${cat.nome}`;
            sugestaoSelect.appendChild(option);
        });
        console.log("Select de sugestão atualizado:", sugestaoSelect.innerHTML); // Debug
    } else {
        console.log("Select de sugestão não encontrado"); // Debug
    }

    // Update combo categoria selects
    const origemSelect = $("combo_categoria_origem");
    const destinoSelect = $("combo_categoria_destino");
    if (origemSelect && destinoSelect) {
        const optionsHTML = '<option value="">Selecione uma categoria</option>' +
            mainCategories.map(cat => `<option value="${cat.id}">${cat.icone} ${cat.nome}</option>`).join('');

        origemSelect.innerHTML = optionsHTML;
        destinoSelect.innerHTML = optionsHTML;
        console.log("Selects de combo categoria atualizados"); // Debug
    } else {
        console.log("Selects de combo categoria não encontrados"); // Debug
    }

    // Update combo subcategoria selects
    const subOrigemSelect = $("combo_subcategoria_origem");
    const subDestinoSelect = $("combo_subcategoria_destino");
    if (subOrigemSelect && subDestinoSelect) {
        const optionsHTML = '<option value="">Selecione uma subcategoria</option>' +
            allSubcategories.map(cat => `<option value="${cat.id}">${cat.icone} ${cat.nome}</option>`).join('');

        subOrigemSelect.innerHTML = optionsHTML;
        subDestinoSelect.innerHTML = optionsHTML;
        console.log("Selects de combo subcategoria atualizados"); // Debug
    } else {
        console.log("Selects de combo subcategoria não encontrados"); // Debug
    }
}

async function updateCategoriaSelects() {
    const mainCategories = state.categorias.filter(c => !c.parent_id);

    // Atualizar select de subcategorias (parent)
    const parentSelect = $("subcategoria_parent");
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">Selecione uma categoria principal</option>';
        mainCategories.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat.id;
            option.textContent = `${cat.icone} ${cat.nome}`;
            parentSelect.appendChild(option);
        });
    }

    // Atualizar select de produtos (categoria)
    const categoriaSelect = $("produto_categoria");
    if (categoriaSelect) {
        categoriaSelect.innerHTML = '<option value="">Selecione uma categoria</option>';
        mainCategories.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat.id;
            option.textContent = `${cat.icone} ${cat.nome}`;
            categoriaSelect.appendChild(option);
        });
    }

    await updateSubcategoriaSelects();
    await updateProdutoSubcategoriaSelects();
    await updateComboSelects(); // Adicionado para popular os selects de combos
}

async function updateSubcategoriaSelects() {
    // Para subcategorias, não precisamos atualizar nada adicional
    // pois só mostramos as categorias principais como parent
}

async function updateProdutoSubcategoriaSelects() {
    const categoriaId = $("produto_categoria").value;
    const subcategoriaSelect = $("produto_subcategoria");

    console.log("Atualizando subcategorias de produtos..."); // Debug
    console.log("Categoria ID selecionada:", categoriaId); // Debug
    console.log("Todas as categorias:", state.categorias); // Debug

    if (!subcategoriaSelect) {
        console.log("Select de subcategorias não encontrado"); // Debug
        return;
    }

    subcategoriaSelect.innerHTML = '<option value="">Selecione uma subcategoria (opcional)</option>';

    if (categoriaId) {
        const subcategories = state.categorias.filter(c => c.parent_id === categoriaId);
        console.log("Subcategorias encontradas:", subcategories); // Debug

        subcategories.forEach(sub => {
            const option = document.createElement("option");
            option.value = sub.id;
            option.textContent = `${sub.icone} ${sub.nome}`;
            subcategoriaSelect.appendChild(option);
        });

        console.log("Options adicionadas:", subcategoriaSelect.innerHTML); // Debug
    } else {
        console.log("Nenhuma categoria selecionada"); // Debug
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

    // Container para agrupar seções
    const secoesContainer = document.createElement("div");
    secoesContainer.className = "secoes-container";

    for (const secao of secoes) {
        // Criar grupo da seção
        const secaoGroup = document.createElement("div");
        secaoGroup.className = "secao-group";

        // Header da seção
        const secaoHeader = document.createElement("div");
        secaoHeader.className = "secao-header";
        secaoHeader.innerHTML = `
            <span class="secao-titulo">📋 ${secao.nome} (${secao.tipo})</span>
            <span class="secao-detalhes">min:${secao.min_selecao} max:${secao.max_selecao}</span>
        `;

        // Ações da seção
        const secaoActions = document.createElement("div");
        secaoActions.className = "secao-actions";

        const addOptionBtn = createButton("+ Opção", "", async () => {
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
            if (!confirm("Excluir seção e todas as opções?")) return;
            await api(`/admin/api/secoes/${secao.id}`, { method: "DELETE" });
            await loadProdutos();
        });

        secaoActions.appendChild(addOptionBtn);
        secaoActions.appendChild(editBtn);
        secaoActions.appendChild(removeBtn);

        secaoHeader.appendChild(secaoActions);
        secaoGroup.appendChild(secaoHeader);

        // Container para opções
        const opcoesContainer = document.createElement("div");
        opcoesContainer.className = "opcoes-container";

        // Carregar opções
        await loadOpcoes(secao.id, opcoesContainer);

        // Adicionar contador de opções
        const opcoesCount = opcoesContainer.querySelectorAll('.row[data-entity="opcoes"]').length;
        const countBadge = document.createElement("span");
        countBadge.className = "item-count";
        countBadge.textContent = `${opcoesCount} opção${opcoesCount !== 1 ? 's' : ''}`;
        secaoHeader.appendChild(countBadge);

        secaoGroup.appendChild(opcoesContainer);
        secoesContainer.appendChild(secaoGroup);
    }

    target.appendChild(secoesContainer);
}

async function loadProdutos() {
    state.produtos = await api(`/admin/api/produtos?pizzaria_id=${pizzaria.id}`);
    const list = $("listaProdutos");
    list.innerHTML = "";

    for (const produto of state.produtos) {
        // Criar container agrupado para cada produto
        const produtoGroup = document.createElement("div");
        produtoGroup.className = "produto-group";
        produtoGroup.dataset.id = produto.id;

        // Header do produto
        const header = document.createElement("div");
        header.className = "produto-header";

        const headerInfo = document.createElement("div");
        headerInfo.innerHTML = `
            <span class="produto-nome">${produto.nome}</span>
            <span class="produto-preco">R$ ${Number(produto.preco_base).toFixed(2)}</span>
        `;

        const headerActions = document.createElement("div");
        headerActions.className = "header-actions";

        // Contador de seções
        const secoesCount = document.createElement("span");
        secoesCount.className = "item-count";
        secoesCount.textContent = "0 seções";
        headerActions.appendChild(secoesCount);

        // Botões de ação do produto
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
            if (!confirm("Excluir produto e todas suas seções/opções?")) return;
            await api(`/admin/api/produtos/${produto.id}`, { method: "DELETE" });
            await loadProdutos();
        });

        headerActions.appendChild(editBtn);
        headerActions.appendChild(removeBtn);

        header.appendChild(headerInfo);
        header.appendChild(headerActions);

        // Content para seções e opções
        const content = document.createElement("div");
        content.className = "produto-content";

        const addSectionBtn = createButton("+ Adicionar Seção", "", () => openCrudModal("Nova secao", [
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

        content.appendChild(addSectionBtn);

        // Carregar seções e opções
        await loadSecoes(produto.id, content);

        // Atualizar contador de seções
        const secoesElements = content.querySelectorAll('.row[data-entity="secoes"]');
        secoesCount.textContent = `${secoesElements.length} seção${secoesElements.length !== 1 ? 's' : ''}`;

        // Montar o grupo
        produtoGroup.appendChild(header);
        produtoGroup.appendChild(content);
        list.appendChild(produtoGroup);
    }

    // Configurar drag & drop apenas para os produtos (não para seções/opções)
    if (window.Sortable) {
        new Sortable(list, {
            animation: 150,
            handle: ".produto-header",
            filter: '.produto-content',
            onEnd: async () => {
                const items = Array.from(list.querySelectorAll('.produto-group')).map((group, index) => ({
                    id: group.dataset.id,
                    sort_order: index
                }));
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
    // Salvar dados principais (sem cupons)
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
        cor_surface: $("cor_surface").value,
        // cupons removido - salvo separadamente
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
        texto_botao_ver_mais: $("texto_botao_ver_mais").value,
        sobre: $("sobre").value
    };

    try {
        // Salvar dados principais
        await api(`/admin/api/pizzarias/${pizzaria.id}`, { method: "PUT", body: JSON.stringify(payload) });

        // Salvar cupons via endpoint separado
        if (state.cupons && state.cupons.length > 0) {
            try {
                await api(`/admin/api/pizzarias/${pizzaria.id}/cupons`, {
                    method: "PUT",
                    body: JSON.stringify({ cupons: state.cupons })
                });
            } catch (cupomError) {
                console.warn("Erro ao salvar cupons:", cupomError);
                // Não falhar todo o salvamento se cupons falharem
            }
        }

        if (showAlert) alert("Configuracoes salvas");
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar configuracoes");
        throw error;
    }
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
        "botao_neutro_hover", "texto_botao_mais", "texto_botao_finalizar", "texto_botao_cancelar", "texto_botao_ver_mais", "sobre"
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
            parent_id: null, // Categoria principal
            nome: $("categoria_nome").value,
            icone: $("categoria_icone").value,
            button_variant: $("categoria_variant").value,
            tipo: "principal"  // Corrigido de "categoria" para "principal"
        };
        console.log("Enviando categoria principal:", payload); // Debug
        await api("/admin/api/categorias", { method: "POST", body: JSON.stringify(payload) });
        $("categoria_nome").value = "";
        $("categoria_icone").value = "";
        await loadCategorias();
        await updateCategoriaSelects();
    });

    // Adicionar subcategoria
    $("addSubcategoria").addEventListener("click", async () => {
        console.log("Botão adicionar subcategoria clicado"); // Debug

        const parentId = $("subcategoria_parent").value;
        console.log("Parent ID selecionado:", parentId); // Debug

        if (!parentId) {
            alert("Selecione uma categoria principal");
            return;
        }

        const nome = $("subcategoria_nome").value;
        const icone = $("subcategoria_icone").value;
        const variant = $("subcategoria_variant").value;

        console.log("Valores do formulário:", { nome, icone, variant }); // Debug

        if (!nome.trim()) {
            alert("Digite o nome da subcategoria");
            return;
        }

        const payload = {
            pizzaria_id: pizzaria.id,
            parent_id: parentId,
            nome: nome.trim(),
            icone: icone.trim(),
            button_variant: variant,
            tipo: "subcategoria",
            sort_order: 0
        };

        console.log("Enviando subcategoria:", payload); // Debug

        try {
            const response = await api("/admin/api/categorias", { method: "POST", body: JSON.stringify(payload) });
            console.log("Resposta do servidor:", response); // Debug

            // Limpar campos
            $("subcategoria_nome").value = "";
            $("subcategoria_icone").value = "";
            $("subcategoria_variant").value = "primary";

            // Recarregar listas
            console.log("Recarregando categorias..."); // Debug
            await loadCategorias();
            console.log("Categorias recarregadas"); // Debug

            await updateCategoriaSelects();
            console.log("Selects atualizados"); // Debug

            alert("Subcategoria adicionada com sucesso!");
        } catch (error) {
            console.error("Erro ao adicionar subcategoria:", error);
            alert("Erro ao adicionar subcategoria: " + error.message);
        }
    });

    // Atualizar subcategorias quando categoria mudar
    $("subcategoria_parent").addEventListener("change", async () => {
        await updateSubcategoriaSelects();
    });

    $("addProduto").addEventListener("click", async () => {
        const payload = {
            pizzaria_id: pizzaria.id,
            categoria_id: $("produto_categoria").value,
            subcategoria_id: $("produto_subcategoria").value || null,
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

    // Atualizar subcategorias de produtos quando categoria mudar
    $("produto_categoria").addEventListener("change", async () => {
        await updateProdutoSubcategoriaSelects();
    });

    // Event listeners para combos
    $("addSugestaoConfig").addEventListener("click", async () => {
        const categoriaId = $("sugestao_categoria").value;
        if (!categoriaId) {
            alert("Selecione uma categoria");
            return;
        }

        const payload = {
            pizzaria_id: pizzaria.id,
            categoria_id: categoriaId,
            ativo: true
        };

        await api("/admin/api/sugestao-config", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        $("sugestao_categoria").value = "";
        await loadSugestaoConfig();
    });

    $("addCategoriaCombo").addEventListener("click", async () => {
        const origemId = $("combo_categoria_origem").value;
        const destinoId = $("combo_categoria_destino").value;

        if (!origemId || !destinoId) {
            alert("Selecione ambas as categorias");
            return;
        }

        if (origemId === destinoId) {
            alert("Uma categoria não pode combinar com ela mesma");
            return;
        }

        const payload = {
            pizzaria_id: pizzaria.id,
            categoria_origem_id: origemId,
            categoria_destino_id: destinoId
        };

        await api("/admin/api/categoria-combos", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        $("combo_categoria_origem").value = "";
        $("combo_categoria_destino").value = "";
        await loadCategoriaCombos();
    });

    $("addSubcategoriaCombo").addEventListener("click", async () => {
        const origemId = $("combo_subcategoria_origem").value;
        const destinoId = $("combo_subcategoria_destino").value;

        if (!origemId || !destinoId) {
            alert("Selecione ambas as subcategorias");
            return;
        }

        if (origemId === destinoId) {
            alert("Uma subcategoria não pode combinar com ela mesma");
            return;
        }

        const payload = {
            pizzaria_id: pizzaria.id,
            subcategoria_origem_id: origemId,
            subcategoria_destino_id: destinoId
        };

        await api("/admin/api/subcategoria-combos", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        $("combo_subcategoria_origem").value = "";
        $("combo_subcategoria_destino").value = "";
        await loadSubcategoriaCombos();
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

    // Cupons functionality
    state.cupons = pizzaria.cupons || [];
    renderCupons();
    renderCuponsVisiveis();

    $("addCupom").addEventListener("click", () => {
        const codigo = $("cupom_codigo").value.trim().toUpperCase();
        const valor = Number($("cupom_valor").value || 0);
        const tipo = $("cupom_tipo").value;

        if (!codigo || valor <= 0) {
            alert("Digite um código válido e valor maior que zero");
            return;
        }

        // Check if coupon already exists
        const exists = state.cupons.find(c => c.codigo === codigo);
        if (exists) {
            alert("Cupom já existe!");
            return;
        }

        state.cupons.push({ codigo, valor, tipo, oculto: false });
        $("cupom_codigo").value = "";
        $("cupom_valor").value = "";
        renderCupons();
        renderCuponsVisiveis();
        scheduleAutosave();
    });

    function renderCupons() {
        const list = $("listaCupons");
        list.innerHTML = "";

        state.cupons.forEach((cupom, index) => {
            const tipoLabel = cupom.tipo === 'percent' ? '%' : 'R$';
            const valorDisplay = cupom.tipo === 'percent' ? `${cupom.valor}%` : `R$ ${cupom.valor.toFixed(2)}`;

            // Checkbox para ocultar/desocultar
            const ocultoLabel = document.createElement("label");
            ocultoLabel.style = "display:flex;align-items:center;gap:4px;cursor:pointer;";
            const ocultoCheckbox = document.createElement("input");
            ocultoCheckbox.type = "checkbox";
            ocultoCheckbox.checked = cupom.oculto || false;
            ocultoCheckbox.addEventListener("change", () => {
                state.cupons[index].oculto = ocultoCheckbox.checked;
                renderCuponsVisiveis();
                scheduleAutosave();
            });
            ocultoLabel.appendChild(ocultoCheckbox);
            ocultoLabel.appendChild(document.createTextNode(" Oculto"));

            const removeBtn = createButton("Excluir", "ghost", () => {
                if (!confirm(`Remover cupom ${cupom.codigo}?`)) return;
                state.cupons.splice(index, 1);
                renderCupons();
                renderCuponsVisiveis();
                scheduleAutosave();
            });

            const row = rowTemplate(`${cupom.codigo} - ${valorDisplay} (${tipoLabel})`, [ocultoLabel, removeBtn]);
            list.appendChild(row);
        });
    }

    function renderCuponsVisiveis() {
        const container = $("cuponsVisiveisLista");
        if (!container) return;

        const visiveis = state.cupons.filter(c => !c.oculto);

        if (visiveis.length === 0) {
            container.innerHTML = "";
            return;
        }

        const listaHtml = visiveis.map(cupom => {
            const tipoLabel = cupom.tipo === 'percent' ? '%' : 'R$';
            const valorDisplay = cupom.tipo === 'percent' ? `${cupom.valor}%` : `R$ ${cupom.valor.toFixed(2)}`;
            return `<span style="display:inline-block;background:var(--btn-secondary-bg,#1f2937);color:var(--btn-secondary-color,#fff);padding:4px 8px;border-radius:4px;margin:2px;font-size:0.85rem;">${cupom.codigo} (${valorDisplay})</span>`;
        }).join('');

        container.innerHTML = `
            <div style="margin-top:8px;">
                <strong style="font-size:0.9rem;color:var(--text-soft,#666);">Cupons ativos:</strong>
                <div style="margin-top:4px;">${listaHtml}</div>
            </div>
        `;
    }

    window.renderCupons = renderCupons;
    window.renderCuponsVisiveis = renderCuponsVisiveis;

    async function loadCategoriaCombos() {
        state.categoriaCombos = await api(`/admin/api/categoria-combos?pizzaria_id=${pizzaria.id}`);
        renderCategoriaCombos();
    }

    async function renderCategoriaCombos() {
        const container = $("listaCategoriaCombos");
        container.innerHTML = "";

        state.categoriaCombos.forEach(combo => {
            const origem = state.categorias.find(c => c.id === combo.categoria_origem_id);
            const destino = state.categorias.find(c => c.id === combo.categoria_destino_id);

            if (!origem || !destino) return;

            const item = document.createElement("div");
            item.className = "combo-item categoria-combo-item";
            item.innerHTML = `
            <div class="combo-item-content">
                <strong>${origem.icone} ${origem.nome}</strong>
                combina com
                <strong>${destino.icone} ${destino.nome}</strong>
            </div>
            <div class="combo-item-actions">
                ${createButton("Excluir", "ghost", async () => {
                if (!confirm("Excluir este combo?")) return;
                await api(`/admin/api/categoria-combos/${combo.id}`, { method: "DELETE" });
                await loadCategoriaCombos();
            }).outerHTML}
            </div>
        `;
            container.appendChild(item);
        });
    }

    async function loadSubcategoriaCombos() {
        state.subcategoriaCombos = await api(`/admin/api/subcategoria-combos?pizzaria_id=${pizzaria.id}`);
        renderSubcategoriaCombos();
    }

    async function renderSubcategoriaCombos() {
        const container = $("listaSubcategoriaCombos");
        container.innerHTML = "";

        state.subcategoriaCombos.forEach(combo => {
            const origem = state.categorias.find(c => c.id === combo.subcategoria_origem_id);
            const destino = state.categorias.find(c => c.id === combo.subcategoria_destino_id);

            if (!origem || !destino) return;

            const item = document.createElement("div");
            item.className = "combo-item subcategoria-combo-item";
            item.innerHTML = `
            <div class="combo-item-content">
                <strong>${origem.icone} ${origem.nome}</strong>
                combina com
                <strong>${destino.icone} ${destino.nome}</strong>
            </div>
            <div class="combo-item-actions">
                ${createButton("Excluir", "ghost", async () => {
                if (!confirm("Excluir este combo?")) return;
                await api(`/admin/api/subcategoria-combos/${combo.id}`, { method: "DELETE" });
                await loadSubcategoriaCombos();
            }).outerHTML}
            </div>
        `;
            container.appendChild(item);
        });
    }

    async function loadSugestaoConfig() {
        state.sugestaoConfig = await api(`/admin/api/sugestao-config?pizzaria_id=${pizzaria.id}`);
        renderSugestaoConfig();
    }

    async function renderSugestaoConfig() {
        const container = $("listaSugestaoConfig");
        container.innerHTML = "";

        state.sugestaoConfig.forEach(config => {
            const categoria = state.categorias.find(c => c.id === config.categoria_id);
            if (!categoria) return;

            const item = document.createElement("div");
            item.className = "combo-item sugestao-config-item";
            item.innerHTML = `
            <div class="combo-item-content">
                <strong>${categoria.icone} ${categoria.nome}</strong>
                ${config.ativo ? "(Ativo)" : "(Inativo)"}
            </div>
            <div class="combo-item-actions">
                ${createButton(config.ativo ? "Desativar" : "Ativar", "", async () => {
                await api(`/admin/api/sugestao-config/${config.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ativo: !config.ativo })
                });
                await loadSugestaoConfig();
            }).outerHTML}
                ${createButton("Excluir", "ghost", async () => {
                if (!confirm("Excluir esta configuração?")) return;
                await api(`/admin/api/sugestao-config/${config.id}`, { method: "DELETE" });
                await loadSugestaoConfig();
            }).outerHTML}
            </div>
        `;
            container.appendChild(item);
        });
    }

    await loadCategorias();
    await updateCategoriaSelects();
    await loadProdutos();
    await loadFrete();
    await loadCategoriaCombos();
    await loadSubcategoriaCombos();
    await loadSugestaoConfig();
});
