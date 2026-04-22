"""
Jinja2 filters for Pizzaria SaaS
"""

from flask import Flask
import json
from datetime import datetime, date

def register_filters(app: Flask):
    """Register custom Jinja2 filters"""

    @app.template_filter('tojson_safe')
    def tojson_safe(value):
        """Convert to JSON, handling non-serializable objects"""
        def default(obj):
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            return str(obj)
        return json.dumps(value, default=default)

    @app.template_filter('format_currency')
    def format_currency(value):
        """Format number as Brazilian currency"""
        if value is None:
            return "R$ 0,00"
        return f"R$ {float(value):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")

    @app.template_filter('format_phone')
    def format_phone(value):
        """Format phone number"""
        if not value:
            return ""
        # Simple formatting, can be improved
        return value
