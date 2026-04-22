"""
Rotas do Painel da Pizzaria
============================
Rotas para gerenciamento da pizzaria com correções de bugs.
"""

from flask import Blueprint, render_template, request, session, redirect, jsonify
from functools import wraps
from ..services.database import SupabaseService
import time
import os

pizzaria_bp = Blueprint('pizzaria', __name__)
db = SupabaseService()


def login_required(f):
    """Decorator que verifica se pizzaria está logada."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('pizzaria_logged') or not session.get('pizzaria_id'):
            return redirect('/pizzaria/login')
        return f(*args, **kwargs)
    return decorated


# Auth
@pizzaria_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('pizzaria/login_simple.html')

    email = request.form.get('email', '').strip()
    senha = request.form.get('senha', '')

    # Buscar pizzaria
    pizzaria = db.client.table('pizzarias').select('*').eq('email', email).execute()

    if not pizzaria.data:
        return jsonify({'success': False, 'message': 'Credenciais inválidas'})

    p = pizzaria.data[0]

    # Verificar senha
    import hashlib
    if hashlib.sha256(senha.encode()).hexdigest() != p.get('password_hash', ''):
        return jsonify({'success': False, 'message': 'Credenciais inválidas'})

    if p.get('status') == 'desativado':
        return jsonify({'success': True, 'message': 'Status atualizado'})

    # Criar sessão
    session['pizzaria_id'] = p['id']
    session['pizzaria_nome'] = p['nome']
    session['pizzaria_logged'] = True

    return jsonify({'success': True})


@pizzaria_bp.route('/logout')
def logout():
    session.clear()
    return redirect('/pizzaria/login')


# Dashboard
@pizzaria_bp.route('/dashboard')
@login_required
def dashboard():
    """Dashboard com dados reais."""
    pizzaria_id = session['pizzaria_id']

    pizzaria = db.get_pizzaria_by_id(pizzaria_id)
    produtos = db.get_produtos_by_pizzaria(pizzaria_id)
    cupons = db.get_cupons_by_pizzaria(pizzaria_id)
    categorias = db.get_categorias_by_pizzaria(pizzaria_id)

    # Filtrar apenas categorias ativas
    categorias_ativas = [c for c in categorias if c.get('ativa', True)]

    return render_template('pizzaria/dashboard_simple.html',
                         pizzaria=pizzaria,
                         total_produtos=len(produtos),
                         total_cupons=len(cupons),
                         total_categorias=len(categorias_ativas))


# Configurações
@pizzaria_bp.route('/configuracoes')
@login_required
def configuracoes():
    """Página de configurações com todas as opções."""
    pizzaria = db.get_pizzaria_by_id(session['pizzaria_id'])
    return render_template('pizzaria/configuracoes_simple.html', pizzaria=pizzaria)


@pizzaria_bp.route('/api/configuracoes', methods=['POST'])
@login_required
def api_configuracoes():
    """API para salvar configurações - CORRIGIDA."""
    try:
        pizzaria_id = session['pizzaria_id']
        data = request.get_json()

        tipo = data.get('tipo')
        dados = data.get('dados', {})

        # Mapear tipos para payloads
        payloads = {
            'info': ['nome', 'whatsapp', 'endereco', 'sobre', 'email', 'banner_url', 'logotipo', 'fonte'],
            'horarios': ['tempo_entrega_min', 'tempo_entrega_max', 'horario_abertura', 'horario_fechamento'],
            'cores': ['cor_fundo_principal', 'cor_fundo_secundario', 'cor_titulos',
                     'cor_texto', 'cor_texto_secundario', 'cor_texto_escuro',
                     'botao_primario_bg', 'botao_primario_texto', 'botao_secundario_bg'],
            'botoes': ['texto_botao_finalizar', 'texto_botao_cancelar']
        }

        if tipo not in payloads:
            return jsonify({'error': 'Tipo inválido'}), 400

        # Construir payload
        payload = {}
        for field in payloads[tipo]:
            if field in dados:
                payload[field] = dados[field]

        # Converter campos numéricos
        if tipo == 'horarios':
            for field in ['tempo_entrega_min', 'tempo_entrega_max']:
                if field in payload:
                    try:
                        payload[field] = int(payload[field])
                    except:
                        payload[field] = 30 if 'min' in field else 50

        if not payload:
            return jsonify({'error': 'Nenhum dado para atualizar'}), 400

        # Atualizar
        result = db.client.table('pizzarias').update(payload).eq('id', pizzaria_id).execute()

        if result.data:
            return jsonify({'success': True, 'message': 'Configurações salvas'})
        else:
            return jsonify({'error': 'Pizzaria não encontrada'}), 404

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# Paletas
@pizzaria_bp.route('/api/paletas')
@login_required
def api_paletas():
    """API para buscar paletas pré-definidas."""
    try:
        result = db.client.table('paletas_predefinidas').select('*').order('sort_order').execute()
        print(f"[DEBUG] Paletas carregadas: {len(result.data)}")
        print(f"[DEBUG] Paletas: {result.data}")

        # Se não houver paletas, criar paletas padrão
        if len(result.data) == 0:
            print("[DEBUG] Tabela vazia, criando paletas padrão...")
            paletas_padrao = [
                {
                    'nome': 'Vermelho Clássico',
                    'slug': 'vermelho-classico',
                    'descricao': 'Paleta com tons de vermelho clássico',
                    'icone': '🍕',
                    'ativo': True,
                    'sort_order': 1,
                    'cor_fundo_principal': '#0b0f1a',
                    'cor_fundo_secundario': '#111827',
                    'cor_titulos': '#f9fafb',
                    'cor_texto': '#e5e7eb',
                    'cor_texto_secundario': '#94a3b8',
                    'cor_surface': '#ffffff',
                    'botao_primario_bg': '#ef4444',
                    'botao_primario_texto': '#ffffff',
                    'botao_primario_hover': '#dc2626',
                    'botao_secundario_bg': '#1f2937',
                    'botao_secundario_texto': '#ffffff',
                    'botao_secundario_hover': '#111827',
                    'botao_destaque_bg': '#f59e0b',
                    'botao_destaque_texto': '#111827',
                    'botao_destaque_hover': '#d97706',
                    'botao_neutro_bg': '#e5e7eb',
                    'botao_neutro_texto': '#111827',
                    'botao_neutro_hover': '#cbd5e1',
                    'cor_texto_escuro': '#1f2937'
                },
                {
                    'nome': 'Verde Natureza',
                    'slug': 'verde-natureza',
                    'descricao': 'Paleta com tons de verde',
                    'icone': '🌿',
                    'ativo': True,
                    'sort_order': 2,
                    'cor_fundo_principal': '#064e3b',
                    'cor_fundo_secundario': '#065f46',
                    'cor_titulos': '#f0fdf4',
                    'cor_texto': '#d1fae5',
                    'cor_texto_secundario': '#6ee7b7',
                    'cor_surface': '#ffffff',
                    'botao_primario_bg': '#10b981',
                    'botao_primario_texto': '#ffffff',
                    'botao_primario_hover': '#059669',
                    'botao_secundario_bg': '#064e3b',
                    'botao_secundario_texto': '#ffffff',
                    'botao_secundario_hover': '#065f46',
                    'botao_destaque_bg': '#f59e0b',
                    'botao_destaque_texto': '#111827',
                    'botao_destaque_hover': '#d97706',
                    'botao_neutro_bg': '#d1fae5',
                    'botao_neutro_texto': '#064e3b',
                    'botao_neutro_hover': '#6ee7b7',
                    'cor_texto_escuro': '#064e3b'
                },
                {
                    'nome': 'Azul Oceano',
                    'slug': 'azul-oceano',
                    'descricao': 'Paleta com tons de azul',
                    'icone': '🌊',
                    'ativo': True,
                    'sort_order': 3,
                    'cor_fundo_principal': '#1e3a8a',
                    'cor_fundo_secundario': '#1e40af',
                    'cor_titulos': '#eff6ff',
                    'cor_texto': '#dbeafe',
                    'cor_texto_secundario': '#93c5fd',
                    'cor_surface': '#ffffff',
                    'botao_primario_bg': '#3b82f6',
                    'botao_primario_texto': '#ffffff',
                    'botao_primario_hover': '#2563eb',
                    'botao_secundario_bg': '#1e3a8a',
                    'botao_secundario_texto': '#ffffff',
                    'botao_secundario_hover': '#1e40af',
                    'botao_destaque_bg': '#f59e0b',
                    'botao_destaque_texto': '#111827',
                    'botao_destaque_hover': '#d97706',
                    'botao_neutro_bg': '#dbeafe',
                    'botao_neutro_texto': '#1e3a8a',
                    'botao_neutro_hover': '#93c5fd',
                    'cor_texto_escuro': '#1e3a8a'
                },
                {
                    'nome': 'Laranja Vibrante',
                    'slug': 'laranja-vibrante',
                    'descricao': 'Paleta com tons de laranja',
                    'icone': '🔥',
                    'ativo': True,
                    'sort_order': 4,
                    'cor_fundo_principal': '#7c2d12',
                    'cor_fundo_secundario': '#9a3412',
                    'cor_titulos': '#fff7ed',
                    'cor_texto': '#ffedd5',
                    'cor_texto_secundario': '#fdba74',
                    'cor_surface': '#ffffff',
                    'botao_primario_bg': '#f97316',
                    'botao_primario_texto': '#ffffff',
                    'botao_primario_hover': '#ea580c',
                    'botao_secundario_bg': '#7c2d12',
                    'botao_secundario_texto': '#ffffff',
                    'botao_secundario_hover': '#9a3412',
                    'botao_destaque_bg': '#f59e0b',
                    'botao_destaque_texto': '#111827',
                    'botao_destaque_hover': '#d97706',
                    'botao_neutro_bg': '#ffedd5',
                    'botao_neutro_texto': '#7c2d12',
                    'botao_neutro_hover': '#fdba74',
                    'cor_texto_escuro': '#7c2d12'
                },
                {
                    'nome': 'Roxo Elegante',
                    'slug': 'roxo-elegante',
                    'descricao': 'Paleta com tons de roxo',
                    'icone': '👑',
                    'ativo': True,
                    'sort_order': 5,
                    'cor_fundo_principal': '#581c87',
                    'cor_fundo_secundario': '#6b21a8',
                    'cor_titulos': '#faf5ff',
                    'cor_texto': '#f3e8ff',
                    'cor_texto_secundario': '#d8b4fe',
                    'cor_surface': '#ffffff',
                    'botao_primario_bg': '#a855f7',
                    'botao_primario_texto': '#ffffff',
                    'botao_primario_hover': '#9333ea',
                    'botao_secundario_bg': '#581c87',
                    'botao_secundario_texto': '#ffffff',
                    'botao_secundario_hover': '#6b21a8',
                    'botao_destaque_bg': '#f59e0b',
                    'botao_destaque_texto': '#111827',
                    'botao_destaque_hover': '#d97706',
                    'botao_neutro_bg': '#f3e8ff',
                    'botao_neutro_texto': '#581c87',
                    'botao_neutro_hover': '#d8b4fe',
                    'cor_texto_escuro': '#581c87'
                }
            ]

            for paleta in paletas_padrao:
                db.client.table('paletas_predefinidas').insert(paleta).execute()

            # Buscar novamente
            result = db.client.table('paletas_predefinidas').select('*').order('sort_order').execute()
            print(f"[DEBUG] Paletas padrão criadas: {len(result.data)}")

        return jsonify({'success': True, 'paletas': result.data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/api/aplicar-paleta', methods=['POST'])
@login_required
def api_aplicar_paleta():
    """API para aplicar paleta à pizzaria."""
    try:
        pizzaria_id = session['pizzaria_id']
        data = request.get_json()
        paleta_id = data.get('paleta_id')

        if not paleta_id:
            return jsonify({'success': False, 'error': 'paleta_id é obrigatório'}), 400

        # Buscar paleta
        paleta_result = db.client.table('paletas_predefinidas').select('*').eq('id', paleta_id).execute()
        if not paleta_result.data:
            return jsonify({'success': False, 'error': 'Paleta não encontrada'}), 404

        paleta = paleta_result.data[0]

        # Construir payload com as cores da paleta
        payload = {
            'cor_fundo_principal': paleta['cor_fundo_principal'],
            'cor_fundo_secundario': paleta['cor_fundo_secundario'],
            'cor_titulos': paleta['cor_titulos'],
            'cor_texto': paleta['cor_texto'],
            'cor_texto_secundario': paleta['cor_texto_secundario'],
            'cor_surface': paleta['cor_surface'],
            'botao_primario_bg': paleta['botao_primario_bg'],
            'botao_primario_texto': paleta['botao_primario_texto'],
            'botao_primario_hover': paleta['botao_primario_hover'],
            'botao_secundario_bg': paleta['botao_secundario_bg'],
            'botao_secundario_texto': paleta['botao_secundario_texto'],
            'botao_secundario_hover': paleta['botao_secundario_hover'],
            'botao_destaque_bg': paleta['botao_destaque_bg'],
            'botao_destaque_texto': paleta['botao_destaque_texto'],
            'botao_destaque_hover': paleta['botao_destaque_hover'],
            'botao_neutro_bg': paleta['botao_neutro_bg'],
            'botao_neutro_texto': paleta['botao_neutro_texto'],
            'botao_neutro_hover': paleta['botao_neutro_hover'],
            'cor_texto_escuro': paleta.get('cor_texto_escuro', '#1f2937')
        }

        # Atualizar pizzaria
        print(f"[DEBUG] Atualizando pizzaria {pizzaria_id} com payload: {payload}")
        result = db.client.table('pizzarias').update(payload).eq('id', pizzaria_id).execute()
        print(f"[DEBUG] Resultado update: {result.data}")

        if result.data:
            return jsonify({'success': True, 'message': 'Paleta aplicada com sucesso'})
        else:
            return jsonify({'success': False, 'error': 'Erro ao aplicar paleta'}), 500

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# Upload de Logotipo
@pizzaria_bp.route('/api/upload-logo', methods=['POST'])
@login_required
def api_upload_logo():
    """API para fazer upload de logotipo."""
    try:
        pizzaria_id = session['pizzaria_id']

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400

        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            return jsonify({'success': False, 'error': 'Tipo de arquivo inválido'}), 400

        # Validar tamanho (2MB)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > 2 * 1024 * 1024:
            return jsonify({'success': False, 'error': 'Arquivo muito grande. Máximo: 2MB'}), 400

        # Upload para Supabase Storage
        filename = f"logotipo_{pizzaria_id}_{int(time.time())}.{file.filename.split('.')[-1]}"
        storage_path = f"logotipos/{filename}"

        try:
            # Fazer upload usando o cliente Supabase corretamente
            from supabase import create_client
            import uuid

            # Criar cliente separado para storage
            storage_client = create_client(
                os.getenv('SUPABASE_URL'),
                os.getenv('SUPABASE_KEY')
            )

            # Ler arquivo
            ext = file.filename.split('.')[-1].lower()
            file_content = file.read()

            # Tentar fazer upload para bucket 'logotipos', se não existir usar 'produtos'
            try:
                result = storage_client.storage.from_('logotipos').upload(
                    filename,
                    file_content,
                    {'content-type': f'image/{ext}'}
                )
                bucket = 'logotipos'
            except Exception as e:
                print(f"[DEBUG] Bucket 'logotipos' não existe, usando 'produtos': {e}")
                result = storage_client.storage.from_('produtos').upload(
                    filename,
                    file_content,
                    {'content-type': f'image/{ext}'}
                )
                bucket = 'produtos'

            # Obter URL pública
            public_url = storage_client.storage.from_(bucket).get_public_url(filename)

            # Atualizar pizzaria
            db.client.table('pizzarias').update({'logotipo': public_url}).eq('id', pizzaria_id).execute()

            return jsonify({'success': True, 'url': public_url})

        except Exception as e:
            return jsonify({'success': False, 'error': f'Erro ao fazer upload: {str(e)}'}), 500

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# Produtos
@pizzaria_bp.route('/produtos')
@login_required
def produtos():
    """Redireciona para cardápio."""
    return redirect('/pizzaria/cardapio')


@pizzaria_bp.route('/api/produtos', methods=['GET', 'POST'])
@login_required
def api_produtos():
    """API para produtos."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'GET':
            produtos_list = db.client.table('produtos').select('*').eq('pizzaria_id', pizzaria_id).execute()
            return jsonify({'success': True, 'produtos': produtos_list.data or []})

        elif request.method == 'POST':
            data = request.get_json()
            print(f"[DEBUG] Data recebida: {data}")

            payload = {
                'pizzaria_id': pizzaria_id,
                'nome': data.get('nome', '').strip(),
                'categoria_global_id': data.get('categoria_global_id'),
                'descricao': data.get('descricao', '').strip(),
                'preco_base': float(data.get('preco_base', 0)),
                'foto': data.get('foto'),
                'ativo': data.get('ativo', True)
            }

            # Temporariamente não enviar subcategoria até criar tabela
            # payload['subcategoria_global_id'] = data.get('subcategoria_global_id')

            print(f"[DEBUG] Payload: {payload}")

            result = db.client.table('produtos').insert(payload).execute()
            print(f"[DEBUG] Result: {result.data}")

            if not result.data:
                return jsonify({'success': False, 'error': 'Erro ao criar produto'}), 500

            produto_id = result.data[0]['id']
            secoes = data.get('secoes', [])

            # Criar seções e opções nas tabelas separadas
            for secao in secoes:
                secao_payload = {
                    'produto_id': produto_id,
                    'nome': secao.get('nome', ''),
                    'tipo': secao.get('tipo', 'single'),
                    'obrigatorio': secao.get('obrigatorio', False),
                    'min_selecao': secao.get('min_selecao', 0),
                    'max_selecao': secao.get('max_selecao', 1),
                    'sort_order': secao.get('sort_order', 0)
                }
                secao_result = db.client.table('produto_secoes').insert(secao_payload).execute()

                if secao_result.data:
                    secao_id = secao_result.data[0]['id']
                    opcoes = secao.get('opcoes', [])

                    for opcao in opcoes:
                        opcao_payload = {
                            'secao_id': secao_id,
                            'nome': opcao.get('nome', ''),
                            'preco_adicional': float(opcao.get('preco_adicional', 0)),
                            'sort_order': opcao.get('sort_order', 0),
                            'ativa': opcao.get('ativa', True)
                        }
                        db.client.table('produto_opcoes').insert(opcao_payload).execute()

            return jsonify({'success': True, 'produto': result.data[0]})

    except Exception as e:
        import traceback
        print(f"[DEBUG] Erro ao criar produto: {e}")
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/api/produtos/<produto_id>', methods=['PUT'])
@login_required
def api_produto_update(produto_id):
    """API para atualizar produto."""
    try:
        pizzaria_id = session['pizzaria_id']
        data = request.get_json()
        print(f"[DEBUG] Data recebida para update: {data}")

        payload = {
            'nome': data.get('nome', '').strip(),
            'categoria_global_id': data.get('categoria_global_id'),
            'descricao': data.get('descricao', '').strip(),
            'preco_base': float(data.get('preco_base', 0)),
            'foto': data.get('foto'),
            'ativo': data.get('ativo', True)
        }

        # Temporariamente não enviar subcategoria até criar tabela
        # payload['subcategoria_global_id'] = data.get('subcategoria_global_id')

        print(f"[DEBUG] Payload update: {payload}")

        result = db.client.table('produtos').update(payload).eq('id', produto_id).eq('pizzaria_id', pizzaria_id).execute()
        print(f"[DEBUG] Result update: {result.data}")

        if not result.data:
            return jsonify({'success': False, 'error': 'Produto não encontrado'}), 404

        # Deletar seções e opções antigas
        # Primeiro buscar seções para deletar as opções
        secoes_existentes = db.client.table('produto_secoes').select('*').eq('produto_id', produto_id).execute()
        if secoes_existentes.data:
            for secao in secoes_existentes.data:
                db.client.table('produto_opcoes').delete().eq('secao_id', secao['id']).execute()

        # Deletar seções
        db.client.table('produto_secoes').delete().eq('produto_id', produto_id).execute()

        # Criar novas seções e opções
        secoes = data.get('secoes', [])
        for secao in secoes:
            secao_payload = {
                'produto_id': produto_id,
                'nome': secao.get('nome', ''),
                'tipo': secao.get('tipo', 'single'),
                'obrigatorio': secao.get('obrigatorio', False),
                'min_selecao': secao.get('min_selecao', 0),
                'max_selecao': secao.get('max_selecao', 1),
                'sort_order': secao.get('sort_order', 0)
            }
            secao_result = db.client.table('produto_secoes').insert(secao_payload).execute()

            if secao_result.data:
                secao_id = secao_result.data[0]['id']
                opcoes = secao.get('opcoes', [])

                for opcao in opcoes:
                    opcao_payload = {
                        'secao_id': secao_id,
                        'nome': opcao.get('nome', ''),
                        'preco_adicional': float(opcao.get('preco_adicional', 0)),
                        'sort_order': opcao.get('sort_order', 0),
                        'ativa': opcao.get('ativa', True)
                    }
                    db.client.table('produto_opcoes').insert(opcao_payload).execute()

        return jsonify({'success': True, 'produto': result.data[0]})

    except Exception as e:
        import traceback
        print(f"[DEBUG] Erro ao atualizar produto: {e}")
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/api/upload-banner', methods=['POST'])
@login_required
def api_upload_banner():
    """API para upload de banner para Supabase Storage."""
    import os
    import uuid
    from supabase import create_client

    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400

        # Validar tipo de arquivo
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            return jsonify({'success': False, 'error': 'Tipo de arquivo inválido'}), 400

        # Validar tamanho máximo (5MB)
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > 5 * 1024 * 1024:
            return jsonify({'success': False, 'error': 'Arquivo muito grande (máximo 5MB)'}), 400

        # Gerar nome único
        ext = file.filename.split('.')[-1].lower()
        filename = f"banner_{uuid.uuid4()}.{ext}"

        # Upload para Supabase Storage

        storage_client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )

        # Ler arquivo
        file_content = file.read()

        # Tentar fazer upload para bucket 'banners', se não existir usar 'produtos'
        try:
            result = storage_client.storage.from_('banners').upload(
                filename,
                file_content,
                {'content-type': f'image/{ext}'}
            )
            bucket = 'banners'
        except Exception as e:
            print(f"[DEBUG] Bucket 'banners' não existe, usando 'produtos': {e}")
            result = storage_client.storage.from_('produtos').upload(
                filename,
                file_content,
                {'content-type': f'image/{ext}'}
            )
            bucket = 'produtos'

        # Obter URL pública
        public_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/{bucket}/{filename}"

        return jsonify({'success': True, 'url': public_url})

    except Exception as e:
        import traceback
        print(f"[DEBUG] Erro ao fazer upload de banner: {e}")
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/api/upload', methods=['POST'])
@login_required
def api_upload():
    """API para upload de imagens para Supabase Storage."""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Nenhum arquivo enviado'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Nenhum arquivo selecionado'}), 400

        # Validar tipo de arquivo
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            return jsonify({'success': False, 'error': 'Tipo de arquivo inválido'}), 400

        # Gerar nome único
        import uuid
        ext = file.filename.split('.')[-1].lower()
        filename = f"{uuid.uuid4()}.{ext}"

        # Upload para Supabase Storage
        from supabase import create_client
        import os

        storage_client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )

        # Ler arquivo
        file_content = file.read()

        # Upload
        result = storage_client.storage.from_('produtos').upload(
            filename,
            file_content,
            {'content-type': f'image/{ext}'}
        )

        # Obter URL pública
        public_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/produtos/{filename}"

        return jsonify({'success': True, 'url': public_url})

    except Exception as e:
        import traceback
        print(f"[DEBUG] Erro ao fazer upload: {e}")
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/api/categorias', methods=['GET', 'POST'])
@login_required
def api_categorias():
    """API para buscar e criar categorias da pizzaria."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'POST':
            # Criar nova categoria
            data = request.get_json()
            nome = data.get('nome')
            icone = data.get('icone', '🍕')

            if not nome:
                return jsonify({'success': False, 'error': 'Nome é obrigatório'}), 400

            # Verificar limite de 15 categorias
            categorias_existentes = db.get_categorias_by_pizzaria(pizzaria_id)
            if len(categorias_existentes) >= 15:
                return jsonify({'success': False, 'error': 'Limite de 15 categorias atingido'}), 400

            # Criar categoria global
            result = db.client.table('categorias_globais').insert({
                'nome': nome,
                'icone': icone,
                'ativa': True,
                'sort_order': len(categorias_existentes)
            }).execute()

            if not result.data:
                return jsonify({'success': False, 'error': 'Erro ao criar categoria'}), 500

            categoria_global_id = result.data[0]['id']

            # Criar associação com a pizzaria
            db.client.table('pizzaria_categorias').insert({
                'pizzaria_id': pizzaria_id,
                'categoria_global_id': categoria_global_id,
                'ativa': True,
                'sort_order': len(categorias_existentes)
            }).execute()

            return jsonify({'success': True, 'categoria': result.data[0]})

        else:
            # GET - buscar todas as categorias
            print(f"[DEBUG] API categorias - Pizzaria ID: {pizzaria_id}")

            categorias = db.get_categorias_by_pizzaria(pizzaria_id)
            print(f"[DEBUG] API categorias - Categorias retornadas: {len(categorias)}")
            print(f"[DEBUG] API categorias - Categorias: {categorias}")

            # Filtrar apenas categorias principais (sem parent_id)
            categorias_principais = [c for c in categorias if not c.get('parent_id')]
            print(f"[DEBUG] API categorias - Categorias principais: {len(categorias_principais)}")

            # Se não há categorias principais, retornar todas (para não ficar vazio)
            if not categorias_principais:
                categorias_principais = categorias

            print(f"[DEBUG] API categorias - Retornando: {len(categorias_principais)} categorias")
            return jsonify({'success': True, 'categorias': categorias_principais})

    except Exception as e:
        import traceback
        print(f"[DEBUG] Erro ao buscar/criar categorias: {e}")
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        return jsonify({'success': False, 'error': str(e)}), 500


# Categorias - CORRIGIDO
@pizzaria_bp.route('/categorias')
@login_required
def categorias():
    """Gerenciamento de categorias com sistema estável."""
    pizzaria_id = session['pizzaria_id']

    pizzaria = db.get_pizzaria_by_id(pizzaria_id)
    categorias = db.get_categorias_by_pizzaria(pizzaria_id)

    return render_template('pizzaria/categorias_simple.html',
                         pizzaria=pizzaria,
                         categorias=categorias,
                         total_categorias=len(categorias))


@pizzaria_bp.route('/api/categorias/<categoria_id>/toggle', methods=['POST'])
@login_required
def api_toggle_categoria(categoria_id):
    """API para ativar/desativar categoria - CORRIGIDA para estabilidade."""
    try:
        pizzaria_id = session['pizzaria_id']
        data = request.get_json()
        ativa = data.get('ativa', True)

        # Verificar se já existe associação
        existing = db.client.table('pizzaria_categorias').select('*') \
            .eq('pizzaria_id', pizzaria_id) \
            .eq('categoria_global_id', categoria_id).execute()

        if existing.data:
            # Atualizar existente
            assoc_id = existing.data[0]['id']
            result = db.client.table('pizzaria_categorias').update({'ativa': ativa}) \
                .eq('id', assoc_id).execute()
        else:
            # Criar nova associação
            result = db.client.table('pizzaria_categorias').insert({
                'pizzaria_id': pizzaria_id,
                'categoria_global_id': categoria_id,
                'ativa': ativa
            }).execute()

        if result.data:
            return jsonify({'success': True, 'ativa': ativa})
        else:
            return jsonify({'success': False, 'error': 'Erro ao atualizar'}), 500

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@pizzaria_bp.route('/cardapio')
@login_required
def cardapio():
    """Página de cardápio."""
    try:
        pizzaria_id = session['pizzaria_id']

        # Buscar dados
        categorias = db.get_categorias_by_pizzaria(pizzaria_id)
        produtos = db.get_produtos_by_pizzaria(pizzaria_id)

        return render_template('pizzaria/cardapio.html',
                             pizzaria=db.get_pizzaria_by_id(pizzaria_id),
                             categorias=categorias,
                             produtos=produtos)

    except Exception as e:
        return render_template('pizzaria/cardapio.html',
                             pizzaria=None,
                             categorias=[],
                             produtos=[],
                             erro=str(e))


@pizzaria_bp.route('/cupons')
@login_required
def cupons():
    """Página de cupons."""
    try:
        pizzaria_id = session['pizzaria_id']

        # Buscar cupons
        cupons = db.get_cupons_by_pizzaria(pizzaria_id)

        return render_template('pizzaria/cupons_simple.html',
                             pizzaria=db.get_pizzaria_by_id(pizzaria_id),
                             cupons=cupons)

    except Exception as e:
        return render_template('pizzaria/cupons_simple.html',
                             pizzaria=db.get_pizzaria_by_id(pizzaria_id),
                             cupons=[],
                             erro=str(e))


@pizzaria_bp.route('/api/cupons', methods=['GET', 'POST'])
@login_required
def api_cupons():
    """API para cupons."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'GET':
            cupons = db.get_cupons_by_pizzaria(pizzaria_id)
            return jsonify({'success': True, 'cupons': cupons})

        elif request.method == 'POST':
            data = request.get_json()
            if not data or not data.get('code'):
                return jsonify({'success': False, 'message': 'Código é obrigatório'})

            # Verificar duplicata
            existente = db.client.table('cupons').select('*').eq('pizzaria_id', pizzaria_id).eq('code', data['code']).execute().data
            if existente:
                return jsonify({'success': False, 'message': 'Cupom já existe'})

            # Inserir
            novo_cupom = {
                'pizzaria_id': pizzaria_id,
                'code': data['code'].upper(),
                'tipo': data.get('tipo', 'percent'),
                'valor': data.get('valor', 0),
                'minimo': data.get('minimo', 0),
                'usos_maximos': data.get('usos_maximos'),
                'ativo': data.get('ativo', True)
            }

            result = db.client.table('cupons').insert(novo_cupom).execute()
            if result.data:
                return jsonify({'success': True, 'cupom': result.data[0]})
            else:
                return jsonify({'success': False, 'message': 'Erro ao criar cupom'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@pizzaria_bp.route('/api/cupons/<cupom_id>', methods=['PUT', 'DELETE'])
@login_required
def api_cupom_detail(cupom_id):
    """API para atualizar ou excluir cupom específico."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'PUT':
            data = request.get_json()
            if not data:
                return jsonify({'success': False, 'message': 'Dados não fornecidos'})

            # Verificar se o cupom pertence à pizzaria
            cupom_existente = db.client.table('cupons').select('*').eq('id', cupom_id).eq('pizzaria_id', pizzaria_id).execute().data
            if not cupom_existente:
                return jsonify({'success': False, 'message': 'Cupom não encontrado'})

            # Verificar duplicidade de código (se mudou)
            if data.get('codigo') and data['codigo'].upper() != cupom_existente[0]['code']:
                duplicata = db.client.table('cupons').select('*').eq('pizzaria_id', pizzaria_id).eq('code', data['codigo'].upper()).execute().data
                if duplicata:
                    return jsonify({'success': False, 'message': 'Código já existe'})

            # Atualizar
            update_data = {
                'code': data.get('codigo', cupom_existente[0]['code']).upper(),
                'tipo': data.get('tipo', cupom_existente[0]['tipo']),
                'valor': data.get('valor', cupom_existente[0]['valor'])
            }

            result = db.client.table('cupons').update(update_data).eq('id', cupom_id).execute()
            if result.data:
                return jsonify({'success': True, 'cupom': result.data[0]})
            else:
                return jsonify({'success': False, 'message': 'Erro ao atualizar cupom'})

        elif request.method == 'DELETE':
            # Verificar se o cupom pertence à pizzaria
            cupom_existente = db.client.table('cupons').select('*').eq('id', cupom_id).eq('pizzaria_id', pizzaria_id).execute().data
            if not cupom_existente:
                return jsonify({'success': False, 'message': 'Cupom não encontrado'})

            # Excluir
            result = db.client.table('cupons').delete().eq('id', cupom_id).execute()
            return jsonify({'success': True, 'message': 'Cupom excluído'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# Subcategorias
@pizzaria_bp.route('/api/subcategorias', methods=['GET', 'POST'])
@login_required
def api_subcategorias():
    """API para subcategorias da pizzaria."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'GET':
            categoria_id = request.args.get('categoria_id')
            query = db.client.table('subcategorias').select('*').eq('pizzaria_id', pizzaria_id)
            if categoria_id:
                query = query.eq('categoria_global_id', categoria_id)
            result = query.execute()
            return jsonify({'success': True, 'subcategorias': result.data or []})

        elif request.method == 'POST':
            data = request.get_json()
            novo = {
                'pizzaria_id': pizzaria_id,
                'categoria_global_id': data['categoria_global_id'],
                'nome': data['nome'],
                'ordem': data.get('ordem', 0)
            }
            result = db.client.table('subcategorias').insert(novo).execute()
            return jsonify({'success': True, 'subcategoria': result.data[0]})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@pizzaria_bp.route('/api/subcategorias/<sub_id>', methods=['PUT', 'DELETE'])
@login_required
def api_subcategoria_detail(sub_id):
    """API para editar/deletar subcategoria."""
    try:
        pizzaria_id = session['pizzaria_id']

        if request.method == 'PUT':
            data = request.get_json()
            result = db.client.table('subcategorias').update(data).eq('id', sub_id).eq('pizzaria_id', pizzaria_id).execute()
            return jsonify({'success': True, 'subcategoria': result.data[0]})

        elif request.method == 'DELETE':
            db.client.table('subcategorias').delete().eq('id', sub_id).eq('pizzaria_id', pizzaria_id).execute()
            return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# Ordenacao de categorias
@pizzaria_bp.route('/api/categorias/ordem', methods=['POST'])
@login_required
def api_categorias_ordem():
    """API para salvar ordem das categorias."""
    try:
        pizzaria_id = session['pizzaria_id']
        data = request.get_json()
        ordem = data.get('ordem', [])

        for item in ordem:
            db.client.table('pizzaria_categorias').update({'sort_order': item['ordem']}) \
                .eq('pizzaria_id', pizzaria_id).eq('categoria_global_id', item['id']).execute()

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# Secoes de produtos
@pizzaria_bp.route('/api/produtos/<prod_id>/secoes', methods=['GET', 'POST'])
@login_required
def api_secoes_produto(prod_id):
    """API para secoes de um produto."""
    try:
        if request.method == 'GET':
            result = db.client.table('produto_secoes').select('*').eq('produto_id', prod_id).order('ordem').execute()
            return jsonify({'success': True, 'secoes': result.data or []})

        elif request.method == 'POST':
            data = request.get_json()
            nova = {
                'produto_id': prod_id,
                'nome': data['nome'],
                'tipo': data.get('tipo', 'single'),
                'obrigatorio': data.get('obrigatorio', False),
                'ordem': data.get('ordem', 0)
            }
            result = db.client.table('produto_secoes').insert(nova).execute()
            return jsonify({'success': True, 'secao': result.data[0]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# Opcoes de secoes
@pizzaria_bp.route('/api/secoes/<sec_id>/opcoes', methods=['GET', 'POST'])
@login_required
def api_opcoes_secao(sec_id):
    """API para opcoes de uma secao."""
    try:
        if request.method == 'GET':
            result = db.client.table('produto_opcoes').select('*').eq('secao_id', sec_id).execute()
            return jsonify({'success': True, 'opcoes': result.data or []})

        elif request.method == 'POST':
            data = request.get_json()
            nova = {
                'secao_id': sec_id,
                'nome': data['nome'],
                'preco_adicional': data.get('preco_adicional', 0)
            }
            result = db.client.table('produto_opcoes').insert(nova).execute()
            return jsonify({'success': True, 'opcao': result.data[0]})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
