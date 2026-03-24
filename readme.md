# Commit SaaS - Pizzarias

Sistema SaaS de pedidos para pizzarias com stack obrigatoria:
- Flask (Python)
- Templates Jinja (HTML)
- CSS puro
- JavaScript puro
- Supabase (PostgreSQL)
- Deploy no Render

## Estrutura do projeto

- `app.py`: backend Flask com rotas publicas e admin.
- `supabase_client.py`: conexao com Supabase via variaveis de ambiente.
- `supabase_schema.sql`: schema completo para criar o banco no Supabase.
- `templates/index.html`: pagina publica da pizzaria (`/<slug>`).
- `templates/admin/*`: login, home e edicao/admin.
- `static/js/main.js`: modal do produto, carrinho localStorage, frete e WhatsApp.
- `static/js/admin/editar_pizzaria.js`: CRUD de categorias/produtos/secoes/opcoes/frete.

## Banco de dados no Supabase

Rode o arquivo `supabase_schema.sql` no SQL Editor do Supabase.

Tabelas criadas:
- `admin_users`
- `pizzarias`
- `categorias`
- `produtos`
- `produto_secoes`
- `produto_opcoes`
- `frete_regras`
- `pedidos`

### Como criar admin master no banco

1. Gere hash da senha com Werkzeug localmente:

```python
from werkzeug.security import generate_password_hash
print(generate_password_hash("SUA_SENHA_FORTE"))
```

2. Insira no Supabase:

```sql
insert into admin_users (email, password_hash)
values ('admin@seuemail.com', 'HASH_GERADO_AQUI');
```

## Variaveis de ambiente (.env local)

Crie um arquivo `.env` na raiz:

```env
SECRET_KEY=sua_chave_flask_bem_forte
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_KEY=SUA_SUPABASE_KEY

# Opcional: login admin via env (prioridade sobre admin_users)
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
```

## Variaveis de ambiente no Render

Configure no painel do Render as mesmas variaveis:
- `SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ADMIN_EMAIL` (opcional)
- `ADMIN_PASSWORD_HASH` (opcional)

## Como rodar localmente

```bash
python -m venv venv
venv\Scripts\activate
pip install flask python-dotenv supabase werkzeug
python app.py
```

Acesse:
- Admin: `http://127.0.0.1:5000/admin/login`
- Publico: `http://127.0.0.1:5000/<slug-da-pizzaria>`

## Fluxo funcional principal

1. Admin cria pizzaria.
2. Admin cadastra categorias.
3. Admin cadastra produtos e configura secoes/opcoes.
4. Admin cadastra regras de frete.
5. Cliente acessa `/<slug>`, monta pedido no modal, carrinho fica salvo em localStorage.
6. Cliente informa dados e finaliza no WhatsApp com mensagem formatada.

## Checklist de 10 minutos (Supabase + Render)

1. Criar projeto no Supabase.
2. Rodar `supabase_schema.sql`.
3. Criar 1 usuario em `admin_users`.
4. Copiar `SUPABASE_URL` e `SUPABASE_KEY`.
5. Subir projeto no GitHub.
6. Criar Web Service no Render apontando para o repo.
7. Definir start command: `python app.py`.
8. Adicionar env vars no Render.
9. Publicar.
10. Entrar no `/admin/login` e cadastrar primeira pizzaria.