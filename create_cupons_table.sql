-- Criar tabela separada para cupons (evita problema de schema cache)
-- pizzaria_id é BIGINT para corresponder à tabela pizzarias
CREATE TABLE IF NOT EXISTS cupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pizzaria_id BIGINT NOT NULL REFERENCES pizzarias(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    valor NUMERIC(10,2) NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL DEFAULT 'fixed',
    oculto BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pizzaria_id, codigo)
);

-- Index para busca rápida
CREATE INDEX IF NOT EXISTS idx_cupons_pizzaria ON cupons(pizzaria_id);

-- Comentário da tabela
COMMENT ON TABLE cupons IS 'Tabela de cupons de desconto por pizzaria';
