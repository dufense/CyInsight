import { useState, useRef, useCallback, type ReactNode } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, ImageRun, HeadingLevel } from "docx";
import { Image, FileText, X, Maximize2, FileType, ImageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ExpandableCard({ title, children, className, headerExtra, icon: HeaderIcon }: {
  title: string; children: ReactNode; className?: string; headerExtra?: ReactNode; icon?: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const captureCanvas = useCallback(async (transparent = false) => {
    if (!contentRef.current) return null;
    const isDark = document.documentElement.classList.contains('dark');
    return html2canvas(contentRef.current, {
      backgroundColor: transparent ? null : (isDark ? '#1a1a2e' : '#ffffff'),
      scale: 2,
      useCORS: true,
    });
  }, []);

  const exportAs = useCallback(async (type: "png" | "png_transparent" | "pdf" | "docx") => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const isTransparent = type === "png_transparent";
      const canvas = await captureCanvas(isTransparent);
      if (!canvas) return;
      const safeName = title.replace(/\s+/g, "_");

      if (type === "png" || type === "png_transparent") {
        const link = document.createElement("a");
        link.download = `${safeName}${isTransparent ? "_transparent" : ""}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else if (type === "pdf") {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px",
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save(`${safeName}.pdf`);
      } else if (type === "docx") {
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
        const arrayBuffer = await blob.arrayBuffer();
        const maxWidth = 600;
        const ratio = canvas.height / canvas.width;
        const imgWidth = Math.min(maxWidth, canvas.width / 2);
        const imgHeight = imgWidth * ratio;

        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({
                text: title,
                heading: HeadingLevel.HEADING_1,
              }),
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
        link.download = `${safeName}.docx`;
        link.href = URL.createObjectURL(docBlob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (e) { console.error("Export failed:", e); }
    setExporting(false);
  }, [title, captureCanvas]);

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="expanded-overlay" onClick={() => setExpanded(false)}>
        <div className="bg-card border rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[95vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold uppercase tracking-wider">{title}</span>
            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => exportAs("png")} disabled={exporting} data-testid="export-png" className="text-[10px] gap-1">
                <Image className="w-3.5 h-3.5" /> PNG
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportAs("png_transparent")} disabled={exporting} data-testid="export-png-transparent" className="text-[10px] gap-1">
                <ImageMinus className="w-3.5 h-3.5" /> Transparent
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportAs("pdf")} disabled={exporting} data-testid="export-pdf" className="text-[10px] gap-1">
                <FileText className="w-3.5 h-3.5" /> PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportAs("docx")} disabled={exporting} data-testid="export-docx" className="text-[10px] gap-1">
                <FileType className="w-3.5 h-3.5" /> Word
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} data-testid="close-expanded">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div ref={contentRef} className="p-6">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          {HeaderIcon && <HeaderIcon className="w-4 h-4" />}
          {title}
        </CardTitle>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button onClick={() => exportAs("png")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as PNG" data-testid="inline-export-png">
            <Image className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => exportAs("png_transparent")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as Transparent PNG" data-testid="inline-export-png-transparent">
            <ImageMinus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => exportAs("pdf")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as PDF" data-testid="inline-export-pdf">
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => exportAs("docx")} disabled={exporting} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export as Word" data-testid="inline-export-docx">
            <FileType className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(true)} data-testid="expand-card" className="p-1 rounded text-muted-foreground hover:text-foreground" title="Expand">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0" ref={contentRef}>{children}</CardContent>
    </Card>
  );
}
