-- Script para adicionar 15 paletas predefinidas baseadas na classica-profissional
-- Cada paleta mantém a mesma estrutura de combinação de cores, mas com variações elegantes

-- 1. Azul Royal
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Azul Royal', 'azul-royal', 'Paleta elegante com tons de azul royal profissional', '👔', true, 4,
    '#0a1628', '#0f2744', '#f0f9ff', '#e0f2fe', '#94a3b8', '#ffffff',
    '#1e40af', '#ffffff', '#1e3a8a',
    '#334155', '#ffffff', '#1e293b',
    '#0ea5e9', '#ffffff', '#0284c7',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 2. Verde Esmeralda
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Verde Esmeralda', 'verde-esmeralda', 'Paleta sofisticada com tons de verde esmeralda', '💎', true, 5,
    '#022c22', '#064e3b', '#ecfdf5', '#d1fae5', '#94a3b8', '#ffffff',
    '#059669', '#ffffff', '#047857',
    '#334155', '#ffffff', '#1e293b',
    '#10b981', '#ffffff', '#059669',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 3. Roxo Nobre
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Roxo Nobre', 'roxo-nobre', 'Paleta luxuosa com tons de roxo nobre', '👑', true, 6,
    '#1e1b4b', '#312e81', '#f5f3ff', '#ede9fe', '#94a3b8', '#ffffff',
    '#7c3aed', '#ffffff', '#6d28d9',
    '#334155', '#ffffff', '#1e293b',
    '#a78bfa', '#ffffff', '#8b5cf6',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 4. Laranja Queimado
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Laranja Queimado', 'laranja-queimado', 'Paleta vibrante com tons de laranja queimado', '🔥', true, 7,
    '#1c1917', '#292524', '#fff7ed', '#ffedd5', '#94a3b8', '#ffffff',
    '#ea580c', '#ffffff', '#c2410c',
    '#334155', '#ffffff', '#1e293b',
    '#f97316', '#ffffff', '#ea580c',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 5. Rosa Profundo
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Rosa Profundo', 'rosa-profundo', 'Paleta elegante com tons de rosa profundo', '🌹', true, 8,
    '#1f1f1f', '#292524', '#fdf2f8', '#fce7f3', '#94a3b8', '#ffffff',
    '#db2777', '#ffffff', '#be185d',
    '#334155', '#ffffff', '#1e293b',
    '#ec4899', '#ffffff', '#db2777',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 6. Ciano Profissional
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Ciano Profissional', 'ciano-profissional', 'Paleta moderna com tons de ciano profissional', '💼', true, 9,
    '#083344', '#0e7490', '#ecfeff', '#cffafe', '#94a3b8', '#ffffff',
    '#0891b2', '#ffffff', '#0e7490',
    '#334155', '#ffffff', '#1e293b',
    '#06b6d4', '#ffffff', '#0891b2',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 7. Cinza Grafite
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Cinza Grafite', 'cinza-grafite', 'Paleta minimalista com tons de cinza grafite', '⬛', true, 10,
    '#0f172a', '#1e293b', '#f8fafc', '#f1f5f9', '#94a3b8', '#ffffff',
    '#475569', '#ffffff', '#334155',
    '#334155', '#ffffff', '#1e293b',
    '#64748b', '#ffffff', '#475569',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 8. Azul Meia-noite
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Azul Meia-noite', 'azul-meia-noite', 'Paleta elegante com tons de azul meia-noite', '🌙', true, 11,
    '#020617', '#0f172a', '#f0f9ff', '#e0f2fe', '#94a3b8', '#ffffff',
    '#0284c7', '#ffffff', '#0369a1',
    '#334155', '#ffffff', '#1e293b',
    '#0ea5e9', '#ffffff', '#0284c7',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 9. Dourado Luxo
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Dourado Luxo', 'dourado-luxo', 'Paleta sofisticada com tons de dourado luxo', '✨', true, 12,
    '#1c1917', '#292524', '#fffbeb', '#fef3c7', '#94a3b8', '#ffffff',
    '#b45309', '#ffffff', '#92400e',
    '#334155', '#ffffff', '#1e293b',
    '#f59e0b', '#ffffff', '#d97706',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 10. Prata Moderno
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Prata Moderno', 'prata-moderno', 'Paleta contemporânea com tons de prata moderno', '🔘', true, 13,
    '#0f172a', '#1e293b', '#f8fafc', '#f1f5f9', '#94a3b8', '#ffffff',
    '#64748b', '#ffffff', '#475569',
    '#334155', '#ffffff', '#1e293b',
    '#94a3b8', '#ffffff', '#64748b',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 11. Vinho Tinto
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Vinho Tinto', 'vinho-tinto', 'Paleta elegante com tons de vinho tinto', '🍷', true, 14,
    '#1c1c1c', '#2d2d2d', '#fdf2f8', '#fce7f3', '#94a3b8', '#ffffff',
    '#9f1239', '#ffffff', '#881337',
    '#334155', '#ffffff', '#1e293b',
    '#be123c', '#ffffff', '#9f1239',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 12. Azul Petróleo
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Azul Petróleo', 'azul-petroleo', 'Paleta refinada com tons de azul petróleo', '🔵', true, 15,
    '#0f172a', '#1e3a5f', '#f0f9ff', '#e0f2fe', '#94a3b8', '#ffffff',
    '#0c4a6e', '#ffffff', '#075985',
    '#334155', '#ffffff', '#1e293b',
    '#0284c7', '#ffffff', '#0369a1',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 13. Bronze Clássico
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Bronze Clássico', 'bronze-classico', 'Paleta tradicional com tons de bronze clássico', '🏆', true, 16,
    '#1c1917', '#292524', '#fffbeb', '#fef3c7', '#94a3b8', '#ffffff',
    '#a16207', '#ffffff', '#854d0e',
    '#334155', '#ffffff', '#1e293b',
    '#ca8a04', '#ffffff', '#a16207',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 14. Índigo Místico
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Índigo Místico', 'indigo-mistico', 'Paleta misteriosa com tons de índigo místico', '🔮', true, 17,
    '#1e1b4b', '#312e81', '#eef2ff', '#e0e7ff', '#94a3b8', '#ffffff',
    '#4338ca', '#ffffff', '#3730a3',
    '#334155', '#ffffff', '#1e293b',
    '#6366f1', '#ffffff', '#4f46e5',
    '#e2e8f0', '#0f172a', '#cbd5e1');

-- 15. Marrom Café
INSERT INTO "public"."paletas_predefinidas" (nome, slug, descricao, icone, ativo, sort_order,
    cor_fundo_principal, cor_fundo_secundario, cor_titulos, cor_texto, cor_texto_secundario, cor_surface,
    botao_primario_bg, botao_primario_texto, botao_primario_hover,
    botao_secundario_bg, botao_secundario_texto, botao_secundario_hover,
    botao_destaque_bg, botao_destaque_texto, botao_destaque_hover,
    botao_neutro_bg, botao_neutro_texto, botao_neutro_hover)
VALUES ('Marrom Café', 'marrom-cafe', 'Paleta acolhedora com tons de marrom café', '☕', true, 18,
    '#1c1917', '#292524', '#fff7ed', '#ffedd5', '#94a3b8', '#ffffff',
    '#78350f', '#ffffff', '#451a03',
    '#334155', '#ffffff', '#1e293b',
    '#d97706', '#ffffff', '#b45309',
    '#e2e8f0', '#0f172a', '#cbd5e1');
