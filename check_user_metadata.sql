-- Verificar la información del usuario autenticado
SELECT 
    'Usuario autenticado' as info,
    auth.uid() as user_id,
    auth.role() as user_role;

-- Verificar la información completa del usuario en auth.users
SELECT 
    'Información completa del usuario' as info,
    id,
    email,
    raw_user_meta_data,
    user_metadata,
    app_metadata
FROM auth.users 
WHERE id = auth.uid();

-- Verificar si hay algún campo relacionado con company
SELECT 
    'Campos relacionados con company' as info,
    raw_user_meta_data->>'company_id' as company_id_from_raw,
    raw_user_meta_data->>'company' as company_from_raw,
    user_metadata->>'company_id' as company_id_from_user,
    user_metadata->>'company' as company_from_user
FROM auth.users 
WHERE id = auth.uid();
