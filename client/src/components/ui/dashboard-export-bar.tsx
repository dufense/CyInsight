import { useState, useRef, useCallback, type ReactNode, type RefObject } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, ImageRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import { Image, FileText, FileType, Download, Loader2, ImageMinus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardExportBarProps {
  dashboardTitle: string;
  containerRef: RefObject<HTMLDivElement>;
  onExcelExport?: () => { sheetName: string; data: Record<string, any>[] }[] | null;
}

export function DashboardExportBar({ dashboardTitle, containerRef, onExcelExport }: DashboardExportBarProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const captureFullDashboard = useCallback(async (transparent = false) => {
    if (!containerRef.current) return null;
    const isDark = document.documentElement.classList.contains('dark');
    return html2canvas(containerRef.current, {
      backgroundColor: transparent ? null : (isDark ? '#1a1a2e' : '#ffffff'),
      scale: 3,
      useCORS: true,
      logging: false,
      windowWidth: containerRef.current.scrollWidth,
      windowHeight: containerRef.current.scrollHeight,
    });
  }, [containerRef]);

  const exportDashboard = useCallback(async (type: "png" | "png_transparent" | "pdf" | "docx") => {
    if (!containerRef.current) return;
    setExporting(type);
    try {
      const isTransparent = type === "png_transparent";
      const canvas = await captureFullDashboard(isTransparent);
      if (!canvas) return;
      const safeName = dashboardTitle.replace(/\s+/g, "_");
      const timestamp = new Date().toISOString().slice(0, 10);

      if (type === "png" || type === "png_transparent") {
        const link = document.createElement("a");
        link.download = `${safeName}_${timestamp}${isTransparent ? "_transparent" : ""}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else if (type === "pdf") {
        const imgData = canvas.toDataURL("image/png", 1.0);
        const scaleFactor = 0.25;
        const pdfWidth = canvas.width * scaleFactor;
        const pdfHeight = canvas.height * scaleFactor;
        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
          unit: "px",
          format: [pdfWidth, pdfHeight],
          compress: true,
        });
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
        pdf.save(`${safeName}_${timestamp}.pdf`);
      } else if (type === "docx") {
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
        const arrayBuffer = await blob.arrayBuffer();
        const maxWidth = 700;
        const ratio = canvas.height / canvas.width;
        const imgWidth = Math.min(maxWidth, canvas.width / 2);
        const imgHeight = imgWidth * ratio;

        const doc = new Document({
          sections: [{
            properties: { page: { size: { width: 12240, height: Math.max(15840, imgHeight * 20) } } },
            children: [
              new Paragraph({ text: dashboardTitle, heading: HeadingLevel.HEADING_1 }),
              new Paragraph({ text: `Generated: ${new Date().toLocaleString()}`, spacing: { after: 200 } }),
              new Paragraph({
                children: [
                  new ImageRun({
                    data: arrayBuffer,
                    transformation: { width: imgWidth, height: imgHeight },
                    type: "png",
                  }),
                ],
              }),
            ],
          }],
        });

        const docBlob = await Packer.toBlob(doc);
        const link = document.createElement("a");
        link.download = `${safeName}_${timestamp}.docx`;
        link.href = URL.createObjectURL(docBlob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (e) { console.error("Dashboard export failed:", e); } finally {
      setExporting(null);
    }
  }, [dashboardTitle, containerRef, captureFullDashboard]);

  const exportExcel = useCallback(async () => {
    if (!onExcelExport) return;
    setExporting("xlsx");
    try {
      const sheets = onExcelExport();
      if (!sheets || sheets.length === 0) {
        setExporting(null);
        return;
      }
      const wb = XLSX.utils.book_new();
      for (const sheet of sheets) {
        const ws = XLSX.utils.json_to_sheet(sheet.data);
        XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.substring(0, 31));
      }
      const safeName = dashboardTitle.replace(/\s+/g, "_");
      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${safeName}_${timestamp}.xlsx`);
    } catch (e) { console.error("Excel export failed:", e); }
    finally { setExporting(null); }
  }, [dashboardTitle, onExcelExport]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!!exporting}
          data-testid="dashboard-export-trigger"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {exporting ? `Exporting ${exporting.toUpperCase()}...` : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportDashboard("png")} data-testid="dashboard-export-png">
          <Image className="w-4 h-4 mr-2" /> Export as PNG (HD)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportDashboard("png_transparent")} data-testid="dashboard-export-png-transparent">
          <ImageMinus className="w-4 h-4 mr-2" /> Export as Transparent PNG (HD)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportDashboard("pdf")} data-testid="dashboard-export-pdf">
          <FileText className="w-4 h-4 mr-2" /> Export as PDF (HD)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportDashboard("docx")} data-testid="dashboard-export-word">
          <FileType className="w-4 h-4 mr-2" /> Export as Word
        </DropdownMenuItem>
        {onExcelExport && (
          <DropdownMenuItem onClick={exportExcel} data-testid="dashboard-export-excel">
            <Table2 className="w-4 h-4 mr-2" /> Export as Excel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useDashboardExportRef() {
  const ref = useRef<HTMLDivElement>(null);
  return ref;
}
