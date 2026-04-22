-- Script para corrigir a tabela paletas_predefinidas

-- 1. Remover duplicatas (manter apenas uma versão de cada slug)
DELETE FROM "public"."paletas_predefinidas" WHERE id = '6212d432-eff2-4fc3-84ed-4549b9459ddf';

-- 2. Atualizar sort_order das paletas restantes
UPDATE "public"."paletas_predefinidas" SET sort_order = 1 WHERE slug = 'classica-profissional';
UPDATE "public"."paletas_predefinidas" SET sort_order = 2 WHERE slug = 'rosinha-1776132692';
UPDATE "public"."paletas_predefinidas" SET sort_order = 3 WHERE slug = 'verde-paleta-preto';

-- 3. Melhorar nomes e descrições
UPDATE "public"."paletas_predefinidas" 
SET nome = 'Vermelho Clássico', 
    slug = 'vermelho-classico',
    descricao = 'Paleta com tons de vermelho vibrante',
    icone = '🍕'
WHERE slug = 'rosinha-1776132692';

UPDATE "public"."paletas_predefinidas" 
SET descricao = 'Paleta elegante e profissional com tons de azul escuro'
WHERE slug = 'classica-profissional';

UPDATE "public"."paletas_predefinidas" 
SET nome = 'Verde Preto', 
    slug = 'verde-preto',
    descricao = 'Paleta com tons de verde e preto',
    icone = '🌿'
WHERE slug = 'verde-paleta-preto';
