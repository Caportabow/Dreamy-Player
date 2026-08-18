import { toast } from 'vue-sonner'

export function useToast() {
  return {
    success(message: string): void {
      toast.success(message, { description: undefined })
    },
    error(message: string): void {
      toast.error(message)
    },
    info(message: string): void {
      toast(message)
    },
  }
}

export function apiErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  return err?.data?.message || err?.data?.statusMessage || err?.message || fallback
}
