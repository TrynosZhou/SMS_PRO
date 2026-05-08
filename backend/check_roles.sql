SELECT name, jsonb_array_length("permissionIds") as perm_count FROM roles ORDER BY name;
