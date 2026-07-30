import { buildColumnsFromRows } from "./typeInference.js";

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === "undefined") return reject(new Error("CSV parser not loaded"));
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if (!rows.length) return reject(new Error("The CSV file has no rows"));
        const headers = results.meta.fields || Object.keys(rows[0]);
        const columns = buildColumnsFromRows(rows, headers);
        resolve({
          tables: [{ name: baseName(file.name), sourceFile: file.name, rowCount: rows.length, columns }],
        });
      },
      error: (err) => reject(err),
    });
  });
}

export function parseXLSXFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === "undefined") return reject(new Error("Excel parser not loaded"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const tables = wb.SheetNames.map((sheetName) => {
          const sheet = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (!rows.length) return null;
          const headers = Object.keys(rows[0]);
          const columns = buildColumnsFromRows(rows, headers);
          return { name: sheetName, sourceFile: file.name, rowCount: rows.length, columns };
        }).filter(Boolean);
        if (!tables.length) return reject(new Error("No data found in the workbook"));
        resolve({ tables });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function parseJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const tables = [];

        if (Array.isArray(data)) {
          if (data.length && typeof data[0] === "object") {
            const headers = Object.keys(data[0]);
            tables.push({ name: baseName(file.name), sourceFile: file.name, rowCount: data.length, columns: buildColumnsFromRows(data, headers) });
          }
        } else if (data && typeof data === "object") {
          Object.entries(data).forEach(([key, value]) => {
            if (Array.isArray(value) && value.length && typeof value[0] === "object") {
              const headers = Object.keys(value[0]);
              tables.push({ name: key, sourceFile: file.name, rowCount: value.length, columns: buildColumnsFromRows(value, headers) });
            }
          });
          if (!tables.length) {
            // single flat object -> one-row table
            const headers = Object.keys(data);
            tables.push({ name: baseName(file.name), sourceFile: file.name, rowCount: 1, columns: buildColumnsFromRows([data], headers) });
          }
        }

        if (!tables.length) return reject(new Error("No tabular data found in this JSON file"));
        resolve({ tables });
      } catch (err) {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.readAsText(file);
  });
}

export function parseSchemaFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") return parseCSVFile(file);
  if (ext === "xlsx" || ext === "xls") return parseXLSXFile(file);
  if (ext === "json") return parseJSONFile(file);
  return Promise.reject(new Error(`Unsupported file type: .${ext}`));
}
