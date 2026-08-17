import * as XLSX from 'xlsx';

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: {
    [sheetName: string]: string[][];
  };
}

/**
 * Extracts clean cell value including any underlying hyperlink target or HYPERLINK formula URL.
 */
function getEnhancedCellValue(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';

  let textVal = '';
  if (cell.w !== undefined && cell.w !== null) {
    textVal = String(cell.w).trim();
  } else if (cell.v !== undefined && cell.v !== null) {
    textVal = String(cell.v).trim();
  }

  // Extract explicit hyperlink target from SheetJS cell.l
  const hyperlinkTarget = cell.l?.Target?.trim() || '';

  // Extract formula hyperlink if present (e.g., =HYPERLINK("https://...", "Label"))
  let formulaTarget = '';
  if (cell.f && typeof cell.f === 'string' && cell.f.toUpperCase().includes('HYPERLINK')) {
    const match = cell.f.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
    if (match && match[1]) {
      formulaTarget = match[1].trim();
    }
  }

  const targetUrl = hyperlinkTarget || formulaTarget;

  if (targetUrl) {
    // If the text value is already the URL itself, just return it
    if (textVal === targetUrl || textVal.toLowerCase().startsWith('http://') || textVal.toLowerCase().startsWith('https://')) {
      return targetUrl;
    }
    // If text is different from target URL, provide both so parser gets the exercise name and the video link
    return `${textVal} (Link: ${targetUrl})`;
  }

  return textVal;
}

/**
 * Converts a worksheet to a 2D string array while preserving all hyperlinks and formulas.
 */
function worksheetTo2DArray(worksheet: XLSX.WorkSheet): string[][] {
  if (!worksheet || !worksheet['!ref']) return [];

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  const rows: string[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    let hasContent = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellAddress];
      const val = getEnhancedCellValue(cell);
      row.push(val);
      if (val !== '') hasContent = true;
    }

    // Keep non-empty rows
    if (hasContent) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parses an Excel (.xls, .xlsx) or CSV file into a structured workbook format with sheet names and 2D arrays.
 */
export async function parseExcelWorkbook(file: File): Promise<ParsedWorkbook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellFormula: true,
          cellHTML: true,
          cellNF: true
        });
        
        const sheetNames = workbook.SheetNames;
        const sheets: { [key: string]: string[][] } = {};
        
        sheetNames.forEach((name) => {
          const sheet = workbook.Sheets[name];
          sheets[name] = worksheetTo2DArray(sheet);
        });
        
        resolve({
          sheetNames,
          sheets,
        });
      } catch (error) {
        console.error("Error parsing workbook:", error);
        reject(new Error("Unable to parse current Excel/CSV spreadsheet format. Ensure the file is not corrupted."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parses an Excel (.xls, .xlsx) or CSV file and extracts its content as clean, readable text.
 * If the file is a text/csv file, it reads it directly as text.
 * If the file is an Excel file, it converts sheets into an enriched text table representation preserving all video links.
 */
export async function getFileContentAsText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellFormula: true,
            cellHTML: true,
            cellNF: true
          });
          let fullText = '';
          
          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const rows = worksheetTo2DArray(worksheet);
            if (rows.length > 0) {
              const tableRepresentation = rows.map(r => r.join(' | ')).join('\n');
              fullText += `### Sheet: ${sheetName} ###\n${tableRepresentation}\n\n`;
            }
          });

          if (!fullText.trim()) {
            resolve(`[Excel file "${file.name}" was loaded but appeared to be empty or had no text content]`);
          } else {
            resolve(fullText);
          }
        } catch (error) {
          console.error("Error parsing Excel file in browser:", error);
          reject(new Error('Failed to parse Excel file format. Please make sure the file is not corrupted.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read the excel file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // Fallback to text reading for txt, csv, or other text-like files
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string || '');
    reader.onerror = () => reject(new Error('Failed to read file as text.'));
    reader.readAsText(file);
  });
}

