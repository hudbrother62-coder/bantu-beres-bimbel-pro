import { Data, definitions, Row } from "./domain";
export async function downloadExcel(
  name: string,
  rows: Data[],
  headers?: string[],
  guide?: Data[],
) {
  const Excel = await import("exceljs");
  const book = new Excel.Workbook();
  book.creator = "Bantu Beres Bimbel Pro";
  const sheet = book.addWorksheet("Data");
  const keys = headers || Object.keys(rows[0] || {});
  sheet.addRow(keys);
  for (const row of rows) sheet.addRow(keys.map((k) => row[k] ?? ""));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF762484" },
  };
  sheet.columns.forEach((c) => {
    c.width = 24;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (guide) {
    const g = book.addWorksheet("Panduan");
    g.addRow(["Kolom", "Petunjuk"]);
    guide.forEach((r) => g.addRow([r.column, r.help]));
    g.getColumn(1).width = 25;
    g.getColumn(2).width = 90;
  }
  const bytes = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function readExcel(file: File) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Ukuran file maksimal 5 MB.");
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("Gunakan berkas .xlsx sesuai template.");
  const Excel = await import("exceljs");
  const b = new Excel.Workbook();
  await b.xlsx.load(await file.arrayBuffer());
  const s = b.getWorksheet("Data") || b.worksheets[0];
  if (!s || s.rowCount > 501) throw new Error("Maksimal 500 baris data.");
  const keys: string[] = [];
  s.getRow(1).eachCell((c, n) => (keys[n - 1] = String(c.text).trim()));
  const result: Data[] = [];
  s.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Data = {};
    keys.forEach((k, i) => {
      const c = row.getCell(i + 1);
      if (c.type === 6)
        throw new Error(
          `Baris ${n}: formula tidak diterima. Gunakan nilai biasa.`,
        );
      obj[k] =
        c.value instanceof Date
          ? c.value.toISOString().slice(0, 10)
          : typeof c.value === "number"
            ? c.value
            : c.text;
    });
    if (Object.values(obj).some((v) => v !== "")) result.push(obj);
  });
  return result;
}
export function templateFor(kind: string, rows: Row[]) {
  const def = definitions[kind];
  const guide = def.fields.map((f) => ({
    column: f.key,
    help: `${f.label}${f.required ? " (wajib)" : ""}${f.options ? " — " + f.options.join(", ") : ""}${f.ref ? " — gunakan ID dari sheet Referensi / ekspor " + definitions[f.ref].title : ""}`,
  }));
  return downloadExcel(
    "template-" + kind,
    [],
    def.fields.map((f) => f.key),
    [
      ...guide,
      ...rows
        .filter((r) => !r.archived && def.fields.some((f) => f.ref === r.kind))
        .map((r) => ({ column: r.id, help: r.kind + " / " + r.data.name })),
    ],
  );
}
