'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Флаг едет пропсом из серверного layout, как в SessionProvider и ProProvider:
 * без него кнопка «Войти через Google» на миг мигнула бы для гостей из РФ.
 * Дефолт true: компонент вне провайдера (юнит-тест) не должен молча прятать кнопку.
 */
const GoogleAuthContext = createContext<boolean>(true)

export function GoogleAuthProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <GoogleAuthContext value={value}>{children}</GoogleAuthContext>
}

export function useGoogleAuthAvailable(): boolean {
  return useContext(GoogleAuthContext)
}
