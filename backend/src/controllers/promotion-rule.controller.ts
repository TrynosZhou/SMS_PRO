import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { PromotionRule } from '../entities/PromotionRule';
import { Class } from '../entities/Class';
import { AuthRequest } from '../middleware/auth';

// Get all promotion rules
export const getPromotionRules = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);
    const rules = await promotionRuleRepository.find({
      relations: ['fromClass', 'toClass'],
      order: { createdAt: 'ASC' }
    });

    res.json(rules);
  } catch (error: any) {
    console.error('Error fetching promotion rules:', error);
    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

// Get a single promotion rule
export const getPromotionRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);
    const rule = await promotionRuleRepository.findOne({
      where: { id },
      relations: ['fromClass', 'toClass']
    });

    if (!rule) {
      return res.status(404).json({ message: 'Promotion rule not found' });
    }

    res.json(rule);
  } catch (error: any) {
    console.error('Error fetching promotion rule:', error);
    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

// Create a new promotion rule
export const createPromotionRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { fromClassId, toClassId, isFinalClass, isActive } = req.body;

    // Validation
    if (!fromClassId) {
      return res.status(400).json({ message: 'From class ID is required' });
    }

    if (!isFinalClass && !toClassId) {
      return res.status(400).json({ 
        message: 'To class ID is required when isFinalClass is false' 
      });
    }

    if (fromClassId === toClassId) {
      return res.status(400).json({ 
        message: 'From class and To class cannot be the same' 
      });
    }

    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);
    const classRepository = AppDataSource.getRepository(Class);

    // Check if fromClass exists
    const fromClass = await classRepository.findOne({ where: { id: fromClassId } });
    if (!fromClass) {
      return res.status(404).json({ message: 'From class not found' });
    }

    // Check if toClass exists (if provided)
    if (toClassId) {
      const toClass = await classRepository.findOne({ where: { id: toClassId } });
      if (!toClass) {
        return res.status(404).json({ message: 'To class not found' });
      }
    }

    // Check for duplicate rule (same fromClassId)
    const existingRule = await promotionRuleRepository.findOne({
      where: { fromClassId }
    });

    if (existingRule) {
      return res.status(400).json({ 
        message: 'A promotion rule already exists for this class' 
      });
    }

    // Create the rule
    const rule = promotionRuleRepository.create({
      fromClassId,
      toClassId: isFinalClass ? null : toClassId,
      isFinalClass: isFinalClass || false,
      isActive: isActive !== undefined ? isActive : true
    });

    const savedRule = await promotionRuleRepository.save(rule);

    // Load relations for response
    const ruleWithRelations = await promotionRuleRepository.findOne({
      where: { id: savedRule.id },
      relations: ['fromClass', 'toClass']
    });

    res.status(201).json(ruleWithRelations);
  } catch (error: any) {
    console.error('Error creating promotion rule:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ 
        message: 'A promotion rule already exists for this class' 
      });
    }

    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

// Update a promotion rule
export const updatePromotionRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { fromClassId, toClassId, isFinalClass, isActive } = req.body;

    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);
    const classRepository = AppDataSource.getRepository(Class);

    // Find the rule
    const rule = await promotionRuleRepository.findOne({ where: { id } });
    if (!rule) {
      return res.status(404).json({ message: 'Promotion rule not found' });
    }

    // Validation
    if (fromClassId && fromClassId === toClassId) {
      return res.status(400).json({ 
        message: 'From class and To class cannot be the same' 
      });
    }

    // Check if fromClass exists (if being updated)
    if (fromClassId && fromClassId !== rule.fromClassId) {
      const fromClass = await classRepository.findOne({ where: { id: fromClassId } });
      if (!fromClass) {
        return res.status(404).json({ message: 'From class not found' });
      }

      // Check for duplicate rule with new fromClassId
      const existingRule = await promotionRuleRepository.findOne({
        where: { fromClassId }
      });

      if (existingRule && existingRule.id !== id) {
        return res.status(400).json({ 
          message: 'A promotion rule already exists for this class' 
        });
      }
    }

    // Check if toClass exists (if provided and not final)
    if (toClassId && !isFinalClass) {
      const toClass = await classRepository.findOne({ where: { id: toClassId } });
      if (!toClass) {
        return res.status(404).json({ message: 'To class not found' });
      }
    }

    // Update the rule
    if (fromClassId !== undefined) rule.fromClassId = fromClassId;
    if (toClassId !== undefined) {
      rule.toClassId = isFinalClass ? null : toClassId;
    }
    if (isFinalClass !== undefined) {
      rule.isFinalClass = isFinalClass;
      if (isFinalClass) {
        rule.toClassId = null;
      }
    }
    if (isActive !== undefined) rule.isActive = isActive;

    const updatedRule = await promotionRuleRepository.save(rule);

    // Load relations for response
    const ruleWithRelations = await promotionRuleRepository.findOne({
      where: { id: updatedRule.id },
      relations: ['fromClass', 'toClass']
    });

    res.json(ruleWithRelations);
  } catch (error: any) {
    console.error('Error updating promotion rule:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ 
        message: 'A promotion rule already exists for this class' 
      });
    }

    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

// Delete a promotion rule
export const deletePromotionRule = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);

    const rule = await promotionRuleRepository.findOne({ where: { id } });
    if (!rule) {
      return res.status(404).json({ message: 'Promotion rule not found' });
    }

    await promotionRuleRepository.remove(rule);
    res.json({ message: 'Promotion rule deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting promotion rule:', error);
    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

// Get active promotion rules (for use in promotion process)
export const getActivePromotionRules = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const promotionRuleRepository = AppDataSource.getRepository(PromotionRule);
    const rules = await promotionRuleRepository.find({
      where: { isActive: true },
      relations: ['fromClass', 'toClass'],
      order: { createdAt: 'ASC' }
    });

    res.json(rules);
  } catch (error: any) {
    console.error('Error fetching active promotion rules:', error);
    res.status(500).json({
      message: 'Server error',
      error: error?.message || 'Unknown error'
    });
  }
};

