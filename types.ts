export interface TextField {
  id: number;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
}

export interface ImageFieldFrame {
  color: string;
  thickness: number;
}

export interface ImageField {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linkColumn: string;
  frame: ImageFieldFrame;
}

export interface PhotoFiles {
  [key: string]: string; // key is basename, value is base64 data URL
}

export interface GeneratedCredential {
  dataUrl: string;
  filename: string;
}

export interface ValidationError {
  message: string;
  suggestion: string;
}

export interface ValidationErrors {
  [key: string]: ValidationError;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export interface ImageDimensions {
    width: number;
    height: number;
}

export interface MousePosition {
    offsetX: number;
    offsetY: number;
    trueX: number;
    trueY: number;
}
