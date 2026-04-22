// ============================================
// VERSÃO LIMPA - APENAS CATEGORIAS GLOBAIS
// ============================================

function $(id) { return document.getElementById(id); }

const state = {
    pizzaria: null,
    produtos: [],
    categoriasGlobais: [],
    associacoes: []
};

async function api(url, options = {}) {
    console.log('🔍 API Request:', url, options);

    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest"  // Adicionar header para identificar requisição AJAX
        },
        credentials: 'same-origin',  // Mudar para same-origin
        ...options
    });

    console.log('📊 API Response:', res.status, res.statusText);

    if (!res.ok) {
        // Se der 404, verificar se é problema de auth
        if (res.status === 404) {
            console.warn('⚠️ 404 pode ser problema de autenticação');
            // Tentar acessar página de admin para verificar sessão
            const adminCheck = await fetch('/admin', { credentials: 'include' });
            console.log('🔐 Admin check status:', adminCheck.status);
        }
        throw new Error(res.statusText);
    }
    return await res.json();
}

// ============================================
// FUNÇÕES DE CORES (RESTAURADAS)
// ============================================

function applyThemePreview() {
    const preview = $("themePreview");
    if (!preview) return;

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
            applyThemePreview();
            refreshColorIndicators();
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

// Inicializar cores
document.addEventListener('DOMContentLoaded', () => {
    // Aplicar tema inicial
    setTimeout(() => {
        applyThemePreview();
        setupColorCodeInputs();
        refreshColorIndicators();
    }, 100);

    // Inicializar dados
    init();
});

// ============================================
// CARREGAR DADOS
// ============================================

async function init() {
    const pathParts = window.location.pathname.split("/");
    const id = pathParts[pathParts.length - 2]; // Pega o penúltimo elemento (/admin/pizzaria/<id>/editar)
    console.log('🔍 Pizzaria ID from URL:', id);
    console.log('🔍 Full path:', window.location.pathname);
    console.log('🔍 Path parts:', pathParts);

    state.pizzaria = await api(`/admin/api/pizzarias/${id}`);

    await loadCategoriasGlobais();
    await loadProdutos();

    // Adicionar event listener ao botão de salvar
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) {
        btnSalvar.addEventListener('click', salvarConfiguracoes);
        console.log('Botão salvar configurado');
    }

    // Configurar toggle de frete fixo
    const toggleFreteFixo = document.getElementById('frete_fixo_ativo');
    if (toggleFreteFixo) {
        toggleFreteFixo.addEventListener('change', atualizarInterfaceFreteFixo);
        // Inicializar interface com estado atual
        atualizarInterfaceFreteFixo();
        console.log('Toggle de frete fixo configurado');
    }

    console.log("Inicialização concluída");
}

// ============================================
// FUNÇÃO DE SALVAMENTO
// ============================================

