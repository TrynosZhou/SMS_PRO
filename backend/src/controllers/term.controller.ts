import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { AcademicTerm } from '../entities/AcademicTerm';

function getRepo() {
  return AppDataSource.getRepository(AcademicTerm);
}

export const listTerms = async (_req: Request, res: Response): Promise<void> => {
  try {
    const terms = await getRepo().find({ order: { year: 'DESC', termNumber: 'ASC' } });
    res.json(terms);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch terms', error: err.message });
  }
};

export const createTerm = async (req: Request, res: Response): Promise<void> => {
  try {
    const { termNumber, periodType, year, startDate, endDate, status } = req.body;

    if (!termNumber || !year || !startDate || !endDate) {
      res.status(400).json({ message: 'termNumber, year, startDate and endDate are required' });
      return;
    }

    const term = getRepo().create({
      termNumber: Number(termNumber),
      periodType: periodType || 'regular',
      year: Number(year),
      startDate,
      endDate,
      status: status || 'upcoming',
    });

    const saved = await getRepo().save(term);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to create term', error: err.message });
  }
};

export const updateTerm = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = getRepo();
    const term = await repo.findOne({ where: { id } });

    if (!term) {
      res.status(404).json({ message: 'Term not found' });
      return;
    }

    const { termNumber, periodType, year, startDate, endDate, status } = req.body;
    if (termNumber !== undefined) term.termNumber = Number(termNumber);
    if (periodType !== undefined) term.periodType = periodType;
    if (year !== undefined) term.year = Number(year);
    if (startDate !== undefined) term.startDate = startDate;
    if (endDate !== undefined) term.endDate = endDate;
    if (status !== undefined) term.status = status;

    const saved = await repo.save(term);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update term', error: err.message });
  }
};

export const deleteTerm = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = getRepo();
    const term = await repo.findOne({ where: { id } });

    if (!term) {
      res.status(404).json({ message: 'Term not found' });
      return;
    }

    await repo.remove(term);
    res.json({ message: 'Term deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to delete term', error: err.message });
  }
};
