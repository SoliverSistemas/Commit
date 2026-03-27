-- Criar tabela de subcategorias (categorias com parent_id)
-- Esta tabela extende a tabela categorias existente para suportar hierarquia

-- Adicionar colunas na tabela categorias existente para suportar subcategorias
ALTER TABLE categorias
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'principal' CHECK (tipo IN ('principal', 'subcategoria'));

-- Criar índices para performance das consultas hierárquicas
CREATE INDEX IF NOT EXISTS idx_categorias_parent_id ON categorias(parent_id);
CREATE INDEX IF NOT EXISTS idx_categorias_tipo ON categorias(tipo);
CREATE INDEX IF NOT EXISTS idx_categorias_pizzaria_parent ON categorias(pizzaria_id, parent_id);

-- Atualizar categorias existentes para serem 'principal' (se ainda não tiverem tipo)
UPDATE categorias
SET tipo = 'principal'
WHERE tipo IS NULL OR tipo = '';

-- Exemplo de como inserir subcategorias (descomente e adapte após criar a tabela)
/*
-- Primeiro, encontre o ID da sua pizzaria:
SELECT id, nome FROM pizzarias;

-- Depois, encontre o ID das categorias principais:
SELECT id, nome FROM categorias WHERE parent_id IS NULL;

-- Exemplo: Bebidas (categoria principal)
-- Substitua 'uuid-da-sua-pizzaria' e 'uuid-da-categoria-bebidas' pelos IDs reais
INSERT INTO categorias (id, pizzaria_id, nome, icone, button_variant, tipo, parent_id, sort_order, created_at)
VALUES
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Refrigerante', '🥤', 'primary', 'subcategoria', 'uuid-da-categoria-bebidas', 1, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Suco', '🧃', 'secondary', 'subcategoria', 'uuid-da-categoria-bebidas', 2, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Água', '💧', 'outline', 'subcategoria', 'uuid-da-categoria-bebidas', 3, NOW());

-- Exemplo: Alimentos (categoria principal)
INSERT INTO categorias (id, pizzaria_id, nome, icone, button_variant, tipo, parent_id, sort_order, created_at)
VALUES
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Pizza', '🍕', 'primary', 'subcategoria', 'uuid-da-categoria-alimentos', 1, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Hambúrguer', '🍔', 'secondary', 'subcategoria', 'uuid-da-categoria-alimentos', 2, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Batata', '🍟', 'outline', 'subcategoria', 'uuid-da-categoria-alimentos', 3, NOW());

-- Exemplo: Doces (categoria principal)
INSERT INTO categorias (id, pizzaria_id, nome, icone, button_variant, tipo, parent_id, sort_order, created_at)
VALUES
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Brownie', '🍫', 'primary', 'subcategoria', 'uuid-da-categoria-doces', 1, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Pudim', '🍮', 'secondary', 'subcategoria', 'uuid-da-categoria-doces', 2, NOW()),
    (gen_random_uuid(), 'uuid-da-sua-pizzaria', 'Sorvete', '🍦', 'outline', 'subcategoria', 'uuid-da-categoria-doces', 3, NOW());
*/

-- Consulta para verificar as categorias e subcategorias (após configurar)
-- Substitua 'uuid-da-sua-pizzaria' pelo ID real
/*
SELECT
    c.id,
    c.nome,
    c.icone,
    c.tipo,
    c.parent_id,
    pc.nome as categoria_pai,
    c.sort_order
FROM categorias c
LEFT JOIN categorias pc ON c.parent_id = pc.id
WHERE c.pizzaria_id = 'uuid-da-sua-pizzaria'
ORDER BY
    CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
    c.sort_order;
*/
