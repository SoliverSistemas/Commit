"""
Pizzaria SaaS - Application Factory Pattern
=============================================
Estrutura modular com Factory Pattern para melhor organização e manutenção.
"""

import os
from flask import Flask
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def create_app(config_name=None):
    """Application Factory - cria e configura a aplicação Flask."""

    import os
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')

    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

    # Configurações base
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['SUPABASE_URL'] = os.getenv('SUPABASE_URL')
    app.config['SUPABASE_KEY'] = os.getenv('SUPABASE_KEY')

    # Configurações de segurança
    app.config['SESSION_COOKIE_SECURE'] = os.getenv('FLASK_ENV') == 'production'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

    # Configurações de geocoding
    app.config['GEOCODE_CACHE_TTL'] = int(os.getenv('GEOCODE_CACHE_TTL_SECONDS', '86400'))
    app.config['GEOCODE_RATE_LIMIT'] = int(os.getenv('GEOCODE_RATE_LIMIT_PER_MIN', '25'))
    app.config['GEOAPIFY_API_KEY'] = os.getenv('GEOAPIFY_API_KEY', '')

    # Inicializar cache global
    from app.utils.cache import init_cache
    init_cache(app)

    # Registrar blueprints
    from app.routes.public import public_bp
    from app.routes.admin import admin_bp
    from app.routes.pizzaria import pizzaria_bp
    from app.routes.api import api_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(pizzaria_bp, url_prefix='/pizzaria')
    app.register_blueprint(api_bp, url_prefix='/api')

    # Configurar filtros Jinja2
    from app.utils.jinja_filters import register_filters
    register_filters(app)

    # Configurar handlers de erro
    from app.utils.error_handlers import register_error_handlers
    register_error_handlers(app)

    # Headers de segurança
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        return response

    return app
