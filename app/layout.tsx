import type { Metadata } from "next";
import { bitter, golos, jetbrains } from "./fonts";
import { SessionProvider } from "@/components/SessionProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Endgrain Studio",
  description: "Проект торцевой разделочной доски: узор, распил, материал, себестоимость",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html
      lang="ru"
      className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SessionProvider value={{ user, enabled: isSupabaseConfigured() }}>{children}</SessionProvider>
      </body>
    </html>
  );
}
