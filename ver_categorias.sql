-- Verificar todas as categorias e subcategorias da sua pizzaria
SELECT 
    c.id,
    c.nome,
    c.tipo,
    c.parent_id,
    c.icone,
    c.button_variant,
    c.sort_order,
    pc.nome as categoria_pai
FROM categorias c
LEFT JOIN categorias pc ON c.parent_id = pc.id
WHERE c.pizzaria_id = '21bfdb1f-d6e4-435d-98df-da7a26b6823a'
ORDER BY 
    CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
    c.sort_order;
