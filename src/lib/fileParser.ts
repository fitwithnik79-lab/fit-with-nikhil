import * as XLSX from 'xlsx';

/**
 * Parses an Excel (.xls, .xlsx) or CSV file and extracts its content as clean, readable text.
 * If the file is a text/csv file, it reads it directly as text.
 * If the file is an Excel file, it converts sheets into a CSV-like text representation.
 */
export async function getFileContentAsText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: 'array' });
          let fullText = '';
          
          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            // SheetJS sheet_to_csv provides an excellent text/tabbed layout
            const csvContent = XLSX.utils.sheet_to_csv(worksheet);
            if (csvContent.trim()) {
              fullText += `### Sheet: ${sheetName} ###\n${csvContent}\n\n`;
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
