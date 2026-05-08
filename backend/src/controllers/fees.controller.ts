import { Request, Response } from 'express';
import AppDataSource from '../data-source';
import { FeeCategory } from '../entities/FeeCategory';
import { FeeItem } from '../entities/FeeItem';

const catRepo = () => AppDataSource.getRepository(FeeCategory);
const itemRepo = () => AppDataSource.getRepository(FeeItem);

// ── CATEGORIES ──────────────────────────────────────────────────────────────

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const cats = await catRepo().find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    const items = await itemRepo().find({ order: { sortOrder: 'ASC', itemName: 'ASC' } });

    const result = cats.map(c => ({
      ...c,
      items: items.filter(i => i.categoryId === c.id),
    }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const cat = catRepo().create({ name, description: description || '', sortOrder: sortOrder || 0 });
    await catRepo().save(cat);
    res.status(201).json(cat);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cat = await catRepo().findOne({ where: { id } });
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    Object.assign(cat, req.body);
    await catRepo().save(cat);
    res.json(cat);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await catRepo().delete(id);
    res.json({ message: 'Deleted' });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

// ── ITEMS ────────────────────────────────────────────────────────────────────

export const createItem = async (req: Request, res: Response) => {
  try {
    const { categoryId, subCategory, itemName, amount, currency, sortOrder } = req.body;
    if (!categoryId || !subCategory || !itemName) {
      return res.status(400).json({ message: 'categoryId, subCategory, and itemName are required' });
    }
    const item = itemRepo().create({
      categoryId,
      subCategory,
      itemName,
      amount: amount || 0,
      currency: currency || 'USD',
      sortOrder: sortOrder || 0,
    });
    await itemRepo().save(item);
    res.status(201).json(item);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await itemRepo().findOne({ where: { id } });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    Object.assign(item, req.body);
    await itemRepo().save(item);
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await itemRepo().delete(id);
    res.json({ message: 'Deleted' });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
};
