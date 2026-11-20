import "./globals.css";
export const metadata = {
  title: "UniRent — Safe student housing near ADDU",
  description: "Verified, safety-scored off-campus housing near Ateneo de Davao University.",
  icons: {
    icon: "/unirent-logo.png",
  },
};
// Applies the saved/system theme before first paint to avoid a light-mode flash.
const themeScript = `(function(){try{var t=localStorage.getItem('unirent-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
