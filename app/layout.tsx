import type { Metadata } from "next";
import { bitter, golos, jetbrains } from "./fonts";
import { SessionProvider } from "@/components/SessionProvider";
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
  // Серверное стартовое значение из cookie eg-locale лендинга; студия дополнительно
  // правит document.documentElement.lang на клиенте (LocaleToggle) при переключении.
  const lang = await getLandingLocale();
  return (
    <html
      lang={lang}
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SessionProvider value={{ user, enabled: isSupabaseConfigured() }}>{children}</SessionProvider>
      </body>
    </html>
  );
}
