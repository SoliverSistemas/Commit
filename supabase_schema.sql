-- Commit SaaS schema for Supabase PostgreSQL
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists admin_users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists pizzarias (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    slug text not null unique,
    whatsapp text not null,
    endereco text not null default '',
    banner_url text not null default '',
    logo_url text not null default '',
    tempo_entrega_min integer not null default 30 check (tempo_entrega_min >= 0),
    tempo_entrega_max integer not null default 50 check (tempo_entrega_max >= 0),
    horario_abertura time not null default '18:00',
    horario_fechamento time not null default '23:00',
    status_override text not null default 'auto' check (status_override in ('auto', 'aberto', 'fechado')),
    cor_fundo_principal text not null default '#0b0f1a',
    cor_fundo_secundario text not null default '#111827',
    cor_titulos text not null default '#f9fafb',
    cor_texto text not null default '#e5e7eb',
    cor_texto_secundario text not null default '#94a3b8',
    botao_primario_bg text not null default '#ef4444',
    botao_primario_texto text not null default '#ffffff',
    botao_primario_hover text not null default '#dc2626',
    botao_secundario_bg text not null default '#1f2937',
    botao_secundario_texto text not null default '#ffffff',
    botao_secundario_hover text not null default '#111827',
    botao_destaque_bg text not null default '#f59e0b',
    botao_destaque_texto text not null default '#111827',
    botao_destaque_hover text not null default '#d97706',
    botao_neutro_bg text not null default '#e5e7eb',
    botao_neutro_texto text not null default '#111827',
    botao_neutro_hover text not null default '#cbd5e1',
    texto_botao_mais text not null default 'Mais',
    texto_botao_finalizar text not null default 'Finalizar pedido',
    texto_botao_cancelar text not null default 'Cancelar',
    texto_botao_ver_mais text not null default 'Ver mais',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists categorias (
    id uuid primary key default gen_random_uuid(),
    pizzaria_id uuid not null references pizzarias(id) on delete cascade,
    nome text not null,
    icone text not null default '',
    button_variant text not null default 'primario' check (button_variant in ('primario', 'secundario', 'destaque', 'neutro')),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_categorias_pizzaria on categorias(pizzaria_id, sort_order);

create table if not exists produtos (
    id uuid primary key default gen_random_uuid(),
    pizzaria_id uuid not null references pizzarias(id) on delete cascade,
    categoria_id uuid not null references categorias(id) on delete cascade,
    nome text not null,
    descricao text not null default '',
    imagem_url text not null default '',
    preco_base numeric(10,2) not null default 0 check (preco_base >= 0),
    sort_order integer not null default 0,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_produtos_pizzaria on produtos(pizzaria_id, categoria_id, sort_order);

create table if not exists produto_secoes (
    id uuid primary key default gen_random_uuid(),
    produto_id uuid not null references produtos(id) on delete cascade,
    nome text not null,
    tipo text not null default 'single' check (tipo in ('single', 'multiple')),
    obrigatorio boolean not null default false,
    min_selecao integer not null default 0 check (min_selecao >= 0),
    max_selecao integer not null default 1 check (max_selecao >= 1),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_produto_secoes_produto on produto_secoes(produto_id, sort_order);

create table if not exists produto_opcoes (
    id uuid primary key default gen_random_uuid(),
    secao_id uuid not null references produto_secoes(id) on delete cascade,
    nome text not null,
    preco_adicional numeric(10,2) not null default 0 check (preco_adicional >= 0),
    sort_order integer not null default 0,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_produto_opcoes_secao on produto_opcoes(secao_id, sort_order);

create table if not exists frete_regras (
    id uuid primary key default gen_random_uuid(),
    pizzaria_id uuid not null references pizzarias(id) on delete cascade,
    distancia_km_min numeric(6,2) not null default 0 check (distancia_km_min >= 0),
    distancia_km_max numeric(6,2) not null default 0 check (distancia_km_max >= distancia_km_min),
    valor numeric(10,2) not null default 0 check (valor >= 0),
    ativo boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_frete_regras_pizzaria on frete_regras(pizzaria_id, sort_order);

create table if not exists pedidos (
    id uuid primary key default gen_random_uuid(),
    pizzaria_id uuid not null references pizzarias(id) on delete cascade,
    cliente_nome text not null,
    cliente_telefone text not null,
    endereco text not null,
    complemento text not null default '',
    forma_pagamento text not null default 'PIX',
    observacoes text not null default '',
    subtotal numeric(10,2) not null default 0,
    frete numeric(10,2) not null default 0,
    total numeric(10,2) not null default 0,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists idx_pedidos_pizzaria on pedidos(pizzaria_id, created_at desc);

-- Updated_at helper
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at before update on admin_users
for each row execute function set_updated_at();

drop trigger if exists trg_pizzarias_updated_at on pizzarias;
create trigger trg_pizzarias_updated_at before update on pizzarias
for each row execute function set_updated_at();

drop trigger if exists trg_categorias_updated_at on categorias;
create trigger trg_categorias_updated_at before update on categorias
for each row execute function set_updated_at();

drop trigger if exists trg_produtos_updated_at on produtos;
create trigger trg_produtos_updated_at before update on produtos
for each row execute function set_updated_at();

drop trigger if exists trg_produto_secoes_updated_at on produto_secoes;
create trigger trg_produto_secoes_updated_at before update on produto_secoes
for each row execute function set_updated_at();

drop trigger if exists trg_produto_opcoes_updated_at on produto_opcoes;
create trigger trg_produto_opcoes_updated_at before update on produto_opcoes
for each row execute function set_updated_at();

drop trigger if exists trg_frete_regras_updated_at on frete_regras;
create trigger trg_frete_regras_updated_at before update on frete_regras
for each row execute function set_updated_at();
