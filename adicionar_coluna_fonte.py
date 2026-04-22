import os
import sys

# Adicionar diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importar cliente Supabase existente
from supabase_client import supabase

# Adicionar coluna fonte à tabela pizzarias
print("Adicionando coluna 'fonte' à tabela pizzarias...")

try:
    # Executar SQL para adicionar a coluna
    result = supabase.rpc('execute_sql', {
        'sql': "ALTER TABLE pizzarias ADD COLUMN IF NOT EXISTS fonte TEXT NOT NULL DEFAULT 'Inter';"
    })
    print("✓ Coluna 'fonte' adicionada com sucesso!")
except Exception as e:
    print(f"✗ Erro ao adicionar coluna: {e}")
    print("Tentando método alternativo...")
    
    # Método alternativo: usar a API REST do Supabase
    import requests
    import json
    
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("✗ Credenciais Supabase não encontradas")
        sys.exit(1)
    
    # Executar SQL via API REST
    url = f"{SUPABASE_URL}/rest/v1/rpc/execute_sql"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'sql': "ALTER TABLE pizzarias ADD COLUMN IF NOT EXISTS fonte TEXT NOT NULL DEFAULT 'Inter';"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 200:
            print("✓ Coluna 'fonte' adicionada com sucesso via API REST!")
        else:
            print(f"✗ Erro na API REST: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"✗ Erro na API REST: {e}")

print("Processo concluído!")
