"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConfirmOptions = { title: string; description?: string; action: string; destructive?: boolean };
type AskOptions = { title: string; label: string; placeholder?: string; action: string };

type Dialogs = {
  /** Resolves true when the person confirms. */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Resolves the typed text, or null when cancelled. */
  ask: (o: AskOptions) => Promise<string | null>;
};

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs() {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs needs <DialogsProvider>");
  return ctx;
}

/** In-page replacements for window.confirm() and window.prompt(), built on shadcn dialogs. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [askState, setAskState] = useState<AskOptions | null>(null);
  const [text, setText] = useState("");
  const resolveConfirm = useRef<(v: boolean) => void>(() => {});
  const resolveAsk = useRef<(v: string | null) => void>(() => {});

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveConfirm.current = resolve;
        setConfirmState(o);
      }),
    [],
  );
  const ask = useCallback(
    (o: AskOptions) =>
      new Promise<string | null>((resolve) => {
        resolveAsk.current = resolve;
        setText("");
        setAskState(o);
      }),
    [],
  );

  const closeConfirm = (v: boolean) => {
    resolveConfirm.current(v);
    setConfirmState(null);
  };
  const closeAsk = (v: string | null) => {
    resolveAsk.current(v);
    setAskState(null);
  };

  return (
    <DialogsContext.Provider value={{ confirm, ask }}>
      {children}

      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && closeConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            {confirmState?.description && <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmState?.destructive ? "destructive" : "default"}
              onClick={() => closeConfirm(true)}
            >
              {confirmState?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!askState} onOpenChange={(open) => !open && closeAsk(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) closeAsk(text.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle>{askState?.title}</DialogTitle>
              <DialogDescription className="sr-only">{askState?.label}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="ask-input">{askState?.label}</Label>
              <Input
                id="ask-input"
                autoFocus
                className="font-mono"
                placeholder={askState?.placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeAsk(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!text.trim()}>
                {askState?.action}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DialogsContext.Provider>
  );
}
