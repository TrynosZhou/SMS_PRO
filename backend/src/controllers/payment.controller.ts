import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Payment, PaymentMethod, PaymentStatus } from '../entities/Payment';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { AuthRequest } from '../middleware/auth';
import { processPayment, verifyPayment, PaymentRequest } from '../utils/paymentGateway';
import { parseAmount } from '../utils/numberUtils';
import { createReceiptPDF } from '../utils/receiptPdfGenerator';
import { Settings } from '../entities/Settings';
import { logPaymentAuditEvent } from '../utils/paymentAuditLogger';
import { PaymentAuditEventType } from '../entities/PaymentAuditLog';
import { ensurePaymentsTable } from '../utils/ensurePaymentsTable';

/**
 * Process online payment
 */
export const processOnlinePayment = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePaymentsTable();

    const {
      invoiceId,
      amount,
      paymentMethod,
      phoneNumber,
      cardNumber,
      cardExpiry,
      cardCvv,
      cardholderName,
      description
    } = req.body;

    if (!invoiceId || !amount || !paymentMethod) {
      return res.status(400).json({ message: 'Invoice ID, amount, and payment method are required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const paymentRepository = AppDataSource.getRepository(Payment);
    const studentRepository = AppDataSource.getRepository(Student);

    // Get invoice
    const invoice = await invoiceRepository.findOne({
      where: { id: invoiceId },
      relations: ['student']
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const paymentAmount = parseAmount(amount);
    if (paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than 0' });
    }

    // Validate payment method
    let method: PaymentMethod;
    switch (paymentMethod.toLowerCase()) {
      case 'ecocash':
        method = PaymentMethod.ECOCASH;
        if (!phoneNumber) {
          return res.status(400).json({ message: 'Phone number is required for EcoCash payment' });
        }
        break;
      case 'innbucks':
        method = PaymentMethod.INNBUCKS;
        if (!phoneNumber) {
          return res.status(400).json({ message: 'Phone number is required for InnBucks payment' });
        }
        break;
      case 'visa':
        method = PaymentMethod.VISA;
        if (!cardNumber || !cardExpiry || !cardCvv || !cardholderName) {
          return res.status(400).json({ message: 'Card details are required for Visa payment' });
        }
        break;
      case 'mastercard':
        method = PaymentMethod.MASTERCARD;
        if (!cardNumber || !cardExpiry || !cardCvv || !cardholderName) {
          return res.status(400).json({ message: 'Card details are required for Mastercard payment' });
        }
        break;
      default:
        return res.status(400).json({ message: 'Invalid payment method' });
    }

    // Get payment gateway configuration from environment variables
    const gatewayConfig = {
      ecocashMerchantCode: process.env.ECOCASH_MERCHANT_CODE,
      ecocashApiKey: process.env.ECOCASH_API_KEY,
      innbucksMerchantId: process.env.INNBUCKS_MERCHANT_ID,
      innbucksApiKey: process.env.INNBUCKS_API_KEY,
      visaMerchantId: process.env.VISA_MERCHANT_ID,
      visaApiKey: process.env.VISA_API_KEY,
      visaSecretKey: process.env.VISA_SECRET_KEY
    };

    // Create payment record
    const payment = paymentRepository.create({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      amount: paymentAmount,
      paymentMethod: method,
      status: PaymentStatus.PENDING,
      paymentDetails: JSON.stringify({
        phoneNumber: phoneNumber || null,
        cardLast4: cardNumber ? cardNumber.slice(-4) : null,
        cardholderName: cardholderName || null
      })
    });

    const savedPayment = await paymentRepository.save(payment);

    // Audit: payment creation (initial record before gateway updates)
    if (req.user) {
      try {
        await logPaymentAuditEvent({
          user: { id: req.user.id, username: req.user.username, role: req.user.role },
          student: invoice.student,
          amountPaid: paymentAmount,
          paymentMethod: method,
          referenceNumber: null,
          eventAt: savedPayment.createdAt || new Date(),
          eventType: PaymentAuditEventType.CREATE,
          paymentId: savedPayment.id,
          invoiceId: invoice.id,
          existingPayment: savedPayment,
          previousInvoiceWasConfirmed: false
        });
      } catch (auditErr) {
        console.error('Payment audit (create) failed:', auditErr);
      }
    }

    // Process payment through gateway
    const paymentRequest: PaymentRequest = {
      amount: paymentAmount,
      method: paymentMethod.toLowerCase() as 'ecocash' | 'innbucks' | 'visa' | 'mastercard',
      phoneNumber,
      cardNumber,
      cardExpiry,
      cardCvv,
      cardholderName,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      description: description || `Payment for invoice ${invoice.invoiceNumber}`
    };

    const paymentResult = await processPayment(paymentRequest, gatewayConfig);

    // Update payment record with gateway response
    savedPayment.transactionId = paymentResult.transactionId || null;
    savedPayment.referenceNumber = paymentResult.referenceNumber || null;
    savedPayment.status = paymentResult.status === 'completed' 
      ? PaymentStatus.COMPLETED 
      : paymentResult.status === 'failed' 
        ? PaymentStatus.FAILED 
        : PaymentStatus.PROCESSING;
    savedPayment.gatewayResponse = JSON.stringify(paymentResult.gatewayResponse || {});
    
    if (paymentResult.status === 'completed') {
      savedPayment.processedAt = new Date();
    }

    await paymentRepository.save(savedPayment);

    // Audit: payment update after gateway response
    if (req.user) {
      try {
        await logPaymentAuditEvent({
          user: { id: req.user.id, username: req.user.username, role: req.user.role },
          student: invoice.student,
          amountPaid: paymentAmount,
          paymentMethod: method,
          referenceNumber: savedPayment.referenceNumber,
          eventAt: savedPayment.processedAt || savedPayment.updatedAt || new Date(),
          eventType: PaymentAuditEventType.UPDATE,
          paymentId: savedPayment.id,
          invoiceId: invoice.id,
          existingPayment: savedPayment,
          previousInvoiceWasConfirmed: false
        });
      } catch (auditErr) {
        console.error('Payment audit (update) failed:', auditErr);
      }
    }

    // If payment successful, update invoice
    if (paymentResult.success && paymentResult.status === 'completed') {
      const oldPaidAmount = parseAmount(invoice.paidAmount);
      const currentBalance = parseAmount(invoice.balance);
      const paymentTowardBalance = Math.min(paymentAmount, currentBalance);
      const overPayment = Math.max(0, paymentAmount - paymentTowardBalance);

      invoice.paidAmount = oldPaidAmount + paymentTowardBalance;
      invoice.balance = Math.max(0, currentBalance - paymentTowardBalance);

      if (overPayment > 0) {
        invoice.prepaidAmount = parseAmount(invoice.prepaidAmount) + overPayment;
      }

      if (invoice.balance <= 0) {
        invoice.status = InvoiceStatus.PAID;
      } else if (invoice.paidAmount > 0) {
        invoice.status = InvoiceStatus.PARTIAL;
      }

      await invoiceRepository.save(invoice);
    }

    res.json({
      message: paymentResult.success 
        ? 'Payment processed successfully' 
        : 'Payment processing failed',
      payment: savedPayment,
      invoice: paymentResult.success ? invoice : null,
      gatewayResponse: paymentResult
    });
  } catch (error: any) {
    console.error('Error processing online payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Get payment history for an invoice
 */
export const getInvoicePayments = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePaymentsTable();

    const { invoiceId } = req.params;
    const paymentRepository = AppDataSource.getRepository(Payment);

    const payments = await paymentRepository.find({
      where: { invoiceId },
      relations: ['student'],
      order: { createdAt: 'DESC' }
    });

    res.json({ payments });
  } catch (error: any) {
    if (error?.code === '42P01') {
      return res.status(500).json({ message: 'Payments table not ready. Please run migrations.' });
    }
    console.error('Error fetching invoice payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Get payment by ID
 */
export const getPayment = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePaymentsTable();

    const { id } = req.params;
    const paymentRepository = AppDataSource.getRepository(Payment);

    const payment = await paymentRepository.findOne({
      where: { id },
      relations: ['invoice', 'student']
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({ payment });
  } catch (error: any) {
    // If migrations haven't created the payments table yet, return a clearer error.
    if (error?.code === '42P01') {
      return res.status(500).json({ message: 'Payments table not ready. Please run migrations.' });
    }
    // If route params are not a UUID (e.g. accidental route collision), fail fast.
    if (error?.code === '22P02') {
      return res.status(400).json({ message: 'Invalid payment id' });
    }
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Verify payment status
 */
export const verifyPaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePaymentsTable();

    const { id } = req.params;
    const paymentRepository = AppDataSource.getRepository(Payment);

    const payment = await paymentRepository.findOne({
      where: { id },
      relations: ['invoice']
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (!payment.transactionId) {
      return res.status(400).json({ message: 'Payment does not have a transaction ID' });
    }

    // Get payment gateway configuration
    const gatewayConfig = {
      ecocashMerchantCode: process.env.ECOCASH_MERCHANT_CODE,
      ecocashApiKey: process.env.ECOCASH_API_KEY,
      innbucksMerchantId: process.env.INNBUCKS_MERCHANT_ID,
      innbucksApiKey: process.env.INNBUCKS_API_KEY,
      visaMerchantId: process.env.VISA_MERCHANT_ID,
      visaApiKey: process.env.VISA_API_KEY,
      visaSecretKey: process.env.VISA_SECRET_KEY
    };

    const method = payment.paymentMethod === PaymentMethod.ECOCASH ? 'ecocash' :
                   payment.paymentMethod === PaymentMethod.INNBUCKS ? 'innbucks' :
                   payment.paymentMethod === PaymentMethod.VISA ? 'visa' : 'mastercard';

    const verificationResult = await verifyPayment(payment.transactionId, method, gatewayConfig);

    // Update payment status if changed
    if (verificationResult.status === 'completed' && payment.status !== PaymentStatus.COMPLETED) {
      payment.status = PaymentStatus.COMPLETED;
      payment.processedAt = new Date();
      await paymentRepository.save(payment);

      // Audit: payment status updated to completed
      try {
        const studentRepository = AppDataSource.getRepository(Student);
        const student = await studentRepository.findOne({ where: { id: payment.studentId } });
        if (student && req.user) {
          await logPaymentAuditEvent({
            user: { id: req.user.id, username: req.user.username, role: req.user.role },
            student,
            amountPaid: payment.amount,
            paymentMethod: payment.paymentMethod,
            referenceNumber: payment.referenceNumber,
            eventAt: payment.processedAt || payment.updatedAt || new Date(),
            eventType: PaymentAuditEventType.UPDATE,
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            existingPayment: payment,
            previousInvoiceWasConfirmed: false
          });
        }
      } catch (auditErr) {
        console.error('Payment audit (verify) failed:', auditErr);
      }

      // Update invoice if payment is now completed
      if (payment.invoice) {
        const invoiceRepository = AppDataSource.getRepository(Invoice);
        const invoice = await invoiceRepository.findOne({ where: { id: payment.invoiceId } });
        
        if (invoice) {
          const oldPaidAmount = parseAmount(invoice.paidAmount);
          const currentBalance = parseAmount(invoice.balance);
          const paymentAmount = parseAmount(payment.amount);
          const paymentTowardBalance = Math.min(paymentAmount, currentBalance);
          const overPayment = Math.max(0, paymentAmount - paymentTowardBalance);

          invoice.paidAmount = oldPaidAmount + paymentTowardBalance;
          invoice.balance = Math.max(0, currentBalance - paymentTowardBalance);

          if (overPayment > 0) {
            invoice.prepaidAmount = parseAmount(invoice.prepaidAmount) + overPayment;
          }

          if (invoice.balance <= 0) {
            invoice.status = InvoiceStatus.PAID;
          } else if (invoice.paidAmount > 0) {
            invoice.status = InvoiceStatus.PARTIAL;
          }

          await invoiceRepository.save(invoice);
        }
      }
    }

    res.json({
      payment,
      verification: verificationResult
    });
  } catch (error: any) {
    if (error?.code === '42P01') {
      return res.status(500).json({ message: 'Payments table not ready. Please run migrations.' });
    }
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Generate payment receipt
 */
export const generatePaymentReceipt = async (req: AuthRequest, res: Response) => {
  try {
    await ensurePaymentsTable();

    const { id } = req.params;
    const paymentRepository = AppDataSource.getRepository(Payment);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const payment = await paymentRepository.findOne({
      where: { id },
      relations: ['invoice', 'student']
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const student = await studentRepository.findOne({
      where: { id: payment.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const receiptNumber = payment.referenceNumber || `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    const receiptPDF = await createReceiptPDF({
      invoice: payment.invoice!,
      student,
      settings,
      paymentAmount: payment.amount,
      paymentDate: payment.processedAt || payment.createdAt,
      paymentMethod: payment.paymentMethod,
      notes: `Online payment via ${payment.paymentMethod}. Transaction ID: ${payment.transactionId || 'N/A'}`,
      receiptNumber,
      isPrepayment: false
    });

    const sanitizedName = `${student.lastName || 'student'}-${student.firstName || ''}`
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-]/g, '')
      .toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${sanitizedName ? sanitizedName : 'receipt'}-${receiptNumber}.pdf`);
    res.send(receiptPDF);
  } catch (error: any) {
    if (error?.code === '42P01') {
      return res.status(500).json({ message: 'Payments table not ready. Please run migrations.' });
    }
    console.error('Error generating payment receipt:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