async function salvarConfiguracoes() {
    const btnSalvar = document.getElementById('btnSalvar');
    const textoOriginal = btnSalvar.textContent;

    try {
        // Desabilitar botão e mostrar loading
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Salvando...';

        // Coletar dados dos formulários (pode haver múltiplos forms)
        const data = {};

        // Coletar de todos os inputs do tipo text, email, tel, numero, e inputs sem tipo (default text)
        document.querySelectorAll('input[type="text"], input:not([type]), input[type="email"], input[type="tel"], input[type="number"], textarea').forEach(input => {
            console.log(`🔍 Input encontrado: ${input.name} = ${input.value}`);
            if (input.name) {
                // Enviar mesmo que vazio para debug
                data[input.name] = input.value || '';
            }
        });

        // Coletar de todos os selects
        document.querySelectorAll('select').forEach(select => {
            console.log(`🔍 Select encontrado: ${select.name} = ${select.value}`);
            if (select.name) {
                // Enviar mesmo que vazio para debug
                data[select.name] = select.value || '';
            }
        });

        // Coletar de todos os checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            console.log(`🔍 Checkbox encontrado: ${checkbox.name} = ${checkbox.checked}`);
            if (checkbox.name) {
                data[checkbox.name] = checkbox.checked;
            }
        });

        // Adicionar dados de teste se nada foi encontrado
        if (Object.keys(data).length === 0) {
            console.warn('⚠️ Nenhum dado coletado, adicionando dados de teste');
            data.nome = state.pizzaria?.nome || 'Teste';
            data.slug = state.pizzaria?.slug || 'teste';
            data.whatsapp = state.pizzaria?.whatsapp || '11999999999';
        }

        // Remover campos que não devem ser enviados
        delete data.id;

        console.log('🔍 State pizzaria:', state.pizzaria);
        console.log('🔍 Pizzaria ID:', state.pizzaria?.id);
        console.log('🔍 Salvando configurações:', data);

        if (!state.pizzaria?.id) {
            throw new Error('ID da pizzaria não encontrado');
        }

        // Enviar para API
        const apiUrl = `/admin/api/pizzarias/${state.pizzaria.id}`;
        console.log('🔍 API URL:', apiUrl);

        const requestData = {
            method: 'PUT',
            body: JSON.stringify(data)
        };

        console.log('🔍 Request data:', requestData);
        console.log('🔍 Body string:', JSON.stringify(data));

        const response = await api(apiUrl, requestData);

        console.log('Resposta:', response);

        // Atualizar estado local
        state.pizzaria = { ...state.pizzaria, ...data };

        // Mostrar sucesso
        btnSalvar.textContent = 'Salvo!';
        btnSalvar.style.background = '#10b981';

        setTimeout(() => {
            btnSalvar.textContent = textoOriginal;
            btnSalvar.style.background = '';
            btnSalvar.disabled = false;
        }, 2000);

        alert('Configurações salvas com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar:', error);

        // Restaurar botão
        btnSalvar.textContent = textoOriginal;
        btnSalvar.disabled = false;

        alert('Erro ao salvar configurações: ' + error.message);
    }
}

// ============================================
// FUNÇÕES DE CATEGORIAS GLOBAIS
// ============================================

async function loadCategoriasGlobais() {
    try {
        console.log('Carregando categorias globais...');

        // Carregar categorias globais disponíveis
        const globaisResponse = await fetch('/admin/api/categorias-globais');
        state.categoriasGlobais = await globaisResponse.json();
        console.log('Categorias globais carregadas:', state.categoriasGlobais.length);

        // Carregar associações da pizzaria
        const associacoesResponse = await fetch(`/admin/api/pizzarias/${state.pizzaria.id}/categorias-globais`);
        state.associacoes = await associacoesResponse.json();
        console.log('Associações carregadas:', state.associacoes.length);

        // Mapear categorias ativas da pizzaria
        const categoriasAtivas = new Set(state.associacoes.map(a => a.categoria_global_id));
        console.log('Categorias ativas:', Array.from(categoriasAtivas));

        renderCategoriasGlobais(categoriasAtivas);
        updateCategoriaSelectsGlobais(categoriasAtivas);

    } catch (error) {
        console.error('Erro ao carregar categorias globais:', error);
        $('categoriasDisponiveis').innerHTML = '<p style="color: red;">Erro ao carregar categorias</p>';
    }
}

function renderCategoriasGlobais(categoriasAtivas) {
    const container = $('categoriasDisponiveis');

    if (!state.categoriasGlobais || state.categoriasGlobais.length === 0) {
        container.innerHTML = '<p style="color: #666;">Nenhuma categoria global disponível. Configure no painel master.</p>';
        return;
    }

    console.log('Renderizando categorias...', {
        total: state.categoriasGlobais.length,
        ativas: categoriasAtivas.size
    });

    // Separar categorias principais e subcategorias
    const principais = state.categoriasGlobais.filter(c => c.tipo === 'principal');
    const subcategorias = state.categoriasGlobais.filter(c => c.tipo === 'subcategoria');

    console.log('Categorias principais:', principais.length);
    console.log('Subcategorias:', subcategorias.length);

    let html = '';

    // Renderizar categorias principais
    principais.forEach(categoria => {
        html += createCategoriaGlobalItem(categoria, categoriasAtivas.has(categoria.id));

        // Buscar subcategorias desta categoria
        const subs = subcategorias.filter(s => s.parent_id === categoria.id);
        console.log(`Subcategorias de ${categoria.nome}:`, subs.length);

        subs.forEach(sub => {
            html += createSubcategoriaGlobalItem(sub, categoriasAtivas.has(sub.id));
        });
    });

    container.innerHTML = html || '<p style="color: #666;">Nenhuma categoria disponível</p>';
    console.log('Renderização concluída');
}

