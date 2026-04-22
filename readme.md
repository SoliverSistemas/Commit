# 🍕 Pizzaria SaaS - Sistema Completo v2.0

**Reformulação Ultra Moderna - TUDO FUNCIONANDO**

Sistema SaaS de pedidos para pizzarias com design ultra moderno, cores dinâmicas e responsividade total.

## 🚀 COMO INICIAR

### Opção 1 - Windows (Script Automático)
```bash
iniciar.bat
```

### Opção 2 - Manual
```bash
python run.py
```

### Acessar o Sistema
- **Painel Admin**: http://localhost:5000/admin/login
- **Painel Pizzaria**: http://localhost:5000/pizzaria/login
- **Site Público**: http://localhost:5000/p/{slug-da-pizzaria}

## ✨ O QUE TEM DE NOVO

### 🎨 Design Ultra Moderno
- **Tema dark profissional** com grain texture
- **Cores 100% configuráveis** por pizzaria
- **Tipografia moderna**: Bebas Neue + DM Sans
- **Animações suaves** em todos os elementos
- **Responsivo**: Desktop, tablet e mobile

### 🐛 Bugs Corrigidos
- ✅ **Salvamento de edição**: Agora funciona perfeitamente
- ✅ **Categorias**: Toggle estável, sem instabilidade
- ✅ **Cupons**: Salvamento correto
- ✅ **Cores dinâmicas**: Aplicadas em tempo real

### 📱 Responsividade Total
- **Desktop**: Sidebar visível, grid 3-4 colunas
- **Tablet**: Layout adaptativo, sidebar toggle
- **Mobile**: Cards compactos, touch-friendly

## 🎨 SISTEMA DE CORES DINÂMICAS

Cada pizzaria pode personalizar suas cores no painel:

```css
Cor de fundo principal     → Fundo do site
Cor de fundo secundário    → Header, cards
Cor dos títulos           → Títulos das seções
Cor do texto              → Texto principal
Cor de destaque           → Botões, acentos
```

## 📁 Estrutura do Projeto

```
pizzaria_saas/
├── app.py                    ← Backend completo (todas correções)
├── run.py                    ← Entry point
├── iniciar.bat               ← Script Windows
├── supabase_client.py        ← Conexão Supabase
├── supabase_schema.sql       ← Schema do banco
│
├── templates/
│   ├── admin/
│   │   ├── login.html        ✅ NOVO - Design moderno
│   │   ├── home.html         ✅ NOVO - Dashboard
│   │   └── editar_pizzaria.html ✅ NOVO - Formulário
│   ├── pizzaria/
│   │   ├── login.html        ✅ NOVO - Login moderno
│   │   └── dashboard.html     ✅ NOVO - Dashboard
│   └── index.html            ✅ ATUALIZADO - Site público
│
└── static/css/
    └── ultra-modern.css      ✅ NOVO - CSS completo
```

## ⚙️ CONFIGURAÇÃO

### 1. Criar arquivo .env
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua_chave_anon_aqui
SECRET_KEY=chave_secreta_segura_aqui
FLASK_DEBUG=True
```

### 2. Banco de Dados (Supabase)
Rode o arquivo `supabase_schema.sql` no SQL Editor do Supabase.

## ✅ FUNCIONALIDADES

### Painel Admin Master
- ✅ Login seguro
- ✅ Criar/editar pizzarias
- ✅ Cores dinâmicas configuráveis
- ✅ Gerenciar categorias globais
- ✅ Gerenciar paletas de cores

### Painel Pizzaria
- ✅ Login próprio
- ✅ Dashboard com estatísticas
- ✅ Gerenciar produtos
- ✅ Toggle de categorias (CORRIGIDO)
- ✅ Configurar cores do tema

### Site Público
- ✅ Design ultra moderno
- ✅ Cores dinâmicas
- ✅ Busca em tempo real
- ✅ Carrinho funcional
- ✅ Pedido via WhatsApp
- ✅ 100% responsivo

## 🎯 PRÓXIMA REFORMULAÇÃO (Opcional)

Para usar a estrutura modular Factory Pattern:
```python
from app import create_app
app = create_app()
```

Arquivos já criados em `app/` prontos para migração futura.

---

**Status**: ✅ **100% FUNCIONAL**
**Versão**: 2.0 Ultra Modern
**Data**: 2024

## Documentação Técnica

- `REFORMAÇÃO.md` - Detalhes técnicos completos
- `RESUMO.md` - Resumo da reformulação

---

**TUDO ESTÁ PRONTO E FUNCIONANDO PERFEITAMENTE!** 🎉

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
