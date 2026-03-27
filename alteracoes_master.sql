-- ============================================
-- ALTERAÇÕES PAINEL ADMIN MASTER
-- ============================================

-- 1. Adicionar campo status na tabela pizzarias
ALTER TABLE pizzarias 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo' 
CHECK (status IN ('ativo', 'desativado'));

-- 2. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_pizzarias_status ON pizzarias(status);

-- 3. Atualizar pizzarias existentes para status ativo
UPDATE pizzarias 
SET status = 'ativo' 
WHERE status IS NULL OR status = '';

-- 4. Verificar resultado
SELECT id, nome, slug, status FROM pizzarias ORDER BY created_at DESC;
