// Global type augmentations
declare global {
  // Node.js globals - these should be provided by @types/node
  // But we declare them here as a fallback
  var __dirname: string;
  var __filename: string;
  var console: Console;
  var process: NodeJS.Process;
  var require: NodeRequire;
}

// Buffer type declaration
declare const Buffer: {
  new (str: string, encoding?: string): Buffer;
  from(str: string, encoding?: string): Buffer;
  concat(buffers: Buffer[]): Buffer;
  isBuffer(obj: any): obj is Buffer;
  alloc(size: number): Buffer;
  allocUnsafe(size: number): Buffer;
  prototype: Buffer;
};

interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
  write(string: string, offset?: number, length?: number, encoding?: string): number;
  slice(start?: number, end?: number): Buffer;
  copy(target: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  length: number;
}

// Extend Express namespace for multer
declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
    }
  }
}

export {};

