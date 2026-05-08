import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ReportRelease } from '../entities/ReportRelease';
import { AcademicTerm } from '../entities/AcademicTerm';

function repo() {
  return AppDataSource.getRepository(ReportRelease);
}

// ── List ──────────────────────────────────────────────────────────────────────
export const listReleases = async (_req: Request, res: Response): Promise<void> => {
  try {
    const releases = await repo().find({ order: { year: 'DESC', term: 'ASC', examType: 'ASC' } });
    res.json(releases);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch report releases', error: err.message });
  }
};

// ── Manual create ─────────────────────────────────────────────────────────────
export const createRelease = async (req: Request, res: Response): Promise<void> => {
  try {
    const { term, year, examType, status, releasedDate, scheduledRelease } = req.body;
    if (!term || !year || !examType) {
      res.status(400).json({ message: 'term, year and examType are required' });
      return;
    }
    const release = repo().create({
      term,
      year: Number(year),
      examType,
      status: status || 'pending',
      releasedDate: releasedDate || null,
      scheduledRelease: scheduledRelease || null,
      releasedBy: (req as any).user?.username || null,
    });
    const saved = await repo().save(release);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to create release', error: err.message });
  }
};

// ── Generate from academic terms ──────────────────────────────────────────────
export const generateFromTerms = async (req: Request, res: Response): Promise<void> => {
  try {
    const termRepo = AppDataSource.getRepository(AcademicTerm);
    const terms = await termRepo.find({ order: { year: 'DESC', termNumber: 'ASC' } });

    if (!terms.length) {
      res.status(400).json({ message: 'No academic terms found. Please create terms first.' });
      return;
    }

    const examTypes: string[] = (req.body?.examTypes as string[]) || ['mid_term', 'end_term'];
    const releaseRepo = repo();
    const created: ReportRelease[] = [];

    for (const t of terms) {
      const termLabel = `Term ${t.termNumber}`;
      for (const examType of examTypes) {
        // Skip if already exists for same term+year+examType
        const exists = await releaseRepo.findOne({
          where: { term: termLabel, year: t.year, examType },
        });
        if (exists) continue;

        const release = releaseRepo.create({
          term: termLabel,
          year: t.year,
          examType,
          status: 'pending',
          releasedDate: null,
          scheduledRelease: null,
          releasedBy: null,
        });
        created.push(await releaseRepo.save(release));
      }
    }

    res.json({
      message: created.length
        ? `Generated ${created.length} release session(s) successfully.`
        : 'All sessions already exist — no new sessions created.',
      created,
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to generate from terms', error: err.message });
  }
};

// ── Process scheduled releases ────────────────────────────────────────────────
export const processScheduled = async (req: Request, res: Response): Promise<void> => {
  try {
    const releaseRepo = repo();
    const now = new Date();

    const due = await releaseRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'scheduled' })
      .andWhere('r."scheduledRelease" <= :now', { now })
      .getMany();

    if (!due.length) {
      res.json({ message: 'No scheduled releases are due at this time.', processed: 0 });
      return;
    }

    const username = (req as any).user?.username || 'system';
    for (const r of due) {
      r.status = 'released';
      r.releasedDate = now.toISOString().split('T')[0];
      r.releasedBy = username;
    }
    await releaseRepo.save(due);

    res.json({ message: `Processed ${due.length} scheduled release(s).`, processed: due.length });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to process scheduled releases', error: err.message });
  }
};

// ── Bulk update ───────────────────────────────────────────────────────────────
export const bulkUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, status, scheduledRelease } = req.body as {
      ids: string[];
      status?: string;
      scheduledRelease?: string;
    };

    if (!ids || !ids.length) {
      res.status(400).json({ message: 'ids array is required' });
      return;
    }
    if (!status && !scheduledRelease) {
      res.status(400).json({ message: 'At least one of status or scheduledRelease must be provided' });
      return;
    }

    const releaseRepo = repo();
    const username = (req as any).user?.username || null;
    const updated: ReportRelease[] = [];

    for (const id of ids) {
      const r = await releaseRepo.findOne({ where: { id } });
      if (!r) continue;
      if (status) r.status = status as any;
      if (scheduledRelease) r.scheduledRelease = scheduledRelease;
      if (status === 'released') {
        r.releasedDate = new Date().toISOString().split('T')[0];
        r.releasedBy = username;
      }
      updated.push(await releaseRepo.save(r));
    }

    res.json({ message: `Updated ${updated.length} release(s).`, updated });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to bulk update', error: err.message });
  }
};

// ── Update one ────────────────────────────────────────────────────────────────
export const updateRelease = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const releaseRepo = repo();
    const release = await releaseRepo.findOne({ where: { id } });
    if (!release) { res.status(404).json({ message: 'Release not found' }); return; }

    const { term, year, examType, status, releasedDate, scheduledRelease } = req.body;
    if (term !== undefined) release.term = term;
    if (year !== undefined) release.year = Number(year);
    if (examType !== undefined) release.examType = examType;
    if (status !== undefined) {
      release.status = status;
      if (status === 'released') {
        release.releasedDate = release.releasedDate || new Date().toISOString().split('T')[0];
        release.releasedBy = release.releasedBy || (req as any).user?.username || null;
      }
    }
    if (releasedDate !== undefined) release.releasedDate = releasedDate || null;
    if (scheduledRelease !== undefined) release.scheduledRelease = scheduledRelease || null;

    const saved = await releaseRepo.save(release);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to update release', error: err.message });
  }
};

// ── Delete ────────────────────────────────────────────────────────────────────
export const deleteRelease = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const releaseRepo = repo();
    const release = await releaseRepo.findOne({ where: { id } });
    if (!release) { res.status(404).json({ message: 'Release not found' }); return; }
    await releaseRepo.remove(release);
    res.json({ message: 'Release deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to delete release', error: err.message });
  }
};
