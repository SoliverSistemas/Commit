"""
Cache utilities for Pizzaria SaaS
"""

from flask import Flask

def init_cache(app: Flask):
    """Initialize cache system - simplified version"""
    # Simple in-memory cache for now
    app.config['CACHE_TYPE'] = 'simple'
    app.config['CACHE_DEFAULT_TIMEOUT'] = 300
