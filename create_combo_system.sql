-- Tabela de Combos entre Categorias
CREATE TABLE IF NOT EXISTS categoria_combos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pizzaria_id UUID NOT NULL REFERENCES pizzarias(id) ON DELETE CASCADE,
    categoria_origem_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    categoria_destino_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Uma categoria não pode combinar com ela mesma
    CONSTRAINT categoria_combos_unique UNIQUE (categoria_origem_id, categoria_destino_id),
    CONSTRAINT categoria_combos_not_same CHECK (categoria_origem_id != categoria_destino_id)
);

-- Tabela de Combos entre Subcategorias (opcional, refina as regras de categoria)
CREATE TABLE IF NOT EXISTS subcategoria_combos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pizzaria_id UUID NOT NULL REFERENCES pizzarias(id) ON DELETE CASCADE,
    subcategoria_origem_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    subcategoria_destino_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Uma subcategoria não pode combinar com ela mesma
    CONSTRAINT subcategoria_combos_unique UNIQUE (subcategoria_origem_id, subcategoria_destino_id),
    CONSTRAINT subcategoria_combos_not_same CHECK (subcategoria_origem_id != subcategoria_destino_id)
);

-- Tabela de Configuração de Sugestões (quais categorias aparecem no botão)
CREATE TABLE IF NOT EXISTS sugestao_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pizzaria_id UUID NOT NULL REFERENCES pizzarias(id) ON DELETE CASCADE,
    categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Cada pizzaria só pode ter uma configuração por categoria
    CONSTRAINT sugestao_config_unique UNIQUE (pizzaria_id, categoria_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_categoria_combos_pizzaria ON categoria_combos(pizzaria_id);
CREATE INDEX IF NOT EXISTS idx_categoria_combos_origem ON categoria_combos(categoria_origem_id);
CREATE INDEX IF NOT EXISTS idx_categoria_combos_destino ON categoria_combos(categoria_destino_id);
CREATE INDEX IF NOT EXISTS idx_subcategoria_combos_pizzaria ON subcategoria_combos(pizzaria_id);
CREATE INDEX IF NOT EXISTS idx_sugestao_config_pizzaria ON sugestao_config(pizzaria_id);

-- Inserir dados de exemplo (opcional, pode remover depois)
-- Exemplo: Bebidas combina com Alimentos
-- INSERT INTO categoria_combos (pizzaria_id, categoria_origem_id, categoria_destino_id) 
-- VALUES ('seu-pizzaria-id', 'id-bebidas', 'id-alimentos');

-- Exemplo: Refrigerante (subcategoria de Bebidas) combina com Pizza (subcategoria de Alimentos)
-- INSERT INTO subcategoria_combos (pizzaria_id, subcategoria_origem_id, subcategoria_destino_id) 
-- VALUES ('seu-pizzaria-id', 'id-refrigerante', 'id-pizza');

-- Exemplo: Mostrar Bebidas e Alimentos no botão de sugestão
-- INSERT INTO sugestao_config (pizzaria_id, categoria_id, ativo) 
-- VALUES ('seu-pizzaria-id', 'id-bebidas', true),
--        ('seu-pizzaria-id', 'id-alimentos', true);
