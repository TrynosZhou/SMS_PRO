import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Student ID Settings
  @Column({ type: 'varchar', default: 'JPS' })
  studentIdPrefix: string;

  // Teacher ID Settings
  @Column({ type: 'varchar', default: 'JPST' })
  teacherIdPrefix: string;

  // Fees Settings (JSON)
  @Column({ type: 'json', nullable: true })
  feesSettings: {
    dayScholarTuitionFee?: number;
    boarderTuitionFee?: number;
    registrationFee?: number;
    deskFee?: number;
    libraryFee?: number;
    sportsFee?: number;
    transportCost?: number; // School transport cost for day scholars
    diningHallCost?: number; // Dining hall (DH) cost for day scholars
    otherFees?: { name: string; amount: number }[];
  } | null;

  // Dynamic grade bands (min % + label), highest minimum first. Falls back to gradeThresholds when empty.
  @Column({ type: 'json', nullable: true })
  gradeBands: { minPercent: number; label: string }[] | null;

  // Grade Thresholds (JSON)
  @Column({ type: 'json', nullable: true })
  gradeThresholds: {
    excellent?: number; // e.g., 90
    veryGood?: number;  // e.g., 80
    good?: number;      // e.g., 60
    satisfactory?: number; // e.g., 40
    needsImprovement?: number; // e.g., 20
    basic?: number; // e.g., 1
  } | null;

  // Grade Labels/Remarks (JSON) - Custom names for each grade level
  @Column({ type: 'json', nullable: true })
  gradeLabels: {
    excellent?: string; // e.g., "Outstanding"
    veryGood?: string;  // e.g., "Very High"
    good?: string;      // e.g., "High"
    satisfactory?: string; // e.g., "Good"
    needsImprovement?: string; // e.g., "Aspiring"
    basic?: string; // e.g., "Basic"
    fail?: string; // e.g., "Unclassified"
  } | null;

  // Grade Points (JSON) - Points awarded per grade (used for Forms 5 & 6)
  @Column({ type: 'json', nullable: true })
  gradePoints: {
    excellent?: number;
    veryGood?: number;
    good?: number;
    satisfactory?: number;
    needsImprovement?: number;
    basic?: number;
    fail?: number;
  } | null;

  // School Information
  @Column({ type: 'text', nullable: true })
  schoolLogo: string | null; // Base64 encoded image or URL

  @Column({ type: 'text', nullable: true })
  schoolLogo2: string | null; // Second school logo - Base64 encoded image or URL

  @Column({ type: 'text', nullable: true })
  schoolName: string | null;

  @Column({ type: 'text', nullable: true })
  schoolAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  schoolEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  headmasterName: string | null;

  @Column({ type: 'text', nullable: true })
  schoolMotto: string | null; // School motto or tagline (line 1)

  @Column({ type: 'text', nullable: true })
  schoolMotto2: string | null;

  @Column({ type: 'text', nullable: true })
  schoolMotto3: string | null;

  // Academic Year
  @Column({ type: 'varchar', nullable: true })
  academicYear: string | null; // e.g., "2024/2025"

  // Current Term
  @Column({ type: 'varchar', nullable: true })
  currentTerm: string | null; // e.g., "Term 1 2024"

  // Active Term (for fetching across all pages)
  @Column({ type: 'varchar', nullable: true })
  activeTerm: string | null; // e.g., "Term 1 2024"

  // Term Dates
  @Column({ type: 'date', nullable: true })
  termStartDate: Date | null; // Opening day of the term

  @Column({ type: 'date', nullable: true })
  termEndDate: Date | null; // Closing day of the term

  // Currency Symbol
  @Column({ type: 'varchar', default: '$' })
  currencySymbol: string; // e.g., "$", "KES", "€", "£"

  /** School bank account for fee deposits (shown on invoice PDFs). */
  @Column({ type: 'json', nullable: true })
  bankingDetails: {
    accountName?: string;
    bank?: string;
    branch?: string;
    accountNumber?: string;
  } | null;

  // Module Access Control (JSON)
  @Column({ type: 'json', nullable: true })
  moduleAccess: {
    teachers?: {
      students?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      settings?: boolean;
    };
    parents?: {
      reportCards?: boolean;
      invoices?: boolean;
      dashboard?: boolean;
    };
    accountant?: {
      students?: boolean;
      invoices?: boolean;
      finance?: boolean;
      dashboard?: boolean;
      settings?: boolean;
    };
    admin?: {
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      settings?: boolean;
      dashboard?: boolean;
    };
    students?: {
      dashboard?: boolean;
      subjects?: boolean;
      assignments?: boolean;
      reportCards?: boolean;
      finance?: boolean;
    };
    demoAccount?: {
      dashboard?: boolean;
      students?: boolean;
      teachers?: boolean;
      classes?: boolean;
      subjects?: boolean;
      exams?: boolean;
      reportCards?: boolean;
      rankings?: boolean;
      finance?: boolean;
      attendance?: boolean;
      assignments?: boolean;
      messages?: boolean;
      accounts?: boolean;
      settings?: boolean;
    };
  } | null;

  // Promotion Rules (JSON) - Maps current class to next class
  @Column({ type: 'json', nullable: true })
  promotionRules: {
    [currentClass: string]: string; // e.g., "ECD A": "ECD B", "Grade 1": "Grade 2"
  } | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

