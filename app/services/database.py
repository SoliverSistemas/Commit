"""
Serviço de Banco de Dados - Supabase
=====================================
Camada de abstração para operações do banco.
"""

import os
import hashlib
from supabase import create_client
import httpx


class SupabaseService:
    """Serviço singleton para operações Supabase."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            url = os.getenv('SUPABASE_URL')
            key = os.getenv('SUPABASE_KEY')
            cls._instance.client = create_client(url, key)
        return cls._instance

    # Admin Users
    def get_admin_user(self, email):
        """Buscar usuário admin por email."""
        result = self.client.table('admin_users').select('*').eq('email', email).execute()
        return result.data[0] if result.data else None

    def verify_password(self, stored_hash, password):
        """Verificar hash SHA256."""
        calculated = hashlib.sha256(password.encode()).hexdigest()
        return calculated == stored_hash

    # Pizzarias
    def get_pizzarias(self):
        """Listar todas as pizzarias."""
        result = self.client.table('pizzarias').select('*').order('created_at', desc=True).execute()
        return result.data or []

    def get_pizzaria_by_id(self, id):
        """Buscar pizzaria por ID."""
        result = self.client.table('pizzarias').select('*').eq('id', id).execute()
        return result.data[0] if result.data else None

    def create_pizzaria(self, data):
        """Criar nova pizzaria."""
        result = self.client.table('pizzarias').insert(data).execute()
        return result.data[0] if result.data else None

    def update_pizzaria(self, id, data):
        """Atualizar pizzaria - CORRIGIDO para evitar perda de dados."""
        # Filtrar valores None para não sobrescrever dados existentes
        filtered_data = {k: v for k, v in data.items() if v is not None or k in ['latitude', 'longitude']}

        result = self.client.table('pizzarias').update(filtered_data).eq('id', id).execute()
        return result.data[0] if result.data else None

    def delete_pizzaria(self, id):
        """Deletar pizzaria."""
        self.client.table('pizzarias').delete().eq('id', id).execute()

    # Cupons
    def get_cupons_by_pizzaria(self, pizzaria_id):
        """Buscar cupons de uma pizzaria."""
        result = self.client.table('cupons').select('*').eq('pizzaria_id', pizzaria_id).execute()
        return result.data or []

    def update_cupons(self, pizzaria_id, cupons):
        """Atualizar cupons - deleta antigos e insere novos."""
        # Deletar cupons existentes
        self.client.table('cupons').delete().eq('pizzaria_id', pizzaria_id).execute()

        # Inserir novos cupons
        for cupom in cupons:
            payload = {
                'pizzaria_id': pizzaria_id,
                'codigo': cupom.get('codigo', '').upper(),
                'valor': float(cupom.get('valor', 0)),
                'tipo': cupom.get('tipo', 'fixed'),
                'oculto': cupom.get('oculto', False)
            }
            self.client.table('cupons').insert(payload).execute()

    # Categorias
    def get_categorias_by_pizzaria(self, pizzaria_id):
        """Buscar todas as categorias da pizzaria (ativas e inativas)."""
        print(f"[DEBUG] get_categorias_by_pizzaria - Pizzaria ID: {pizzaria_id}")

        import time
        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                # Buscar associações
                assoc = self.client.table('pizzaria_categorias').select('*') \
                    .eq('pizzaria_id', pizzaria_id).execute()
                print(f"[DEBUG] Associações encontradas: {len(assoc.data) if assoc.data else 0}")

                # Se não existem associações, criar para todas as categorias globais ativas
                if not assoc.data:
                    print(f"[DEBUG] Nenhuma associação encontrada, buscando categorias globais")
                    categorias_globais = self.client.table('categorias_globais').select('*') \
                        .eq('ativa', True).order('sort_order').execute()
                    print(f"[DEBUG] Categorias globais ativas: {len(categorias_globais.data) if categorias_globais.data else 0}")

                    if categorias_globais.data:
                        # Criar associações
                        for cat in categorias_globais.data:
                            print(f"[DEBUG] Criando associação para categoria: {cat['nome']}")
                            self.client.table('pizzaria_categorias').insert({
                                'pizzaria_id': pizzaria_id,
                                'categoria_global_id': cat['id'],
                                'ativa': True,
                                'sort_order': cat.get('sort_order', 0)
                            }).execute()

                        return categorias_globais.data
                    return []

                # Buscar TODAS as categorias globais (ativas e inativas)
                categorias_globais_todas = self.client.table('categorias_globais').select('*') \
                    .order('sort_order').execute()
                print(f"[DEBUG] Todas categorias globais: {len(categorias_globais_todas.data) if categorias_globais_todas.data else 0}")

                # IDs já associados
                associados_ids = {a['categoria_global_id'] for a in assoc.data}
                print(f"[DEBUG] IDs associados: {associados_ids}")

                # Criar associações para categorias principais que não estão associadas
                for cat in categorias_globais_todas.data:
                    if not cat.get('parent_id') and cat['id'] not in associados_ids:
                        print(f"[DEBUG] Criando associação para categoria principal: {cat['nome']}")
                        self.client.table('pizzaria_categorias').insert({
                            'pizzaria_id': pizzaria_id,
                            'categoria_global_id': cat['id'],
                            'ativa': True,
                            'sort_order': cat.get('sort_order', 0)
                        }).execute()
                        associados_ids.add(cat['id'])

                # Buscar categorias globais com dados das associações
                result = []
                for assoc in assoc.data:
                    cat_global = next((c for c in categorias_globais_todas.data if c['id'] == assoc['categoria_global_id']), None)
                    if cat_global:
                        result.append({
                            **cat_global,
                            'ativa': assoc.get('ativa', True),
                            'sort_order': assoc.get('sort_order', 0)
                        })

                print(f"[DEBUG] Retornando {len(result)} categorias")
                return result

            except Exception as e:
                print(f"[DEBUG] Erro na tentativa {attempt + 1}/{max_retries}: {e}")
                if attempt < max_retries - 1:
                    print(f"[DEBUG] Aguardando {retry_delay} segundos antes de tentar novamente...")
                    time.sleep(retry_delay)
                else:
                    print(f"[DEBUG] Todas as tentativas falharam, retornando array vazio")
                    return []

    def toggle_categoria(self, pizzaria_id, categoria_id, ativa):
        """Ativar/desativar categoria para pizzaria."""
        # Verificar se já existe associação
        existing = self.client.table('pizzaria_categorias').select('*') \
            .eq('pizzaria_id', pizzaria_id) \
            .eq('categoria_global_id', categoria_id).execute()

        if existing.data:
            # Atualizar
            self.client.table('pizzaria_categorias').update({'ativa': ativa}) \
                .eq('id', existing.data[0]['id']).execute()
        else:
            # Criar nova associação
            self.client.table('pizzaria_categorias').insert({
                'pizzaria_id': pizzaria_id,
                'categoria_global_id': categoria_id,
                'ativa': ativa
            }).execute()

    # Produtos
    def get_produtos_by_pizzaria(self, pizzaria_id):
        """Buscar produtos da pizzaria com secoes e opcoes."""
        result = self.client.table('produtos').select('*') \
            .eq('pizzaria_id', pizzaria_id).execute()

        produtos = result.data or []
        print(f"[DEBUG] get_produtos_by_pizzaria - Produtos encontrados: {len(produtos)}")

        # Para cada produto, buscar secoes e opcoes
        for produto in produtos:
            print(f"[DEBUG] Produto: {produto.get('nome')}")
            # Buscar secoes
            secoes_result = self.client.table('produto_secoes').select('*') \
                .eq('produto_id', produto['id']).execute()

            secoes = secoes_result.data or []
            print(f"[DEBUG] Seções encontradas: {len(secoes)}")

            # Para cada secao, buscar opcoes
            for secao in secoes:
                opcoes_result = self.client.table('produto_opcoes').select('*') \
                    .eq('secao_id', secao['id']).execute()
                secao['opcoes'] = opcoes_result.data or []
                print(f"[DEBUG] Seção {secao.get('nome')}: {len(secao['opcoes'])} opções")

            produto['secoes'] = secoes
            print(f"[DEBUG] Produto {produto.get('nome')} tem {len(secoes)} seções")

        return produtos

    def create_produto(self, data):
        """Criar produto."""
        result = self.client.table('produtos').insert(data).execute()
        return result.data[0] if result.data else None

    def update_produto(self, id, data):
        """Atualizar produto."""
        result = self.client.table('produtos').update(data).eq('id', id).execute()
        return result.data[0] if result.data else None

    def delete_produto(self, id):
        """Deletar produto."""
        self.client.table('produtos').delete().eq('id', id).execute()
