import * as XLSX from 'xlsx';
import fs from 'fs';

function readXlsx() {
  const buf = fs.readFileSync('test.xlsx');
  const workbook = XLSX.read(buf);
  console.log("Sheet names:", workbook.SheetNames);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  console.log("Rows:");
  console.log(JSON.stringify(rows, null, 2));
}

readXlsx();
