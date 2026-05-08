import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { Teacher } from '../entities/Teacher';
import { User } from '../entities/User';
import { Settings } from '../entities/Settings';
import { Message } from '../entities/Message';
import { AuthRequest } from '../middleware/auth';

export const sendBulkMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, message, recipients } = req.body;
    const user = req.user;

    // Check if user has permission (admin, superadmin, or accountant)
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'You do not have permission to send bulk messages' });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject/title is required' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (!recipients || !['all', 'students', 'parents', 'teachers'].includes(recipients)) {
      return res.status(400).json({ message: 'Invalid recipients selection' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const parentRepository = AppDataSource.getRepository(Parent);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get school name and headmaster name from settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const schoolName = settings?.schoolName || 'School';
    const headmasterName = settings?.headmasterName || 'Headmaster';

    // Get recipients based on selection
    let recipientList: any[] = [];
    let recipientCount = 0;

    if (recipients === 'all' || recipients === 'students') {
      const students = await studentRepository.find({
        where: { isActive: true },
        relations: ['user']
      });
      students.forEach(student => {
        if (student.user?.email) {
          recipientList.push({
            email: student.user.email,
            name: `${student.firstName} ${student.lastName}`,
            type: 'student'
          });
        }
      });
    }

    if (recipients === 'all' || recipients === 'parents') {
      const parents = await parentRepository.find({
        relations: ['user']
      });
      parents.forEach(parent => {
        if (parent.user?.email) {
          recipientList.push({
            email: parent.user.email,
            name: `${parent.firstName} ${parent.lastName}`,
            type: 'parent'
          });
        }
      });
    }

    if (recipients === 'all' || recipients === 'teachers') {
      const teachers = await teacherRepository.find({
        where: { isActive: true },
        relations: ['user']
      });
      teachers.forEach(teacher => {
        if (teacher.user?.email) {
          recipientList.push({
            email: teacher.user.email,
            name: `${teacher.firstName} ${teacher.lastName}`,
            type: 'teacher'
          });
        }
      });
    }

    recipientCount = recipientList.length;

    // Replace placeholders in message
    const processedMessage = message
      .replace(/\[School Name\]/g, schoolName)
      .replace(/\[Headmaster Name\]/g, headmasterName)
      .replace(/\[Recipient Name\]/g, '[Name]'); // Will be replaced per recipient

    // Get sender name
    const senderName = user.email || 'School Administration';

    // Save messages to database for parents if they are recipients
    const messageRepository = AppDataSource.getRepository(Message);
    
    if (recipients === 'all' || recipients === 'parents') {
      const parents = await parentRepository.find({
        relations: ['user']
      });
      
      // Create message records for each parent
      const messagePromises = parents.map(async (parent) => {
        // Replace [Recipient Name] with actual parent name
        const personalizedMessage = processedMessage.replace(/\[Name\]/g, `${parent.firstName} ${parent.lastName}`);
        
        const messageRecord = messageRepository.create({
          subject,
          message: personalizedMessage,
          recipients,
          senderId: user.id,
          senderName,
          parentId: parent.id,
          isRead: false
        });
        
        return messageRepository.save(messageRecord);
      });
      
      await Promise.all(messagePromises);
    }

    // In a real implementation, you would:
    // 1. Send emails via an email service (e.g., SendGrid, AWS SES, Nodemailer)
    // 2. Handle email delivery status

    // For now, we'll simulate sending and return success
    // TODO: Implement actual email sending service
    console.log(`Bulk message sent to ${recipientCount} recipients`);
    console.log(`Subject: ${subject}`);
    console.log(`Recipients: ${recipients}`);
    console.log(`Sample message: ${processedMessage.substring(0, 100)}...`);

    res.json({
      message: `Bulk message sent successfully to ${recipientCount} recipient(s)`,
      recipientCount,
      recipients: recipientList.length > 0 ? recipientList.slice(0, 10) : [], // Return first 10 as sample
      note: 'In production, emails would be sent via email service. This is a simulation.'
    });
  } catch (error: any) {
    console.error('Error sending bulk message:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getParentMessages = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    // Find parent by user ID
    const parent = await parentRepository.findOne({
      where: { userId: user.id }
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    // Inbox: messages from the school to this parent (exclude parent→school outbox rows)
    const messages = await messageRepository
      .createQueryBuilder('m')
      .where('m.parentId = :pid', { pid: parent.id })
      .andWhere('(m.isFromParent = :f OR m.isFromParent IS NULL)', { f: false })
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    res.json({
      messages: messages.map(msg => ({
        id: msg.id,
        subject: msg.subject,
        message: msg.message,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        isRead: msg.isRead,
        attachmentUrl: msg.attachmentUrl || null
      }))
    });
  } catch (error: any) {
    console.error('Error fetching parent messages:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Mark a single inbox message as read (parent must own the message). */
export const markParentMessageRead = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Message id is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    const parent = await parentRepository.findOne({
      where: { userId: user.id }
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const message = await messageRepository.findOne({
      where: { id, parentId: parent.id }
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.isFromParent) {
      return res.status(400).json({ message: 'Not an inbox message' });
    }

    message.isRead = true;
    await messageRepository.save(message);

    res.json({
      success: true,
      message: { id: message.id, isRead: true }
    });
  } catch (error: any) {
    console.error('Error marking parent message read:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Parent sends a message to the school (administrators). */
export const sendParentMessageToSchool = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }

    const { subject, message: body } = req.body;
    const sub = typeof subject === 'string' ? subject.trim() : '';
    const text = typeof body === 'string' ? body.trim() : '';
    if (!sub || !text) {
      return res.status(400).json({ message: 'Subject and message are required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    const parent = await parentRepository.findOne({
      where: { userId: user.id }
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const senderName = `${parent.firstName} ${parent.lastName}`.trim() || user.email || 'Parent';

    const record = messageRepository.create({
      subject: sub,
      message: text,
      recipients: 'school',
      senderId: user.id,
      senderName,
      parentId: parent.id,
      isRead: true,
      isFromParent: true
    });
    await messageRepository.save(record);

    res.status(201).json({
      success: true,
      message: {
        id: record.id,
        subject: record.subject,
        message: record.message,
        senderName: record.senderName,
        createdAt: record.createdAt,
        isRead: true
      }
    });
  } catch (error: any) {
    console.error('Error sending parent message to school:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Messages sent by the parent to the school (outbox). */
export const getParentOutboxMessages = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;

    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    const parent = await parentRepository.findOne({
      where: { userId: user.id }
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const rows = await messageRepository.find({
      where: { parentId: parent.id, isFromParent: true },
      order: { createdAt: 'DESC' }
    });

    res.json({
      messages: rows.map(msg => ({
        id: msg.id,
        subject: msg.subject,
        message: msg.message,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        isRead: msg.isRead
      }))
    });
  } catch (error: any) {
    console.error('Error fetching parent outbox:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Admin/superadmin: send email-style message to all parents or one parent; optional attachment. */
export const sendAdminToParents = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const scope = typeof req.body?.scope === 'string' ? req.body.scope.trim() : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const messageBody = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const parentIdRaw = typeof req.body?.parentId === 'string' ? req.body.parentId.trim() : '';

    if (!['all', 'one'].includes(scope)) {
      return res.status(400).json({ message: 'scope must be "all" or "one"' });
    }
    if (!subject) {
      return res.status(400).json({ message: 'Subject is required' });
    }
    if (!messageBody) {
      return res.status(400).json({ message: 'Message is required' });
    }
    if (scope === 'one' && !parentIdRaw) {
      return res.status(400).json({ message: 'parentId is required when scope is "one"' });
    }

    const settingsRepository = AppDataSource.getRepository(Settings);
    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });
    const schoolName = settings?.schoolName || 'School';
    const headmasterName = settings?.headmasterName || 'Headmaster';

    const processedTemplate = messageBody
      .replace(/\[School Name\]/g, schoolName)
      .replace(/\[Headmaster Name\]/g, headmasterName);

    const senderName = user.email || 'School Administration';
    let attachmentUrl: string | null = null;
    if (req.file?.filename) {
      attachmentUrl = `/uploads/messages/${req.file.filename}`;
    }

    let parents: Parent[] = [];
    if (scope === 'all') {
      parents = await parentRepository.find({ relations: ['user'] });
    } else {
      const one = await parentRepository.findOne({
        where: { id: parentIdRaw },
        relations: ['user']
      });
      if (!one) {
        return res.status(404).json({ message: 'Parent not found' });
      }
      parents = [one];
    }

    const recipientsLabel = scope === 'all' ? 'parents' : 'parent';

    const records = parents.map((parent) => {
      const personalized = processedTemplate.replace(
        /\[Recipient Name\]|\[Name\]/g,
        `${parent.firstName} ${parent.lastName}`.trim() || 'Parent'
      );
      return messageRepository.create({
        subject,
        message: personalized,
        recipients: recipientsLabel,
        senderId: user.id,
        senderName,
        parentId: parent.id,
        isRead: false,
        isFromParent: false,
        attachmentUrl
      });
    });

    await messageRepository.save(records);

    res.status(201).json({
      message: `Message queued for ${records.length} parent(s). In production, emails would be sent via your mail provider.`,
      sentCount: records.length,
      scope,
      attachmentUrl
    });
  } catch (error: any) {
    console.error('Error sendAdminToParents:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Admin/superadmin: inbox — messages sent by parents to the school. */
export const getAdminMessagesFromParents = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const messageRepository = AppDataSource.getRepository(Message);
    const rows = await messageRepository.find({
      where: { isFromParent: true },
      relations: ['parent'],
      order: { createdAt: 'DESC' }
    });

    res.json({
      messages: rows.map((m) => ({
        id: m.id,
        subject: m.subject,
        message: m.message,
        senderName: m.senderName,
        createdAt: m.createdAt,
        isRead: m.isRead,
        parentId: m.parentId,
        parentFirstName: m.parent?.firstName || null,
        parentLastName: m.parent?.lastName || null,
        parentEmail: m.parent?.email || null
      }))
    });
  } catch (error: any) {
    console.error('Error getAdminMessagesFromParents:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};
