"""
Rotas da API
============
Endpoints API para operações assíncronas.
"""

from flask import Blueprint, request, jsonify
from ..services.database import SupabaseService

api_bp = Blueprint('api', __name__)
db = SupabaseService()


def ok(payload=None):
    response = {'status': 'ok'}
    if payload:
        response.update(payload)
    return jsonify(response)


def fail(message, status=400):
    return jsonify({'status': 'error', 'message': message}), status


@api_bp.route('/produtos/<pizzaria_id>')
def api_produtos(pizzaria_id):
    """API para listar produtos de uma pizzaria."""
    produtos = db.get_produtos_by_pizzaria(pizzaria_id)
    return ok({'produtos': produtos})


@api_bp.route('/categorias/<pizzaria_id>')
def api_categorias(pizzaria_id):
    """API para listar categorias ativas."""
    categorias = db.get_categorias_by_pizzaria(pizzaria_id)
    return ok({'categorias': categorias})


@api_bp.route('/pizzaria/<slug>/info')
def api_pizzaria_info(slug):
    """API para obter informações básicas da pizzaria."""
    result = db.client.table('pizzarias').select('*').eq('slug', slug).execute()
    if not result.data:
        return fail('Pizzaria não encontrada', 404)
    
    p = result.data[0]
    return ok({
        'nome': p['nome'],
        'whatsapp': p['whatsapp'],
        'aberto': p.get('status_override', 'auto') == 'aberto'
    })