function createCategoriaGlobalItem(categoria, ativa) {
    const status = ativa ? 'Ativada' : 'Desativada';
    const statusClass = ativa ? 'status-ativo' : 'status-desativado';
    const buttonText = ativa ? 'Desativar' : 'Ativar';
    const buttonClass = ativa ? 'btn-desativar' : 'btn-ativar';

    return `
        <div class="categoria-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.5rem;">${categoria.icone}</span>
                    <div>
                        <strong>${categoria.nome}</strong>
                        <span class="categoria-badge ${statusClass}" style="margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${status}</span>
                    </div>
                </div>
                <button class="${buttonClass}" onclick="toggleCategoriaGlobal('${categoria.id}', ${ativa})" style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">
                    ${buttonText}
                </button>
            </div>
        </div>
    `;
}

function createSubcategoriaGlobalItem(subcategoria, ativa) {
    const status = ativa ? 'Ativada' : 'Desativada';
    const statusClass = ativa ? 'status-ativo' : 'status-desativado';
    const buttonText = ativa ? 'Desativar' : 'Ativar';
    const buttonClass = ativa ? 'btn-desativar' : 'btn-ativar';

    return `
        <div class="categoria-item" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px; margin-left: 32px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.2rem;">${subcategoria.icone}</span>
                    <div>
                        <strong>${subcategoria.nome}</strong>
                        <span class="categoria-badge ${statusClass}" style="margin-left: 8px; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${status}</span>
                    </div>
                </div>
                <button class="${buttonClass}" onclick="toggleCategoriaGlobal('${subcategoria.id}', ${ativa})" style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">
                    ${buttonText}
                </button>
            </div>
        </div>
    `;
}

async function toggleCategoriaGlobal(categoriaId, statusAtual) {
    console.log('Toggle categoria:', { categoriaId, statusAtual });

    try {
        const response = await api(`/admin/api/pizzarias/${state.pizzaria.id}/categorias-globais`, {
            method: 'POST',
            body: JSON.stringify({
                categoria_global_id: categoriaId,
                ativa: !statusAtual
            })
        });

        console.log('Resposta do servidor:', response);

        // Forçar atualização do estado local
        const novoStatus = !statusAtual;

        // Atualizar associações no estado
        if (novoStatus) {
            // Adicionar às associações
            if (!state.associacoes.find(a => a.categoria_global_id === categoriaId)) {
                state.associacoes.push({
                    categoria_global_id: categoriaId,
                    ativa: true
                });
            }
        } else {
            // Remover das associações
            state.associacoes = state.associacoes.filter(a => a.categoria_global_id !== categoriaId);
        }

        // Re-renderizar com dados atualizados
        const categoriasAtivas = new Set(state.associacoes.map(a => a.categoria_global_id));
        renderCategoriasGlobais(categoriasAtivas);

        console.log('Estado atualizado:', { novoStatus, categoriasAtivas: Array.from(categoriasAtivas) });

    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        alert('Erro ao atualizar categoria: ' + error.message);
    }
}

function updateCategoriaSelectsGlobais(categoriasAtivas) {
    // Atualizar select de produtos
    const produtoCategoria = $('produto_categoria');
    const produtoSubcategoria = $('produto_subcategoria');

    if (produtoCategoria) {
        const ativas = state.categoriasGlobais.filter(c => categoriasAtivas.has(c.id) && c.tipo === 'principal');
        produtoCategoria.innerHTML = '<option value="">Selecione uma categoria</option>' +
            ativas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }

    if (produtoSubcategoria) {
        const ativas = state.categoriasGlobais.filter(c => categoriasAtivas.has(c.id) && c.tipo === 'subcategoria');
        produtoSubcategoria.innerHTML = '<option value="">Selecione uma subcategoria</option>' +
            ativas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }
}

// ============================================
// FUNÇÕES DE PRODUTOS (SIMPLIFICADAS)
// ============================================

