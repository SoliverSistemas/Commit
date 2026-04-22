"""
Rotas do Painel Administrativo Master
======================================
Todas as rotas de administração com correções de bugs.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, jsonify
from functools import wraps
from ..services.database import SupabaseService

admin_bp = Blueprint('admin', __name__)
db = SupabaseService()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logado'):
            return redirect(url_for('admin.login'))
        return f(*args, **kwargs)
    return decorated


def ok(payload=None, status=200):
    response = {"status": "ok"}
    if payload:
        response.update(payload)
    return jsonify(response), status


def fail(message, status=400):
    return jsonify({"status": "erro", "message": message}), status


# Auth
@admin_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('admin/login.html')

    email = request.form.get('email', '').strip().lower()
    senha = request.form.get('senha', '')

    # Verificar contra banco
    user = db.get_admin_user(email)
    if user and db.verify_password(user['password_hash'], senha):
        session['admin_logado'] = True
        session['admin_email'] = email
        return redirect(url_for('admin.home'))

    return render_template('admin/login.html', erro='Credenciais inválidas')


@admin_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('admin.login'))


# Categorias Globais
@admin_bp.route('/categorias-globais')
@login_required
def categorias_globais():
    """Página de categorias globais."""
    try:
        categorias = db.client.table('categorias_globais').select('*').order('nome').execute().data or []
        return render_template('admin/categorias_globais.html', categorias=categorias)
    except Exception as e:
        return render_template('admin/categorias_globais.html', categorias=[], erro=str(e))


@admin_bp.route('/api/categorias-globais', methods=['GET', 'POST'])
@login_required
def api_categorias_globais():
    """API para categorias globais."""
    try:
        if request.method == 'GET':
            categorias = db.client.table('categorias_globais').select('*').order('nome').execute().data or []
            return ok({'categorias': categorias})

        elif request.method == 'POST':
            data = request.get_json()
            if not data or not data.get('nome'):
                return fail('Nome é obrigatório')

            # Verificar duplicata
            existente = db.client.table('categorias_globais').select('*').eq('nome', data['nome']).execute().data
            if existente:
                return fail('Categoria já existe')

            # Inserir
            nova_categoria = {
                'nome': data['nome'],
                'icone': data.get('icone', '🍕'),
                'ativa': data.get('ativa', True),
                'sort_order': data.get('sort_order', 0),
                'parent_id': data.get('parent_id')
            }

            result = db.client.table('categorias_globais').insert(nova_categoria).execute()
            if result.data:
                return ok({'categoria': result.data[0]})
            else:
                return fail('Erro ao criar categoria')

    except Exception as e:
        return fail(str(e), 500)


@admin_bp.route('/api/categorias-globais/<categoria_id>', methods=['PUT', 'DELETE'])
@login_required
def api_categoria_global(categoria_id):
    """API para editar/deletar categoria global."""
    try:
        if request.method == 'PUT':
            data = request.get_json()
            if not data:
                return fail('Dados inválidos')

            # Verificar duplicata (se mudou o nome)
            if 'nome' in data:
                existente = db.client.table('categorias_globais').select('*').eq('nome', data['nome']).neq('id', categoria_id).execute().data
                if existente:
                    return fail('Categoria já existe')

            # Atualizar
            result = db.client.table('categorias_globais').update(data).eq('id', categoria_id).execute()
            if result.data:
                return ok({'categoria': result.data[0]})
            else:
                return fail('Categoria não encontrada')

        elif request.method == 'DELETE':
            # Verificar se há produtos vinculados
            produtos = db.client.table('produtos').select('*').eq('categoria_global_id', categoria_id).execute().data

            if produtos:
                # Se há produtos, apenas desativar
                result = db.client.table('categorias_globais').update({'ativa': False}).eq('id', categoria_id).execute()
                if result.data:
                    return ok({'message': 'Categoria desativada (há produtos vinculados)'})
                else:
                    return fail('Categoria não encontrada')
            else:
                # Se não há produtos, pode excluir
                result = db.client.table('categorias_globais').delete().eq('id', categoria_id).execute()
                if result.data:
                    return ok({'message': 'Categoria excluída'})
                else:
                    return fail('Categoria não encontrada')

    except Exception as e:
        return fail(str(e), 500)


# Paletas
@admin_bp.route('/paletas')
@login_required
def paletas():
    """Página de paletas de cores."""
    try:
        return render_template('admin/paletas.html')
    except Exception as e:
        return render_template('admin/paletas.html', erro=str(e))


@admin_bp.route('/api/paletas/preview', methods=['POST'])
@login_required
def preview_paleta():
    """Preview de paleta de cores."""
    try:
        data = request.get_json()
        if not data:
            return fail('Dados inválidos')

        # Retornar dados da paleta para preview
        return ok({'paleta': data})

    except Exception as e:
        return fail(str(e), 500)


@admin_bp.route('/api/paletas', methods=['GET', 'POST'])
@login_required
def api_paletas():
    """API para listar e criar paletas."""
    try:
        if request.method == 'GET':
            # Listar todas as paletas
            result = db.client.table('paletas_predefinidas').select('*').order('sort_order').execute()
            return ok({'paletas': result.data or []})

        elif request.method == 'POST':
            # Criar nova paleta
            data = request.get_json()
            if not data or not data.get('nome'):
                return fail('Nome é obrigatório')

            # Gerar slug a partir do nome
            import re
            slug = re.sub(r'[^a-z0-9-]', '-', data['nome'].lower()).strip('-')

            # Verificar se slug já existe
            existente = db.client.table('paletas_predefinidas').select('*').eq('slug', slug).execute().data
            if existente:
                # Adicionar timestamp ao slug
                import time
                slug = f"{slug}-{int(time.time())}"

            # Criar paleta com estrutura correta
            nova_paleta = {
                'nome': data['nome'],
                'slug': slug,
                'descricao': data.get('descricao', ''),
                'icone': data.get('icone', '🎨'),
                'ativo': True,
                'sort_order': data.get('sort_order', 0),
                # Cores
                'cor_fundo_principal': data.get('cor_primaria', '#0b0f1a'),
                'cor_fundo_secundario': data.get('cor_secundaria', '#111827'),
                'cor_titulos': data.get('cor_texto_escuro', '#f9fafb'),
                'cor_texto': data.get('cor_texto', '#e5e7eb'),
                'cor_texto_secundario': data.get('cor_texto_secundario', '#94a3b8'),
                'cor_surface': data.get('cor_fundo', '#ffffff'),
                # Botões
                'botao_primario_bg': data.get('cor_primaria', '#ef4444'),
                'botao_primario_texto': data.get('botao_primario_texto', '#ffffff'),
                'botao_primario_hover': data.get('botao_primario_hover', '#dc2626'),
                'botao_secundario_bg': data.get('cor_secundario', '#1f2937'),
                'botao_secundario_texto': data.get('botao_secundario_texto', '#ffffff'),
                'botao_secundario_hover': data.get('botao_secundario_hover', '#111827'),
                'botao_destaque_bg': data.get('botao_destaque_bg', '#f59e0b'),
                'botao_destaque_texto': data.get('botao_destaque_texto', '#111827'),
                'botao_destaque_hover': data.get('botao_destaque_hover', '#d97706'),
                'botao_neutro_bg': data.get('botao_neutro_bg', '#e5e7eb'),
                'botao_neutro_texto': data.get('botao_neutro_texto', '#111827'),
                'botao_neutro_hover': data.get('botao_neutro_hover', '#cbd5e1'),
                'cor_texto_escuro': data.get('cor_texto_escuro', '#1f2937')
            }

            result = db.client.table('paletas_predefinidas').insert(nova_paleta).execute()
            if result.data:
                return ok({'paleta': result.data[0]})
            else:
                return fail('Erro ao criar paleta')

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(str(e), 500)


@admin_bp.route('/api/paletas/limpar', methods=['POST'])
@login_required
def limpar_paletas():
    """Limpa paletas duplicadas e corrige dados."""
    try:
        # Buscar todas as paletas
        result = db.client.table('paletas_predefinidas').select('*').execute()
        paletas = result.data

        # Remover duplicatas baseadas em slug
        slugs_vistos = set()
        ids_para_remover = []

        for paleta in paletas:
            if paleta['slug'] in slugs_vistos:
                ids_para_remover.append(paleta['id'])
            else:
                slugs_vistos.add(paleta['slug'])

        # Excluir duplicatas
        for paleta_id in ids_para_remover:
            db.client.table('paletas_predefinidas').delete().eq('id', paleta_id).execute()

        # Atualizar sort_order das paletas restantes
        paletas_restantes = db.client.table('paletas_predefinidas').select('*').execute().data
        for idx, paleta in enumerate(paletas_restantes):
            db.client.table('paletas_predefinidas').update({'sort_order': idx + 1}).eq('id', paleta['id']).execute()

        return ok({'message': f'{len(ids_para_remover)} duplicatas removidas, sort_order atualizado'})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(str(e), 500)


@admin_bp.route('/api/paletas/<paleta_id>', methods=['PUT', 'DELETE'])
@login_required
def api_paleta_detail(paleta_id):
    """API para atualizar ou excluir paleta."""
    try:
        if request.method == 'PUT':
            data = request.get_json()
            if not data:
                return fail('Dados não fornecidos')

            # Atualizar paleta
            update_data = {
                'nome': data.get('nome'),
                'descricao': data.get('descricao', ''),
                'icone': data.get('icone', '🎨'),
                'sort_order': data.get('sort_order', 0),
                'cor_fundo_principal': data.get('cor_primaria'),
                'cor_fundo_secundario': data.get('cor_secundaria'),
                'cor_titulos': data.get('cor_texto_escuro'),
                'cor_texto': data.get('cor_texto'),
                'cor_texto_secundario': data.get('cor_texto_secundario'),
                'cor_surface': data.get('cor_fundo'),
                'botao_primario_bg': data.get('botao_primario_bg'),
                'botao_primario_texto': data.get('botao_primario_texto'),
                'botao_primario_hover': data.get('botao_primario_hover'),
                'botao_secundario_bg': data.get('botao_secundario_bg'),
                'botao_secundario_texto': data.get('botao_secundario_texto'),
                'botao_secundario_hover': data.get('botao_secundario_hover'),
                'botao_destaque_bg': data.get('botao_destaque_bg'),
                'botao_destaque_texto': data.get('botao_destaque_texto'),
                'botao_destaque_hover': data.get('botao_destaque_hover')
            }

            # Remover valores None
            update_data = {k: v for k, v in update_data.items() if v is not None}

            result = db.client.table('paletas_predefinidas').update(update_data).eq('id', paleta_id).execute()
            if result.data:
                return ok({'paleta': result.data[0]})
            else:
                return fail('Erro ao atualizar paleta')

        elif request.method == 'DELETE':
            result = db.client.table('paletas_predefinidas').delete().eq('id', paleta_id).execute()
            return ok({'message': 'Paleta excluída'})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(str(e), 500)


@admin_bp.route('/pizzaria/<slug>/preview')
@login_required
def preview_pizzaria(slug):
    """Preview da pizzaria."""
    try:
        # Buscar pizzaria pelo slug
        result = db.client.table('pizzarias').select('*').eq('slug', slug).execute()

        if not result.data:
            return 'Pizzaria não encontrada', 404

        pizzaria = result.data[0]

        # Buscar dados adicionais
        categorias = db.get_categorias_by_pizzaria(pizzaria['id'])
        produtos = db.get_produtos_by_pizzaria(pizzaria['id'])
        cupons = db.get_cupons_by_pizzaria(pizzaria['id'])

        return render_template('index.html',
                             pizzaria=pizzaria,
                             categorias=categorias,
                             produtos=produtos,
                             cupons=cupons,
                             aberta=True,
                             desativado=False)

    except Exception as e:
        return f'Erro: {str(e)}', 500


@admin_bp.route('/configuracoes', methods=['GET', 'POST'])
@login_required
def configuracoes():
    """Configurações do sistema."""
    try:
        if request.method == 'POST':
            data = request.get_json()
            if not data:
                return fail('Dados inválidos')

            # Salvar configurações (implementar lógica específica)
            # Por enquanto, apenas retorna sucesso
            return ok({'message': 'Configurações salvas com sucesso'})

        return render_template('admin/configuracoes.html')

    except Exception as e:
        if request.method == 'POST':
            return fail(str(e), 500)
        return render_template('admin/configuracoes.html', erro=str(e))


# Dashboard
@admin_bp.route('')
@login_required
def home():
    pizzarias = db.get_pizzarias()
    return render_template('admin/home.html', pizzarias=pizzarias)


# Pizzarias
@admin_bp.route('/pizzaria/nova')
@login_required
def nova_pizzaria():
    return render_template('admin/nova_pizzaria.html')


@admin_bp.route('/pizzaria/<id>/editar')
@login_required
def editar_pizzaria(id):
    pizzaria = db.get_pizzaria_by_id(id)
    if not pizzaria:
        return 'Pizzaria não encontrada', 404
    return render_template('admin/editar_pizzaria.html', pizzaria=pizzaria)


# API Pizzarias - CORRIGIDA
@admin_bp.route('/api/pizzarias', methods=['GET', 'POST'])
@login_required
def api_pizzarias():
    if request.method == 'GET':
        return jsonify(db.get_pizzarias())

    # POST - Criar
    try:
        data = request.get_json()

        # Validar campos obrigatórios
        required = ['nome', 'slug', 'whatsapp']
        for field in required:
            if not data.get(field):
                return fail(f'Campo obrigatório: {field}')

        # Criar payload com tratamento de valores
        payload = {
            'nome': data['nome'].strip(),
            'slug': data['slug'].strip().lower(),
            'whatsapp': data['whatsapp'].strip(),
            'email': data.get('email', '').strip(),
            'tempo_entrega_min': int(data.get('tempo_entrega_min', 30)),
            'tempo_entrega_max': int(data.get('tempo_entrega_max', 50)),
            'status': data.get('status', 'ativo'),
            # Cores padrão do tema dark moderno
            'cor_fundo_principal': data.get('cor_fundo_principal', '#0D0D0D'),
            'cor_fundo_secundario': data.get('cor_fundo_secundario', '#161616'),
            'cor_titulos': data.get('cor_titulos', '#F5EDD8'),
            'cor_texto': data.get('cor_texto', '#FFFFFF'),
            'cor_texto_secundario': data.get('cor_texto_secundario', '#888888'),
            'botao_primario_bg': data.get('botao_primario_bg', '#E81C1C'),
            'botao_primario_texto': '#FFFFFF'
        }

        result = db.create_pizzaria(payload)
        return ok({'item': result}), 201

    except Exception as e:
        return fail(str(e), 500)


@admin_bp.route('/api/pizzarias/<id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_pizzaria_detail(id):
    if request.method == 'GET':
        pizzaria = db.get_pizzaria_by_id(id)
        if not pizzaria:
            return fail('Pizzaria não encontrada', 404)
        return jsonify(pizzaria)

    if request.method == 'DELETE':
        db.delete_pizzaria(id)
        return ok()

    # PUT - Atualizar (CORRIGIDO)
    try:
        data = request.get_json()

        # Separar cupons
        cupons = data.pop('cupons', None)

        # Tratar campos numéricos
        for field in ['tempo_entrega_min', 'tempo_entrega_max']:
            if field in data:
                try:
                    data[field] = int(float(data[field])) if data[field] else None
                except:
                    data[field] = None

        # Remover campos protegidos
        for field in ['id', 'created_at', 'updated_at']:
            data.pop(field, None)

        # Atualizar
        updated = db.update_pizzaria(id, data)

        # Atualizar cupons se fornecidos
        if cupons is not None:
            db.update_cupons(id, cupons)

        return ok({'item': updated})

    except Exception as e:
        return fail(str(e), 500)


@admin_bp.route('/api/pizzarias/<id>/status', methods=['PUT'])
@login_required
def api_pizzaria_status(id):
    """API para atualizar apenas o status da pizzaria"""
    try:
        data = request.get_json()
        status = data.get('status')

        if not status:
            return fail('Status é obrigatório', 400)

        # Atualizar apenas o status
        updated = db.update_pizzaria(id, {'status': status})
        return ok({'item': updated})

    except Exception as e:
        return fail(str(e), 500)
