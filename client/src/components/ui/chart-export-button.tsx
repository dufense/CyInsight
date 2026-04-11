import { useState, useRef, useCallback, type RefObject, type ReactNode } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Download, Image, ImageMinus, FileText, Loader2, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChartExportButtonProps {
  title: string;
  chartRef: RefObject<HTMLDivElement>;
}

function prepareForCapture(el: HTMLElement): (() => void) {
  const restoreFns: (() => void)[] = [];

  const originalOverflow = el.style.overflow;
  const originalMinWidth = el.style.minWidth;
  const originalMinHeight = el.style.minHeight;
  const originalWidth = el.style.width;
  el.style.overflow = "visible";
  el.style.minWidth = el.scrollWidth + "px";
  el.style.minHeight = el.scrollHeight + "px";
  restoreFns.push(() => {
    el.style.overflow = originalOverflow;
    el.style.minWidth = originalMinWidth;
    el.style.minHeight = originalMinHeight;
    el.style.width = originalWidth;
  });

  const overflowEls = el.querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-y-auto, .overflow-auto, .overflow-hidden");
  overflowEls.forEach((child) => {
    const orig = child.style.overflow;
    child.style.overflow = "visible";
    restoreFns.push(() => { child.style.overflow = orig; });
  });

  const svgs = el.querySelectorAll<SVGElement>("svg");
  svgs.forEach((svg) => {
    const nativeWidth = svg.getAttribute("width");
    const nativeHeight = svg.getAttribute("height");
    const isResponsive = svg.classList.contains("w-full") || svg.style.width === "100%";
    if (nativeWidth && isResponsive && /^\d+(\.\d+)?$/.test(nativeWidth)) {
      const hadWFull = svg.classList.contains("w-full");
      if (hadWFull) svg.classList.remove("w-full");
      const origW = svg.style.width;
      const origH = svg.style.height;
      const origMax = svg.style.maxWidth;
      svg.style.width = nativeWidth + "px";
      svg.style.height = (nativeHeight && /^\d+(\.\d+)?$/.test(nativeHeight)) ? nativeHeight + "px" : "auto";
      svg.style.maxWidth = "none";
      restoreFns.push(() => {
        if (hadWFull) svg.classList.add("w-full");
        svg.style.width = origW;
        svg.style.height = origH;
        svg.style.maxWidth = origMax;
      });
    }
  });

  return () => { restoreFns.forEach(fn => fn()); };
}

export function ChartExportButton({ title, chartRef }: ChartExportButtonProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const captureChart = useCallback(async (transparent = false) => {
    if (!chartRef.current) return null;
    const isDark = document.documentElement.classList.contains('dark');
    const restore = prepareForCapture(chartRef.current);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: transparent ? null : (isDark ? '#1a1a2e' : '#ffffff'),
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: chartRef.current.scrollWidth,
        windowHeight: chartRef.current.scrollHeight,
      });
      return canvas;
    } finally {
      restore();
    }
  }, [chartRef]);

  const exportChart = useCallback(async (type: "png" | "png_transparent" | "pdf") => {
    if (!chartRef.current) return;
    setExporting(type);
    try {
      const isTransparent = type === "png_transparent";
      const canvas = await captureChart(isTransparent);
      if (!canvas) return;
      const safeName = title.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
      const timestamp = new Date().toISOString().slice(0, 10);

      if (type === "png" || type === "png_transparent") {
        const link = document.createElement("a");
        link.download = `${safeName}_${timestamp}${isTransparent ? "_transparent" : ""}_HD.png`;
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
        pdf.save(`${safeName}_${timestamp}_HD.pdf`);
      }
    } catch (e) {
      console.error("Chart export failed:", e);
    } finally {
      setExporting(null);
    }
  }, [title, chartRef, captureChart]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!!exporting}
          data-testid={`chart-export-${title.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportChart("png")} data-testid={`chart-export-png-${title.replace(/\s+/g, '-').toLowerCase()}`}>
          <Image className="w-3.5 h-3.5 mr-2" /> Export PNG (HD)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportChart("png_transparent")} data-testid={`chart-export-png-transparent-${title.replace(/\s+/g, '-').toLowerCase()}`}>
          <ImageMinus className="w-3.5 h-3.5 mr-2" /> Export Transparent PNG (HD)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportChart("pdf")} data-testid={`chart-export-pdf-${title.replace(/\s+/g, '-').toLowerCase()}`}>
          <FileText className="w-3.5 h-3.5 mr-2" /> Export PDF (HD)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useChartExportRef() {
  return useRef<HTMLDivElement>(null);
}

interface ExpandableChartWrapperProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  contentRef?: RefObject<HTMLDivElement>;
}

export function ExpandableChartWrapper({ title, children, actions, contentRef }: ExpandableChartWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedRef = useChartExportRef();
  const [clonedHtml, setClonedHtml] = useState<string>("");

  const handleExpand = useCallback(() => {
    if (!children && contentRef?.current) {
      setClonedHtml(contentRef.current.innerHTML);
    }
    setIsExpanded(true);
  }, [children, contentRef]);

  const exportRef = children ? expandedRef : contentRef || expandedRef;

  return (
    <>
      <div className="flex items-center gap-0.5">
        {actions}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleExpand}
          data-testid={`expand-${title.replace(/\s+/g, '-').toLowerCase()}`}
          title="Expand to full screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-auto">
          <DialogHeader className="flex flex-row items-center justify-between gap-2 pr-8">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <div className="flex items-center gap-1">
              <ChartExportButton title={title} chartRef={exportRef as RefObject<HTMLDivElement>} />
            </div>
          </DialogHeader>
          <div ref={expandedRef} className="min-h-[200px]">
            {children ? children : (
              <div dangerouslySetInnerHTML={{ __html: clonedHtml }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
