import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Role } from '../entities/Role';
import { Permission } from '../entities/Permission';

function roleRepo() { return AppDataSource.getRepository(Role); }
function permRepo() { return AppDataSource.getRepository(Permission); }

// ── Permissions ───────────────────────────────────────────────────────────────

export const listPermissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const perms = await permRepo().find({ order: { module: 'ASC', action: 'ASC' } });
    res.json(perms);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch permissions', error: err.message });
  }
};

export const createPermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, module: mod, action, isActive } = req.body;
    if (!name || !mod || !action) {
      res.status(400).json({ message: 'name, module and action are required' }); return;
    }
    const key = `${mod.trim().toLowerCase()}.${action.trim().toLowerCase()}`;
    const exists = await permRepo().findOne({ where: { name: key } });
    if (exists) { res.status(409).json({ message: `Permission "${key}" already exists` }); return; }
    const perm = permRepo().create({
      name: key,
      description: description || `${mod.charAt(0).toUpperCase() + mod.slice(1)}: ${action.toUpperCase()}`,
      module: mod.trim().toLowerCase(),
      action: action.trim().toLowerCase(),
      isActive: isActive !== false,
    });
    const saved = await permRepo().save(perm);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to create permission', error: err.message });
  }
};

export const updatePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = permRepo();
    const perm = await repo.findOne({ where: { id } });
    if (!perm) { res.status(404).json({ message: 'Permission not found' }); return; }
    const { description, isActive } = req.body;
    if (description !== undefined) perm.description = description;
    if (isActive !== undefined) perm.isActive = isActive;
    const saved = await repo.save(perm);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update permission', error: err.message });
  }
};

export const deletePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = permRepo();
    const perm = await repo.findOne({ where: { id } });
    if (!perm) { res.status(404).json({ message: 'Permission not found' }); return; }
    await repo.remove(perm);
    res.json({ message: 'Permission deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to delete permission', error: err.message });
  }
};

// ── Roles ─────────────────────────────────────────────────────────────────────

export const listRoles = async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = await roleRepo().find({ order: { name: 'ASC' } });
    // Annotate each role with its resolved permissions for convenience
    const allPerms = await permRepo().find();
    const permMap = new Map(allPerms.map(p => [p.id, p]));

    const enriched = roles.map(r => ({
      ...r,
      permissionCount: r.permissionIds?.length ?? 0,
      permissions: (r.permissionIds || []).map(id => permMap.get(id)).filter(Boolean),
    }));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch roles', error: err.message });
  }
};

export const getRoleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await roleRepo().findOne({ where: { id: req.params.id } });
    if (!role) { res.status(404).json({ message: 'Role not found' }); return; }
    const allPerms = await permRepo().find();
    const permMap = new Map(allPerms.map(p => [p.id, p]));
    res.json({
      ...role,
      permissionCount: role.permissionIds?.length ?? 0,
      permissions: (role.permissionIds || []).map(id => permMap.get(id)).filter(Boolean),
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch role', error: err.message });
  }
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, permissionIds, isActive } = req.body;
    if (!name) { res.status(400).json({ message: 'Role name is required' }); return; }

    const exists = await roleRepo().findOne({ where: { name: name.trim().toLowerCase() } });
    if (exists) { res.status(409).json({ message: `Role "${name}" already exists` }); return; }

    const role = roleRepo().create({
      name: name.trim().toLowerCase(),
      description: description || '',
      isSystem: false,
      isActive: isActive !== false,
      permissionIds: Array.isArray(permissionIds) ? permissionIds : [],
    });
    const saved = await roleRepo().save(role);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to create role', error: err.message });
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = roleRepo();
    const role = await repo.findOne({ where: { id } });
    if (!role) { res.status(404).json({ message: 'Role not found' }); return; }

    const { name, description, permissionIds, isActive } = req.body;
    if (name !== undefined) role.name = name.trim().toLowerCase();
    if (description !== undefined) role.description = description;
    if (permissionIds !== undefined) role.permissionIds = Array.isArray(permissionIds) ? permissionIds : [];
    if (isActive !== undefined) role.isActive = isActive;

    const saved = await repo.save(role);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update role', error: err.message });
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = roleRepo();
    const role = await repo.findOne({ where: { id } });
    if (!role) { res.status(404).json({ message: 'Role not found' }); return; }
    if (role.isSystem) { res.status(403).json({ message: 'System roles cannot be deleted' }); return; }
    await repo.remove(role);
    res.json({ message: 'Role deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to delete role', error: err.message });
  }
};
