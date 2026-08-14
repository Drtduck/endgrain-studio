import type { Metadata } from "next";
import { Suspense } from "react";
import { bitter, golos, jetbrains } from "./fonts";
import { Analytics } from "@/components/Analytics";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ConsentProvider } from "@/components/ConsentProvider";
import { GoogleAuthProvider } from "@/components/GoogleAuthProvider";
import { LocaleBootstrap } from "@/components/LocaleBootstrap";
import { NavProgress } from "@/components/NavProgress";
import { ProProvider } from "@/components/ProProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { getAiAccess } from "@/lib/ai/entitlements";
import { getGoogleAuthAvailable } from "@/lib/auth/googleAuth";
import { getConsentContext } from "@/lib/consent/server";
import { isStripeConfigured } from "@/lib/stripe/config";
import { getProStatus } from "@/lib/stripe/pro";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/session";
import { getOwnAvatarUrl } from "@/lib/profile/read";
import { getLandingLocale } from "@/lib/landing/locale";
import { t } from "@/lib/i18n";
import { appUrl } from "@/lib/seo/metadata";
import "./globals.css";

// Описание зависит от языка посетителя, поэтому метаданные считаются функцией,
// а не константой: cookie eg-locale читается тем же способом, что и lang документа.
// metadataBase собран через appUrl(): страницы лендингового домена (лендинг, блог)
// переопределяют его у себя через siteUrl(), это дефолт для остальных.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: "Endgrain App", template: "%s · Endgrain App" },
    description: t(locale, "meta.description"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  // Картинка аватара для шапки едет тем же путём, что и сам пользователь:
  // пропсом с сервера, без клиентского fetch и без мигания инициала. После
  // загрузки нового аватара AvatarPicker зовёт router.refresh(), layout
  // пересчитывается и кружок в шапке обновляется сразу.
  const avatarUrl = user === null ? null : await getOwnAvatarUrl(user.id);
  // Статус Pro считается на сервере и уезжает пропсом: клиент серверные ключи
  // Stripe не видит и isStripeConfigured() у себя вызвать не может.
  const proStatus = await getProStatus();
  // Доступ к платным AI-фичам и остаток квоты считаются там же и тем же способом:
  // клиенту нельзя доверить ни проверку подписки, ни счётчик генераций.
  const aiAccess = await getAiAccess();
  // Серверное стартовое значение из cookie eg-locale лендинга; приложение дополнительно
  // правит document.documentElement.lang на клиенте (LocaleToggle) при переключении.
  const lang = await getLandingLocale();
  const googleAuthAvailable = await getGoogleAuthAvailable();
  // Считается один раз на серверный рендер, ровно как остальные значения выше:
  // первый же HTML либо содержит баннер согласия, либо нет, без мигания на клиенте.
  const consent = await getConsentContext();
  return (
    <html
      lang={lang}
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* Полоска перехода поверх всего документа: клик по меню обязан давать
            реакцию раньше, чем сервер отдаст следующий экран. Suspense нужен,
            потому что внутри читаются searchParams. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <Analytics regime={consent.regime} initialDecision={consent.decision} />
        <SessionProvider value={{ user, enabled: isSupabaseConfigured(), avatarUrl }}>
          <GoogleAuthProvider value={googleAuthAvailable}>
            <ProProvider value={{ status: proStatus, billingEnabled: isStripeConfigured(), ai: aiAccess }}>
              <ConsentProvider regime={consent.regime} initialDecision={consent.decision}>
                <LocaleBootstrap locale={lang} />
                {children}
                <ConsentBanner />
              </ConsentProvider>
            </ProProvider>
          </GoogleAuthProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
