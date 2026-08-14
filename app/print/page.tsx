import type { Metadata } from 'next'
import { PrintInstruction } from '@/components/print/PrintInstruction'
import './print.css'

// Печатная страница живёт по ссылке-снимку: индексировать нечего, содержимое целиком в хэше.
export const metadata: Metadata = {
  title: 'Print',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <PrintInstruction />
}
