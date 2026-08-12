import type { Metadata } from "next";
import { bitter, golos, jetbrains } from "./fonts";
import { GoogleAuthProvider } from "@/components/GoogleAuthProvider";
import { ProProvider } from "@/components/ProProvider";
import { SessionProvider } from "@/components/SessionProvider";
import { getAiAccess } from "@/lib/ai/entitlements";
import { getGoogleAuthAvailable } from "@/lib/auth/googleAuth";
import { isStripeConfigured } from "@/lib/stripe/config";
import { getProStatus } from "@/lib/stripe/pro";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/session";
import { getLandingLocale } from "@/lib/landing/locale";
import { APP_ORIGIN } from "@/lib/routing/host";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: { default: "Endgrain Studio", template: "%s · Endgrain Studio" },
  description: "Проект торцевой разделочной доски: узор, распил, материал, себестоимость",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  // Статус Pro считается на сервере и уезжает пропсом: клиент серверные ключи
  // Stripe не видит и isStripeConfigured() у себя вызвать не может.
  const proStatus = await getProStatus();
  // Доступ к платным AI-фичам и остаток квоты считаются там же и тем же способом:
  // клиенту нельзя доверить ни проверку подписки, ни счётчик генераций.
  const aiAccess = await getAiAccess();
  // Серверное стартовое значение из cookie eg-locale лендинга; студия дополнительно
  // правит document.documentElement.lang на клиенте (LocaleToggle) при переключении.
  const lang = await getLandingLocale();
  const googleAuthAvailable = await getGoogleAuthAvailable();
  return (
    <html
      lang={lang}
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SessionProvider value={{ user, enabled: isSupabaseConfigured() }}>
          <GoogleAuthProvider value={googleAuthAvailable}>
            <ProProvider value={{ status: proStatus, billingEnabled: isStripeConfigured(), ai: aiAccess }}>
              {children}
            </ProProvider>
          </GoogleAuthProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