async function loadProdutos() {
    try {
        state.produtos = await api(`/admin/api/produtos?pizzaria_id=${state.pizzaria.id}`);
        console.log("Produtos carregados:", state.produtos.length);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

// ============================================
// CONFIGURAÇÕES DE FRETE
// ============================================

async function buscarGeolocalizacao() {
    const btn = $('geocodeStoreButton');
    const endereco = $('endereco').value.trim();
    const cep = $('cep').value.trim();

    if (!endereco && !cep) {
        alert('Por favor, preencha o endereço ou CEP antes de buscar.');
        return;
    }

    const textoOriginal = btn.textContent;
    btn.textContent = 'Buscando...';
    btn.disabled = true;

    try {
        const response = await api('/admin/api/geocode', {
            method: 'POST',
            body: JSON.stringify({ endereco, cep })
        });

        if (response.status === 'ok' && response.latitude && response.longitude) {
            $('latitude').value = response.latitude;
            $('longitude').value = response.longitude;

            // Atualizar preview do tema
            applyThemePreview();

            alert(`Coordenadas encontradas!\nLatitude: ${response.latitude}\nLongitude: ${response.longitude}`);
        } else {
            alert('Não foi possível encontrar as coordenadas. Verifique o endereço/CEP e tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao buscar geolocalização:', error);
        alert('Erro ao buscar coordenadas: ' + error.message);
    } finally {
        btn.textContent = textoOriginal;
        btn.disabled = false;
    }
}

async function salvarConfiguracoesFrete() {
    const dados = {
        texto_frete_whatsapp: $('texto_frete_whatsapp').value,
        texto_frete_regiao: $('texto_frete_regiao').value,
        texto_frete_confirmado: $('texto_frete_confirmado').value,
        frete_fixo_ativo: $('frete_fixo_ativo').checked,
        frete_fixo_valor: parseFloat($('frete_fixo_valor').value) || 0
    };

    try {
        await api('/pizzaria/api/configuracoes', {
            method: 'POST',
            body: JSON.stringify({
                tipo: 'frete',
                dados: dados
            })
        });

        alert('Configurações de frete salvas com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar configurações de frete:', error);
        alert('Erro ao salvar configurações de frete: ' + error.message);
    }
}

// Função para atualizar a interface baseada no toggle
function atualizarInterfaceFreteFixo() {
    const toggle = $('frete_fixo_ativo');
    const valorGroup = $('frete_fixo_valor_group');
    const hint = $('frete_fixo_hint');

    if (toggle.checked) {
        valorGroup.style.display = 'block';
        hint.textContent = 'Sim → usa frete fixo definido abaixo';
    } else {
        valorGroup.style.display = 'none';
        hint.textContent = 'Não → confirmar no WhatsApp';
    }
}

// ============================================
// FUNÇÃO CRIAR NOVA CATEGORIA
// ============================================

async function criarNovaCategoria() {
    const nomeInput = $('novaCategoriaNome');
    const iconeInput = $('novaCategoriaIcone');

    const nome = nomeInput?.value?.trim();
    const icone = iconeInput?.value?.trim() || '📁';

    if (!nome) {
        alert('Por favor, digite um nome para a categoria.');
        return;
    }

    const btn = $('btnCriarCategoria');
    const textoOriginal = btn?.textContent || 'Criar';

    if (btn) {
        btn.textContent = 'Criando...';
        btn.disabled = true;
    }

    try {
        const response = await api('/admin/api/categorias', {
            method: 'POST',
            body: JSON.stringify({
                nome: nome,
                icone: icone,
                tipo: 'categoria',
                ativa: true
            })
        });

        if (response.success) {
            alert('Categoria criada com sucesso!');
            // Limpar inputs
            if (nomeInput) nomeInput.value = '';
            if (iconeInput) iconeInput.value = '';
            // Recarregar lista
            await carregarCategorias();
        } else {
            alert('Erro: ' + (response.error || 'Tente novamente'));
        }
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        alert('Erro ao criar categoria: ' + error.message);
    } finally {
        if (btn) {
            btn.textContent = textoOriginal;
            btn.disabled = false;
        }
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', init);
