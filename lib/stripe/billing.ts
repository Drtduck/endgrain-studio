// Вынесено из app/actions/billing.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, ни константу, ни тип оттуда Next не соберёт
// (тот же урок, что и lib/subscribe.ts).

export type CheckoutError = 'disabled' | 'unauthenticated' | 'invalid' | 'already' | 'failed'
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: CheckoutError }
