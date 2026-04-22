"""
Rotas Públicas
===============
Rotas para o site público da pizzaria.
"""

from flask import Blueprint, render_template, request, redirect
from ..services.database import SupabaseService
from datetime import datetime

public_bp = Blueprint('public', __name__)
db = SupabaseService()


def is_open_now(pizzaria):
    """Verificar se pizzaria está aberta agora."""
    override = pizzaria.get('status_override', 'auto')
    if override == 'aberto':
        return True
    if override == 'fechado':
        return False

    # Verificar horário
    agora = datetime.now().time()
    abertura = pizzaria.get('horario_abertura', '18:00')
    fechamento = pizzaria.get('horario_fechamento', '23:00')

    # Parse times
    try:
        abertura = datetime.strptime(str(abertura)[:5], '%H:%M').time()
        fechamento = datetime.strptime(str(fechamento)[:5], '%H:%M').time()
    except:
        return True

    if fechamento < abertura:
        return agora >= abertura or agora <= fechamento
    return abertura <= agora <= fechamento


@public_bp.route('/')
def root():
    """Redireciona para login admin."""
    return redirect('/admin/login')


@public_bp.route('/<slug>')
def pizzaria_public(slug):
    """Página pública da pizzaria - CORRIGIDA com colunas explícitas."""
    try:
        # Buscar pizzaria pelo slug
        result = db.client.table('pizzarias').select('*').eq('slug', slug).execute()

        if not result.data:
            return 'Pizzaria não encontrada', 404

        pizzaria = result.data[0]
        print(f"[DEBUG] Banner URL: {pizzaria.get('banner_url', 'NÃO DEFINIDO')}")
        print(f"[DEBUG] Cores da pizzaria: botao_primario_bg={pizzaria.get('botao_primario_bg')}, cor_fundo_principal={pizzaria.get('cor_fundo_principal')}")
        print(f"[DEBUG] Status da pizzaria: {pizzaria.get('status', 'NÃO DEFINIDO')}")
        print(f"[DEBUG] Fonte da pizzaria: {pizzaria.get('fonte', 'NÃO DEFINIDO')}")

        # Verificar se está desativada
        if pizzaria.get('status') == 'desativado':
            print(f"[DEBUG] Pizzaria desativada, renderizando template desativado")
            return render_template('index.html', pizzaria=pizzaria, desativado=True)

        # Buscar categorias ativas
        categorias = db.get_categorias_by_pizzaria(pizzaria['id'])

        # Buscar produtos
        produtos = db.get_produtos_by_pizzaria(pizzaria['id'])
        print(f"[DEBUG] Produtos encontrados: {len(produtos)}")
        print(f"[DEBUG] Primeiro produto: {produtos[0] if produtos else 'Nenhum'}")
        print(f"[DEBUG] Lista de produtos: {produtos}")

        # Buscar cupons
        cupons = db.get_cupons_by_pizzaria(pizzaria['id'])

        # Verificar se está aberto
        aberta = is_open_now(pizzaria)

        print(f"[DEBUG] Renderizando template com {len(produtos)} produtos")
        return render_template('index.html',
                             pizzaria=pizzaria,
                             categorias=categorias,
                             produtos=produtos,
                             cupons=cupons,
                             aberta=aberta,
                             desativado=False)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return f'Erro: {str(e)}', 500


@public_bp.route('/preview/<slug>')
def preview(slug):
    """Preview da pizzaria (para admin)."""
    view = request.args.get('view', 'mobile')
    return pizzaria_public(slug)
