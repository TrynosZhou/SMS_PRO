import 'reflect-metadata';
import dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Load environment variables
dotenv.config();

// Import entities
import { User } from '../src/entities/User';
import { Student } from '../src/entities/Student';
import { Teacher } from '../src/entities/Teacher';
import { Class } from '../src/entities/Class';
import { Subject } from '../src/entities/Subject';
import { Exam } from '../src/entities/Exam';
import { Marks } from '../src/entities/Marks';
import { Invoice } from '../src/entities/Invoice';
import { Parent } from '../src/entities/Parent';
import { Settings } from '../src/entities/Settings';
import { ReportCardRemarks } from '../src/entities/ReportCardRemarks';
import { Message } from '../src/entities/Message';
import { UniformItem } from '../src/entities/UniformItem';
import { InvoiceUniformItem } from '../src/entities/InvoiceUniformItem';
import { Attendance } from '../src/entities/Attendance';
import { PromotionRule } from '../src/entities/PromotionRule';
import { RecordBook } from '../src/entities/RecordBook';
import { TeacherClass } from '../src/entities/TeacherClass';
const entities = [
  User, Student, Teacher, Class, Subject, Exam, Marks, Invoice, Parent,
  Settings, ReportCardRemarks, Message, UniformItem, InvoiceUniformItem,
  Attendance, PromotionRule, RecordBook
];

async function syncSchema() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: String(process.env.DB_PASSWORD || ''),
    database: 'sms_school',
    synchronize: true, // Enable synchronize
    logging: true, // Enable logging to see what's happening
    entities: entities,
  });

  try {
    console.log(`🔧 Syncing database schema for ${process.env.DB_NAME}...`);
    console.log('📋 This will create all missing tables based on your entities\n');
    
    await dataSource.initialize();
    console.log('✅ Database connected');
    
    // Synchronize will happen automatically on initialize when synchronize: true
    // But we can also call it explicitly
    await dataSource.synchronize(false);
    
    console.log('✅ Schema synchronized successfully!');
    console.log('✅ All tables created with proper structure, constraints, and indexes\n');
    
    await dataSource.destroy();
    
    process.env.DB_NAME = originalDbName;
    
    console.log('✅ Done! You can now run: node scripts/copy-tables-only.js');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error syncing schema:', error.message);
    console.error(error);

    process.exit(1);
  }
}

syncSchema();