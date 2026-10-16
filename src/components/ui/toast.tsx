import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ToastKind } from "@/lib/toastQueue"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "pointer-events-none fixed left-1/2 z-[1100] flex w-[calc(100vw-2rem)] max-w-[380px] -translate-x-1/2 flex-col gap-2 outline-none transition-[top] duration-200",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-red-400" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden />,
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & { kind: ToastKind }
>(({ className, kind, children, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    // Errors interrupt screen readers, confirmations wait their turn.
    type={kind === "error" ? "foreground" : "background"}
    className={cn(
      "group pointer-events-auto relative flex w-full items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/95 py-2.5 pl-3 pr-8 text-white shadow-xl shadow-black/40 backdrop-blur-md",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-200",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=closed]:duration-200",
      "data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none data-[swipe=cancel]:translate-y-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)]",
      className
    )}
    {...props}
  >
    <span className="mt-0.5 shrink-0">{KIND_ICON[kind]}</span>
    {children}
  </ToastPrimitives.Root>
))
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "-my-0.5 shrink-0 self-center rounded-md px-2 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    aria-label="Schließen"
    className={cn(
      "absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 group-hover:opacity-100",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-medium leading-5", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("mt-0.5 text-xs leading-snug text-zinc-400 [overflow-wrap:anywhere]", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
