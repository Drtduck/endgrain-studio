// Вынесено из app/actions/feedback.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, константу оттуда Next не соберёт.
export const FEEDBACK_MAX_LENGTH = 2000
