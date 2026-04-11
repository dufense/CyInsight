import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: [
      { key: "G D", label: "Go to Dashboard" },
      { key: "G I", label: "Go to Incidents" },
      { key: "G E", label: "Go to Events" },
      { key: "G C", label: "Go to CAASM" },
    ],
  },
  {
    title: "Command Palette",
    shortcuts: [
      { key: "⌘K / Ctrl+K", label: "Open command palette" },
      { key: "⌘/ / Ctrl+/", label: "Focus global search" },
      { key: "?", label: "Show this help" },
    ],
  },
  {
    title: "Interface",
    shortcuts: [
      { key: "⌘B / Ctrl+B", label: "Toggle sidebar" },
      { key: "Esc", label: "Close dialogs / palette" },
      { key: "↑ ↓", label: "Navigate list items" },
      { key: "↵ Enter", label: "Activate selected item" },
    ],
  },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-keyboard-shortcuts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</h4>
              <div className="space-y-1">
                {group.shortcuts.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-3 py-1 px-2 rounded-md hover:bg-muted/40">
                    <span className="text-sm text-foreground">{s.label}</span>
                    <kbd className="px-2 py-0.5 rounded border text-[11px] font-mono bg-muted/60 whitespace-nowrap">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
