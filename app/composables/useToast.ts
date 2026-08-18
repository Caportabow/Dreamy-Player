import { toast } from 'vue-sonner'

interface ToastOptions {
  description?: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

export function useToast() {
  return {
    success(message: string, options?: ToastOptions): void {
      toast.success(message, options)
    },
    error(message: string, options?: ToastOptions): void {
      toast.error(message, options)
    },
    info(message: string, options?: ToastOptions): void {
      toast(message, options)
    },
  }
}

export function apiErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  return err?.data?.message || err?.data?.statusMessage || err?.message || fallback
}
