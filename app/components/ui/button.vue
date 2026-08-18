<script setup lang="ts">
import { Primitive, type PrimitiveProps } from 'radix-vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-300 select-none outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:
          'text-night-950 bg-lavender-200 hover:bg-lavender-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_10px_30px_-10px_rgba(140,110,200,0.55)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),0_14px_40px_-10px_rgba(140,110,200,0.7)]',
        secondary:
          'text-cream bg-white/6 hover:bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]',
        ghost: 'text-cream-muted hover:text-cream hover:bg-white/5',
        outline:
          'border border-lavender-400/25 text-lavender-200 hover:bg-lavender-400/10 hover:border-lavender-400/40',
        destructive: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
        subtle: 'bg-white/5 text-cream-muted hover:text-cream hover:bg-white/10',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-8 px-3.5 text-xs',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: string
}

const props = withDefaults(defineProps<Props>(), { as: 'button' })
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
