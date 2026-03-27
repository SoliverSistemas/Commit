-- Corrigir dados existentes e remover constraints problemáticos

-- 1. Verificar constraints atuais
SELECT conname, consrc 
FROM pg_constraint 
WHERE conrelid = 'categorias'::regclass;

-- 2. Atualizar button_variant para valores válidos
UPDATE categorias 
SET button_variant = 'primary' 
WHERE button_variant = 'primario';

-- 3. Corrigir tipo para valores válidos
UPDATE categorias 
SET tipo = CASE 
    WHEN parent_id IS NULL THEN 'principal'
    WHEN parent_id IS NOT NULL THEN 'subcategoria'
    ELSE 'principal'
END
WHERE tipo NOT IN ('principal', 'subcategoria') OR tipo IS NULL;

-- 4. Remover constraints problemáticos
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_tipo_check;
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_button_variant_check;

-- 5. Recriar apenas o constraint de tipo (se necessário)
ALTER TABLE categorias 
ADD CONSTRAINT categorias_tipo_check 
CHECK (tipo IN ('principal', 'subcategoria'));

-- 6. Verificar resultado
SELECT id, nome, tipo, button_variant, parent_id 
FROM categorias 
ORDER BY parent_id NULLS FIRST, sort_order;
