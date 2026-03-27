-- ============================================
-- AUTENTICAÇÃO DAS PIZZARIAS - NOVO PAINEL
-- ============================================

-- 1. Adicionar campos de autenticação na tabela pizzarias
ALTER TABLE pizzarias 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN soda_ativo BOOLEAN DEFAULT false;

-- 2. Criar índices
CREATE INDEX IF NOT EXISTS idx_pizzarias_email ON pizzarias(email);
CREATE INDEX IF NOT EXISTS idx_pizzarias_soda_ativo ON pizzarias(soda_ativo);

-- 3. Verificar resultado
SELECT id, nome, slug, email, soda_ativo FROM pizzarias ORDER BY created_at DESC;
