import { Bitter, Golos_Text, JetBrains_Mono } from 'next/font/google';

export const bitter = Bitter({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-bitter',
  display: 'swap',
});

export const golos = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-golos',
  display: 'swap',
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

// layout.tsx:
// <body className={`${bitter.variable} ${golos.variable} ${jetbrains.variable} font-sans`}>

// Точные имена в Google Fonts: Bitter · Golos Text · JetBrains Mono
