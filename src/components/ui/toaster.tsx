import { dismissToast, useToastTop, useToasts } from "@/hooks/use-toast"
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/** Top-centre notifications below the page header, mounted once in App. */
export function Toaster() {
  const { toasts } = useToasts()
  const top = useToastTop()

  return (
    <ToastProvider swipeDirection="up" label="Benachrichtigungen">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          kind={t.kind}
          open={t.open}
          duration={t.duration}
          onOpenChange={(open) => { if (!open) dismissToast(t.id) }}
        >
          <div className="min-w-0 flex-1">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          {t.action && (
            <ToastAction altText={t.action.label} onClick={t.action.onClick}>
              {t.action.label}
            </ToastAction>
          )}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport style={{ top }} />
    </ToastProvider>
  )
}
